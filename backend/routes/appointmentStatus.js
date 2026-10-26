import express from 'express';
import jwt from 'jsonwebtoken';
import { appointmentStatuses, inactiveAppointmentStatuses, cancellationStatus } from '../appointmentStatus.js';

export default function createAppointmentStatusRouter(pool, secret, cancelCalendarEvent = async () => {}, restoreCalendarEvent = async () => {}, now = () => new Date()) {
  const router = express.Router();
  router.use(['/bulk-status', '/:id/status'], async (req, res, next) => {
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = jwt.verify(token, secret);
      const user = await pool.query('SELECT id, role FROM users WHERE id = $1', [payload.userId]);
      if (user.rows[0]?.role !== 'admin') return res.status(403).json({ error: 'Admin account required.' });
      req.statusUserId = payload.userId;
      next();
    } catch { res.status(401).json({ error: 'Please sign in again.' }); }
  });
  const update = async (req, res) => {
    const ids = req.params.id ? [Number(req.params.id)] : req.body.ids;
    const { status, note = '', cancelledAt } = req.body;
    const noticeTime = cancelledAt ? new Date(cancelledAt) : now();
    if (status === 'cancelled' && (Number.isNaN(noticeTime.getTime()) || noticeTime > now() || (cancelledAt && (typeof cancelledAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(cancelledAt))))) return res.status(400).json({ error: 'Enter a valid cancellation notice time, including its time zone, that is not in the future.' });
    if (!Array.isArray(ids) || !ids.length || ids.length > 500 || ids.some(id => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length ||
        !appointmentStatuses.some(item => item.value === status) || typeof note !== 'string' || note.length > 1000) {
      return res.status(400).json({ error: 'Choose valid appointments, a status, and a note of up to 1,000 characters.' });
    }
    let db;
    let updated;
    let previous = [];
    try {
      db = await pool.connect();
      await db.query('BEGIN');
      const found = await db.query('SELECT * FROM appointments WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids]);
      previous = found.rows;
      if (found.rows.length !== ids.length) {
        await db.query('ROLLBACK');
        return res.status(404).json({ error: 'One or more appointments no longer exist. Refresh your schedule.' });
      }
      // Restoring an inactive appointment must not overwrite a newly booked slot.
      if (!inactiveAppointmentStatuses.includes(status)) {
        for (const appt of found.rows.filter(item => inactiveAppointmentStatuses.includes(item.status))) {
          const conflict = await db.query(`SELECT id FROM appointments WHERE date = $1 AND id <> $2
            AND (status <> ALL($5::text[]) OR id = ANY($6::int[])) AND time < COALESCE($4::time, $3::time + interval '30 minutes')
            AND COALESCE(end_time, time + interval '30 minutes') > $3::time LIMIT 1`,
          [appt.date, appt.id, appt.time, appt.end_time, inactiveAppointmentStatuses, ids]);
          if (conflict.rows.length) {
            await db.query('ROLLBACK');
            return res.status(409).json({ error: 'This time is already booked. Edit the appointment to choose a new time first.' });
          }
          const blocks = await db.query('SELECT time_slot, label FROM schedule_blocks WHERE date = $1', [appt.date]);
          const minutes = value => { const [h, m] = String(value).split(':').map(Number); return h * 60 + m; };
          const start = minutes(appt.time), end = appt.end_time ? minutes(appt.end_time) : start + 30;
          if (blocks.rows.some(block => {
            const from = minutes(String(block.time_slot).split('-').pop());
            const hours = Number(String(block.label || '').match(/\(([\d.]+)\s*hours?\)/i)?.[1]) || 1;
            return start < from + hours * 60 && end > from;
          })) {
            await db.query('ROLLBACK');
            return res.status(409).json({ error: 'This time is blocked. Edit the appointment to choose a new time first.' });
          }
        }
      }
      const groups = new Map();
      for (const appt of found.rows) {
        const resolved = status === 'cancelled' ? (!cancelledAt && ['cancelled', 'no_show'].includes(appt.status) ? appt.status : cancellationStatus(appt, noticeTime)) : status;
        if (!groups.has(resolved)) groups.set(resolved, []);
        groups.get(resolved).push(appt.id);
      }
      updated = { rows: [] };
      for (const [resolvedStatus, groupIds] of groups) {
      const result = await db.query(`UPDATE appointments SET status = $2, status_note = $3, status_updated_at = now(),
        status_history = status_history || jsonb_build_array(jsonb_build_object(
          'from', status, 'to', $2::text, 'note', $3::text, 'userId', $4::int, 'at', now(), 'cancelledAt', $5::text))
        WHERE id = ANY($1::int[]) RETURNING *`, [groupIds, resolvedStatus, note.trim(), req.statusUserId, status === 'cancelled' ? noticeTime.toISOString() : null]);
        updated.rows.push(...result.rows);
      }
      await db.query('COMMIT');
    } catch (error) {
      if (db) await db.query('ROLLBACK');
      console.error('Appointment status update failed:', error);
      return res.status(500).json({ error: 'Could not update appointment statuses.' });
    } finally { db?.release(); }
    let calendarWarning = false;
    if (inactiveAppointmentStatuses.includes(status)) {
      for (const appt of updated.rows.filter(item => item.google_event_id)) {
        try {
          await cancelCalendarEvent(appt);
          await pool.query('UPDATE appointments SET google_event_id = NULL WHERE id = $1 AND status = $2', [appt.id, appt.status]);
        } catch { calendarWarning = true; }
      }
    }
    if (['scheduled', 'confirmed', 'rescheduled'].includes(status)) {
      for (const appt of updated.rows.filter(item => previous.some(old => old.id === item.id && inactiveAppointmentStatuses.includes(old.status)))) {
        try { await restoreCalendarEvent(appt); } catch { calendarWarning = true; }
      }
    }
    res.json({ appointments: updated.rows, calendarWarning });
  };
  router.patch('/:id/status', update);
  router.post('/bulk-status', update);
  return router;
}
