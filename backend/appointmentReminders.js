import crypto from 'node:crypto';
import express from 'express';

// Persist delivery per session time so rescheduled sessions receive a fresh request.
export async function ensureAppointmentReminderSchema(pool) {
  await pool.query(`ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS reminder_session_start timestamptz,
    ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS confirmation_token text,
    ADD COLUMN IF NOT EXISTS confirmation_session_start timestamptz,
    ADD COLUMN IF NOT EXISTS attendance_confirmed_at timestamptz`);
}

export async function sendDueAppointmentReminders(pool, sendEmail) {
  const db = await pool.connect();
  let locked = false;
  try {
    const lock = await db.query('SELECT pg_try_advisory_lock(72401932) AS locked');
    locked = lock.rows[0].locked;
    if (!locked) return;
    const { rows } = await db.query(`SELECT a.id, a.title, a.date::text AS date, a.time,
        c.full_name, c.email,
        (a.date + a.time) AT TIME ZONE 'America/New_York' AS session_start
      FROM appointments a JOIN clients c ON c.id = a.client_id
      WHERE COALESCE(a.status, 'scheduled') IN ('scheduled', 'rescheduled')
        AND NULLIF(TRIM(c.email), '') IS NOT NULL
        AND (a.date + a.time) AT TIME ZONE 'America/New_York' > now()
        AND (a.date + a.time) AT TIME ZONE 'America/New_York' <= now() + interval '24 hours'
        AND a.reminder_session_start IS DISTINCT FROM
          ((a.date + a.time) AT TIME ZONE 'America/New_York')
      ORDER BY a.date, a.time`);
    for (const appointment of rows) {
      try {
        const token = crypto.randomBytes(32).toString('hex');
        await db.query(`UPDATE appointments SET confirmation_token = $2 WHERE id = $1`, [appointment.id, token]);
        const base = (process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'https://stemwithlyn.onrender.com').replace(/\/$/, '');
        await sendEmail({ ...appointment, confirmationUrl: `${base}/session-confirmation/${token}` });
        await db.query(`UPDATE appointments SET reminder_session_start = $2, reminder_sent_at = now()
          WHERE id = $1`, [appointment.id, appointment.session_start]);
      } catch (error) {
        console.error(`Appointment confirmation email failed for session ${appointment.id}:`, error.message);
      }
    }
  } finally {
    try {
      if (locked) await db.query('SELECT pg_advisory_unlock(72401932)');
    } finally {
      db.release();
    }
  }
}

export function createSessionConfirmationRouter(pool) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    next();
  });
  // Email scanners can open GET links without confirming attendance.
  router.get('/:token', (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(400).send('Invalid confirmation link.');
    res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Confirm your session</title></head><body><h1>Confirm your session</h1><p>Please confirm before midnight (America/New_York) before your session day. Unconfirmed sessions are canceled without using a package session or counting as a no-show.</p><form method="post"><button type="submit">Yes, I will attend</button></form></body></html>`);
  });
  router.post('/:token', async (req, res) => {
    if (!/^[a-f0-9]{64}$/.test(req.params.token)) return res.status(400).send('Invalid confirmation link.');
    try {
      const result = await pool.query(`UPDATE appointments SET
          confirmation_session_start = (date + time) AT TIME ZONE 'America/New_York',
          attendance_confirmed_at = now(), status = 'confirmed', status_updated_at = now(),
          status_history = status_history || jsonb_build_array(jsonb_build_object('from', status, 'to', 'confirmed', 'at', now(), 'note', 'Client confirmed attendance'))
        WHERE confirmation_token = $1 AND status IN ('scheduled', 'rescheduled', 'confirmed')
          AND reminder_session_start = ((date + time) AT TIME ZONE 'America/New_York')
          AND now() < (date::timestamp AT TIME ZONE 'America/New_York')
        RETURNING id`, [req.params.token]);
      if (!result.rows.length) return res.status(409).send('This confirmation link has expired or the session has changed. Please contact Lyn.');
      res.send('Thank you! Your attendance is confirmed.');
    } catch (error) {
      console.error('Session confirmation failed:', error.message);
      res.status(500).send('Could not confirm your session. Please try again or contact Lyn.');
    }
  });
  return router;
}

export async function cancelUnconfirmedSessions(pool, cancelCalendarEvent) {
  // Only enforce the cutoff after a confirmation request was actually delivered
  // before the deadline. Same-day bookings and failed emails are not penalized.
  await pool.query(`UPDATE appointments SET status = 'cancelled', status_updated_at = now(),
      status_note = 'Automatically canceled: not confirmed by midnight. No penalty; package session not used.',
      status_history = status_history || jsonb_build_array(jsonb_build_object('from', status, 'to', 'cancelled', 'at', now(), 'note', 'Midnight confirmation deadline missed; no penalty'))
    WHERE status IN ('scheduled', 'rescheduled')
      AND reminder_session_start = ((date + time) AT TIME ZONE 'America/New_York')
      AND reminder_sent_at < (date::timestamp AT TIME ZONE 'America/New_York')
      AND now() >= (date::timestamp AT TIME ZONE 'America/New_York')
      AND (date + time) AT TIME ZONE 'America/New_York' > now()
      AND confirmation_session_start IS DISTINCT FROM ((date + time) AT TIME ZONE 'America/New_York')`);
  const { rows } = await pool.query(`SELECT * FROM appointments WHERE status = 'cancelled'
    AND status_note = 'Automatically canceled: not confirmed by midnight. No penalty; package session not used.'
    AND google_event_id IS NOT NULL`);
  for (const appointment of rows) {
    try {
      await cancelCalendarEvent(appointment);
      await pool.query(`UPDATE appointments SET google_event_id = NULL, google_event_link = NULL
        WHERE id = $1 AND status = 'cancelled' AND google_event_id = $2`, [appointment.id, appointment.google_event_id]);
    } catch (error) {
      console.error(`Canceled session calendar cleanup failed for ${appointment.id}:`, error.message);
    }
  }
}
