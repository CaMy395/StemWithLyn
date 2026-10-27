import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { sendDueAppointmentReminders, cancelUnconfirmedSessions, createSessionConfirmationRouter } from './appointmentReminders.js';

function database(rows, locked = true) {
  const calls = [];
  const db = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked }] };
      if (sql.includes('SELECT a.id')) return { rows };
      return { rows: [] };
    },
    release() { calls.push({ sql: 'release' }); },
  };
  return { calls, connect: async () => db };
}

test('records successful delivery against the session time and releases the lock', async () => {
  const appointment = { id: 1, session_start: '2026-10-28T15:00:00Z' };
  const pool = database([appointment]);
  const sent = [];
  await sendDueAppointmentReminders(pool, async value => sent.push(value));
  assert.equal(sent[0].id, appointment.id);
  assert.match(sent[0].confirmationUrl, /\/session-confirmation\/[a-f0-9]{64}$/);
  assert.deepEqual(pool.calls.find(call => call.sql.includes('SET reminder_session_start')).values, [1, appointment.session_start]);
  const selection = pool.calls.find(call => call.sql.includes('SELECT a.id')).sql;
  assert.match(selection, /interval '24 hours'/);
  assert.match(selection, /America\/New_York/);
  assert.match(selection, /IS DISTINCT FROM/);
  assert.match(pool.calls.at(-2).sql, /pg_advisory_unlock/);
  assert.equal(pool.calls.at(-1).sql, 'release');
});

test('a failed email remains eligible for retry and does not prevent later deliveries', async () => {
  const pool = database([{ id: 1 }, { id: 2, session_start: 'later' }]);
  await sendDueAppointmentReminders(pool, async appointment => {
    if (appointment.id === 1) throw new Error('Simulated delivery failure');
  });
  assert.deepEqual(pool.calls.filter(call => call.sql.includes('SET reminder_session_start')).map(call => call.values[0]), [2]);
  assert.equal(pool.calls.at(-1).sql, 'release');
});

test('midnight cutoff cancels without applying the late-cancellation/no-show rule', async () => {
  const calls = [];
  await cancelUnconfirmedSessions({ query: async sql => { calls.push(sql); return { rows: [] }; } }, async () => {});
  assert.match(calls[0], /status = 'cancelled'/);
  assert.match(calls[0], /reminder_sent_at </);
  assert.match(calls[0], /confirmation_session_start IS DISTINCT FROM/);
  assert.match(calls[0], /status IN \('scheduled', 'rescheduled'\)/);
  assert.match(calls[0], /America\/New_York/);
});

test('another server holding the lock prevents duplicate processing', async () => {
  const pool = database([{ id: 1 }], false);
  await sendDueAppointmentReminders(pool, async () => assert.fail('must not send'));
  assert.equal(pool.calls.length, 2);
  assert.equal(pool.calls.at(-1).sql, 'release');
});

test('confirmation requires a POST; expired or changed sessions cannot be confirmed', async () => {
  let eligible = true;
  const calls = [];
  const app = express();
  app.use('/session-confirmation', createSessionConfirmationRouter({ query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: eligible ? [{ id: 1 }] : [] };
  } }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/session-confirmation/${'a'.repeat(64)}`;
  try {
    const preview = await fetch(url);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('referrer-policy'), 'same-origin');
    assert.match(await preview.text(), /Yes, I will attend/);
    assert.equal(calls.length, 0);
    assert.equal((await fetch(url, { method: 'POST' })).status, 200);
    assert.match(calls[0].sql, /now\(\) < \(date::timestamp AT TIME ZONE/);
    assert.match(calls[0].sql, /reminder_session_start =/);
    assert.match(calls[0].sql, /status IN \('scheduled', 'rescheduled', 'confirmed'\)/);
    eligible = false;
    assert.equal((await fetch(url, { method: 'POST' })).status, 409);
    assert.equal((await fetch(url.replace(/a{64}$/, 'bad'), { method: 'POST' })).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
