const STATUS_TONE = {
  'In Progress': 'progress',
  Planning: 'neutral',
  'On Hold': 'hold',
  Delayed: 'danger',
  Completed: 'completed',
  Pending: 'pending',
  Overdue: 'danger',
};

const PRIORITY_TONE = {
  High: 'danger',
  Medium: 'warning',
  Low: 'neutral',
};

export function statusTone(status) {
  return STATUS_TONE[status] || 'neutral';
}

export function priorityTone(priority) {
  return PRIORITY_TONE[priority] || 'neutral';
}
