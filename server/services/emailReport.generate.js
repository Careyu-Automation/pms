const { query } = require('../db');
const workload = require('./workload.service');
const dailyFormat = require('./emailReport.dailyFormat');

const TYPES = {
  DAILY_WORK: 'Daily Work Report',
  WEEKLY_SUMMARY: 'Weekly Work Summary',
  TEAM_PERFORMANCE: 'Team Performance Report',
  PROJECT_PROGRESS: 'Project Progress Report',
  TASK_STATUS: 'Task Status Report',
  WORKLOAD: 'Workload Report',
  PROJECT_DELAY: 'Project Delay Report',
  LEAVE_ATTENDANCE: 'Leave & Attendance Report',
  LEAD_PIPELINE: 'Lead Pipeline Report',
  FEASIBILITY: 'Feasibility Study Report',
  SOLUTION_COSTING: 'Solution & Costing Report',
  CUSTOM: 'Custom Management Report',
};

const CUSTOM_SECTIONS = ['kpis', 'projects', 'tasks', 'teams', 'employees', 'delays', 'workload', 'activity', 'risks'];

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function periodFor(type, config) {
  const today = todayIso();
  if (type === 'DAILY_WORK') {
    const from = config.dateFrom || config.dateTo || today;
    const to = config.dateTo || config.dateFrom || today;
    return { from, to };
  }
  if (config.dateFrom && config.dateTo) return { from: config.dateFrom, to: config.dateTo };
  if (type === 'WEEKLY_SUMMARY' || type === 'WORKLOAD') {
    const day = new Date().getDay();
    const start = shiftIso(today, day === 0 ? -6 : 1 - day);
    return { from: start, to: shiftIso(start, 6) };
  }
  if (config.frequency === 'MONTHLY' || type === 'CUSTOM') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: shiftIso(today, -30), to: today };
}

function table(title, columns, rows, limit = 120) {
  return { title, columns, rows: rows.slice(0, limit) };
}

function barsFrom(rows, index) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = String(row[index] || '—');
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].slice(0, 6).map(([label, value]) => ({ label, value }));
}

