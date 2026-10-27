import { api } from '../services/api';
import { listLeads } from '../services/leads.service';
import { listProjects } from '../services/costing.service';
import { listTasks } from '../services/planning.service';
import { getTeam, listTeams } from '../services/teams.service';
import { formatDate, formatDateTime } from '../utils/format';

const TEAMS = [
  ['vision', 'Vision Team', 'vision'],
  ['robotics', 'Robotics Team', 'robotics'],
  ['software', 'Software Team', 'software'],
  ['procurement', 'Procurement Team', 'procurement'],
  ['execution', 'Execution Team', 'execution'],
];

const PROJECT_LABEL = {
  NOT_STARTED: 'Planning',
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const PRIORITY_LABEL = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };

function taskStatus(task) {
  if (task.overdue && task.status !== 'COMPLETED') return 'Overdue';
  if (task.status === 'COMPLETED') return 'Completed';
  if (task.status === 'IN_PROGRESS' || task.status === 'AT_RISK') return 'In Progress';
  return 'Pending';
}

function teamCodes(project, tasks) {
  const codes = new Set();
  String(project.teams || '').split(',').map((item) => item.trim()).filter(Boolean).forEach((code) => codes.add(code));
  if (project.teamCode) codes.add(project.teamCode);
  tasks.filter((task) => task.projectId === project.id && task.teamCode).forEach((task) => codes.add(task.teamCode));
  return [...codes];
}

function pipelineFrom(leads) {
  const buckets = [
    ['new', 'New'],
    ['qualification', 'Qualification'],
    ['feasibility', 'Feasibility'],
    ['quotation', 'Quotation'],
    ['negotiation', 'Negotiation'],
    ['won', 'Won', 'won'],
    ['lost', 'Lost', 'lost'],
  ];
  const counts = Object.fromEntries(buckets.map(([id]) => [id, 0]));
  leads.forEach((lead) => {
    const stage = `${lead.stage || ''} ${lead.status || ''}`.toLowerCase();
    if (stage.includes('lost') || stage.includes('reject')) counts.lost += 1;
    else if (stage.includes('project') || stage.includes('won') || stage.includes('convert')) counts.won += 1;
    else if (stage.includes('negot')) counts.negotiation += 1;
    else if (stage.includes('quot') || stage.includes('cost')) counts.quotation += 1;
    else if (stage.includes('feas')) counts.feasibility += 1;
    else if (stage.includes('review') || stage.includes('qual')) counts.qualification += 1;
    else counts.new += 1;
  });
  return buckets.map(([id, label, tone]) => ({ id, label, count: counts[id], tone }));
}

function whenLabel(iso) {
  if (!iso) return 'Scheduled';
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  if (iso === todayIso) return 'Today';
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (iso === tomorrowIso) return 'Tomorrow';
  return formatDate(iso);
}

export async function loadLiveWorkspace() {
  const [projectPayload, taskPayload, minePayload, leadPayload] = await Promise.all([
    listProjects(),
    listTasks(),
    listTasks('mine').catch(() => ({ data: { tasks: [] } })),
    listLeads().catch(() => ({ data: { leads: [] } })),
  ]);
  const projects = projectPayload.data.projects || [];
  const tasks = taskPayload.data.tasks || [];
  const mine = minePayload.data.tasks || [];
  const leads = leadPayload.data.leads || [];
  const activity = projectPayload.data.activity || [];
  const workflow = await api('/workflow/summary').catch(() => ({ data: { queues: [] } }));
  return { projects, tasks, mine, leads, activity, managers: projectPayload.data.managers || [], workflow: workflow.data?.queues || [] };
}

