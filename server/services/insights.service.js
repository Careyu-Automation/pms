const leaveRepository = require('../db/leave.repository');
const repository = require('../db/insights.repository');
const workload = require('./workload.service');
const { roleAccess } = require('./costing.rules');
const timeExport = require('./timeExport');
const logger = require('../utils/logger');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_STATUS = new Set(['NOT_STARTED', 'PLANNING', 'IN_PROGRESS', 'AT_RISK', 'ON_HOLD', 'COMPLETED', 'CANCELLED']);
const TEAM_LABEL = { software: 'Software', robotics: 'Robotics', procurement: 'Procurement', execution: 'Execution', vision: 'Vision' };

function iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parse(value) {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return iso(value);
  return '';
}

function addDays(date, days) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return next;
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

function rangeOf(query) {
  const today = new Date();
  const preset = ['today', 'week', 'month', 'lastMonth', 'quarter', 'last3', 'year', 'custom'].includes(query.preset) ? query.preset : 'month';
  let start;
  let end;
  if (preset === 'today') {
    start = today;
    end = today;
  } else if (preset === 'week') {
    start = startOfWeek(today);
    end = addDays(start, 6);
  } else if (preset === 'lastMonth') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (preset === 'quarter') {
    const quarter = Math.floor(today.getMonth() / 3);
    start = new Date(today.getFullYear(), quarter * 3, 1);
    end = new Date(today.getFullYear(), quarter * 3 + 3, 0);
  } else if (preset === 'last3') {
    start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (preset === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
    end = new Date(today.getFullYear(), 11, 31);
  } else if (preset === 'custom') {
    start = parse(query.from) || new Date(today.getFullYear(), today.getMonth(), 1);
    end = parse(query.to) || today;
  } else {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  }
  if (end < start) end = start;
  const span = Math.round((end - start) / 86400000);
  const previousEnd = addDays(start, -1);
  const previousStart = addDays(previousEnd, -span);
  const asOfDate = end < today ? end : today;
  return {
    preset,
    from: iso(start),
    to: iso(end),
    previousFrom: iso(previousStart),
    previousTo: iso(previousEnd),
    asOf: iso(asOfDate),
  };
}

function filtersOf(query) {
  return {
    projectId: UUID.test(query.projectId || '') ? query.projectId : '',
    teamId: UUID.test(query.teamId || '') ? query.teamId : '',
    managerId: UUID.test(query.managerId || '') ? query.managerId : '',
    customer: String(query.customer || '').trim().slice(0, 80),
    status: PROJECT_STATUS.has(query.status) ? query.status : '',
  };
}

async function scopeFor(user) {
  const code = user?.role?.code || '';
  const leadTeamIds = await leaveRepository.leadTeamIds(user.id);
  if (['admin', 'super_admin', 'management', 'project_manager'].includes(code)) {
    return { level: 'org', userId: user.id, teamIds: leadTeamIds };
  }
  if (leadTeamIds.length) return { level: 'lead', userId: user.id, teamIds: leadTeamIds };
  return { level: 'member', userId: user.id, teamIds: [] };
}

function commercialAllowed(user) {
  const access = roleAccess(user, 'APPROVED');
  return Boolean(access.canEditCommercial && !access.salesOnly);
}

function percent(part, total) {
  if (!total) return null;
  return Math.round((part / total) * 100);
}

function compare(current, previous, available) {
  if (!available || current == null || previous == null) return { delta: null, label: 'No comparison data' };
  const delta = current - previous;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  return { delta, label: `${arrow} ${Math.abs(delta)} vs previous period` };
}

function daysBetween(from, to) {
  const start = parse(from);
  const end = parse(to);
  if (!start || !end) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function weekdays(from, to) {
  let count = 0;
  let cursor = parse(from);
  const end = parse(to);
  let guard = 0;
  while (cursor && end && cursor <= end && guard < 370) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count += 1;
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return count;
}

function bucket(events, from, to, createdKey, completedKey) {
  const days = [];
  let cursor = parse(from);
  const end = parse(to);
  const map = new Map();
  let guard = 0;
  while (cursor && end && cursor <= end && guard < 120) {
    const key = iso(cursor);
    map.set(key, { date: key, created: 0, completed: 0 });
    days.push(key);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  events.forEach((event) => {
    const created = dayKey(event[createdKey]);
    const updated = dayKey(event[completedKey]);
    if (map.has(created)) map.get(created).created += 1;
    if (['COMPLETED', 'RESOLVED', 'CLOSED'].includes(event.status) && map.has(updated)) map.get(updated).completed += 1;
  });
  return days.map((key) => map.get(key));
}

async function safe(name, work) {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    logger.error('insights_section_failed', { section: name, message: error.message });
    return { ok: false, message: 'Unable to load this insight' };
  }
}

function num(value) {
  return Number(value) || 0;
}

async function overview(user, query) {
  const range = rangeOf(query || {});
  const filters = filtersOf(query || {});
  const scope = await scopeFor(user);
  const commercial = commercialAllowed(user);
  const trendDays = [7, 30, 90].includes(Number(query.trend)) ? Number(query.trend) : 30;
  const trendStart = iso(addDays(parse(range.to), 1 - trendDays));

  const [choices, projects, previousProjects, progress, tasks, previousTasks, events, overdue, teams, daily, time, leads, feasibility, costing, procurement, escalations, focus, recent, load] = await Promise.all([
    safe('filters', () => repository.options(scope)),
    safe('projects', () => repository.projectStats(scope, filters, range.to, range.asOf)),
    safe('projectsPrevious', () => repository.projectStats(scope, filters, range.previousTo, range.previousTo)),
    safe('progress', () => repository.projectProgress(scope, filters, range.to, range.asOf)),
    safe('tasks', () => repository.taskStats(scope, filters, range.from, range.to, range.asOf)),
    safe('tasksPrevious', () => repository.taskStats(scope, filters, range.previousFrom, range.previousTo, range.previousTo)),
    safe('trend', () => repository.taskEvents(scope, filters, trendStart, range.to)),
    safe('overdue', () => repository.overdueWork(scope, filters, range.asOf)),
    safe('teams', () => repository.teamRows(scope, filters)),
    safe('daily', () => repository.dailyStats(scope, filters, range.from, range.to)),
    safe('time', () => repository.timeStats(scope, range.from, range.to)),
    safe('leads', () => repository.leadStats(scope, range.from, range.to)),
    safe('feasibility', () => repository.feasibilityStats(scope, filters)),
    safe('costing', () => repository.costingStats(scope, commercial)),
    safe('procurement', () => repository.procurementStats(scope, filters, range.asOf)),
    safe('escalations', () => repository.escalationStats(scope, filters, range.from, range.to, range.asOf)),
    safe('attention', () => repository.attention(scope, filters, range.asOf)),
    safe('activity', () => repository.activity(scope, filters, range.from, range.to)),
    safe('workload', () => workload.board(user, {
      mode: 'custom',
      start: range.from,
      end: range.to,
      projectId: filters.projectId,
      teamId: filters.teamId,
    })),
  ]);

  const projectRow = projects.ok ? projects.data : {};
  const taskRow = tasks.ok ? tasks.data : {};
  const previousTaskRow = previousTasks.ok ? previousTasks.data : {};
  const completion = percent(num(taskRow.completed), num(taskRow.total));
  const previousCompletion = percent(num(previousTaskRow.completed), num(previousTaskRow.total));
  const onTime = percent(num(taskRow.on_time), num(taskRow.completed_in_range));
  const previousOnTime = percent(num(previousTaskRow.on_time), num(previousTaskRow.completed_in_range));
  const employees = load.ok ? (load.data.employees || []) : [];
  const utilizationValues = employees.map((person) => person.utilization).filter((value) => value != null);
  const utilization = utilizationValues.length
    ? Math.round(utilizationValues.reduce((sum, value) => sum + value, 0) / utilizationValues.length)
    : null;
  const leadRow = leads.ok ? leads.data : {};
  const wonRate = percent(num(leadRow.won), num(leadRow.total));
  const days = weekdays(range.from, range.to);
  const expectedReports = daily.ok ? num(daily.data.people) * days : 0;
  const submission = percent(daily.ok ? num(daily.data.submitted) : 0, expectedReports);
  const hours = time.ok ? num(time.data.total) : 0;
  const target = time.ok && num(time.data.weekly) ? Math.round((num(time.data.weekly) * days) / 5) : 0;
  const achievement = percent(Math.round(hours), target);

  const teamUtilization = new Map();
  employees.forEach((person) => {
    if (!person.teamName || person.utilization == null) return;
    const current = teamUtilization.get(person.teamName) || { total: 0, count: 0 };
    current.total += person.utilization;
    current.count += 1;
    teamUtilization.set(person.teamName, current);
  });

  const progressRows = progress.ok ? progress.data : [];
  const attentionRows = [];
  if (focus.ok) {
    const focusData = focus.data;
    (focusData.critical || []).forEach((row) => attentionRows.push({ priority: 'Critical', issue: 'Critical escalation unresolved', project: row.project || row.title, owner: row.owner || '', due: dayKey(row.due_date), href: `/escalations/${row.id}` }));
    (focusData.tasks || []).forEach((row) => attentionRows.push({ priority: 'High', issue: row.title, project: row.project, owner: row.owner || '', due: dayKey(row.due), href: `/tasks/${row.id}` }));
    (focusData.deadlines || []).forEach((row) => attentionRows.push({ priority: 'High', issue: 'Project deadline approaching', project: row.title, owner: row.owner || '', due: dayKey(row.due), href: `/projects/${row.id}` }));
    (focusData.procurement || []).forEach((row) => attentionRows.push({ priority: 'High', issue: `Procurement delayed: ${row.title}`, project: row.project || '', owner: '', due: dayKey(row.needed_by), href: '/procurement-requests' }));
    (focusData.blocked || []).forEach((row) => attentionRows.push({ priority: 'Medium', issue: `Feasibility blocked (${TEAM_LABEL[row.team_code] || row.team_code})`, project: row.title, owner: '', due: dayKey(row.due_date), href: '/feasibility-studies' }));
    (focusData.approvals || []).forEach((row) => attentionRows.push({ priority: 'Medium', issue: 'Costing awaiting approval', project: row.title, owner: '', due: '', href: `/solution-costing/${row.id}` }));
    (focusData.waiting || []).forEach((row) => attentionRows.push({ priority: 'Medium', issue: 'Customer response pending', project: row.project || row.description, owner: row.owner || '', due: dayKey(row.due), href: '/daily-work-updates' }));
  }
  employees.filter((person) => person.status === 'OVERLOADED').slice(0, 4).forEach((person) => {
    attentionRows.push({ priority: 'High', issue: 'Team member overloaded', project: person.teamName || '', owner: person.name, due: '', href: '' });
  });

  const summary = [];
  if (projects.ok) {
    const active = num(projectRow.active);
    const delayed = num(projectRow.delayed) + num(projectRow.overdue);
    const onTrack = active ? Math.max(0, Math.round(((active - delayed) / active) * 100)) : null;
    summary.push(onTrack == null ? 'No active projects in this view.' : `${onTrack}% of active projects are currently clear of delay or overdue dates.`);
    summary.push(`${attentionRows.length} item${attentionRows.length === 1 ? '' : 's'} require management attention.`);
  }
  if (tasks.ok) summary.push(`${num(taskRow.overdue)} task${num(taskRow.overdue) === 1 ? ' is' : 's are'} overdue.`);
  if (escalations.ok) summary.push(`${num(escalations.critical)} critical escalation${num(escalations.critical) === 1 ? '' : 's'} remain unresolved.`);
  if (utilization != null) {
    const busiest = [...teamUtilization.entries()].sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0];
    if (busiest) summary.push(`${busiest[0]} has the highest current utilization.`);
  }

  return {
    range,
    access: { level: scope.level, commercial },
    filters: choices.ok ? choices.data : { error: true },
    kpis: {
      totalProjects: projects.ok ? num(projectRow.total) : null,
      activeProjects: projects.ok ? num(projectRow.active) : null,
      completedProjects: projects.ok ? num(projectRow.completed) : null,
      overdueTasks: tasks.ok ? num(taskRow.overdue) : null,
      openEscalations: escalations.ok ? num(escalations.open) : null,
      leads: leads.ok ? num(leadRow.total) : null,
      utilization,
      onTime,
    },
    projects: projects.ok ? {
      total: num(projectRow.total),
      active: num(projectRow.active),
      completed: num(projectRow.completed),
      onHold: num(projectRow.on_hold),
      delayed: num(projectRow.delayed),
      overdue: num(projectRow.overdue),
      cancelled: num(projectRow.cancelled),
      notStarted: num(projectRow.not_started),
      planning: num(projectRow.planning),
      inProgress: num(projectRow.in_progress),
    } : { error: true },
    progress: progress.ok ? progressRows.map((row) => {
      const due = dayKey(row.target_date);
      const remaining = due ? Math.round((parse(due) - parse(range.asOf)) / 86400000) : null;
      const reasons = [];
      if (num(row.overdue_tasks)) reasons.push(`${row.overdue_tasks} overdue task${num(row.overdue_tasks) === 1 ? '' : 's'}`);
      if (row.status === 'AT_RISK') reasons.push('Marked at risk');
      if (remaining != null && remaining >= 0 && remaining <= 14) reasons.push('Deadline approaching');
      if (num(row.progress) < 40 && remaining != null && remaining < 0) reasons.push('Low progress');
      return {
        id: row.id,
        title: row.title,
        customer: row.customer_name || '',
        manager: row.manager || '',
        progress: num(row.progress),
        status: row.status,
        deadline: due,
        daysRemaining: remaining,
        risk: reasons.length >= 2 || num(row.overdue_tasks) >= 3 ? 'High' : reasons.length ? 'Medium' : 'Clear',
        reasons,
        href: `/projects/${row.id}`,
      };
    }) : { error: true },
    tasks: tasks.ok ? {
      total: num(taskRow.total),
      completed: num(taskRow.completed),
      inProgress: num(taskRow.in_progress),
      pending: num(taskRow.pending),
      overdue: num(taskRow.overdue),
      completion,
      onTime,
      averageDays: num(taskRow.completed_in_range) ? num(taskRow.avg_days) : null,
      trend: events.ok ? bucket(events.data, trendStart, range.to, 'created_on', 'updated_on') : [],
    } : { error: true },
    overdue: overdue.ok ? {
      tasks: overdue.data.tasks.map((row) => ({ ...row, due: dayKey(row.due), href: `/tasks/${row.id}`, kind: 'Task' })),
      projects: overdue.data.projects.map((row) => ({ ...row, due: dayKey(row.due), href: `/projects/${row.id}`, kind: 'Project' })),
      escalations: overdue.data.escalations.map((row) => ({ ...row, due: dayKey(row.due), href: `/escalations/${row.id}`, kind: 'Escalation' })),
    } : { error: true },
    teams: teams.ok ? teams.data.map((row) => ({
      id: row.id,
      name: row.name,
      members: num(row.members),
      activeProjects: num(row.active_projects),
      assigned: num(row.assigned),
      completed: num(row.completed),
      overdue: num(row.overdue),
      completion: percent(num(row.completed), num(row.assigned)),
      utilization: teamUtilization.has(row.name)
        ? Math.round(teamUtilization.get(row.name).total / teamUtilization.get(row.name).count)
        : null,
    })) : { error: true },
    workload: load.ok ? {
      underutilized: employees.filter((person) => person.status === 'UNDERUTILIZED').length,
      balanced: employees.filter((person) => person.status === 'HEALTHY' || person.status === 'NEAR_CAPACITY').length,
      high: employees.filter((person) => person.status === 'OVER_CAPACITY').length,
      overloaded: employees.filter((person) => person.status === 'OVERLOADED').length,
      employees: employees.slice(0, 8).map((person) => ({
        id: person.id,
        name: person.name,
        team: person.teamName || '',
        assigned: person.assigned,
        logged: person.logged,
        capacity: person.capacity,
        utilization: person.utilization,
        status: person.status === 'HEALTHY' || person.status === 'NEAR_CAPACITY' ? 'Balanced' : person.status === 'UNDERUTILIZED' ? 'Underutilized' : person.status === 'OVER_CAPACITY' ? 'High Load' : 'Overloaded',
        href: '',
      })),
    } : { error: true },
    daily: daily.ok ? {
      expected: expectedReports,
      submitted: num(daily.submitted),
      pending: Math.max(0, expectedReports - num(daily.submitted)),
      percent: submission,
      contributors: daily.data.contributors || [],
      missing: daily.data.pending || [],
      teams: daily.data.teamGaps || [],
    } : { error: true },
    time: time.ok ? {
      total: Math.round(hours * 10) / 10,
      average: num(time.data.people) ? Math.round((hours / num(time.data.people)) * 10) / 10 : null,
      billable: Math.round(num(time.data.billable) * 10) / 10,
      nonBillable: Math.round(num(time.data.non_billable) * 10) / 10,
      attendance: Math.round((num(time.data.attendanceMinutes) / 60) * 10) / 10,
      target,
      achievement,
      days: (time.data.days || []).map((row) => ({ date: dayKey(row.work_date), hours: Math.round(num(row.hours) * 10) / 10 })),
    } : { error: true },
    leads: leads.ok ? {
      total: num(leadRow.total),
      created: num(leadRow.created),
      draft: num(leadRow.draft),
      submitted: num(leadRow.submitted),
      changes: num(leadRow.changes),
      approved: num(leadRow.approved),
      onHold: num(leadRow.on_hold),
      feasibility: num(leadRow.feasibility),
      costing: num(leadRow.costing),
      won: num(leadRow.won),
      conversion: wonRate,
      feasibilityRate: percent(num(leadRow.feasibility), num(leadRow.total)),
      costingRate: percent(num(leadRow.costing), num(leadRow.feasibility)),
      wonRate,
    } : { error: true },
    feasibility: feasibility.ok ? {
      total: num(feasibility.data.total),
      inProgress: num(feasibility.data.in_progress),
      feasible: num(feasibility.data.feasible),
      conditional: num(feasibility.data.conditional),
      notFeasible: num(feasibility.data.not_feasible),
      pendingInput: num(feasibility.data.pending_input),
      averageDays: num(feasibility.data.total) ? num(feasibility.data.averageDays) : null,
      teams: (feasibility.data.teams || []).map((row) => ({
        name: TEAM_LABEL[row.code] || row.code,
        studies: num(row.studies),
        completed: num(row.completed),
        blocked: num(row.blocked),
      })),
    } : { error: true },
    costing: costing.ok ? {
      commercial,
      total: num(costing.data.total),
      draft: num(costing.data.draft),
      review: num(costing.data.review),
      approved: num(costing.data.approved),
      rejected: num(costing.data.rejected),
      superseded: num(costing.data.superseded),
      internal: commercial ? num(costing.data.internal) : null,
      selling: commercial ? num(costing.data.selling) : null,
      margin: commercial ? num(costing.data.margin) : null,
    } : { error: true },
    procurement: procurement.ok ? {
      open: num(procurement.data.open),
      pending: num(procurement.data.pending),
      approved: num(procurement.data.approved),
      ordered: num(procurement.data.ordered),
      received: num(procurement.data.received),
      delayed: num(procurement.data.delayed),
      leadDays: num(procurement.data.received) ? num(procurement.data.leadDays) : null,
      items: (procurement.data.delayed || []).map((row) => ({
        id: row.id,
        title: row.title,
        vendor: row.vendor_name || '',
        project: row.project || '',
        due: dayKey(row.needed_by),
        days: num(row.days),
        href: '/procurement-requests',
      })),
    } : { error: true },
    escalations: escalations.ok ? {
      open: num(escalations.data.open),
      critical: num(escalations.data.critical),
      overdue: num(escalations.data.overdue),
      underReview: num(escalations.data.under_review),
      resolved: num(escalations.data.resolved),
      byTeam: escalations.data.byTeam || [],
      byType: escalations.data.byType || [],
      trend: bucket(escalations.data.events || [], range.from, range.to, 'created_on', 'resolved_on'),
    } : { error: true },
    risks: Array.isArray(progressRows) ? progressRows.filter((row) => {
      const due = dayKey(row.target_date);
      const remaining = due ? Math.round((parse(due) - parse(range.asOf)) / 86400000) : null;
      return num(row.overdue_tasks) || row.status === 'AT_RISK' || (remaining != null && remaining <= 7);
    }).map((row) => ({
      id: row.id,
      title: row.title,
      reasons: [
        num(row.overdue_tasks) ? `${row.overdue_tasks} overdue task${num(row.overdue_tasks) === 1 ? '' : 's'}` : '',
        row.status === 'AT_RISK' ? 'Project marked at risk' : '',
      ].filter(Boolean),
      href: `/projects/${row.id}`,
    })) : { error: true },
    attention: focus.ok || load.ok ? attentionRows.slice(0, 12) : { error: true },
    activity: recent.ok ? recent.data.map((row) => ({
      user: row.actor || 'System',
      action: row.action,
      record: row.record || '',
      at: row.created_at,
      href: row.href,
    })) : { error: true },
    summary,
    cards: [
      { label: 'Project Health', value: projects.ok && num(projectRow.active) ? `${Math.max(0, Math.round(((num(projectRow.active) - num(projectRow.delayed) - num(projectRow.overdue)) / num(projectRow.active)) * 100))}%` : 'No data', comparison: compare(projects.ok ? num(projectRow.completed) : null, previousProjects.ok ? num(previousProjects.data.completed) : null, previousProjects.ok && (num(previousProjects.data.total) || num(projectRow.total))) },
      { label: 'Team Capacity', value: utilization == null ? 'No data' : `${utilization}%`, comparison: { delta: null, label: 'No comparison data' } },
      { label: 'Task Delivery', value: onTime == null ? 'No data' : `${onTime}%`, comparison: compare(onTime, previousOnTime, previousTaskRow.completed_in_range > 0) },
      { label: 'Lead Conversion', value: wonRate == null ? 'No data' : `${wonRate}%`, comparison: { delta: null, label: num(leadRow.total) ? 'Projects created from leads' : 'No comparison data' } },
      { label: 'Procurement Risk', value: procurement.ok ? String(num(procurement.data.delayed)) : 'No data', comparison: { delta: null, label: procurement.ok && num(procurement.data.delayed) ? 'Delayed requests' : 'No comparison data' } },
      { label: 'Escalation Risk', value: escalations.ok ? String(num(escalations.data.critical)) : 'No data', comparison: { delta: null, label: 'No comparison data' } },
    ],
    sections: {
      projects: projects.ok,
      tasks: tasks.ok,
      teams: teams.ok,
      workload: load.ok,
      daily: daily.ok,
      time: time.ok,
      leads: leads.ok,
      feasibility: feasibility.ok,
      costing: costing.ok,
      procurement: procurement.ok,
      escalations: escalations.ok,
      attention: focus.ok,
      activity: recent.ok,
    },
  };
}

function sheet(name, columns, lines) {
  const body = [columns, ...lines].map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${String(cell ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${name}"><Table>${body}</Table></Worksheet></Workbook>`;
}

async function exportFile(user, query) {
  const data = await overview(user, query || {});
  const lines = [
    `Range ${data.range.from} to ${data.range.to}`,
    ...data.summary,
    `Projects ${data.kpis.totalProjects ?? 0}`,
    `Active ${data.kpis.activeProjects ?? 0}`,
    `Completed ${data.kpis.completedProjects ?? 0}`,
    `Overdue tasks ${data.kpis.overdueTasks ?? 0}`,
    `Open escalations ${data.kpis.openEscalations ?? 0}`,
    `Leads ${data.kpis.leads ?? 0}`,
    `Utilization ${data.kpis.utilization == null ? 'No data' : `${data.kpis.utilization}%`}`,
    `On-time ${data.kpis.onTime == null ? 'No data' : `${data.kpis.onTime}%`}`,
  ];
  const format = query.format === 'pdf' ? 'pdf' : query.format === 'csv' ? 'csv' : 'xls';
  if (format === 'pdf') {
    return { name: 'insights.pdf', type: 'application/pdf', body: timeExport.pdf('CareYu Insights', lines) };
  }
  if (format === 'csv') {
    return { name: 'insights.csv', type: 'text/csv; charset=utf-8', body: lines.map((line) => `"${line.replace(/"/g, '""')}"`).join('\n') };
  }
  return { name: 'insights.xls', type: 'application/vnd.ms-excel', body: sheet('Insights', ['Insight'], lines.map((line) => [line])) };
}

module.exports = { overview, exportFile };
