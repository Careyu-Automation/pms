const STATUS_LABEL = {
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

const PRIORITY_LABEL = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const STATUS_BADGE = {
  NOT_STARTED: { bg: '#eef2f7', color: '#3d4f63', border: '#c5d0dc' },
  IN_PROGRESS: { bg: '#e8f1ff', color: '#0b4ea2', border: '#b7d0f5' },
  COMPLETED: { bg: '#e7f6ed', color: '#0f6b3a', border: '#b7e0c6' },
  BLOCKED: { bg: '#fff2cc', color: '#7a5b00', border: '#f1c232' },
  ON_HOLD: { bg: '#f3f0ff', color: '#4b3f72', border: '#d4ccec' },
};

function nameFromDependencyItem(item) {
  if (item == null || item === '') return '';
  if (typeof item === 'string') {
    const text = item.trim();
    if (!text || text === 'null' || text === 'undefined') return '';
    return text;
  }
  if (typeof item === 'object') {
    return String(item.name || item.label || item.fullName || item.full_name || item.external_name || '').trim();
  }
  return '';
}

function formatDependencyNames(value) {
  if (value == null || value === '') return '—';
  if (Array.isArray(value)) {
    const names = value.map(nameFromDependencyItem).filter(Boolean);
    return names.length ? [...new Set(names)].join(', ') : '—';
  }
  if (typeof value === 'object') {
    const name = nameFromDependencyItem(value);
    return name || '—';
  }
  const text = String(value).trim();
  if (!text || text === 'None' || text === 'NONE' || text === 'null' || text === 'undefined') return '—';
  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try {
      return formatDependencyNames(JSON.parse(text));
    } catch {
      return '—';
    }
  }
  if (text.includes('[object Object]')) return '—';
  return text;
}

function dependencyText(row) {
  if (!row) return '—';
  if (Array.isArray(row.dependencies) && row.dependencies.length) {
    const names = row.dependencies.map((item) => nameFromDependencyItem(item) || String(item.label || '').trim()).filter(Boolean);
    if (names.length) return [...new Set(names)].join(', ');
  }
  const fromDetails = formatDependencyNames(row.dependencyDetails);
  if (fromDetails !== '—') return fromDetails;
  if (row.dependencyText) return formatDependencyNames(row.dependencyText);
  return '—';
}

function statusLabel(status) {
  const key = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_LABEL[key] || STATUS_LABEL[status] || (status ? String(status).replace(/_/g, ' ') : '—');
}

function priorityLabel(priority) {
  const key = String(priority || '').trim().toUpperCase();
  return PRIORITY_LABEL[key] || priority || '—';
}

function statusBadgeStyle(status) {
  const key = String(status || '').trim().toUpperCase().replace(/\s+/g, '_');
  return STATUS_BADGE[key] || STATUS_BADGE.IN_PROGRESS;
}

function workDescription(row) {
  const title = String(row.workTitle || row.title || '').trim();
  const body = String(row.description || '').trim();
  if (body && title && body !== title && title !== 'Daily work') return `${title}\n${body}`;
  if (body && body !== 'Daily work') return body;
  if (title && title !== 'Daily work') return title;
  return '—';
}

function groupByEmployee(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const id = row.employeeId || row.employee_id || `name:${row.employeeName || 'Unknown'}`;
    const name = String(row.employeeName || row.employee_name || 'Unknown').trim() || 'Unknown';
    const existing = groups.get(id);
    if (existing) existing.rows.push(row);
    else groups.set(id, { employeeId: id, employeeName: name, rows: [row] });
  });
  return [...groups.values()].sort((a, b) => {
    const byName = a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' });
    if (byName) return byName;
    return String(a.employeeId).localeCompare(String(b.employeeId));
  });
}

function reportColumns() {
  return ['Project', 'Work Description', 'Status', 'Dependencies', 'Priority', 'Next Action / Remarks'];
}

function reportRowCells(row) {
  return [
    row.projectName || 'No project',
    workDescription(row),
    statusLabel(row.status),
    dependencyText(row),
    priorityLabel(row.priority),
    row.nextAction || row.reasonForDelay || '—',
  ];
}

function excelFlatRow(row) {
  return [
    row.employeeName || '—',
    ...reportRowCells(row),
  ];
}

module.exports = {
  STATUS_LABEL,
  PRIORITY_LABEL,
  formatDependencyNames,
  dependencyText,
  statusLabel,
  priorityLabel,
  statusBadgeStyle,
  workDescription,
  groupByEmployee,
  reportColumns,
  reportRowCells,
  excelFlatRow,
};