export async function loadDashboard() {
  const data = await loadLiveWorkspace();
  const active = data.projects.filter((project) => !['COMPLETED', 'CANCELLED'].includes(project.status));
  const pending = data.tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status));
  const overdue = data.tasks.filter((task) => task.overdue);
  const completed = data.projects.filter((project) => project.status === 'COMPLETED');
  const today = new Date().toISOString().slice(0, 10);
  const bucketOf = (project) => {
    if (project.status === 'COMPLETED') return 'completed';
    if (project.status === 'CANCELLED') return 'cancelled';
    if (project.status === 'ON_HOLD') return 'hold';
    const delayed = project.status === 'AT_RISK' || (project.targetDate && project.targetDate < today);
    if (delayed) return 'delayed';
    if (project.status === 'IN_PROGRESS') return 'progress';
    return 'planning';
  };
  const countBucket = (id) => data.projects.filter((project) => bucketOf(project) === id).length;

  return {
    kpis: [
      { id: 'total', label: 'Total Projects', value: String(data.projects.length), note: 'From the project register', tone: 'positive' },
      { id: 'active', label: 'Active Projects', value: String(active.length), note: 'Planning, in progress, and on hold' },
      { id: 'pending', label: 'Pending Tasks', value: String(pending.length), note: 'Open tasks across projects' },
      { id: 'overdue', label: 'Overdue', value: String(overdue.length), note: 'Tasks past their due date', tone: 'attention' },
      { id: 'completed', label: 'Completed', value: String(completed.length), note: 'Completed projects' },
    ],
    statuses: [
      { id: 'planning', label: 'Planning', count: countBucket('planning'), color: 'var(--chart-planning)' },
      { id: 'progress', label: 'In Progress', count: countBucket('progress'), color: 'var(--chart-progress)' },
      { id: 'hold', label: 'On Hold', count: countBucket('hold'), color: 'var(--chart-hold)' },
      { id: 'delayed', label: 'Delayed', count: countBucket('delayed'), color: 'var(--chart-delayed)' },
      { id: 'completed', label: 'Completed', count: countBucket('completed'), color: 'var(--chart-completed)' },
    ],
    pipeline: pipelineFrom(data.leads),
    projects: active.slice(0, 8).map((project) => ({
      id: project.projectCode,
      projectId: project.id,
      code: project.projectCode,
      name: project.title,
      customer: project.customerName || 'Not specified',
      manager: project.projectManager || 'Not assigned',
      progress: project.progress || 0,
      status: PROJECT_LABEL[project.status] || project.status,
      deadline: formatDate(project.targetDate),
      priority: PRIORITY_LABEL[project.priority] || project.priority,
    })),
    deadlines: [...data.tasks]
      .filter((task) => task.endDate && task.status !== 'COMPLETED' && task.status !== 'CANCELLED')
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .slice(0, 6)
      .map((task) => ({
        id: task.id,
        when: whenLabel(task.endDate),
        task: task.title,
        project: task.projectCode || task.productCode,
        owner: task.assignee || 'Unassigned',
      })),
    myWork: data.mine.slice(0, 6).map((task) => ({
      id: task.id,
      taskId: task.id,
      task: task.title,
      project: task.projectCode || task.productCode,
      due: whenLabel(task.endDate),
      priority: PRIORITY_LABEL[task.priority] || task.priority,
      status: taskStatus(task),
    })),
    workload: TEAMS.map(([id, label]) => {
      const owned = data.tasks.filter((task) => task.teamCode === id && task.status !== 'CANCELLED');
      const value = owned.length ? Math.round(owned.reduce((sum, task) => sum + (task.progress || 0), 0) / owned.length) : 0;
      return { id, label, value };
    }).filter((team) => team.value > 0 || data.tasks.some((task) => task.teamCode === team.id)),
    workflow: data.workflow || [],
    activity: data.activity.slice(0, 6).map((item) => ({
      id: item.id,
      time: formatDateTime(item.createdAt),
      title: item.actor ? `${item.actor} · ${item.action}` : item.action,
      ref: item.projectCode,
      kind: /document|upload/i.test(item.action) ? 'upload' : /status|complete/i.test(item.action) ? 'status' : 'approved',
    })),
  };
}

