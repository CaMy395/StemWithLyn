import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import createRouter from './appointmentStatus.js';
import { earnsAppointmentPay } from '../appointmentStatus.js';

async function fixture(run, { conflict = false, failUpdate = false, calendarFailure = false, blocked = false, noticeTime = '2026-10-24T12:00:00Z' } = {}) {
  const rows = [1, 2, 3].map(id => ({ id, client_id: 10, status: 'scheduled', date: '2026-10-26', time: '15:00:00', end_time: '16:00:00', paid: true, price: 60, google_event_id: `event-${id}` }));
  const queries = [], deletedEvents = [];
  let transaction;
  const pool = {
    query: async (sql, args) => {
      queries.push(sql);
      if (sql.includes('FROM users')) return { rows: [{ id: args[0], role: args[0] === 1 ? 'admin' : 'client' }] };
      if (sql.includes('google_event_id = NULL')) rows.find(row => row.id === args[0]).google_event_id = null;
      return { rows: [] };
    },
    connect: async () => ({
      release() {},
      query: async (sql, args) => {
        queries.push(sql);
        if (sql === 'BEGIN') transaction = structuredClone(rows);
        if (sql === 'COMMIT') rows.splice(0, rows.length, ...transaction);
        if (sql.includes('FOR UPDATE')) return { rows: transaction.filter(row => args[0].includes(row.id)) };
        if (sql.includes('SELECT id FROM appointments')) return { rows: conflict ? [{ id: 99 }] : [] };
        if (sql.includes('FROM schedule_blocks')) return { rows: blocked ? [{ time_slot: '2026-10-26-15:30', label: 'Away (1 hours)' }] : [] };
        if (sql.includes('UPDATE appointments SET status')) {
          if (failUpdate) throw new Error('Simulated database failure');
          const changed = transaction.filter(row => args[0].includes(row.id));
          for (const row of changed) { row.status = args[1]; row.status_note = args[2]; }
          return { rows: structuredClone(changed) };
        }
        return { rows: [] };
      },
    }),
  };
  const app = express(); app.use(express.json());
  app.use('/appointments', createRouter(pool, 'test-secret', async row => {
    if (calendarFailure) throw new Error('Offline calendar');
    deletedEvents.push(row.id);
  }, undefined, () => new Date(noticeTime)));
  app.get('/appointments', (_req, res) => res.json(rows));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const request = async (body, { userId = 1, path = '/bulk-status', method = 'POST', token = true } = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/appointments${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${jwt.sign({ userId }, 'test-secret')}` } : {}) },
      ...(method !== 'GET' ? { body: JSON.stringify(body) } : {}),
    });
    return { code: response.status, body: await response.json() };
  };
  try { await run({ rows, queries, deletedEvents, request }); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('bulk cancellation preserves all three records and payment amounts while removing expected pay', async () => {
  await fixture(async ({ request, rows, queries, deletedEvents }) => {
    const result = await request({ ids: [1, 2, 3], status: 'cancelled', note: 'Student canceled' });
    assert.equal(result.code, 200);
    assert.equal(rows.length, 3);
    assert.ok(rows.every(row => row.status === 'cancelled' && row.price === 60 && row.paid && !earnsAppointmentPay(row.status)));
    assert.deepEqual(deletedEvents, [1, 2, 3]);
    assert.ok(queries.some(sql => sql.includes('status_history')));
    assert.ok(!queries.some(sql => /profits|DELETE FROM appointments|SET paid/.test(sql)));
  });
});
test('only admins can change statuses; existing appointment reads remain available', async () => {
  await fixture(async ({ request }) => {
    assert.equal((await request({ ids: [1], status: 'completed' }, { token: false })).code, 401);
    assert.equal((await request({ ids: [1], status: 'completed' }, { userId: 2 })).code, 403);
    assert.equal((await request(null, { path: '', method: 'GET', token: false })).code, 200);
    assert.equal((await request({ status: 'completed' }, { path: '/1/status', method: 'PATCH' })).code, 200);
  });
});
test('invalid status, duplicate IDs, and missing records never partially update appointments', async () => {
  await fixture(async ({ request, rows }) => {
    assert.equal((await request({ ids: [1], status: 'whatever' })).code, 400);
    assert.equal((await request({ ids: [1, 1], status: 'completed' })).code, 400);
    assert.equal((await request({ ids: [1, 999], status: 'completed' })).code, 404);
    assert.ok(rows.every(row => row.status === 'scheduled'));
  });
});
test('failed status write rolls back the batch', async () => {
  await fixture(async ({ request, rows, queries }) => {
    assert.equal((await request({ ids: [1, 2, 3], status: 'cancelled' })).code, 500);
    assert.ok(rows.every(row => row.status === 'scheduled'));
    assert.ok(queries.includes('ROLLBACK'));
  }, { failUpdate: true });
});
test('restoring canceled sessions cannot collide with a booked or blocked time', async () => {
  for (const option of [{ conflict: true }, { blocked: true }]) {
    await fixture(async ({ request, rows }) => {
      rows[0].status = 'cancelled';
      assert.equal((await request({ ids: [1], status: 'scheduled' })).code, 409);
      assert.equal(rows[0].status, 'cancelled');
    }, option);
  }
});
test('calendar failure reports a warning while retaining the saved cancellation', async () => {
  await fixture(async ({ request, rows }) => {
    const result = await request({ ids: [1], status: 'cancelled' });
    assert.equal(result.code, 200);
    assert.equal(result.body.calendarWarning, true);
    assert.equal(rows[0].status, 'cancelled');
  }, { calendarFailure: true });
});
test('unreviewed sessions never imply completed attendance; inactive outcomes do not earn expected pay', () => {
  assert.equal(earnsAppointmentPay(), true);
  for (const status of ['cancelled', 'not_completed', 'no_show', 'reschedule_needed']) assert.equal(earnsAppointmentPay(status), false);
  for (const status of ['scheduled', 'confirmed', 'rescheduled', 'completed']) assert.equal(earnsAppointmentPay(status), true);
});

test('late cancellation becomes no-show, while an early cancellation in the same batch stays canceled', async () => {
  await fixture(async ({ request, rows }) => {
    rows[0].date = '2026-10-26';
    rows[1].date = '2026-10-27';
    const result = await request({ ids: [1, 2], status: 'cancelled' });
    assert.equal(result.code, 200);
    assert.equal(rows[0].status, 'no_show');
    assert.equal(rows[1].status, 'cancelled');
  }, { noticeTime: '2026-10-26T14:00:00Z' });
});
test('historical cancellation notice uses the supplied time; repeated cancellation preserves its outcome', async () => {
  await fixture(async ({ request, rows }) => {
    const result = await request({ ids: [1], status: 'cancelled', cancelledAt: '2026-10-24T12:00:00Z' });
    assert.equal(result.code, 200);
    assert.equal(rows[0].status, 'cancelled');
    assert.equal((await request({ ids: [1], status: 'cancelled' })).code, 200);
    assert.equal(rows[0].status, 'cancelled');
    assert.equal((await request({ ids: [2], status: 'cancelled', cancelledAt: '2099-01-01T00:00:00Z' })).code, 400);
    assert.equal((await request({ ids: [2], status: 'cancelled', cancelledAt: 'invalid' })).code, 400);
  }, { noticeTime: '2026-10-26T14:00:00Z' });
});
