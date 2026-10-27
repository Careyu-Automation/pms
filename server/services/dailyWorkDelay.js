function isoToday(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function shiftIso(iso, days) {
  const [year, month, day] = String(iso).slice(0, 10).split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return isoToday(date);
}

function diffDays(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const [y1, m1, d1] = String(fromIso).slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = String(toIso).slice(0, 10).split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / 86400000);
}

function dayLabel(days, late) {
  const noun = days === 1 ? 'day' : 'days';
  return late ? `Completed ${days} ${noun} late` : `${days} ${noun} overdue`;
}

function evaluateDeadline({ updateDate, deadline, status, completionDate }) {
  const blocked = status === 'BLOCKED';
  if (status === 'COMPLETED') {
    const done = completionDate || updateDate;
    if (!deadline || diffDays(deadline, done) <= 0) {
      return { delayStatus: 'COMPLETED_ON_TIME', delayDays: 0, displayLabel: 'On time' };
    }
    const days = diffDays(deadline, done);
    return { delayStatus: 'COMPLETED_LATE', delayDays: days, displayLabel: dayLabel(days, true) };
  }
  if (blocked && !deadline) {
    return { delayStatus: 'BLOCKED', delayDays: 0, displayLabel: 'Blocked' };
  }
  if (!deadline) {
    return { delayStatus: 'ON_TIME', delayDays: 0, displayLabel: 'On time' };
  }
  const days = diffDays(deadline, updateDate);
  if (blocked) {
    return days > 0
      ? { delayStatus: 'BLOCKED', delayDays: days, displayLabel: `Blocked · ${dayLabel(days, false)}` }
      : { delayStatus: 'BLOCKED', delayDays: 0, displayLabel: 'Blocked' };
  }
  if (days === 0) return { delayStatus: 'DUE_TODAY', delayDays: 0, displayLabel: 'Due today' };
  if (days > 0) return { delayStatus: 'OVERDUE', delayDays: days, displayLabel: dayLabel(days, false) };
  if (days >= -3) return { delayStatus: 'DUE_SOON', delayDays: 0, displayLabel: 'Due soon' };
  return { delayStatus: 'ON_TIME', delayDays: 0, displayLabel: 'On time' };
}

function reasonRequired(delay) {
  return ['OVERDUE', 'COMPLETED_LATE', 'BLOCKED'].includes(delay.delayStatus);
}

function rangeWindow(range, anchor, from, to) {
  const day = anchor || isoToday();
  if (range === 'custom') {
    return { from: from || day, to: to || from || day };
  }
  if (range === 'yesterday') {
    const previous = shiftIso(day, -1);
    return { from: previous, to: previous };
  }
  if (range === 'week' || range === 'last_week') {
    const [year, month, date] = day.split('-').map(Number);
    const current = new Date(year, month - 1, date);
    const weekday = current.getDay();
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const start = shiftIso(day, mondayOffset + (range === 'last_week' ? -7 : 0));
    return { from: start, to: shiftIso(start, 6) };
  }
  if (range === 'month') {
    const [year, month] = day.split('-');
    const last = new Date(Number(year), Number(month), 0).getDate();
    return { from: `${year}-${month}-01`, to: `${year}-${month}-${String(last).padStart(2, '0')}` };
  }
  return { from: day, to: day };
}

module.exports = {
  isoToday,
  shiftIso,
  diffDays,
  evaluateDeadline,
  reasonRequired,
  rangeWindow,
};
