import { PRIORITY_LABEL, STATUS_LABEL } from './model';

export function EscalationStatusBadge({ status, overdue }) {
  const key = String(status || 'OPEN').toLowerCase();
  return (
    <span className="esc-badge-row">
      <span className={`esc-status esc-status--${key}`}>{STATUS_LABEL[status] || status}</span>
      {overdue ? <span className="esc-status esc-status--overdue">Overdue</span> : null}
    </span>
  );
}

export function EscalationPriorityBadge({ priority }) {
  const key = String(priority || 'MEDIUM').toLowerCase();
  return <span className={`esc-priority esc-priority--${key}`}>{PRIORITY_LABEL[priority] || priority}</span>;
}
