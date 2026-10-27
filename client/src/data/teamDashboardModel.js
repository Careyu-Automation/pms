function isoToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

export const TASK_STATUSES = ['All', 'Pending', 'In Progress', 'Completed', 'Overdue'];
export const PRIORITIES = ['All', 'Critical', 'High', 'Medium', 'Low'];
export const DATE_RANGES = [
  { id: 'all', label: 'All dates' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];

const CATALOG_TEAMS = {
  vision: 'Vision Team',
  robotics: 'Robotics Team',
  software: 'Software Team',
  procurement: 'Procurement Team',
  execution: 'Execution Team',
};

function teamFamily(team) {
  const text = `${team?.id || ''} ${team?.name || ''}`.toLowerCase();
  if (/\bsoftware\b/.test(text)) return 'software';
  if (/\bvision\b/.test(text)) return 'vision';
  if (/\brobot/.test(text)) return 'robotics';
  if (/\bprocur|\bcosting\b/.test(text)) return 'procurement';
  if (/\bexecut/.test(text)) return 'execution';
  return '';
}

function isCatalogTeam(team) {
  return CATALOG_TEAMS[String(team?.id || '').trim()] === String(team?.name || '').trim();
}

export function uniqueDashboardTeams(teams) {
  const list = (Array.isArray(teams) ? teams : []).filter((team) => String(team?.id || '').trim());
  const grouped = new Map();
  list.forEach((team) => {
    const family = teamFamily(team) || `id:${String(team.id).trim().toLowerCase()}`;
    const group = grouped.get(family) || [];
    group.push(team);
    grouped.set(family, group);
  });
  const hidden = new Set();
  grouped.forEach((group) => {
    const live = group.filter((team) => !isCatalogTeam(team));
    if (!live.length) return;
    group.filter(isCatalogTeam).forEach((team) => hidden.add(team));
  });
  const seenCodes = new Set();
  const seenNames = new Set();
  const result = [];
  list.forEach((team) => {
    if (hidden.has(team)) return;
    const code = String(team.id).trim().toLowerCase();
    const name = String(team.name || '').trim().toLowerCase();
    if (seenCodes.has(code) || (name && seenNames.has(name))) return;
    seenCodes.add(code);
    if (name) seenNames.add(name);
    const family = teamFamily(team);
    result.push({
      ...team,
      tone: family || team.tone || 'software',
    });
  });
  return result;
}

export function retargetTeamId(teamId, teams) {
  const raw = String(teamId || '').trim();
  if (!raw) return raw;
  const exact = teams.find((team) => String(team.id).trim().toLowerCase() === raw.toLowerCase());
  if (exact) return exact.id;
  const family = teamFamily({ id: raw, name: '' });
  const matches = family ? teams.filter((team) => teamFamily(team) === family) : [];
  return matches.length === 1 ? matches[0].id : raw;
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    const id = String(item?.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function scopedDashboard(data) {
  const teams = uniqueDashboardTeams(data?.teams);
  const mapId = (id) => retargetTeamId(id, teams);
  return {
    ...data,
    teams,
    members: (data?.members || []).map((member) => ({ ...member, teamId: mapId(member.teamId) })),
    projects: (data?.projects || []).map((project) => ({
      ...project,
      contributions: (project.contributions || []).map((entry) => ({ ...entry, teamId: mapId(entry.teamId) })),
    })),
    tasks: uniqueById((data?.tasks || []).map((task) => ({ ...task, teamId: mapId(task.teamId) }))),
    activity: (data?.activity || []).map((item) => ({ ...item, teamId: mapId(item.teamId) })),
  };
}

export function listTeamCards(data) {
  const scoped = scopedDashboard(data);
  return scoped.teams.map((team) => summarizeTeam(scoped, team));
}

export function buildTeamDetail(data, teamId, filters) {
  const source = scopedDashboard(data);
  const requested = String(teamId || '');
  const team = source.teams.find((item) => item.id === requested)
    || source.teams.find((item) => item.id.toLowerCase() === requested.toLowerCase())
    || source.teams[0];
  if (!team) return null;
  const summary = summarizeTeam(source, team);
  const teamProjects = projectsFor(source, team.id);
  const projectId = teamProjects.some((item) => item.id === filters.projectId) ? filters.projectId : 'all';
  const scopedProjects = projectId === 'all' ? teamProjects : teamProjects.filter((item) => item.id === projectId);
  const scopedTasks = source.tasks.filter((item) => item.teamId === team.id && (projectId === 'all' || item.projectId === projectId));
  const filteredTasks = filterTasks(scopedTasks, { ...filters, projectId: 'all' });
  const filteredActivity = filterActivity(source.activity.filter((item) => item.teamId === team.id), source, { ...filters, projectId });
  const members = memberRows(source, team, filteredTasks, scopedProjects);
  const snapshot = snapshotFrom(scopedProjects, filteredTasks, summary.members);

  return {
    team,
    summary,
    snapshot,
    projectOptions: teamProjects,
    projects: scopedProjects.map((item) => decorateProject(source, team, item, scopedTasks)),
    tasks: filteredTasks.map((item) => decorateTask(source, item)),
    members,
    workload: workloadFrom(filteredTasks),
    performance: performanceFrom(filteredTasks),
    activity: filteredActivity.map((item) => decorateActivity(source, item)),
    filtersActive: projectId !== 'all' || filters.status !== 'all' || filters.priority !== 'all' || filters.dateRange !== 'all',
    appliedProjectId: projectId,
  };
}

export function findMember(detail, memberId) {
  return detail?.members.find((item) => item.id === memberId) || null;
}

function summarizeTeam(data, team) {
  const members = data.members.filter((item) => item.teamId === team.id);
  const projects = projectsFor(data, team.id);
  const tasks = data.tasks.filter((item) => item.teamId === team.id);
  const activeTasks = tasks.filter((item) => item.status !== 'Completed');
  return {
    id: team.id,
    name: team.name,
    tone: team.tone,
    members: members.length,
    projects: projects.length,
    activeProjects: projects.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length,
    completedProjects: projects.filter((item) => item.status === 'Completed').length,
    activeTasks: activeTasks.length,
    completedTasks: tasks.filter((item) => item.status === 'Completed').length,
    overdue: tasks.filter((item) => item.status === 'Overdue').length,
    completion: average(tasks.map((item) => item.progress)),
  };
}

function projectsFor(data, teamId) {
  return data.projects.filter((item) => item.contributions.some((entry) => entry.teamId === teamId));
}

function filterTasks(tasks, filters) {
  return tasks.filter((item) => {
    if (filters.projectId !== 'all' && item.projectId !== filters.projectId) return false;
    if (filters.status !== 'all' && item.status !== filters.status) return false;
    if (filters.priority !== 'all' && item.priority !== filters.priority) return false;
    if (!matchesDate(item.dueDate, filters.dateRange)) return false;
    return true;
  });
}

function filterActivity(items, data, filters) {
  return items.filter((item) => {
    if (filters.projectId !== 'all' && item.projectId !== filters.projectId) return false;
    if (!matchesDate(item.date, filters.dateRange)) return false;
    if (filters.status === 'all' && filters.priority === 'all') return true;
    const related = data.tasks.filter((task) => task.teamId === item.teamId && task.projectId === item.projectId && (!item.memberId || task.assigneeId === item.memberId));
    return related.some((task) => (
      (filters.status === 'all' || task.status === filters.status)
      && (filters.priority === 'all' || task.priority === filters.priority)
    ));
  });
}

function matchesDate(value, range) {
  if (!range || range === 'all') return true;
  if (!value) return false;
  const today = isoToday();
  if (range === 'today') return value === today;
  if (range === 'week') {
    const [year, month, day] = today.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const weekday = date.getDay();
    const start = shiftIso(today, weekday === 0 ? -6 : 1 - weekday);
    return value >= start && value <= shiftIso(start, 6);
  }
  if (range === 'month') return String(value).slice(0, 7) === today.slice(0, 7);
  return true;
}

function memberRows(data, team, tasks, projects) {
  return data.members
    .filter((item) => item.teamId === team.id)
    .map((member) => {
      const own = tasks.filter((item) => item.assigneeId === member.id);
      const projectIds = [...new Set(own.map((item) => item.projectId))];
      const active = own.filter((item) => item.status !== 'Completed');
      const overdue = own.filter((item) => item.status === 'Overdue');
      return {
        id: member.id,
        name: member.name,
        designation: member.designation,
        teamName: team.name,
        projectCount: projectIds.length,
        taskCount: own.length,
        progress: average(own.map((item) => item.progress)),
        activeTasks: active.length,
        completedTasks: own.filter((item) => item.status === 'Completed').length,
        overdueTasks: overdue.length,
        workload: own.length ? Math.round((active.length / own.length) * 100) : 0,
        projects: projectIds.map((id) => {
          const project = projects.find((item) => item.id === id) || data.projects.find((item) => item.id === id);
          const contribution = project?.contributions.find((item) => item.teamId === team.id);
          return {
            id,
            name: project?.name || id,
            progress: project?.progress || 0,
            contribution: contribution?.percent || 0,
            role: contribution?.level || 'Supporting',
          };
        }),
        tasks: own.map((item) => decorateTask(data, item)),
        activity: data.activity
          .filter((item) => item.memberId === member.id)
          .map((item) => decorateActivity(data, item)),
      };
    });
}

function decorateProject(data, team, project, tasks) {
  const contribution = project.contributions.find((item) => item.teamId === team.id);
  const names = Object.fromEntries(data.teams.map((item) => [item.id, item.name.replace(' Team', '')]));
  return {
    ...project,
    role: contribution?.level || 'Supporting',
    contribution: contribution?.percent || 0,
    taskCount: tasks.filter((item) => item.projectId === project.id).length,
    partners: project.contributions
      .filter((item) => item.teamId !== team.id)
      .map((item) => `${names[item.teamId] || item.teamId} ${item.level}`),
  };
}

function decorateTask(data, item) {
  const project = data.projects.find((entry) => entry.id === item.projectId);
  const member = data.members.find((entry) => entry.id === item.assigneeId);
  return {
    ...item,
    projectName: project?.name || item.projectId,
    assignee: member?.name || 'Unassigned',
  };
}

function decorateActivity(data, item) {
  const project = data.projects.find((entry) => entry.id === item.projectId);
  const member = data.members.find((entry) => entry.id === item.memberId);
  return {
    ...item,
    user: item.userName || member?.name || 'Workspace',
    projectName: project?.name || item.projectId,
  };
}

function workloadFrom(tasks) {
  const completed = tasks.filter((item) => item.status === 'Completed').length;
  const progress = tasks.filter((item) => item.status === 'In Progress').length;
  const pending = tasks.filter((item) => item.status === 'Pending').length;
  const overdue = tasks.filter((item) => item.status === 'Overdue').length;
  return {
    assigned: tasks.length,
    completed,
    inProgress: progress,
    pending,
    overdue,
  };
}

function performanceFrom(tasks) {
  return {
    completed: tasks.filter((item) => item.status === 'Completed').length,
    pending: tasks.filter((item) => item.status === 'Pending').length,
    overdue: tasks.filter((item) => item.status === 'Overdue').length,
    average: average(tasks.map((item) => item.progress)),
    projects: new Set(tasks.map((item) => item.projectId)).size,
    assigned: tasks.length,
  };
}

function snapshotFrom(projects, tasks, members) {
  return {
    projects: projects.length,
    activeProjects: projects.filter((item) => !['Completed', 'Cancelled'].includes(item.status)).length,
    completedProjects: projects.filter((item) => item.status === 'Completed').length,
    activeTasks: tasks.filter((item) => item.status !== 'Completed').length,
    completedTasks: tasks.filter((item) => item.status === 'Completed').length,
    overdue: tasks.filter((item) => item.status === 'Overdue').length,
    members,
    completion: average(tasks.map((item) => item.progress)),
  };
}

function average(values) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}
