export function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDayCount(days) {
  const value = Number(days);
  if (!value) return '—';
  return value === 1 ? '1 day' : `${value} day${value === 0.5 ? '' : 's'}`.replace('0.5 days', '0.5 day');
}

export function formatMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0);
  if (value < 1) return '—';
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (hours && rest) return `${hours}h ${rest}m`;
  if (hours) return `${hours}h`;
  return `${rest}m`;
}

export function requestDays(item) {
  if (item.kind === 'PERMISSION') return formatMinutes(item.durationMinutes);
  return formatDayCount(item.durationDays);
}

function isWorkingDay(iso, weekends, holidays) {
  const holiday = holidays.find((item) => item.date === iso);
  const [year, month, day] = iso.split('-').map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (holiday) return Boolean(holiday.isWorkingDay);
  return !weekends.has(weekday);
}

export function estimateLeaveDays(start, end, durationType, holidays = [], weekendDays = [0, 6]) {
  if (!start || !end || end < start) return null;
  const weekends = new Set((weekendDays || [0, 6]).map(Number));
  if (durationType !== 'FULL') {
    if (start !== end || !isWorkingDay(start, weekends, holidays)) return null;
    return 0.5;
  }
  let count = 0;
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 370) {
    if (isWorkingDay(cursor, weekends, holidays)) count += 1;
    cursor = shiftIso(cursor, 1);
    guard += 1;
  }
  return count;
}

export function formatAmount(value) {
  const amount = Number(value) || 0;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}

export const STATUS_TONE = {
  PENDING: 'pending',
  APPROVED: 'completed',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
  CANCELLED: 'hold',
};

export const STATUS_LABEL = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  CANCELLED: 'Cancelled',
};

export const DURATION_LABEL = {
  FULL: 'Full Day',
  FIRST_HALF: 'Half Day - First Half',
  SECOND_HALF: 'Half Day - Second Half',
};