async function actorScope(actor) {
  const admin = ['admin', 'super_admin', 'project_manager', 'management'].includes(actor?.role?.code || '');
  if (admin) return { admin: true, userIds: null };
  const lead = await query(
    `SELECT id FROM teams WHERE lead_id = $1 AND status <> 'ARCHIVED'`,
    [actor.id],
  );
  if (lead.rows.length) {
    const members = await query(
      `SELECT user_id FROM team_members WHERE team_id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [lead.rows.map((row) => row.id)],
    );
    const ids = new Set(members.rows.map((row) => row.user_id));
    ids.add(actor.id);
    return { admin: false, userIds: [...ids], teamIds: lead.rows.map((row) => row.id) };
  }
  return { admin: false, userIds: [actor.id], teamIds: [] };
}

function userFilter(scope, column, params) {
  if (!scope.userIds) return '';
  params.push(scope.userIds);
  return ` AND ${column} = ANY($${params.length}::uuid[])`;
}

const DAILY_STATUS = {
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

const DAILY_PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

const DAILY_DEPENDENCY = {
  '': 'None',
  NONE: 'None',
  TEAM: 'Internal team',
  EMPLOYEE: 'Team member',
  APPROVAL: 'Management approval',
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
  PROCUREMENT: 'Procurement',
  TECHNICAL: 'Technical information',
  MATERIAL: 'Material',
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  OTHER: 'Other',
};

const DAILY_COLUMNS = ['Person', 'Project', 'Task Description', 'Dependencies', 'Status', 'Start Date', 'Task Deadline', 'Logged Hours', 'Reason for Delay'];
const EVENING_COLUMNS = [...DAILY_COLUMNS, 'Morning Work', 'Evening Work', 'Progress'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function displayDate(iso) {
  const text = String(iso || '').slice(0, 10);
  const [year, month, day] = text.split('-').map(Number);
  if (!year || !month || !day) return text || '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function hoursText(row) {
  const logged = row.loggedHours != null && row.loggedHours !== ''
    ? Number(row.loggedHours)
    : (Number(row.hours) || 0) + ((Number(row.minutes) || 0) / 60);
  if (!Number.isFinite(logged)) return '—';
  const rounded = Math.round(logged * 10) / 10;
  return `${rounded} hrs`;
}

function sheetDate(iso) {
  const text = String(iso || '').slice(0, 10);
  const [year, month, day] = text.split('-');
  if (!year || !month || !day) return '—';
  return `${day}-${month}-${year}`;
}

function taskText(row) {
  return dailyFormat.workDescription(row);
}

function dependencyText(row) {
  return dailyFormat.dependencyText(row);
}

function dailyLine(row, shift) {
  const line = [
    row.employeeName || '—',
    row.projectName || 'No project',
    taskText(row),
    dependencyText(row),
    dailyFormat.statusLabel(row.status),
    sheetDate(row.startDate),
    sheetDate(row.deadline),
    hoursText(row),
    row.reasonForDelay || '—',
  ];
  if (shift !== 'Morning') {
    line.push(
      row.morningWork || '—',
      row.eveningWork || '—',
      row.progress == null || row.progress === '' ? '—' : `${row.progress}%`,
    );
  }
  return line;
}

function attentionText(values) {
  const unique = [...new Set(values.map((item) => String(item || '').trim()).filter((item) => item && item !== 'None' && item !== '—'))];
  if (!unique.length) return 'None';
  const shown = unique.slice(0, 5).join('; ');
  return unique.length > 5 ? `${shown}; +${unique.length - 5} more` : shown;
}

function shiftLabel(period) {
  if (period === 'EVENING') return 'Evening';
  if (period === 'MORNING') return 'Morning';
  return 'Full day';
}

function reportStamp(iso) {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '—';
  return `${String(day).padStart(2, '0')}-${MONTHS[month - 1]}-${year}`;
}

function dailySubject(iso) {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 'Daily Work Updates Report';
  return `Daily Work Updates Report — ${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

function workKey(row) {
  if (row.taskId) return `task:${row.taskId}:${row.employeeId}`;
  return `work:${row.employeeId}:${row.projectId || ''}:${String(row.workTitle || row.description || '').trim().toLowerCase()}`;
}

/** Evening digest should include the whole day's saved work; keep one row per item (prefer evening). */
function preferLatestShift(rows) {
  const best = new Map();
  rows.forEach((row) => {
    const key = workKey(row);
    const current = best.get(key);
    if (!current) {
      best.set(key, row);
      return;
    }
    if (current.period !== 'EVENING' && row.period === 'EVENING') best.set(key, row);
    else if (current.period === row.period && String(row.updatedAt || '') > String(current.updatedAt || '')) best.set(key, row);
  });
  return [...best.values()];
}

async function daily(config, actor, period) {
  // Daily Work emails always include every saved update for the date/period — no team/employee/project filters.
  // Morning = morning-only. Evening/Full day = all saved updates for that date (so evening edits kept as MORNING still appear).
  const dailyWork = require('./dailyWork.service');
  const shiftPeriod = config.period === 'EVENING' || config.period === 'MORNING' ? config.period : '';
  const data = await dailyWork.list(actor, {
    range: 'custom',
    date: period.from,
    from: period.from,
    to: period.to,
    employeeId: '',
    teamId: '',
    projectId: '',
    productId: '',
    workType: '',
    status: '',
    priority: '',
    period: shiftPeriod === 'MORNING' ? 'MORNING' : '',
    savedOnly: true,
    organization: true,
  });
  let updates = (data.updates || []).filter((row) => row.id);
  if (shiftPeriod !== 'MORNING') updates = preferLatestShift(updates);
  const shift = shiftLabel(config.period);
  const groups = dailyFormat.groupByEmployee(updates);
  const reportColumns = dailyFormat.reportColumns();
  const sections = groups.map((group) => table(
    group.employeeName,
    reportColumns,
    group.rows.map((row) => dailyFormat.reportRowCells(row)),
    500,
  ));
  if (!sections.length) {
    sections.push(table(
      shift === 'Evening' ? 'Evening Daily Work Updates' : shift === 'Morning' ? 'Morning Daily Work Updates' : 'Daily Work Updates',
      reportColumns,
      [],
      500,
    ));
  }
  const blockers = updates.map((row) => dependencyText(row));
  return {
    kpis: [
      { label: 'Total work entries', value: updates.length },
      { label: 'Employees who submitted updates', value: new Set(updates.map((row) => row.employeeId)).size },
      { label: 'Completed entries', value: data.summary.completed },
      { label: 'In-progress entries', value: data.summary.inProgress },
      { label: 'Blocked entries', value: data.summary.blocked },
      { label: 'Total hours logged', value: data.summary.hoursLabel },
      { label: 'Outstanding blockers or dependencies', value: attentionText(blockers) },
      { label: 'Delay reasons requiring attention', value: attentionText(updates.map((row) => row.reasonForDelay)) },
    ],
    sections,
    bars: [],
    shift,
    dailyRows: updates,
    empty: updates.length === 0,
    recordCount: updates.length,
  };
}

async function tasks(config, scope, period, overdueOnly) {
  const params = [period.from, period.to];
  let extra = userFilter(scope, 't.assignee_id', params);
  if (config.teamId) {
    params.push(config.teamId);
    extra += ` AND tm.code = (SELECT code FROM teams WHERE id = $${params.length})`;
  }
  if (config.projectId) {
    params.push(config.projectId);
    extra += ` AND t.project_id = $${params.length}`;
  }
  if (config.employeeId) {
    params.push(config.employeeId);
    extra += ` AND t.assignee_id = $${params.length}`;
  }
  if (config.priority) {
    params.push(config.priority);
    extra += ` AND t.priority = $${params.length}`;
  }
  if (overdueOnly || config.overdueOnly) extra += ` AND t.end_date < CURRENT_DATE AND t.status NOT IN ('COMPLETED', 'CANCELLED')`;
  if (config.includeCompleted === false) extra += ` AND t.status <> 'COMPLETED'`;
  const result = await query(
    `SELECT t.title, COALESCE(u.full_name, 'Unassigned') AS assignee, COALESCE(tm.name, t.team_code, '') AS team,
            p.title AS project, p.project_code, t.status, t.priority, t.start_date, t.end_date, t.baseline_end,
            t.estimated_hours, t.progress,
            GREATEST(0, CURRENT_DATE - t.end_date) AS delay_days
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN users u ON u.id = t.assignee_id
     LEFT JOIN teams tm ON tm.code = t.team_code
     WHERE t.end_date >= $1 AND t.start_date <= $2 ${extra}
     ORDER BY t.end_date
     LIMIT 200`,
    params,
  );
  return result.rows;
}

async function weekly(config, scope, period) {
  const rows = await tasks(config, scope, period, false);
  const hourParams = [period.from, period.to];
  const hourScope = scope.userIds ? (hourParams.push(scope.userIds), ` AND user_id = ANY($${hourParams.length}::uuid[])`) : '';
  const hours = await query(
    `SELECT COALESCE(SUM(hours), 0)::float AS hours FROM project_time_entries
     WHERE work_date BETWEEN $1 AND $2 ${hourScope}`,
    hourParams,
  );
  const completed = rows.filter((row) => row.status === 'COMPLETED').length;
  const open = rows.filter((row) => !['COMPLETED', 'CANCELLED'].includes(row.status)).length;
  const overdue = rows.filter((row) => Number(row.delay_days) > 0 && row.status !== 'COMPLETED').length;
  const body = rows.map((row) => [row.title, row.assignee, row.team || '—', row.project, row.status, row.end_date, row.progress]);
  return {
    kpis: [
      { label: 'Assigned', value: rows.length },
      { label: 'Completed', value: completed },
      { label: 'Open', value: open },
      { label: 'Overdue', value: overdue },
      { label: 'Hours logged', value: Math.round(hours.rows[0].hours * 10) / 10 },
      { label: 'Completion', value: rows.length ? `${Math.round((completed / rows.length) * 100)}%` : '0%' },
    ],
    sections: [table('Weekly tasks', ['Task', 'Assignee', 'Team', 'Project', 'Status', 'Due', 'Progress'], body)],
    bars: barsFrom(body, 4),
  };
}

async function teamPerformance(config, scope) {
  const params = [];
  let extra = '';
  if (!scope.admin) {
    params.push(scope.userIds);
    extra = `WHERE t.assignee_id = ANY($1::uuid[])`;
  }
  if (config.teamId) {
    params.push(config.teamId);
    extra += `${extra ? ' AND' : 'WHERE'} tm.id = $${params.length}`;
  }
  const result = await query(
    `SELECT COALESCE(tm.name, 'Unassigned') AS team, COALESCE(lead.full_name, '') AS lead,
            COUNT(DISTINCT t.assignee_id) AS members,
            COUNT(DISTINCT t.project_id) AS projects,
            COUNT(*) FILTER (WHERE t.status NOT IN ('COMPLETED', 'CANCELLED')) AS open_tasks,
            COUNT(*) FILTER (WHERE t.status = 'COMPLETED') AS completed,
            COUNT(*) FILTER (WHERE t.end_date < CURRENT_DATE AND t.status NOT IN ('COMPLETED', 'CANCELLED')) AS overdue,
            COALESCE(SUM(t.estimated_hours), 0)::float AS estimated
     FROM project_tasks t
     LEFT JOIN teams tm ON tm.code = t.team_code
     LEFT JOIN users lead ON lead.id = tm.lead_id
     ${extra}
     GROUP BY tm.name, lead.full_name
     ORDER BY tm.name NULLS LAST
     LIMIT 40`,
    params,
  );
  const rows = result.rows.map((row) => [
    row.team, row.lead || '—', row.members, row.projects, row.open_tasks, row.completed, row.overdue, row.estimated,
  ]);
  return {
    kpis: [
      { label: 'Teams', value: rows.length },
      { label: 'Open tasks', value: result.rows.reduce((sum, row) => sum + Number(row.open_tasks), 0) },
      { label: 'Overdue', value: result.rows.reduce((sum, row) => sum + Number(row.overdue), 0) },
    ],
    sections: [table('Teams', ['Team', 'Lead', 'Members', 'Projects', 'Open', 'Completed', 'Overdue', 'Estimated hours'], rows)],
    bars: result.rows.slice(0, 6).map((row) => ({ label: row.team, value: Number(row.open_tasks) })),
  };
}

async function projects(config, scope) {
  const params = [];
  let extra = 'WHERE p.status <> \'CANCELLED\'';
  if (config.projectId) {
    params.push(config.projectId);
    extra += ` AND p.id = $${params.length}`;
  }
  if (!scope.admin) {
    params.push(scope.userIds);
    extra += ` AND (p.project_manager_id = ANY($${params.length}::uuid[]) OR p.created_by = ANY($${params.length}::uuid[]) OR EXISTS (SELECT 1 FROM project_tasks t WHERE t.project_id = p.id AND t.assignee_id = ANY($${params.length}::uuid[])))`;
  }
  const result = await query(
    `SELECT p.project_code, p.title, p.customer_name, COALESCE(u.full_name, '') AS manager, p.status,
            p.start_date, p.target_date,
            COUNT(t.id) FILTER (WHERE t.status NOT IN ('COMPLETED', 'CANCELLED')) AS open_tasks,
            COUNT(t.id) FILTER (WHERE t.status = 'COMPLETED') AS completed,
            COUNT(t.id) FILTER (WHERE t.end_date < CURRENT_DATE AND t.status NOT IN ('COMPLETED', 'CANCELLED')) AS delayed,
            COALESCE(AVG(t.progress), 0)::int AS progress
     FROM projects p
     LEFT JOIN users u ON u.id = p.project_manager_id
     LEFT JOIN project_tasks t ON t.project_id = p.id
     ${extra}
     GROUP BY p.id, p.project_code, p.title, p.customer_name, p.status, p.start_date, p.target_date, u.full_name
     ORDER BY p.title
     LIMIT 80`,
    params,
  );
  const rows = result.rows.map((row) => {
    const remaining = row.target_date ? Math.round((new Date(row.target_date) - new Date()) / 86400000) : '';
    return [row.project_code, row.title, row.customer_name || '—', row.manager || '—', row.status, `${row.progress}%`, row.target_date || '—', remaining, row.open_tasks, row.completed, row.delayed];
  });
  return {
    kpis: [
      { label: 'Projects', value: rows.length },
      { label: 'Open tasks', value: result.rows.reduce((sum, row) => sum + Number(row.open_tasks), 0) },
      { label: 'Delayed tasks', value: result.rows.reduce((sum, row) => sum + Number(row.delayed), 0) },
    ],
    sections: [table('Projects', ['ID', 'Project', 'Customer', 'Manager', 'Status', 'Progress', 'Target', 'Days left', 'Open', 'Completed', 'Delayed'], rows)],
    bars: result.rows.slice(0, 6).map((row) => ({ label: row.title, value: Number(row.progress) })),
  };
}

async function delays(config, scope, period) {
  const rows = await tasks({ ...config, overdueOnly: true }, scope, { from: '2000-01-01', to: period.to }, true);
  const body = rows.map((row) => [
    row.project, row.title, row.assignee, row.team || '—', row.baseline_end || row.end_date, row.end_date, row.delay_days, row.status,
  ]);
  return {
    kpis: [{ label: 'Delayed tasks', value: body.length }],
    sections: [table('Delays', ['Project', 'Task', 'Assignee', 'Team', 'Original deadline', 'Current deadline', 'Delay days', 'Status'], body)],
    bars: barsFrom(body, 3),
  };
}

async function workloadReport(actor, config, period) {
  const data = await workload.board(actor, {
    mode: 'custom',
    start: period.from,
    end: period.to,
    teamId: config.teamId || '',
    employeeId: config.employeeId || '',
  });
  const rows = (data.employees || []).map((person) => [
    person.name, person.teamName || '—', person.openTasks, person.assigned, person.logged, person.capacity, person.utilization == null ? '—' : `${person.utilization}%`, person.overdue, person.status,
  ]);
  return {
    kpis: [
      { label: 'People', value: data.summary.people },
      { label: 'Assigned hours', value: data.summary.assigned },
      { label: 'Logged hours', value: data.summary.logged },
      { label: 'Overloaded', value: data.summary.overloaded },
    ],
    sections: [table('Workload', ['Employee', 'Team', 'Open tasks', 'Estimated', 'Logged', 'Capacity', 'Utilization', 'Overdue', 'Status'], rows)],
    bars: (data.employees || []).slice(0, 6).map((person) => ({ label: person.name, value: Math.round(person.utilization || 0) })),
  };
}

async function leaveReport(config, scope, period) {
  const params = [period.from, period.to];
  let extra = userFilter(scope, 'r.user_id', params);
  if (config.employeeId) {
    params.push(config.employeeId);
    extra += ` AND r.user_id = $${params.length}`;
  }
  const result = await query(
    `SELECT u.full_name, COALESCE(t.name, '') AS team, lt.name AS leave_type, r.start_date, r.end_date, r.duration_days, r.status, r.reason
     FROM leave_requests r
     JOIN users u ON u.id = r.user_id
     JOIN leave_types lt ON lt.id = r.leave_type_id
     LEFT JOIN teams t ON t.id = r.team_id
     WHERE r.end_date >= $1 AND r.start_date <= $2 ${extra}
     ORDER BY r.start_date DESC
     LIMIT 150`,
    params,
  );
  const rows = result.rows.map((row) => [row.full_name, row.team || '—', row.leave_type, row.start_date, row.end_date, row.duration_days, row.status, row.reason]);
  return {
    kpis: [
      { label: 'Requests', value: rows.length },
      { label: 'Approved', value: rows.filter((row) => row[6] === 'APPROVED').length },
      { label: 'Pending', value: rows.filter((row) => row[6] === 'PENDING').length },
    ],
    sections: [table('Leave', ['Employee', 'Team', 'Type', 'Start', 'End', 'Days', 'Status', 'Reason'], rows)],
    bars: barsFrom(rows, 6),
  };
}

async function leads(config, scope) {
  const params = [];
  let extra = '';
  if (!scope.admin) {
    params.push(scope.userIds);
    extra = `WHERE l.created_by = ANY($1::uuid[])`;
  }
  const result = await query(
    `SELECT l.lead_code, l.title, l.customer_name, l.business_vertical, u.full_name, l.priority, l.stage, l.status,
            l.expected_decision_date, GREATEST(0, (CURRENT_DATE - l.updated_at::date)) AS days_in_stage, l.updated_at::date AS updated
     FROM leads l
     JOIN users u ON u.id = l.created_by
     ${extra}
     ORDER BY l.updated_at DESC
     LIMIT 120`,
    params,
  );
  const rows = result.rows.map((row) => [row.lead_code, row.title, row.customer_name, row.business_vertical, row.full_name, row.priority, row.stage, row.status, row.expected_decision_date || '—', row.days_in_stage, row.updated]);
  return {
    kpis: [{ label: 'Leads', value: rows.length }],
    sections: [table('Leads', ['ID', 'Title', 'Customer', 'Vertical', 'Created by', 'Priority', 'Stage', 'Status', 'Decision date', 'Days in stage', 'Updated'], rows)],
    bars: barsFrom(rows, 6),
  };
}

async function feasibility(scope) {
  const params = [];
  let extra = '';
  if (!scope.admin) {
    params.push(scope.userIds);
    extra = `WHERE l.created_by = ANY($1::uuid[]) OR f.owner_id = ANY($1::uuid[])`;
  }
  const result = await query(
    `SELECT l.title, l.customer_name, f.status, f.technical_feasibility, f.required_resources, f.major_constraints,
            f.major_risks, f.overall_conclusion, f.target_completion_date
     FROM feasibility_studies f
     JOIN leads l ON l.id = f.lead_id
     ${extra}
     ORDER BY f.updated_at DESC
     LIMIT 80`,
    params,
  );
  const rows = result.rows.map((row) => [
    row.title, row.customer_name, row.status, clip(row.technical_feasibility), clip(row.required_resources),
    clip(row.major_constraints), clip(row.major_risks), clip(row.overall_conclusion), row.target_completion_date || '—',
  ]);
  return {
    kpis: [{ label: 'Studies', value: rows.length }],
    sections: [table('Feasibility', ['Lead', 'Customer', 'Status', 'Assessment', 'Resources', 'Constraints', 'Risks', 'Conclusion', 'Target'], rows)],
    bars: barsFrom(rows, 2),
  };
}

async function costing(scope) {
  const params = [];
  let extra = 'WHERE v.is_current = TRUE';
  if (!scope.admin) {
    params.push(scope.userIds);
    extra += ` AND (c.owner_id = ANY($1::uuid[]) OR c.created_by = ANY($1::uuid[]) OR l.created_by = ANY($1::uuid[]))`;
  }
  const result = await query(
    `SELECT l.title, l.customer_name, v.solution_name, v.version_no, v.status, v.margin_percent, v.contingency_percent,
            v.overhead_percent, v.totals
     FROM solution_costing_versions v
     JOIN solution_costings c ON c.id = v.costing_id
     JOIN leads l ON l.id = c.lead_id
     ${extra}
     ORDER BY v.updated_at DESC
     LIMIT 80`,
    params,
  );
  const rows = result.rows.map((row) => {
    const totals = row.totals || {};
    return [
      row.title, row.customer_name, row.solution_name || '—', `v${row.version_no}`, row.status,
      money(totals.internalCost || totals.cost || totals.subtotal),
      money(totals.sellingPrice || totals.selling || totals.grandTotal),
      `${row.margin_percent}%`, `${row.contingency_percent}%`, `${row.overhead_percent}%`,
    ];
  });
  return {
    kpis: [{ label: 'Costings', value: rows.length }],
    sections: [table('Solution & costing', ['Lead', 'Customer', 'Solution', 'Version', 'Status', 'Internal cost', 'Selling price', 'Margin', 'Contingency', 'Overhead'], rows)],
    bars: barsFrom(rows, 4),
  };
}

function clip(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 140) : '—';
}

function money(value) {
  if (value === undefined || value === null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : String(value);
}

async function custom(report, actor, config, scope, period) {
  const wanted = new Set((config.sections && config.sections.length ? config.sections : CUSTOM_SECTIONS));
  const sections = [];
  const kpis = [];
  let bars = [];
  if (wanted.has('projects') || wanted.has('kpis')) {
    const pack = await projects(config, scope);
    if (wanted.has('projects')) sections.push(...pack.sections);
    if (wanted.has('kpis')) kpis.push(...pack.kpis);
    bars = pack.bars;
  }
  if (wanted.has('tasks') || wanted.has('employees')) {
    const rows = await tasks(config, scope, period, false);
    sections.push(table('Tasks', ['Task', 'Assignee', 'Team', 'Project', 'Status', 'Priority', 'Due', 'Progress'], rows.map((row) => [row.title, row.assignee, row.team || '—', row.project, row.status, row.priority, row.end_date, row.progress])));
  }
  if (wanted.has('teams')) sections.push(...(await teamPerformance(config, scope)).sections);
  if (wanted.has('delays') || wanted.has('risks')) sections.push(...(await delays(config, scope, period)).sections);
  if (wanted.has('workload')) {
    const pack = await workloadReport(actor, config, period);
    sections.push(...pack.sections);
    bars = pack.bars;
  }
  if (wanted.has('activity')) {
    const activity = await query(
      `SELECT a.created_at::date AS day, COALESCE(u.full_name, 'CareYu') AS actor, a.action, p.title
       FROM project_activity a
       LEFT JOIN users u ON u.id = a.actor_id
       JOIN projects p ON p.id = a.project_id
       ORDER BY a.created_at DESC
       LIMIT 30`,
    );
    sections.push(table('Recent activity', ['Date', 'Person', 'Action', 'Project'], activity.rows.map((row) => [row.day, row.actor, row.action, row.title])));
  }
  return { kpis, sections, bars };
}

async function build(report, actor) {
  const config = report.configuration || {};
  const scope = await actorScope(actor);
  const period = periodFor(report.type, { ...config, frequency: report.frequency });
  let pack;
  if (report.type === 'DAILY_WORK') pack = await daily(config, actor, period);
  else if (report.type === 'WEEKLY_SUMMARY') pack = await weekly(config, scope, period);
  else if (report.type === 'TEAM_PERFORMANCE') pack = await teamPerformance(config, scope);
  else if (report.type === 'PROJECT_PROGRESS') pack = await projects(config, scope);
  else if (report.type === 'TASK_STATUS') {
    const rows = await tasks(config, scope, period, false);
    pack = {
      kpis: [{ label: 'Tasks', value: rows.length }],
      sections: [table('Tasks', ['Task', 'Assignee', 'Team', 'Project', 'Status', 'Priority', 'Start', 'Due', 'Estimated', 'Progress', 'Delay days'], rows.map((row) => [row.title, row.assignee, row.team || '—', row.project, row.status, row.priority, row.start_date, row.end_date, row.estimated_hours || '—', row.progress, row.delay_days]))],
      bars: barsFrom(rows.map((row) => [row.status]), 0),
    };
  } else if (report.type === 'WORKLOAD') pack = await workloadReport(actor, config, period);
  else if (report.type === 'PROJECT_DELAY') pack = await delays(config, scope, period);
  else if (report.type === 'LEAVE_ATTENDANCE') pack = await leaveReport(config, scope, period);
  else if (report.type === 'LEAD_PIPELINE') pack = await leads(config, scope);
  else if (report.type === 'FEASIBILITY') pack = await feasibility(scope);
  else if (report.type === 'SOLUTION_COSTING') pack = await costing(scope);
  else pack = await custom(report, actor, config, scope, period);

  const names = await namesFor(config);
  return {
    title: report.name || TYPES[report.type] || 'Report',
    type: report.type,
    typeLabel: TYPES[report.type] || report.type,
    period,
    shift: pack.shift || '',
    dailyRows: pack.dailyRows || [],
    empty: Boolean(pack.empty),
    recordCount: Number(pack.recordCount || 0),
    generatedAt: new Date().toISOString(),
    kpis: pack.kpis || [],
    sections: pack.sections || [],
    bars: pack.bars || [],
    variables: {
      reportName: report.name,
      teamName: names.teamName,
      projectName: names.projectName,
      employeeName: names.employeeName,
      customerName: names.customerName,
      reportDate: period.to,
      startDate: period.from,
      endDate: period.to,
      period: report.type === 'DAILY_WORK' ? `${displayDate(period.from)} (${shiftLabel(config.period)})` : `${period.from} to ${period.to}`,
      projectManager: names.manager,
      teamLead: names.lead,
      date: period.to,
    },
  };
}

async function namesFor(config) {
  const names = { teamName: '', projectName: '', employeeName: '', customerName: config.customer || '', manager: '', lead: '' };
  if (config.teamId) {
    const row = (await query(`SELECT t.name, COALESCE(u.full_name, '') AS lead FROM teams t LEFT JOIN users u ON u.id = t.lead_id WHERE t.id = $1`, [config.teamId])).rows[0];
    if (row) {
      names.teamName = row.name;
      names.lead = row.lead;
    }
  }
  if (config.projectId) {
    const row = (await query(`SELECT p.title, p.customer_name, COALESCE(u.full_name, '') AS manager FROM projects p LEFT JOIN users u ON u.id = p.project_manager_id WHERE p.id = $1`, [config.projectId])).rows[0];
    if (row) {
      names.projectName = row.title;
      names.customerName = names.customerName || row.customer_name;
      names.manager = row.manager;
    }
  }
  if (config.employeeId) {
    const row = (await query('SELECT full_name FROM users WHERE id = $1', [config.employeeId])).rows[0];
    if (row) names.employeeName = row.full_name;
  }
  return names;
}

function applyVariables(template, variables) {
  return String(template || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (variables[key] ? String(variables[key]) : match));
}

module.exports = { TYPES, CUSTOM_SECTIONS, build, applyVariables, actorScope, displayDate, dailySubject };
