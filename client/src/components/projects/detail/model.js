export const PROJECT_STATUS = {
  NOT_STARTED: { label: 'Not Started', tone: 'neutral' },
  PLANNING: { label: 'Planning', tone: 'review' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'hold' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const PRIORITY = {
  LOW: { label: 'Low', tone: 'neutral' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  HIGH: { label: 'High', tone: 'danger' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export const TASK_STATUS = {
  NOT_STARTED: { label: 'Not Started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'hold' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

export const MILESTONE_STATUS = {
  PENDING: { label: 'Upcoming', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  MISSED: { label: 'Delayed', tone: 'danger' },
};

export const TEAMS = [
  ['vision', 'Vision'],
  ['robotics', 'Robotics'],
  ['software', 'Software'],
  ['procurement', 'Procurement'],
  ['execution', 'Execution'],
];

export const TABS = [
  ['overview', 'Overview'],
  ['tasks', 'Tasks'],
  ['board', 'Board'],
  ['timeline', 'Timeline'],
  ['calendar', 'Calendar'],
  ['hours', 'Hours'],
  ['milestones', 'Milestones'],
];

export const BOARD = [
  { id: 'todo', label: 'To Do', status: 'NOT_STARTED', match: ['NOT_STARTED', 'AT_RISK', 'CANCELLED'] },
  { id: 'progress', label: 'In Progress', status: 'IN_PROGRESS', match: ['IN_PROGRESS'] },
  { id: 'hold', label: 'On Hold', status: 'ON_HOLD', match: ['ON_HOLD', 'BLOCKED'] },
  { id: 'done', label: 'Completed', status: 'COMPLETED', match: ['COMPLETED'] },
];

const HEALTH = {
  'ON TRACK': 'On Track',
  'NOT ASSESSED': 'Not assessed',
  'ON HOLD': 'On Hold',
  DELAYED: 'Delayed',
  'AT RISK': 'At Risk',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export function teamLabel(code) {
  return TEAMS.find(([value]) => value === code)?.[1] || '';
}

export function projectTeamName(project) {
  if (!project) return 'Not assigned';
  if (project.teamCode) return teamLabel(project.teamCode) || project.teamCode;
  const first = String(project.teams || '').split(',')[0]?.trim();
  if (!first) return 'Not assigned';
  return teamLabel(first) || first;
}

export function canManage(user) {
  const code = user?.role?.code || '';
  return ['admin', 'super_admin', 'project_manager', 'management', 'employee'].includes(code);
}

export function accessFor(project, user) {
  if (project?.access) return project.access;
  const allowed = canManage(user);
  return { canEdit: allowed, canDelete: allowed, canComplete: allowed, canPlan: allowed };
}

export function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function blankTask(seed = {}) {
  const today = todayIso();
  return {
    title: '',
    description: '',
    assigneeId: '',
    teamCode: seed.teamCode || '',
    startDate: seed.startDate || today,
    endDate: seed.endDate || seed.startDate || today,
    priority: 'MEDIUM',
    status: 'NOT_STARTED',
    estimatedHours: '',
    tags: '',
    progress: 0,
    phaseId: '',
  };
}

export function taskToForm(task) {
  return {
    title: task.title || '',
    description: task.description || '',
    assigneeId: task.assigneeId || '',
    teamCode: task.teamCode || '',
    startDate: task.startDate || '',
    endDate: task.endDate || '',
    priority: task.priority || 'MEDIUM',
    status: task.status || 'NOT_STARTED',
    estimatedHours: task.estimatedHours ?? '',
    tags: task.tags || '',
    progress: task.progress || 0,
    phaseId: task.phaseId || '',
  };
}

export function taskPayload(form) {
  return {
    ...form,
    progress: Number(form.progress) || 0,
    estimatedHours: form.estimatedHours === '' ? null : Number(form.estimatedHours),
  };
}

export function milestoneProgress(status) {
  if (status === 'COMPLETED') return 100;
  if (status === 'IN_PROGRESS') return 50;
  return 0;
}

export function scheduleLabel(summary) {
  return HEALTH[summary?.health] || 'Not assessed';
}

export function hoursSummary(tasks = [], entries = []) {
  const estimated = tasks
    .filter((task) => task.status !== 'CANCELLED')
    .reduce((sum, task) => sum + (Number(task.estimatedHours) || 0), 0);
  const actual = entries.reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  const billable = entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  return {
    estimated,
    actual,
    billable,
    nonBillable: Math.max(0, actual - billable),
    remaining: Math.max(0, estimated - actual),
    variance: actual - estimated,
  };
}

export function hourText(value) {
  const number = Math.round((Number(value) || 0) * 10) / 10;
  return `${number}h`;
}

export function fileKind(name = '') {
  const ext = String(name).split('.').pop();
  return ext && ext !== name ? ext.toUpperCase() : 'FILE';
}

export function projectMembers(project, tasks) {
  const map = new Map();
  if (project?.projectManager) {
    map.set(project.projectManagerId || 'manager', {
      id: project.projectManagerId || 'manager',
      name: project.projectManager,
      role: 'Project Manager',
      progressValues: [],
      taskCount: 0,
    });
  }
  tasks.forEach((task) => {
    if (!task.assigneeId) return;
    const current = map.get(task.assigneeId) || {
      id: task.assigneeId,
      name: task.assignee || 'Member',
      role: teamLabel(task.teamCode) || 'Member',
      progressValues: [],
      taskCount: 0,
    };
    current.taskCount += 1;
    current.progressValues.push(task.progress || 0);
    if (current.role === 'Member' && task.teamCode) current.role = teamLabel(task.teamCode) || current.role;
    map.set(task.assigneeId, current);
  });
  return [...map.values()].map((member) => ({
    ...member,
    progress: member.progressValues.length
      ? Math.round(member.progressValues.reduce((sum, value) => sum + value, 0) / member.progressValues.length)
      : 0,
  }));
}
