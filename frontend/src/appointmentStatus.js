import statuses from './data/appointmentStatuses.json';
export { statuses };
export const statusLabel = (status) => statuses.find(item => item.value === (status || 'scheduled'))?.label || 'Scheduled';
export const countsTowardExpectedPay = (appointment) => statuses.some(item => item.value === (appointment.status || 'scheduled') && item.earns);
export const isUpcomingStatus = (appointment) => ['scheduled', 'confirmed', 'rescheduled'].includes(appointment.status || 'scheduled');
