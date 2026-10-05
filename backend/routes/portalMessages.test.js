import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import createRouter from './portalMessages.js';

test('messages enforce signed identity, conversation ownership, read boundaries and input validation', async () => {
  const queries = [];
  const pool = { query: async (sql, args = []) => {
    queries.push({ sql, args });
    if (sql.includes('SELECT id, role, name')) return { rowCount: 1, rows: [{ id: args[0], role: args[0] === 1 ? 'admin' : 'client' }] };
    if (sql.includes('SELECT id, email, name')) return { rowCount: 1, rows: [{ id: args[0], email: 'client@example.com' }] };
    if (sql.includes('INSERT INTO portal_messages')) return { rows: [{ id: '12', body: args[3], from_admin: args[2] }] };
    return { rowCount: 0, rows: [] };
  } };
  const app = express(); app.use(express.json()); app.use('/messages', createRouter(pool, 'test-secret'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/messages`;
  const call = (path, userId, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: {
    'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${jwt.sign({ userId }, 'test-secret')}` } : { 'x-user-id': '1' }),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call('/2', null)).status, 401);
    assert.equal((await call('/3', 2)).status, 403);
    assert.equal((await call('/3', 1)).status, 200);
    assert.equal((await call('/2', 2, { body: '   ' })).status, 400);
    assert.equal((await call('/2', 2, { body: 'x'.repeat(4001) })).status, 400);
    const sent = await call('/2', 2, { body: '  Hello Lyn  ', from_admin: true, sender_user_id: 1 });
    assert.equal(sent.status, 201);
    assert.equal((await sent.json()).from_admin, false);
    assert.deepEqual(queries.find(q => q.sql.includes('INSERT INTO portal_messages')).args, [2, 2, false, 'Hello Lyn']);
    assert.equal((await call('/2/read', 2, { throughId: '12' })).status, 200);
    assert.deepEqual(queries.find(q => q.sql.includes('UPDATE portal_messages')).args, [2, true, '12']);
    assert.equal((await call('/2/read', 2, { throughId: 'not-an-id' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
