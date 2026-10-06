import express from 'express';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';

export function validSubscription(value) {
  try {
    const url = new URL(value.endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(url.hostname) &&
      /^[A-Za-z0-9_-]{87}=?$/.test(value.keys?.p256dh || '') && /^[A-Za-z0-9_-]{22}={0,2}$/.test(value.keys?.auth || '') && value.endpoint.length < 2048;
  } catch { return false; }
}

export default function createVisitorAlertsRouter(pool, secret) {
  const router = express.Router();
  let setup;
  const ready = () => setup ||= (async () => {
    await pool.query(`CREATE TABLE IF NOT EXISTS visitor_push_settings (id integer PRIMARY KEY CHECK(id=1), keys jsonb NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS visitor_push_subscriptions (endpoint text PRIMARY KEY, user_id integer NOT NULL REFERENCES users(id), subscription jsonb NOT NULL)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS visitor_alert_sessions (id uuid PRIMARY KEY, seen_at timestamptz NOT NULL DEFAULT now())`);
    const keys = webpush.generateVAPIDKeys();
    await pool.query('INSERT INTO visitor_push_settings (id, keys) VALUES (1, $1) ON CONFLICT DO NOTHING', [keys]);
    return (await pool.query('SELECT keys FROM visitor_push_settings WHERE id=1')).rows[0].keys;
  })().catch(error => { setup = null; throw error; });

  async function send(subscription, payload) {
    const keys = await ready();
    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: { subject: 'https://stemwithlyn.com', publicKey: keys.publicKey, privateKey: keys.privateKey },
        TTL: 120, timeout: 10000,
      });
      return true;
    } catch (error) {
      if ([404, 410].includes(error.statusCode)) await pool.query('DELETE FROM visitor_push_subscriptions WHERE endpoint=$1', [subscription.endpoint]);
      console.error('Visitor push delivery failed:', error.statusCode || error.message);
      return false;
    }
  }

  // Bound public traffic and memory; a visit has a 30-minute inactivity window.
  const traffic = new Map();
  let windowStart = Date.now();
  let total = 0;
  let alerts = 0;
  router.post('/visit', async (req, res) => {
    const now = Date.now();
    if (now - windowStart > 60000) { traffic.clear(); total = 0; alerts = 0; windowStart = now; }
    const count = (traffic.get(req.ip) || 0) + 1;
    if (++total > 300 || count > 30) return res.sendStatus(429);
    traffic.set(req.ip, count);
    const id = req.body?.id;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) return res.sendStatus(400);
    try {
      if (req.headers.authorization) {
        try {
          const payload = jwt.verify(String(req.headers.authorization).replace(/^Bearer\s+/i, ''), secret);
          const user = await pool.query('SELECT role FROM users WHERE id=$1', [payload.userId]);
          if (user.rows[0]?.role === 'admin') return res.sendStatus(204);
        } catch { /* Anonymous visits are allowed. */ }
      }
      await ready();
      await pool.query("DELETE FROM visitor_alert_sessions WHERE seen_at < now() - interval '1 day'");
      const result = await pool.query(`INSERT INTO visitor_alert_sessions (id) VALUES ($1)
        ON CONFLICT(id) DO UPDATE SET seen_at=now()
        WHERE visitor_alert_sessions.seen_at < now() - interval '30 minutes' RETURNING id`, [id]);
      if (!result.rowCount) await pool.query('UPDATE visitor_alert_sessions SET seen_at=now() WHERE id=$1', [id]);
      res.sendStatus(204);
      if (result.rowCount && alerts++ < 10) {
        const subscriptions = await pool.query(`SELECT s.subscription FROM visitor_push_subscriptions s JOIN users u ON u.id=s.user_id WHERE u.role='admin'`);
        await Promise.allSettled(subscriptions.rows.map(row => send(row.subscription, {
          title: 'Someone is visiting STEM with Lyn', body: 'A visitor just arrived on your site.', tag: `visitor-${id}`, url: '/admin',
        })));
      }
    } catch (error) {
      console.error('Visitor alert failed:', error.message);
      if (!res.headersSent) res.sendStatus(503);
    }
  });

  router.use(async (req, res, next) => {
    try {
      const payload = jwt.verify(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''), secret);
      const user = await pool.query('SELECT id, role FROM users WHERE id=$1', [payload.userId]);
      if (user.rows[0]?.role !== 'admin') return res.sendStatus(403);
      req.adminId = user.rows[0].id;
      await ready();
      next();
    } catch (error) {
      res.status(['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name) ? 401 : 503).json({ error: 'Please sign in again or try again shortly.' });
    }
  });
  router.get('/key', async (_req, res) => res.json({ publicKey: (await ready()).publicKey }));
  router.post('/subscription', async (req, res) => {
    if (!validSubscription(req.body)) return res.status(400).json({ error: 'Invalid push subscription.' });
    try {
      await pool.query(`INSERT INTO visitor_push_subscriptions (endpoint,user_id,subscription) VALUES ($1,$2,$3)
        ON CONFLICT(endpoint) DO UPDATE SET user_id=$2,subscription=$3`, [req.body.endpoint, req.adminId, req.body]);
      res.json({ enabled: true });
    } catch { res.status(503).json({ error: 'Could not enable visitor alerts.' }); }
  });
  router.delete('/subscription', async (req, res) => {
    try {
      await pool.query('DELETE FROM visitor_push_subscriptions WHERE endpoint=$1 AND user_id=$2', [req.body?.endpoint, req.adminId]);
      res.json({ enabled: false });
    } catch { res.status(503).json({ error: 'Could not disable visitor alerts.' }); }
  });
  router.post('/test', async (req, res) => {
    try {
      const result = await pool.query('SELECT subscription FROM visitor_push_subscriptions WHERE endpoint=$1 AND user_id=$2', [req.body?.endpoint, req.adminId]);
      const delivered = result.rowCount && await send(result.rows[0].subscription, { title: 'Visitor alerts are ready', body: 'You will receive an alert when someone arrives on your site.', tag: 'visitor-test', url: '/admin' });
      res.status(delivered ? 200 : 503).json(delivered ? { sent: true } : { error: 'Test delivery failed. Try enabling alerts again.' });
    } catch { res.status(503).json({ error: 'Could not send the test alert.' }); }
  });
  return router;
}
