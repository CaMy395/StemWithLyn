import test from 'node:test';
import assert from 'node:assert/strict';
import { expandAvailability, serviceDuration } from './schedulingSlots.js';

test('October 5 bookings leave individual one-hour openings', () => {
  const slots = expandAvailability([
    { start_time: '08:00:00', end_time: '10:00:00' },
    { start_time: '15:00:00', end_time: '22:00:00' },
  ], 60);
  const bookings = [[570, 630], [1020, 1140], [1140, 1200], [1200, 1260]];
  const minutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const free = slots.filter((s) => !bookings.some(([start, end]) => minutes(s.start_time) < end && minutes(s.end_time) > start));
  assert.deepEqual(free.map((s) => s.start_time.slice(0, 5)), ['08:00', '08:30', '15:00', '15:30', '16:00', '21:00']);
});

test('supports half-hour services, longer appointments, boundaries and duplicate ranges', () => {
  const range = { start_time: '08:00', end_time: '10:00' };
  assert.equal(serviceDuration('Consultation (30 min)'), 30);
  assert.equal(serviceDuration('Package (6 sessions - SCHEDULING)'), 60);
  assert.equal(expandAvailability([range, range], 30).length, 4);
  assert.deepEqual(expandAvailability([range], 120).map((s) => [s.start_time, s.end_time]), [['08:00:00', '10:00:00']]);
  assert.deepEqual(expandAvailability([range], 150), []);
});
