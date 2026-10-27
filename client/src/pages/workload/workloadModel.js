export const STATUS_LABEL = {
  UNDERUTILIZED: 'Underutilized',
  HEALTHY: 'Healthy',
  NEAR_CAPACITY: 'Near capacity',
  OVER_CAPACITY: 'Over capacity',
  OVERLOADED: 'Overloaded',
};

export const STATUS_TONE = {
  UNDERUTILIZED: 'info',
  HEALTHY: 'completed',
  NEAR_CAPACITY: 'pending',
  OVER_CAPACITY: 'warning',
  OVERLOADED: 'danger',
};

export function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function startOfWeek(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  return shiftIso(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function formatHours(value) {
  const amount = Number(value) || 0;
  const text = Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
  return `${text}h`;
}

export function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${Math.round(Number(value))}%`;
}

export function periodLabel(period) {
  if (!period?.start) return '';
  const [year, month, day] = period.start.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const stamp = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  return `${weekday}, ${stamp}`;
}

export function shiftMonth(iso, direction) {
  const [year, month] = iso.split('-').map(Number);
  const date = new Date(year, month - 1 + direction, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

export function weekdayLabel(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: 'short' });
}
