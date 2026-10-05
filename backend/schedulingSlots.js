export const serviceDuration = (title) => /30\s*min/i.test(title) ? 30 : 60;

export function expandAvailability(rows, duration) {
  const minutes = (time) => {
    const [hours, mins] = String(time).split(':').map(Number);
    return hours * 60 + mins;
  };
  const time = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}:00`;
  const slots = new Map();
  for (const row of rows) {
    const end = minutes(row.end_time);
    for (let start = minutes(row.start_time); start + duration <= end; start += 30) {
      slots.set(start, { ...row, start_time: time(start), end_time: time(start + duration) });
    }
  }
  return [...slots.entries()].sort(([a], [b]) => a - b).map(([, slot]) => slot);
}
