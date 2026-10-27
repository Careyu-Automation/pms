export function isoToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export function timeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function formatMinutes(value) {
  const minutes = Math.round(Number(value) || 0);
  if (!minutes || minutes < 0) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

export function formatClock(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatSlash(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function weekdayName(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(year, month - 1, day));
}

export function longDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
}

export function localStamp(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).toISOString();
}

export const ATTENDANCE_LABEL = {
  NOT_CHECKED_IN: 'Not checked in',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
};

export function buildLog(day) {
  const items = [];
  if (day.session?.checkIn) items.push({ id: 'in', at: day.session.checkIn, text: 'Checked in' });
  (day.breaks || []).forEach((item) => {
    items.push({ id: `${item.id}-start`, at: item.startTime, text: `Break started · ${item.type}` });
    if (item.endTime) items.push({ id: `${item.id}-end`, at: item.endTime, text: `Break ended · ${item.type}` });
  });
  (day.entries || []).forEach((entry) => {
    const where = entry.taskTitle || entry.projectName || 'general work';
    items.push({
      id: entry.id,
      at: entry.startAt || entry.createdAt,
      text: `Logged ${formatMinutes(entry.durationMinutes)} on ${where}`,
      entry: true,
    });
  });
  if (day.session?.checkOut) items.push({ id: 'out', at: day.session.checkOut, text: 'Checked out' });
  return items.sort((a, b) => new Date(a.at) - new Date(b.at));
}
