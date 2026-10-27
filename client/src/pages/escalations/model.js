export const TYPES = [
  ['PROJECT_DELAY', 'Project Delay'],
  ['TECHNICAL', 'Technical Issue'],
  ['CUSTOMER', 'Customer Issue'],
  ['PROCUREMENT', 'Procurement Issue'],
  ['VENDOR', 'Vendor Issue'],
  ['RESOURCE', 'Resource Issue'],
  ['QUALITY', 'Quality Issue'],
  ['SAFETY', 'Safety Issue'],
  ['INTEGRATION', 'Integration Issue'],
  ['REQUIREMENT', 'Requirement Change'],
  ['COMMERCIAL', 'Commercial Issue'],
  ['PRODUCTION', 'Production Issue'],
  ['INSTALLATION', 'Installation Issue'],
  ['OTHER', 'Other'],
];

export const PRIORITIES = [
  ['LOW', 'Low'],
  ['MEDIUM', 'Medium'],
  ['HIGH', 'High'],
  ['CRITICAL', 'Critical'],
];

export const STATUSES = [
  ['OPEN', 'Open'],
  ['ASSIGNED', 'Assigned'],
  ['UNDER_REVIEW', 'Under Review'],
  ['ACTION_REQUIRED', 'Action Required'],
  ['WAITING_FOR_RESPONSE', 'Waiting for Response'],
  ['RESOLVED', 'Resolved'],
  ['CLOSED', 'Closed'],
  ['REJECTED', 'Rejected'],
  ['CANCELLED', 'Cancelled'],
];

export const LEVELS = [
  ['TEAM', 'Team Lead'],
  ['PROJECT', 'Project Manager'],
  ['DEPARTMENT', 'Department Head'],
  ['MANAGEMENT', 'Management'],
];

export const IMPACTS = [
  ['SCHEDULE', 'Schedule'],
  ['COST', 'Cost'],
  ['CUSTOMER', 'Customer'],
  ['QUALITY', 'Quality'],
  ['SAFETY', 'Safety'],
  ['PRODUCTION', 'Production'],
  ['TECHNICAL', 'Technical'],
  ['RESOURCE', 'Resource'],
  ['PROCUREMENT', 'Procurement'],
  ['OTHER', 'Other'],
];

export const NEXT = {
  OPEN: ['ASSIGNED', 'UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  ASSIGNED: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CANCELLED'],
  UNDER_REVIEW: ['ACTION_REQUIRED', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CANCELLED'],
  ACTION_REQUIRED: ['WAITING_FOR_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_RESPONSE: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
  REJECTED: ['OPEN'],
  CANCELLED: ['OPEN'],
};

export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const TYPE_LABEL = Object.fromEntries(TYPES);
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES);
export const LEVEL_LABEL = Object.fromEntries(LEVELS);
export const IMPACT_LABEL = Object.fromEntries(IMPACTS);

export function blankEscalation(seed = {}) {
  return {
    title: '',
    type: 'TECHNICAL',
    priority: 'MEDIUM',
    description: '',
    impactArea: '',
    impactSeverity: '',
    recommendedAction: '',
    projectId: '',
    customerName: '',
    teamId: '',
    assignedTo: '',
    dueDate: '',
    taskId: '',
    workRequestId: '',
    leadId: '',
    feasibilityId: '',
    costingId: '',
    ...seed,
  };
}

export function rowToForm(row) {
  return blankEscalation({
    title: row.title,
    type: row.type,
    priority: row.priority,
    description: row.description,
    impactArea: row.impactArea || '',
    impactSeverity: row.impactSeverity || '',
    recommendedAction: row.recommendedAction || '',
    projectId: row.projectId || '',
    customerName: row.customerName || '',
    teamId: row.teamId || '',
    assignedTo: row.assignedToId || '',
    dueDate: row.dueDate || '',
    taskId: row.taskId || '',
    workRequestId: row.workRequestId || '',
    leadId: row.leadId || '',
    feasibilityId: row.feasibilityId || '',
    costingId: row.costingId || '',
  });
}

export function stamp(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
    timeZone: 'Asia/Kolkata',
  }).format(date);
}

export function escalationFieldErrors(form) {
  const errors = {};
  if (String(form?.title || '').trim().length < 2) errors.title = 'Escalation title is required.';
  if (!form?.type) errors.type = 'Select an escalation type.';
  if (!form?.priority) errors.priority = 'Select a priority.';
  if (String(form?.description || '').trim().length < 2) errors.description = 'Description is required.';
  return errors;
}

export const FILE_TYPES = ['pdf', 'xls', 'xlsx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'csv', 'txt'];

export function peopleForTeam(options, teamId) {
  const people = options?.people || [];
  if (!teamId) return people;
  const ids = new Set((options.members || []).filter((item) => item.teamId === teamId).map((item) => item.userId));
  const members = people.filter((person) => ids.has(person.id));
  return members.length ? members : people;
}
