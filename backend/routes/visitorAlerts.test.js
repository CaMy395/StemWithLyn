import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import webpush from 'web-push';
import createRouter, { validSubscription } from './visitorAlerts.js';

test('subscription endpoints reject local and lookalike destinations', () => {
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/example', keys: { p256dh: 'A'.repeat(87), auth: 'B'.repeat(22) } };
  assert.equal(validSubscription(subscription), true);
  for (const endpoint of ['http://fcm.googleapis.com/x', 'https://localhost/x', 'https://fcm.googleapis.com.evil.com/x', 'https://127.0.0.1/x', 'https://fcm.googleapis.com:8443/x']) {
    assert.equal(validSubscription({ ...subscription, endpoint }), false);
  }
});

test('admin visits are skipped, repeat visitor heartbeats do not alert, expired subscriptions are removed', async () => {
  const sessions = new Set();
  const queries = [];
  const sessionUpdates = [];
  const keys = webpush.generateVAPIDKeys();
  const pool = { query: async (sql, args) => {
    queries.push(sql);
    if (sql.includes('SELECT role') || sql.includes('SELECT id, role')) return { rows: [{ id: args[0], role: args[0] === 1 ? 'admin' : 'client' }], rowCount: 1 };
    if (sql.includes('SELECT keys')) return { rows: [{ keys }] };
    if (sql.includes('INSERT INTO visitor_alert_sessions')) { sessionUpdates.push(args); const fresh = !sessions.has(args[0]); sessions.add(args[0]); return { rowCount: fresh ? 1 : 0 }; }
    if (sql.includes('UPDATE visitor_alert_sessions SET seen_at')) sessionUpdates.push(args);
    if (sql.includes('SELECT s.id, s.page')) return { rows: [{ id: args[0], name: 'Test client', page: '/client-portal', active: true }] };
    if (sql.includes('SELECT s.subscription')) return { rows: [{ subscription: { endpoint: 'https://fcm.googleapis.com/test' } }] };
    return { rows: [], rowCount: 0 };
  } };
  let deliveries = 0;
  const original = webpush.sendNotification;
  let destination;
  webpush.sendNotification = async (_subscription, payload) => { deliveries++; destination = JSON.parse(payload).url; throw Object.assign(new Error('expired'), { statusCode: 410 }); };
  const app = express(); app.use(express.json()); app.use(createRouter(pool, 'test-secret'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const id = '00000000-0000-4000-8000-000000000001';
  const visit = (token, fields = {}) => fetch(`${base}/visit`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ id, ...fields }) });
  try {
    assert.equal((await visit(jwt.sign({ userId: 1 }, 'test-secret'))).status, 204);
    assert.equal(sessions.size, 0);
    assert.equal((await fetch(`${base}/key`)).status, 401);
    assert.equal((await fetch(`${base}/key`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: 2 }, 'test-secret')}` } })).status, 403);
    assert.equal((await fetch(`${base}/visitors`)).status, 401);
    assert.equal((await fetch(`${base}/visitors`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: 2 }, 'test-secret')}` } })).status, 403);
    assert.equal((await visit(null, { userId: 2, name: 'Spoofed name', page: '/?email=private' })).status, 204);
    assert.deepEqual(sessionUpdates[0], [id, null, '/']);
    assert.equal((await visit(jwt.sign({ userId: 2 }, 'test-secret'), { page: '/client-portal' })).status, 204);
    assert.deepEqual(sessionUpdates.at(-1), [id, 2, '/client-portal']);
    assert.equal(deliveries, 1);
    assert.equal(destination, `/admin/visitors?visitor=${id}`);
    const list = await fetch(`${base}/visitors?visitor=${id}`, { headers: { Authorization: `Bearer ${jwt.sign({ userId: 1 }, 'test-secret')}` } });
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    assert.equal((await list.json()).visitors[0].name, 'Test client');
    assert.ok(queries.some(sql => sql.includes('DELETE FROM visitor_push_subscriptions')));
  } finally {
    webpush.sendNotification = original;
    await new Promise(resolve => server.close(resolve));
  }
});
