import fs from 'node:fs';
import moment from 'moment-timezone';
export const appointmentStatuses = JSON.parse(fs.readFileSync(new URL('../frontend/src/data/appointmentStatuses.json', import.meta.url), 'utf8'));
export const inactiveAppointmentStatuses = appointmentStatuses.filter(item => !item.active).map(item => item.value);
export const earnsAppointmentPay = (status = 'scheduled') => appointmentStatuses.some(item => item.value === (status || 'scheduled') && item.earns);
export const consumesPackageSession = (status = 'scheduled') => status === 'no_show' || earnsAppointmentPay(status);
export function cancellationStatus(appointment, cancelledAt = new Date()) {
  const date = appointment.date instanceof Date ? appointment.date.toISOString().slice(0, 10) : String(appointment.date).slice(0, 10);
  const start = moment.tz(`${date} ${appointment.time}`, 'YYYY-MM-DD HH:mm:ss', 'America/New_York');
  const notice = moment(cancelledAt).tz('America/New_York');
  if (!start.isValid() || !notice.isValid()) throw new Error('Invalid appointment or cancellation time.');
  return start.format('YYYY-MM-DD') === notice.format('YYYY-MM-DD') || start.valueOf() - notice.valueOf() < 24 * 60 * 60 * 1000 ? 'no_show' : 'cancelled';
}
export async function ensureAppointmentStatusSchema(pool) {
  await pool.query(`ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS status_note text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status_updated_at timestamptz,
    ADD COLUMN IF NOT EXISTS status_history jsonb NOT NULL DEFAULT '[]'::jsonb`);
}
