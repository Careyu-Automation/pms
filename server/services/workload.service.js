const ApiError = require('../utils/ApiError');
const repository = require('../db/workload.repository');
const leaveRepository = require('../db/leave.repository');
const planningRepository = require('../db/planning.repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN = new Set(['NOT_STARTED', 'IN_PROGRESS', 'AT_RISK', 'ON_HOLD']);

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function cleanDate(value) {
  const text = String(value || '').slice(0, 10);
  return DATE.test(text) ? text : '';
}

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function weekday(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function startOfWeek(iso) {
  const day = weekday(iso);
  return shiftIso(iso, day === 0 ? -6 : 1 - day);
}

function endOfMonth(iso) {
  const [year, month] = iso.split('-').map(Number);
  const date = new Date(year, month, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function workingDates(start, end, calendar) {
  const weekends = new Set((calendar.weekendDays || [0, 6]).map(Number));
  const holidays = new Map((calendar.holidays || []).map((item) => [item.date, item]));
  const dates = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 400) {
    const holiday = holidays.get(cursor);
    const working = holiday ? holiday.isWorkingDay : !weekends.has(weekday(cursor));
    if (working) dates.push(cursor);
    cursor = shiftIso(cursor, 1);
    guard += 1;
  }
  return dates;
}

function periodOf(query) {
  const mode = ['week', 'month', 'custom'].includes(query.mode) ? query.mode : 'week';
  const anchor = cleanDate(query.anchor) || todayIso();
  if (mode === 'month') {
    const start = `${anchor.slice(0, 7)}-01`;
    return { mode, anchor, start, end: endOfMonth(anchor) };
  }
  if (mode === 'custom') {
    const start = cleanDate(query.start) || startOfWeek(anchor);
    const end = cleanDate(query.end) || shiftIso(startOfWeek(anchor), 6);
    if (end < start) throw new ApiError(400, 'End date cannot be before the start date.');
    if (workingDates(start, end, { weekendDays: [], holidays: [] }).length > 370) {
      throw new ApiError(400, 'Choose a range of one year or less.');
    }
    return { mode, anchor, start, end };
  }
  const start = startOfWeek(anchor);
  return { mode, anchor, start, end: shiftIso(start, 6) };
}

function previousPeriod(period) {
  if (period.mode === 'month') {
    const anchor = shiftIso(`${period.start.slice(0, 7)}-01`, -1);
    return periodOf({ mode: 'month', anchor });
  }
  const length = workingDates(period.start, period.end, { weekendDays: [], holidays: [] }).length;
  const end = shiftIso(period.start, -1);
  return { mode: period.mode, start: shiftIso(end, 1 - length), end, anchor: end };
}

async function accessFor(actor) {
  const admin = isAdmin(actor);
  const leadTeamIds = await leaveRepository.leadTeamIds(actor.id);
  const memberTeamIds = await repository.memberTeamIds(actor.id);
  return {
    admin,
    leadTeamIds,
    memberTeamIds,
    canViewOthers: admin || leadTeamIds.length > 0,
    canRebalance: admin || leadTeamIds.length > 0,
    defaultScope: admin ? 'all' : (leadTeamIds.length ? 'team' : 'mine'),
  };
}

function loadStatus(assigned, capacity) {
  if (capacity <= 0) return assigned > 0 ? 'OVERLOADED' : 'HEALTHY';
  const ratio = assigned / capacity;
  if (ratio <= 0.7) return 'UNDERUTILIZED';
  if (ratio <= 0.9) return 'HEALTHY';
  if (ratio <= 1) return 'NEAR_CAPACITY';
  if (ratio <= 1.2) return 'OVER_CAPACITY';
  return 'OVERLOADED';
}

function leaveUnits(leaves, periodDays, calendar) {
  const used = new Map();
  leaves.forEach((leave) => {
    const half = leave.durationType !== 'FULL' && leave.startDate === leave.endDate;
    const days = half ? [leave.startDate] : workingDates(leave.startDate, leave.endDate, calendar);
    const fraction = half ? 0.5 : 1;
    days.forEach((day) => {
      if (!periodDays.has(day)) return;
      used.set(day, Math.min(1, (used.get(day) || 0) + fraction));
    });
  });
  let total = 0;
  used.forEach((value) => { total += value; });
  return total;
}

function assignedHours(tasks, period, calendar) {
  return tasks.reduce((sum, task) => {
    if (!task.startDate || !task.endDate || task.endDate < period.start || task.startDate > period.end) return sum;
    const span = workingDates(task.startDate, task.endDate, calendar);
    if (!span.length || task.estimatedHours == null) return sum;
    const from = task.startDate > period.start ? task.startDate : period.start;
    const to = task.endDate < period.end ? task.endDate : period.end;
    const slice = workingDates(from, to, calendar);
    return sum + (task.estimatedHours * slice.length) / span.length;
  }, 0);
}

function personMetrics(person, tasks, logged, leaves, period, calendar) {
  const periodDays = new Set(workingDates(period.start, period.end, calendar));
  const weekends = new Set((calendar.weekendDays || [0, 6]).map(Number));
  const weekDays = [0, 1, 2, 3, 4, 5, 6].filter((day) => !weekends.has(day)).length || 5;
  const daily = person.weeklyCapacity / weekDays;
  const leaveDays = leaveUnits(leaves, periodDays, calendar);
  const capacity = Math.max(0, round1((periodDays.size - leaveDays) * daily));
  const assigned = round1(assignedHours(tasks, period, calendar));
  const loggedHours = round1(logged);
  const openTasks = tasks.filter((task) => OPEN.has(task.status) && task.endDate >= period.start && task.startDate <= period.end);
  const overdue = tasks.filter((task) => OPEN.has(task.status) && task.endDate && task.endDate < todayIso());
  const remaining = round1(capacity - assigned);
  const capacityPercent = capacity > 0 ? Math.round((assigned / capacity) * 100) : (assigned > 0 ? null : 0);
  const utilization = capacity > 0 ? Math.round((loggedHours / capacity) * 100) : (loggedHours > 0 ? null : 0);
  return {
    id: person.id,
    name: person.fullName,
    designation: person.designation,
    department: person.department,
    teamId: person.teamId,
    teamName: person.teamName,
    roleName: person.roleName,
    roleCode: person.roleCode,
    memberRole: person.memberRole,
    isLead: person.isLead,
    weeklyCapacity: person.weeklyCapacity,
    capacity,
    assigned,
    logged: loggedHours,
    remaining,
    capacityPercent,
    utilization,
    openTasks: openTasks.length,
    overdue: overdue.length,
    leaveDays: round1(leaveDays),
    status: loadStatus(assigned, capacity),
  };
}

async function visiblePeople(actor, access) {
  if (!access.canViewOthers) {
    return repository.people('WHERE u.id = $1 AND u.is_active = TRUE', [actor.id]);
  }
  if (access.admin) return repository.people('WHERE u.is_active = TRUE', []);
  return repository.people(
    `WHERE u.is_active = TRUE AND (
       u.id = $1 OR u.id IN (
         SELECT user_id FROM team_members WHERE status = 'ACTIVE' AND team_id = ANY($2::uuid[])
       )
     )`,
    [actor.id, access.leadTeamIds],
  );
}

async function applyScope(people, actor, access, query) {
  const scope = ['all', 'mine', 'team', 'department'].includes(query.scope) ? query.scope : access.defaultScope;
  let rows = people;
  if (scope === 'mine' || !access.canViewOthers) rows = people.filter((person) => person.id === actor.id);
  if (scope === 'team' && access.canViewOthers) {
    const teamIds = access.admin ? access.memberTeamIds : access.leadTeamIds;
    const ids = new Set((await repository.teamMemberIds(teamIds)).map((row) => row.userId));
    ids.add(actor.id);
    rows = people.filter((person) => ids.has(person.id));
  }
  if (scope === 'department') {
    const department = String(actor.department || '').trim().toLowerCase();
    rows = department
      ? people.filter((person) => String(person.department || '').trim().toLowerCase() === department)
      : people.filter((person) => person.id === actor.id);
  }
  if (!access.admin && scope === 'all') rows = people;
  if (UUID.test(query.teamId || '') && access.canViewOthers) {
    const allowed = access.admin || access.leadTeamIds.includes(query.teamId) || access.memberTeamIds.includes(query.teamId);
    if (allowed) {
      const ids = new Set((await repository.teamMemberIds([query.teamId])).map((row) => row.userId));
      rows = rows.filter((person) => ids.has(person.id));
    }
  }
  if (UUID.test(query.employeeId || '') && access.canViewOthers) {
    rows = people.filter((person) => person.id === query.employeeId);
  }
  if (query.role) {
    const role = String(query.role).toLowerCase();
    rows = rows.filter((person) => person.roleCode === role || String(person.memberRole || '').toLowerCase() === role || person.roleName.toLowerCase() === role);
  }
  return { scope: access.canViewOthers ? scope : 'mine', rows };
}

async function measure(people, period, projectId) {
  const ids = people.map((person) => person.id);
  const calendar = await leaveRepository.calendar();
  const [taskRows, hourRows, leaveRows] = await Promise.all([
    repository.tasks(ids, period.start, period.end, projectId),
    repository.loggedHours(ids, period.start, period.end, projectId),
    repository.approvedLeave(ids, period.start, period.end),
  ]);
  const tasksByUser = new Map();
  const hoursByUser = new Map(hourRows.map((row) => [row.userId, row.hours]));
  const leaveByUser = new Map();
  taskRows.forEach((task) => {
    const list = tasksByUser.get(task.assigneeId) || [];
    list.push(task);
    tasksByUser.set(task.assigneeId, list);
  });
  leaveRows.forEach((leave) => {
    const list = leaveByUser.get(leave.userId) || [];
    list.push(leave);
    leaveByUser.set(leave.userId, list);
  });
  return {
    calendar,
    tasks: taskRows,
    employees: people.map((person) => personMetrics(
      person,
      tasksByUser.get(person.id) || [],
      hoursByUser.get(person.id) || 0,
      leaveByUser.get(person.id) || [],
      period,
      calendar,
    )),
  };
}

function sortEmployees(rows, sort) {
  const key = ['name', 'assigned', 'logged', 'capacity', 'utilization', 'overdue', 'remaining'].includes(sort) ? sort : 'remaining';
  const copy = [...rows];
  copy.sort((a, b) => {
    if (key === 'name') return a.name.localeCompare(b.name);
    if (key === 'capacity') return (b.capacityPercent || 0) - (a.capacityPercent || 0);
    return (a[key] || 0) - (b[key] || 0);
  });
  if (key === 'remaining') return copy;
  if (key !== 'name') copy.reverse();
  return copy;
}

function summarize(employees, period) {
  const assigned = round1(employees.reduce((sum, person) => sum + person.assigned, 0));
  const logged = round1(employees.reduce((sum, person) => sum + person.logged, 0));
  const available = round1(employees.reduce((sum, person) => sum + Math.max(0, person.remaining), 0));
  const overloaded = employees.filter((person) => person.assigned > person.capacity).length;
  const under = employees.filter((person) => person.status === 'UNDERUTILIZED').length;
  const capacities = [...new Set(employees.map((person) => person.weeklyCapacity))];
  const threshold = period.mode === 'week' && capacities.length === 1 ? `${capacities[0]}h` : 'personal capacity';
  const label = period.mode === 'week' ? 'week' : period.mode === 'month' ? 'month' : 'period';
  return {
    people: employees.length,
    assigned,
    logged,
    available,
    overloaded,
    underutilized: under,
    headline: `Capacity this ${label} · overload above ${threshold} · ${overloaded} overloaded`,
  };
}

function matchesQuery(person, tasks, query) {
  const text = String(query.q || '').trim().toLowerCase();
  if (!text) return true;
  if (person.name.toLowerCase().includes(text) || person.teamName.toLowerCase().includes(text)) return true;
  return tasks.some((task) => task.assigneeId === person.id && (
    task.projectTitle.toLowerCase().includes(text) || task.title.toLowerCase().includes(text)
  ));
}

async function board(actor, query) {
  const access = await accessFor(actor);
  const period = periodOf(query);
  const projectId = UUID.test(query.projectId || '') ? query.projectId : '';
  const everyone = await visiblePeople(actor, access);
  const scoped = await applyScope(everyone, actor, access, query);
  const measured = await measure(scoped.rows, period, projectId);
  let employees = measured.employees.filter((person) => matchesQuery(
    scoped.rows.find((row) => row.id === person.id),
    measured.tasks,
    query,
  ));
  if (query.status && ['UNDERUTILIZED', 'HEALTHY', 'NEAR_CAPACITY', 'OVER_CAPACITY', 'OVERLOADED'].includes(query.status)) {
    employees = employees.filter((person) => person.status === query.status);
  }
  employees = sortEmployees(employees, query.sort);
  const meSource = everyone.find((person) => person.id === actor.id);
  const mine = meSource ? (await measure([meSource], period, projectId)).employees[0] : null;
  const leads = await leadCards(scoped.rows, measured.employees, access);
  const teams = access.admin
    ? await repository.leadTeams(everyone.map((person) => person.id))
    : await repository.leadTeams([actor.id]);
  const memberTeams = [...new Map(everyone.filter((person) => person.teamId).map((person) => [person.teamId, { id: person.teamId, name: person.teamName }])).values()];
  return {
    period,
    summary: summarize(employees, period),
    employees,
    me: mine,
    leads,
    teams: access.admin ? memberTeams : memberTeams.filter((team) => access.leadTeamIds.includes(team.id) || team.id === meSource?.teamId),
    projects: await repository.projectsInScope(everyone.map((person) => person.id)),
    access: {
      admin: access.admin,
      canViewOthers: access.canViewOthers,
      canRebalance: access.canRebalance,
      defaultScope: access.defaultScope,
      scope: scoped.scope,
      department: actor.department || '',
    },
    directory: everyone.map((person) => ({ id: person.id, name: person.fullName, teamId: person.teamId, teamName: person.teamName })),
  };
}

async function leadCards(people, metrics, access) {
  const leads = people.filter((person) => person.isLead);
  const teams = await repository.leadTeams(leads.map((person) => person.id));
  const membership = await repository.teamMemberIds(teams.map((team) => team.id));
  const byId = new Map(metrics.map((person) => [person.id, person]));
  const cards = [];
  for (const lead of leads) {
    const ownTeams = teams.filter((team) => team.leadId === lead.id);
    const memberIds = new Set(membership.filter((row) => ownTeams.some((team) => team.id === row.teamId)).map((row) => row.userId));
    memberIds.add(lead.id);
    const members = [...memberIds].map((id) => byId.get(id)).filter(Boolean);
    const assigned = round1(members.reduce((sum, person) => sum + person.assigned, 0));
    const logged = round1(members.reduce((sum, person) => sum + person.logged, 0));
    const capacity = round1(members.reduce((sum, person) => sum + person.capacity, 0));
    cards.push({
      id: lead.id,
      name: lead.fullName,
      designation: lead.designation,
      teamName: ownTeams.map((team) => team.name).join(', ') || lead.teamName,
      projects: await repository.managedProjects(lead.id, ownTeams.map((team) => team.id)),
      assigned,
      logged,
      members: memberIds.size,
      overloaded: members.filter((person) => person.assigned > person.capacity).length,
      openTasks: members.reduce((sum, person) => sum + person.openTasks, 0),
      overdue: members.reduce((sum, person) => sum + person.overdue, 0),
      capacityPercent: capacity > 0 ? Math.round((assigned / capacity) * 100) : 0,
      status: loadStatus(assigned, capacity),
    });
  }
  if (!access.canViewOthers) return cards.filter((card) => card.id === people[0]?.id);
  return cards.sort((a, b) => b.overloaded - a.overloaded || b.assigned - a.assigned);
}

async function assertVisible(actor, employeeId) {
  if (!UUID.test(employeeId || '')) throw new ApiError(400, 'Employee is not valid.');
  const access = await accessFor(actor);
  const people = await visiblePeople(actor, access);
  const person = people.find((item) => item.id === employeeId);
  if (!person) throw new ApiError(404, 'Employee not found.');
  return { access, person };
}

async function employee(actor, employeeId, query) {
  const { access, person } = await assertVisible(actor, employeeId);
  const period = periodOf(query);
  const metrics = (await measure([person], period, '')).employees[0];
  return {
    period,
    access: { canRebalance: access.canRebalance && person.id !== actor.id, canViewOthers: access.canViewOthers },
    profile: person,
    metrics,
  };
}

function recommendations(metrics, insight) {
  const notes = [];
  if (metrics.capacity > 0 && metrics.logged < metrics.capacity * 0.7) {
    notes.push({ title: 'Increase logged hours', reason: 'Logged hours are below the capacity target for this period.' });
  }
  if (insight.accuracy != null && insight.accuracy < 85 && insight.actual > insight.estimated) {
    notes.push({ title: 'Refine time estimates', reason: 'Actual hours are running ahead of the estimates on completed work.' });
  }
  if (metrics.overdue > 0) {
    notes.push({ title: 'Reduce overdue tasks', reason: `${metrics.overdue} task${metrics.overdue === 1 ? ' is' : 's are'} past the due date.` });
  }
  if (metrics.assigned > metrics.capacity) {
    const extra = round1(metrics.assigned - metrics.capacity);
    notes.push({ title: 'Balance workload', reason: `Assigned work is ${extra}h above available capacity.` });
  }
  if (insight.onTime != null && insight.onTime < 80 && insight.completed > 0) {
    notes.push({ title: 'Improve on-time delivery', reason: 'Completed work is missing its due dates.' });
  }
  return notes;
}

function accuracyOf(tasks) {
  const scored = tasks.filter((task) => task.estimatedHours > 0);
  if (!scored.length) return { accuracy: null, estimated: 0, actual: 0, variance: 0 };
  const estimated = round1(scored.reduce((sum, task) => sum + task.estimatedHours, 0));
  const actual = round1(scored.reduce((sum, task) => sum + task.actualHours, 0));
  const ratios = scored.map((task) => Math.max(0, Math.min(1, 1 - Math.abs(task.actualHours - task.estimatedHours) / task.estimatedHours)));
  return {
    accuracy: Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100),
    estimated,
    actual,
    variance: round1(actual - estimated),
  };
}

async function insights(actor, employeeId, query) {
  const { person } = await assertVisible(actor, employeeId);
  const period = periodOf(query);
  const metrics = (await measure([person], period, '')).employees[0];
  const earlier = previousPeriod(period);
  const [completed, dueOpen, daily, previousCompleted] = await Promise.all([
    repository.completedTasks(person.id, period.start, period.end),
    repository.dueInPeriod(person.id, period.start, period.end),
    repository.dailyHours(person.id, period.start, period.end),
    repository.completedTasks(person.id, earlier.start, earlier.end),
  ]);
  const onTimeCount = completed.filter((task) => isoDay(task.updatedAt) <= task.endDate).length;
  const accuracy = accuracyOf(completed);
  const denominator = completed.length + dueOpen;
  const insight = {
    completed: completed.length,
    completionRate: denominator ? Math.round((completed.length / denominator) * 100) : null,
    previousCompleted: previousCompleted.length,
    onTime: completed.length ? Math.round((onTimeCount / completed.length) * 100) : null,
    onTimeCount,
    ...accuracy,
  };
  const byDate = new Map(daily.map((row) => [row.date, row.hours]));
  const days = [];
  let cursor = period.start;
  while (cursor <= period.end) {
    days.push({ date: cursor, hours: round1(byDate.get(cursor) || 0) });
    cursor = shiftIso(cursor, 1);
  }
  return {
    period,
    metrics,
    insight,
    hours: days,
    recommendations: recommendations(metrics, insight),
  };
}

function isoDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function tasks(actor, employeeId, query) {
  const { person } = await assertVisible(actor, employeeId);
  const period = periodOf(query);
  const calendar = await leaveRepository.calendar();
  let rows = await repository.tasks([person.id], period.start, period.end, UUID.test(query.projectId || '') ? query.projectId : '');
  if (query.taskStatus) rows = rows.filter((task) => task.status === query.taskStatus);
  if (query.priority) rows = rows.filter((task) => task.priority === query.priority);
  const actuals = await repository.timeEntries(person.id, '2000-01-01', '2100-01-01');
  const logged = new Map();
  actuals.forEach((entry) => {
    if (!entry.taskId) return;
    logged.set(entry.taskId, (logged.get(entry.taskId) || 0) + entry.hours);
  });
  return {
    tasks: rows.map((task) => ({
      ...task,
      logged: round1(logged.get(task.id) || 0),
      periodHours: round1(assignedHours([task], period, calendar)),
      overdue: OPEN.has(task.status) && task.endDate < todayIso(),
    })).sort((a, b) => a.endDate.localeCompare(b.endDate)),
  };
}

async function hours(actor, employeeId, query) {
  const { person } = await assertVisible(actor, employeeId);
  const period = periodOf(query);
  const entries = await repository.timeEntries(person.id, period.start, period.end);
  return {
    entries,
    total: round1(entries.reduce((sum, entry) => sum + entry.hours, 0)),
  };
}

async function attendance(actor, employeeId, query) {
  const { person } = await assertVisible(actor, employeeId);
  const period = periodOf(query);
  const calendar = await leaveRepository.calendar();
  const [sessions, leaves] = await Promise.all([
    repository.attendance(person.id, period.start, period.end),
    repository.approvedLeave([person.id], period.start, period.end),
  ]);
  const sessionByDate = new Map(sessions.map((row) => [row.date, row]));
  const leaveDays = new Set();
  leaves.forEach((leave) => workingDates(leave.startDate, leave.endDate, calendar).forEach((day) => leaveDays.add(day)));
  const days = workingDates(period.start, period.end, calendar).map((date) => {
    const session = sessionByDate.get(date);
    let status = 'Absent';
    if (leaveDays.has(date) && !session) status = 'Leave';
    else if (session && !session.checkOut) status = 'Checked in';
    else if (session) status = 'Present';
    return {
      date,
      checkIn: session?.checkIn || null,
      checkOut: session?.checkOut || null,
      breakMinutes: session?.breakMinutes || 0,
      workedMinutes: session?.workedMinutes,
      status,
    };
  });
  const present = days.filter((day) => day.status === 'Present' || day.status === 'Checked in').length;
  return {
    days,
    summary: {
      workingDays: days.length,
      present,
      absent: days.filter((day) => day.status === 'Absent').length,
      leave: days.filter((day) => day.status === 'Leave').length,
      late: null,
      totalHours: round1(days.reduce((sum, day) => sum + ((day.workedMinutes || 0) / 60), 0)),
    },
  };
}

async function rebalanceOptions(actor, employeeId, query) {
  const { access, person } = await assertVisible(actor, employeeId);
  if (!access.canRebalance) throw new ApiError(403, 'You cannot reassign this work.');
  const period = periodOf(query);
  const everyone = await visiblePeople(actor, access);
  const measured = await measure(everyone, period, '');
  const open = (await tasks(actor, employeeId, query)).tasks.filter((task) => OPEN.has(task.status));
  const candidates = measured.employees
    .filter((item) => item.id !== person.id && item.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining);
  return { tasks: open, candidates, period };
}

async function rebalance(actor, body) {
  const access = await accessFor(actor);
  if (!access.canRebalance) throw new ApiError(403, 'You cannot reassign this work.');
  const assigneeId = body.assigneeId;
  const taskIds = [...new Set((body.taskIds || []).filter((id) => UUID.test(id)))];
  if (!UUID.test(assigneeId || '') || !taskIds.length) throw new ApiError(400, 'Choose tasks and a new assignee.');
  const assignee = await repository.userActive(assigneeId);
  if (!assignee || !assignee.isActive) throw new ApiError(400, 'Choose an active employee.');
  const visible = await visiblePeople(actor, access);
  if (!visible.some((person) => person.id === assigneeId)) throw new ApiError(403, 'That employee is outside your team.');
  const found = await repository.findTasks(taskIds);
  if (found.length !== taskIds.length) throw new ApiError(404, 'One of the selected tasks was not found.');
  if (found.some((task) => !OPEN.has(task.status))) throw new ApiError(400, 'Completed or cancelled tasks cannot be reassigned.');
  const owners = new Set(found.map((task) => task.assigneeId));
  for (const owner of owners) {
    if (!visible.some((person) => person.id === owner)) throw new ApiError(403, 'You cannot move that task.');
  }
  if (!access.admin) {
    const allowed = new Set((await repository.teamMemberIds(access.leadTeamIds)).map((row) => row.userId));
    allowed.add(actor.id);
    if (!allowed.has(assigneeId) || [...owners].some((owner) => owner && !allowed.has(owner))) {
      throw new ApiError(403, 'Reassign work only inside the teams you lead.');
    }
  }
  const calendar = await leaveRepository.calendar();
  const leaves = await repository.approvedLeave([assigneeId], found.reduce((min, task) => (task.startDate < min ? task.startDate : min), found[0].startDate), found.reduce((max, task) => (task.endDate > max ? task.endDate : max), found[0].endDate));
  const blocked = found.filter((task) => {
    const days = new Set(workingDates(task.startDate, task.endDate, calendar));
    return leaveUnits(leaves, days) > 0;
  });
  if (blocked.length && !body.allowDuringLeave) {
    throw new ApiError(409, 'The new assignee has approved leave during this work. Confirm to assign it anyway.');
  }
  for (const task of found) {
    await repository.reassign(task.id, assigneeId);
    await planningRepository.addActivity(
      task.projectId,
      actor.id,
      `${assignee.fullName} was assigned to ${task.title}`,
      'Workload rebalance',
      task.productId,
    );
  }
  return { reassigned: found.length, assigneeId, assigneeName: assignee.fullName };
}

async function exportRows(actor, query) {
  const data = await board(actor, query);
  return data;
}

async function weekMetrics(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await repository.people('WHERE u.id = ANY($1::uuid[])', [ids]);
  const measured = await measure(rows, periodOf({ mode: 'week' }), '');
  return measured.employees;
}

module.exports = {
  board,
  employee,
  insights,
  tasks,
  hours,
  attendance,
  rebalanceOptions,
  rebalance,
  exportRows,
  weekMetrics,
  periodOf,
  loadStatus,
  assignedHours,
  workingDates,
};
