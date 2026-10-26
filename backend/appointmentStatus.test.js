import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { cancellationStatus, consumesPackageSession, earnsAppointmentPay } from './appointmentStatus.js';

const session = { date: '2026-10-26', time: '15:00:00' }; // 3pm New York = 19:00 UTC.
test('24-hour cancellation boundary is exact and same-day notices are no-shows', () => {
  assert.equal(cancellationStatus(session, '2026-10-25T19:00:00Z'), 'cancelled');
  assert.equal(cancellationStatus(session, '2026-10-25T19:00:00.001Z'), 'no_show');
  assert.equal(cancellationStatus(session, '2026-10-25T18:59:59Z'), 'cancelled');
  assert.equal(cancellationStatus(session, '2026-10-26T04:01:00Z'), 'no_show');
  assert.equal(cancellationStatus(session, '2026-10-27T19:00:00Z'), 'no_show');
});
test('cancellation policy uses New York time and actual elapsed hours across daylight saving', () => {
  const fall = { date: '2026-11-01', time: '15:00:00' }; // Standard time starts that day.
  assert.equal(cancellationStatus(fall, '2026-10-31T20:00:00Z'), 'cancelled');
  assert.equal(cancellationStatus(fall, '2026-10-31T20:00:01Z'), 'no_show');
  const spring = { date: '2026-03-08', time: '15:00:00' };
  assert.equal(cancellationStatus(spring, '2026-03-07T19:00:00Z'), 'cancelled');
  assert.equal(cancellationStatus(spring, '2026-03-07T19:00:01Z'), 'no_show');
  assert.equal(cancellationStatus({ ...session, date: new Date('2026-10-26T04:00:00Z') }, '2026-10-25T19:00:00Z'), 'cancelled');
});
test('no-shows use package credits without automatically changing earnings policy', () => {
  assert.equal(consumesPackageSession('no_show'), true);
  assert.equal(earnsAppointmentPay('no_show'), false);
  assert.equal(consumesPackageSession('cancelled'), false);
  assert.equal(consumesPackageSession('reschedule_needed'), false);
});
test('package balances count completed and no-show sessions, returning timely cancellation credits', () => {
  const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const details = source.slice(source.indexOf('const packageDetails ='), source.indexOf('const loadPackagePurchases ='));
  const balances = source.slice(source.indexOf('const packageBalances ='), source.indexOf('const requireSignedClientUser ='));
  const context = vm.createContext({ consumesPackageSession });
  vm.runInContext(`${details}\n${balances}\nglobalThis.balance = packageBalances;`, context);
  const purchased = [{ title: 'Virtual Tutoring Package (6 sessions, @ $330.00)', total: 6 }];
  const title = 'Virtual Tutoring Package (6 sessions - SCHEDULING)';
  const appointments = ['completed', 'no_show', 'cancelled', 'confirmed', 'not_completed', 'reschedule_needed'].map(status => ({ title, status }));
  let result = context.balance(purchased, appointments)[0];
  assert.equal(result.booked, 3);
  assert.equal(result.used, 2);
  assert.equal(result.completed, 1);
  assert.equal(result.noShows, 1);
  assert.equal(result.reserved, 1);
  assert.equal(result.remaining, 3);
  appointments[1].status = 'cancelled';
  result = context.balance(purchased, appointments)[0];
  assert.equal(result.remaining, 4);
  assert.equal(result.used, 1);
  assert.equal(result.noShows, 0);
  assert.equal(result.reserved, 1);
});

test('client cancellation persists the same late/early policy and leaves no-show results unchanged on retry', async () => {
  const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8');
  const start = source.indexOf('app.post("/client/appointments/:id/cancel"');
  const route = source.slice(start, source.indexOf('\n});', start) + 5);
  for (const [notice, previous, expected] of [
    ['2026-10-24T12:00:00Z', 'scheduled', 'cancelled'],
    ['2026-10-26T12:00:00Z', 'scheduled', 'no_show'],
    ['2026-10-26T12:00:00Z', 'no_show', 'no_show'],
  ]) {
    let handler, written;
    const appointment = { ...session, id: 1, client_id: 2, status: previous };
    const pool = { query: async (sql, args) => {
      assert.ok(!sql.includes('DELETE FROM appointments'));
      if (sql.includes('SELECT *')) return { rowCount: 1, rows: [appointment] };
      if (sql.includes('SELECT id FROM clients')) return { rowCount: 1 };
      if (sql.includes('SET status = $4')) written = args[3];
      return { rowCount: 1, rows: [] };
    } };
    vm.runInNewContext(route, { app: { post: (_, fn) => { handler = fn; } }, pool, console,
      requireClientUser: async () => ({ ok: true, user: { id: 10 } }),
      cancellationStatus: appt => cancellationStatus(appt, notice),
      deleteGoogleCalendarEvent: async () => {},
    });
    const res = { code: 200, status(value) { this.code = value; return this; }, json(body) { this.body = body; return this; } };
    await handler({ params: { id: 1 } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.status, expected);
    assert.equal(written, previous === 'no_show' ? undefined : expected);
  }
});