export function teamWorkspaceFrom(data) {
  const tasksByProject = new Map();
  data.tasks.forEach((task) => {
    const list = tasksByProject.get(task.projectId) || [];
    list.push(task);
    tasksByProject.set(task.projectId, list);
  });
  const projects = data.projects.map((project) => {
    const codes = teamCodes(project, data.tasks);
    return {
      id: project.id,
      name: project.title,
      customer: project.customerName || '',
      progress: project.progress || 0,
      status: PROJECT_LABEL[project.status] || project.status,
      deadline: formatDate(project.targetDate),
      deadlineDate: project.targetDate || '',
      contributions: codes.map((teamId) => ({
        teamId,
        level: codes.length === 1 ? 'Primary' : 'Supporting',
        percent: project.progress || 0,
      })),
    };
  });
  const known = new Map(TEAMS.map(([id, name, tone]) => [id.toLowerCase(), { id, name, tone }]));
  data.tasks.forEach((task) => {
    const code = String(task.teamCode || '').trim();
    if (!code || known.has(code.toLowerCase())) return;
    known.set(code.toLowerCase(), { id: code, name: code, tone: 'software' });
  });
  const members = [];
  const seen = new Set();
  data.tasks.forEach((task) => {
    if (!task.assigneeId || !task.teamCode) return;
    const key = `${task.teamCode}:${task.assigneeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const manager = data.managers.find((person) => person.id === task.assigneeId);
    members.push({
      id: task.assigneeId,
      teamId: task.teamCode,
      name: task.assignee || 'Member',
      designation: manager?.roleName || 'Team member',
    });
  });
  const tasks = data.tasks.filter((task) => task.teamCode).map((task) => ({
    id: task.id,
    teamId: task.teamCode,
    assigneeId: task.assigneeId || '',
    projectId: task.projectId,
    title: task.title,
    priority: PRIORITY_LABEL[task.priority] || 'Medium',
    due: formatDate(task.endDate),
    dueDate: task.endDate,
    status: taskStatus(task),
    progress: task.progress || 0,
  }));
  const activity = data.tasks.filter((task) => task.teamCode).slice(0, 24).map((task) => ({
    id: `${task.id}-activity`,
    teamId: task.teamCode,
    memberId: task.assigneeId || null,
    action: `${task.title} updated`,
    projectId: task.projectId,
    time: formatDateTime(task.updatedAt),
    date: String(task.updatedAt || task.endDate || '').slice(0, 10),
  }));
  return {
    updatedAt: formatDateTime(new Date().toISOString()),
    teams: [...known.values()],
    members,
    projects,
    tasks,
    activity,
  };
}

const MEMBER_ROLE = {
  TEAM_LEAD: 'Team Lead',
  SENIOR_MEMBER: 'Senior Member',
  MEMBER: 'Member',
  OVERSIGHT: 'Oversight',
  PROJECT_COORDINATION: 'Project Coordinator',
};

const PROJECT_ROLE = {
  PRIMARY: 'Primary',
  MAJOR: 'Major',
  SUPPORTING: 'Supporting',
  MINOR: 'Minor',
};

function applyTeamRecords(workspace, details) {
  const seenCodes = new Set();
  const seenNames = new Set();
  const teams = [];
  const kept = [];
  details.forEach((detail) => {
    const code = String(detail?.team?.code || '').trim();
    const name = String(detail?.team?.name || '').trim();
    if (!code || !name) return;
    const codeKey = code.toLowerCase();
    const nameKey = name.toLowerCase();
    if (seenCodes.has(codeKey) || seenNames.has(nameKey)) return;
    seenCodes.add(codeKey);
    seenNames.add(nameKey);
    teams.push({ id: code, name, tone: code });
    kept.push(detail);
  });
  if (!teams.length) teams.push(...workspace.teams);

  const members = kept.flatMap((detail) => detail.members
    .filter((member) => member.status === 'ACTIVE' && ['TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER'].includes(member.role))
    .map((member) => ({
      id: member.userId,
      teamId: detail.team.code,
      name: member.name,
      designation: member.designation || MEMBER_ROLE[member.role] || 'Member',
    })));

  const contributionByProject = new Map();
  const progressByProject = new Map();
  kept.forEach((detail) => {
    detail.projects.forEach((project) => {
      const links = contributionByProject.get(project.projectId) || [];
      links.push({
        teamId: detail.team.code,
        level: PROJECT_ROLE[project.teamRole] || 'Supporting',
        percent: project.contributionPercent,
      });
      contributionByProject.set(project.projectId, links);
      progressByProject.set(project.projectId, project.projectProgress);
      if (!workspace.projects.some((item) => item.id === project.projectId)) {
        workspace.projects.push({
          id: project.projectId,
          name: project.projectName,
          customer: project.customerName,
          progress: project.projectProgress,
          status: PROJECT_LABEL[project.projectStatus] || project.projectStatus,
          deadline: formatDate(project.dueDate),
          deadlineDate: project.dueDate || '',
          contributions: [],
        });
      }
    });
  });

  const projects = workspace.projects.map((project) => {
    const links = contributionByProject.get(project.id);
    if (!links) return { ...project, contributions: [] };
    return {
      ...project,
      progress: progressByProject.get(project.id) ?? project.progress,
      contributions: links,
    };
  });

  const activity = kept.flatMap((detail) => detail.activity.map((item) => ({
    id: item.id,
    teamId: detail.team.code,
    memberId: item.actorId || null,
    userName: item.actorName,
    action: item.action,
    projectId: '',
    time: formatDateTime(item.createdAt),
    date: String(item.createdAt || '').slice(0, 10),
  })));

  return { ...workspace, teams, members, projects, activity };
}

export async function loadTeamDashboard() {
  const data = await loadLiveWorkspace();
  const workspace = teamWorkspaceFrom(data);
  try {
    const listed = await listTeams();
    const details = await Promise.all((listed.data?.teams || []).map((team) => getTeam(team.id).then((payload) => payload.data)));
    return applyTeamRecords(workspace, details);
  } catch {
    return workspace;
  }
}
