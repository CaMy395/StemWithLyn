import express from 'express';
import jwt from 'jsonwebtoken';
import portalContact from '../portalContact.js';

export default function createPortalMessagesRouter(pool, secret, notify = async () => {}) {
  const router = express.Router();
  let schema;
  const ensureSchema = () => schema ||= pool.query(`CREATE TABLE IF NOT EXISTS portal_messages (
    id bigserial PRIMARY KEY, client_user_id integer NOT NULL REFERENCES users(id),
    sender_user_id integer NOT NULL REFERENCES users(id), from_admin boolean NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz
  )`).then(() => pool.query(`CREATE INDEX IF NOT EXISTS portal_messages_conversation
    ON portal_messages(client_user_id, id)`)).catch(error => { schema = null; throw error; });

  router.use(async (req, res, next) => {
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = jwt.verify(token, secret);
      const result = await pool.query('SELECT id, role, name, username, email FROM users WHERE id = $1', [payload.userId]);
      if (!result.rowCount) return res.status(401).json({ error: 'Please sign in again.' });
      req.messageUser = result.rows[0];
      await ensureSchema();
      next();
    } catch (error) {
      if (['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) return res.status(401).json({ error: 'Please sign in again.' });
      console.error('Message setup failed:', error);
      res.status(503).json({ error: 'Messages are temporarily unavailable. Please try again.' });
    }
  });

  router.get('/contact-info', (_req, res) => {
    const phone = String(process.env.GOOGLE_VOICE_NUMBER || (portalContact.googleVoiceActive ? portalContact.googleVoiceNumber : '')).replace(/[^\d+]/g, '');
    res.json({ email: portalContact.email, phone: /^\+?\d{10,15}$/.test(phone) ? phone : '' });
  });

  router.get('/conversations', async (req, res) => {
    try {
      const admin = req.messageUser.role === 'admin';
      const result = await pool.query(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.username) AS name,
        latest.body AS preview, latest.created_at AS updated_at,
        (SELECT COUNT(*)::integer FROM portal_messages m WHERE m.client_user_id = u.id
          AND m.from_admin = $1 AND m.read_at IS NULL) AS unread
        FROM users u JOIN LATERAL (SELECT body, created_at FROM portal_messages
          WHERE client_user_id = u.id ORDER BY id DESC LIMIT 1) latest ON true
        WHERE u.role <> 'admin' AND ($2::boolean OR u.id = $3)
        ORDER BY latest.created_at DESC`, [!admin, admin, req.messageUser.id]);
      res.json(result.rows);
    } catch (error) { console.error('Inbox failed:', error); res.status(500).json({ error: 'Could not load your inbox.' }); }
  });

  router.use('/:userId', async (req, res, next) => {
    const id = Number(req.params.userId);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid conversation.' });
    if (req.messageUser.role !== 'admin' && id !== req.messageUser.id) return res.status(403).json({ error: 'You can only access your own messages.' });
    try {
      const user = await pool.query("SELECT id, email, name, username FROM users WHERE id = $1 AND role <> 'admin'", [id]);
      if (!user.rowCount) return res.status(404).json({ error: 'Conversation not found.' });
      req.conversationUser = user.rows[0];
      next();
    } catch (error) { res.status(500).json({ error: 'Could not load the conversation.' }); }
  });

  router.get('/:userId', async (req, res) => {
    try {
      const result = await pool.query(`SELECT id, body, from_admin, created_at, read_at FROM
        (SELECT * FROM portal_messages WHERE client_user_id = $1 ORDER BY id DESC LIMIT 200) messages ORDER BY id`, [req.conversationUser.id]);
      res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Could not load messages.' }); }
  });

  router.post('/:userId/read', async (req, res) => {
    const through = String(req.body?.throughId || '');
    if (!/^\d{1,18}$/.test(through)) return res.status(400).json({ error: 'Invalid message.' });
    try {
      await pool.query(`UPDATE portal_messages SET read_at = now() WHERE client_user_id = $1
        AND from_admin = $2 AND read_at IS NULL AND id <= $3::bigint`, [req.conversationUser.id, req.messageUser.role !== 'admin', through]);
      res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Could not mark messages as read.' }); }
  });

  router.post('/:userId', async (req, res) => {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body || body.length > 4000) return res.status(400).json({ error: 'Enter a message up to 4,000 characters.' });
    try {
      const admin = req.messageUser.role === 'admin';
      const result = await pool.query(`INSERT INTO portal_messages (client_user_id, sender_user_id, from_admin, body)
        VALUES ($1, $2, $3, $4) RETURNING id, body, from_admin, created_at, read_at`, [req.conversationUser.id, req.messageUser.id, admin, body]);
      res.status(201).json(result.rows[0]);
      Promise.resolve().then(() => notify({ admin, client: req.conversationUser })).catch(error => console.error('Message notification failed:', error.message));
    } catch (error) { console.error('Send message failed:', error); res.status(500).json({ error: 'Your message was not sent. Please try again.' }); }
  });
  return router;
}
