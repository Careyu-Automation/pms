export const WORK_STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  ON_HOLD: 'On Hold',
  WAITING_CUSTOMER: 'Waiting for Customer',
  WAITING_VENDOR: 'Waiting for Vendor',
  WAITING_INTERNAL: 'Waiting for Internal Team',
  UNDER_REVIEW: 'Under Review',
};

export const STATUS_TONE = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'progress',
  COMPLETED: 'completed',
  BLOCKED: 'danger',
  ON_HOLD: 'hold',
  WAITING_CUSTOMER: 'warning',
  WAITING_VENDOR: 'warning',
  WAITING_INTERNAL: 'warning',
  UNDER_REVIEW: 'progress',
};

export const DELAY_TONE = {
  ON_TIME: 'completed',
  DUE_SOON: 'warning',
  DUE_TODAY: 'warning',
  OVERDUE: 'danger',
  COMPLETED_ON_TIME: 'completed',
  COMPLETED_LATE: 'warning',
  BLOCKED: 'danger',
};

export const PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export const DEPENDENCY_TYPE = {
  TEAM: 'Internal team',
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
  PROCUREMENT: 'Procurement',
  TECHNICAL: 'Technical information',
  MATERIAL: 'Material',
  APPROVAL: 'Approval',
  OTHER: 'Other',
};

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

export function weekdayLabel(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(year, month - 1, day));
}

function diffDays(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function dayLabel(days, late) {
  const noun = days === 1 ? 'day' : 'days';
  return late ? `Completed ${days} ${noun} late` : `${days} ${noun} overdue`;
}

export function previewDelay({ updateDate, deadline, status }) {
  if (status === 'COMPLETED') {
    if (!deadline || diffDays(deadline, updateDate) <= 0) return { delayStatus: 'COMPLETED_ON_TIME', displayLabel: 'On time' };
    const days = diffDays(deadline, updateDate);
    return { delayStatus: 'COMPLETED_LATE', displayLabel: dayLabel(days, true) };
  }
  if (status === 'BLOCKED') {
    if (deadline && diffDays(deadline, updateDate) > 0) {
      const days = diffDays(deadline, updateDate);
      return { delayStatus: 'BLOCKED', displayLabel: `Blocked · ${dayLabel(days, false)}` };
    }
    return { delayStatus: 'BLOCKED', displayLabel: 'Blocked' };
  }
  if (!deadline) return { delayStatus: 'ON_TIME', displayLabel: 'On time' };
  const days = diffDays(deadline, updateDate);
  if (days === 0) return { delayStatus: 'DUE_TODAY', displayLabel: 'Due today' };
  if (days > 0) return { delayStatus: 'OVERDUE', displayLabel: dayLabel(days, false) };
  if (days >= -3) return { delayStatus: 'DUE_SOON', displayLabel: 'Due soon' };
  return { delayStatus: 'ON_TIME', displayLabel: 'On time' };
}

export function formatWorkDate(iso) {
  if (!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

export function needsReason(preview) {
  return ['OVERDUE', 'COMPLETED_LATE', 'BLOCKED'].includes(preview.delayStatus);
}

export function blankDependency() {
  return { type: 'TEAM', employeeId: '', teamId: '', externalName: '', description: '' };
}
