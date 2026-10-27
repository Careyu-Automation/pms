export const TEAMS = [
  ['vision', 'Vision'],
  ['robotics', 'Robotics'],
  ['software', 'Software'],
  ['procurement', 'Procurement'],
  ['execution', 'Execution'],
];

export const TASK_STATUS = {
  NOT_STARTED: 'Not started',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  AT_RISK: 'At risk',
  ON_HOLD: 'On hold',
  BLOCKED: 'Blocked',
  CANCELLED: 'Cancelled',
};

export const PRIORITY = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };

export function parseDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function isoDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(value, days) {
  const date = parseDate(value);
  if (!date) return value;
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function diffDays(from, to) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return 0;
  return Math.round((end - start) / 86400000);
}

export function todayIso() {
  return isoDate(new Date());
}

function startOfWeek(date) {
  const next = new Date(date);
  const day = next.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + shift);
  return next;
}

export function shortDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

export function timelineRange(project, tasks, milestones, mode) {
  const dates = [];
  if (project?.startDate) dates.push(project.startDate);
  if (project?.targetDate) dates.push(project.targetDate);
  tasks.forEach((task) => {
    if (task.startDate) dates.push(task.startDate);
    if (task.endDate) dates.push(task.endDate);
  });
  milestones.forEach((item) => {
    if (item.date) dates.push(item.date);
  });
  if (!dates.length) {
    const today = todayIso();
    dates.push(today, addDays(today, 27));
  }
  let start = dates.reduce((left, right) => (left < right ? left : right));
  let end = dates.reduce((left, right) => (left > right ? left : right));
  if (mode === 'week') {
    const weekStart = startOfWeek(parseDate(start));
    const weekEnd = startOfWeek(parseDate(end));
    if (weekStart) start = isoDate(weekStart);
    if (weekEnd) end = addDays(isoDate(weekEnd), 6);
  } else if (mode === 'month') {
    const first = parseDate(start);
    const last = parseDate(end);
    if (first) start = isoDate(new Date(first.getFullYear(), first.getMonth(), 1));
    if (last) end = isoDate(new Date(last.getFullYear(), last.getMonth() + 1, 0));
  }
  if (!parseDate(start) || !parseDate(end) || end < start) {
    const today = todayIso();
    return { start: today, end: addDays(today, 27) };
  }
  return { start, end };
}

export function timelineColumns(range, mode, dayWidth) {
  const columns = [];
  if (!parseDate(range?.start) || !parseDate(range?.end)) return columns;
  if (mode === 'day') {
    for (let cursor = range.start; cursor <= range.end && columns.length < 800; cursor = addDays(cursor, 1)) {
      const date = parseDate(cursor);
      if (!date) break;
      columns.push({
        key: cursor,
        label: String(date.getDate()),
        sub: date.toLocaleDateString(undefined, { weekday: 'short' }),
        x: diffDays(range.start, cursor) * dayWidth,
        width: dayWidth,
      });
    }
    return columns;
  }
  if (mode === 'month') {
    let cursor = parseDate(range.start);
    const last = parseDate(range.end);
    while (cursor && last && cursor <= last && columns.length < 240) {
      const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const key = isoDate(cursor);
      columns.push({
        key,
        label: cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        sub: '',
        x: diffDays(range.start, key) * dayWidth,
        width: days * dayWidth,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return columns;
  }
  let cursor = range.start;
  let week = 1;
  while (cursor && cursor <= range.end && columns.length < 520) {
    const weekEnd = addDays(cursor, 6);
    columns.push({
      key: cursor,
      label: `Week ${week}`,
      sub: `${shortDate(cursor)} – ${shortDate(weekEnd)}`,
      x: diffDays(range.start, cursor) * dayWidth,
      width: 7 * dayWidth,
    });
    week += 1;
    cursor = addDays(cursor, 7);
  }
  return columns;
}

export function barStyle(startDate, endDate, rangeStart, dayWidth) {
  const left = diffDays(rangeStart, startDate) * dayWidth;
  const width = (diffDays(startDate, endDate) + 1) * dayWidth;
  return { left, width: Math.max(width, 8) };
}

export function taskTone(task) {
  if (task.status === 'COMPLETED') return 'done';
  if (task.overdue || task.status === 'CANCELLED') return 'delayed';
  if (task.status === 'AT_RISK') return 'risk';
  if (task.status === 'IN_PROGRESS') return 'active';
  return 'upcoming';
}

export function durationDays(startDate, endDate) {
  return diffDays(startDate, endDate) + 1;
}
