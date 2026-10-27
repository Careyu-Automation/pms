const { query } = require('./index');

const OPEN_TASK = `('NOT_STARTED','IN_PROGRESS','AT_RISK','ON_HOLD')`;
const OPEN_PROJECT = `('NOT_STARTED','PLANNING','IN_PROGRESS','AT_RISK')`;
const OPEN_ESCALATION = `('OPEN','ASSIGNED','UNDER_REVIEW','ACTION_REQUIRED','WAITING_FOR_RESPONSE')`;

function mark(params, value) {
  params.push(value);
  return `$${params.length}`;
}

function peopleSql(scope, params) {
  if (scope.level === 'org') return 'SELECT id FROM users WHERE is_active = TRUE';
  if (scope.level === 'lead') {
    const teams = mark(params, scope.teamIds);
    const user = mark(params, scope.userId);
    return `SELECT user_id AS id FROM team_members WHERE status = 'ACTIVE' AND team_id = ANY(${teams}::uuid[]) UNION SELECT ${user}::uuid`;
  }
  return `SELECT ${mark(params, scope.userId)}::uuid AS id`;
}

function projectWhere(scope, filters, params, alias = 'p') {
  const parts = ['TRUE'];
  if (scope.level === 'lead') {
    const teams = mark(params, scope.teamIds);
    const user = mark(params, scope.userId);
    parts.push(`(${alias}.project_manager_id = ${user}::uuid OR ${alias}.id IN (SELECT project_id FROM project_teams WHERE team_id = ANY(${teams}::uuid[])) OR ${alias}.id IN (SELECT project_id FROM project_tasks WHERE team_code IN (SELECT code FROM teams WHERE id = ANY(${teams}::uuid[]))))`);
  } else if (scope.level === 'member') {
    const user = mark(params, scope.userId);
    parts.push(`(${alias}.project_manager_id = ${user}::uuid OR ${alias}.id IN (SELECT project_id FROM project_tasks WHERE assignee_id = ${user}::uuid) OR ${alias}.id IN (SELECT pt.project_id FROM project_teams pt JOIN team_members tm ON tm.team_id = pt.team_id AND tm.user_id = ${user}::uuid AND tm.status = 'ACTIVE'))`);
  }
  if (filters.projectId) parts.push(`${alias}.id = ${mark(params, filters.projectId)}::uuid`);
  if (filters.managerId) parts.push(`${alias}.project_manager_id = ${mark(params, filters.managerId)}::uuid`);
  if (filters.customer) parts.push(`${alias}.customer_name ILIKE ${mark(params, `%${String(filters.customer).replace(/[%_]/g, '')}%`)}`);
  if (filters.status) parts.push(`${alias}.status = ${mark(params, filters.status)}`);
  if (filters.teamId) {
    const team = mark(params, filters.teamId);
    parts.push(`(${alias}.id IN (SELECT project_id FROM project_teams WHERE team_id = ${team}::uuid) OR ${alias}.team_code = (SELECT code FROM teams WHERE id = ${team}::uuid) OR ${alias}.id IN (SELECT project_id FROM project_tasks WHERE team_code = (SELECT code FROM teams WHERE id = ${team}::uuid)))`);
  }
  return parts.join(' AND ');
}

function leadWhere(scope, params) {
  if (scope.level === 'org') return 'TRUE';
  const people = peopleSql(scope, params);
  if (scope.level === 'member') return `l.created_by IN (${people})`;
  const teams = mark(params, scope.teamIds);
  return `(l.created_by IN (${people}) OR l.id IN (
    SELECT f.lead_id FROM feasibility_studies f
    JOIN feasibility_team_assignments a ON a.feasibility_id = f.id
    WHERE a.team_code IN (SELECT code FROM teams WHERE id = ANY(${teams}::uuid[]))
  ))`;
}

function escalationWhere(scope, filters, params) {
  const parts = ['e.archived_at IS NULL'];
  const projectMatch = `e.project_id IN (SELECT p.id FROM projects p WHERE ${projectWhere(scope, filters, params)})`;
  if (scope.level === 'org') {
    if (filters.projectId || filters.managerId || filters.customer || filters.status || filters.teamId) parts.push(projectMatch);
  } else {
    const user = mark(params, scope.userId);
    const team = scope.level === 'lead' ? ` OR e.team_id = ANY(${mark(params, scope.teamIds)}::uuid[])` : '';
    parts.push(`(${projectMatch} OR e.raised_by = ${user}::uuid OR e.assigned_to = ${user}::uuid${team})`);
  }
  return parts.join(' AND ');
}

async function rows(sql, params) {
  const result = await query(sql, params);
  return result.rows;
}

function scopedWhere(scope) {
  const params = [];
  return { params, where: projectWhere(scope, {}, params) };
}

async function options(scope) {
  const teamParams = [];
  const teamLimit = scope.level === 'org'
    ? 'TRUE'
    : scope.level === 'lead'
      ? `id = ANY(${mark(teamParams, scope.teamIds)}::uuid[])`
      : `id IN (SELECT team_id FROM team_members WHERE user_id = ${mark(teamParams, scope.userId)}::uuid AND status = 'ACTIVE')`;
  const projectsScope = scopedWhere(scope);
  const managersScope = scopedWhere(scope);
  const customersScope = scopedWhere(scope);
  const [teams, projects, managers, customers] = await Promise.all([
    rows(`SELECT id, name FROM teams WHERE status <> 'ARCHIVED' AND ${teamLimit} ORDER BY name`, teamParams),
    rows(`SELECT id, title AS name, status FROM projects p WHERE ${projectsScope.where} ORDER BY title LIMIT 200`, projectsScope.params),
    rows(`SELECT DISTINCT u.id, u.full_name AS name FROM projects p JOIN users u ON u.id = p.project_manager_id WHERE ${managersScope.where} ORDER BY u.full_name`, managersScope.params),
    rows(`SELECT DISTINCT customer_name AS name FROM projects p WHERE ${customersScope.where} AND btrim(customer_name) <> '' ORDER BY customer_name LIMIT 100`, customersScope.params),
  ]);
  return { teams, projects, managers, customers };
}

async function projectStats(scope, filters, to, asOf) {
  const params = [to, asOf];
  const where = projectWhere(scope, filters, params);
  const result = await rows(
    `SELECT
      COUNT(*) FILTER (WHERE p.created_at::date <= $1::date)::int AS total,
      COUNT(*) FILTER (WHERE p.status IN ${OPEN_PROJECT})::int AS active,
      COUNT(*) FILTER (WHERE p.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE p.status = 'ON_HOLD')::int AS on_hold,
      COUNT(*) FILTER (WHERE p.status = 'AT_RISK')::int AS delayed,
      COUNT(*) FILTER (WHERE p.status = 'CANCELLED')::int AS cancelled,
      COUNT(*) FILTER (WHERE p.status = 'NOT_STARTED')::int AS not_started,
      COUNT(*) FILTER (WHERE p.status = 'PLANNING')::int AS planning,
      COUNT(*) FILTER (WHERE p.status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE p.status NOT IN ('COMPLETED','CANCELLED') AND p.target_date IS NOT NULL AND p.target_date < $2::date)::int AS overdue
     FROM projects p
     WHERE ${where} AND p.created_at::date <= $1::date`,
    params,
  );
  return result[0];
}

async function projectProgress(scope, filters, to, asOf) {
  const params = [to, asOf];
  const where = projectWhere(scope, filters, params);
  return rows(
    `SELECT p.id, p.title, p.customer_name, p.status, p.target_date, u.full_name AS manager,
      COUNT(t.id)::int AS tasks,
      COUNT(t.id) FILTER (WHERE t.status NOT IN ('COMPLETED','CANCELLED') AND t.end_date < $2::date)::int AS overdue_tasks,
      COALESCE(ROUND(AVG(t.progress)), 0)::int AS progress
     FROM projects p
     LEFT JOIN users u ON u.id = p.project_manager_id
     LEFT JOIN project_tasks t ON t.project_id = p.id
     WHERE ${where} AND p.created_at::date <= $1::date AND p.status IN ${OPEN_PROJECT}
     GROUP BY p.id, p.title, p.customer_name, p.status, p.target_date, u.full_name
     ORDER BY overdue_tasks DESC, p.target_date NULLS LAST
     LIMIT 8`,
    params,
  );
}

async function taskStats(scope, filters, from, to, asOf) {
  const params = [from, to, asOf];
  const where = projectWhere(scope, filters, params);
  const result = await rows(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED')::int AS completed,
      COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE t.status = 'NOT_STARTED')::int AS pending,
      COUNT(*) FILTER (WHERE t.status IN ${OPEN_TASK} AND t.end_date < $3::date)::int AS overdue,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED' AND t.updated_at::date BETWEEN $1::date AND $2::date AND t.updated_at::date <= t.end_date)::int AS on_time,
      COUNT(*) FILTER (WHERE t.status = 'COMPLETED' AND t.updated_at::date BETWEEN $1::date AND $2::date)::int AS completed_in_range,
      COALESCE(ROUND(AVG((t.updated_at::date - t.start_date)) FILTER (WHERE t.status = 'COMPLETED' AND t.updated_at::date BETWEEN $1::date AND $2::date)), 0)::int AS avg_days
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE ${where} AND t.start_date <= $2::date AND t.end_date >= $1::date`,
    params,
  );
  return result[0];
}

async function taskEvents(scope, filters, from, to) {
  const params = [from, to];
  const where = projectWhere(scope, filters, params);
  return rows(
    `SELECT t.created_at::date AS created_on, t.updated_at::date AS updated_on, t.status
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE ${where}
       AND (t.created_at::date BETWEEN $1::date AND $2::date
         OR (t.status = 'COMPLETED' AND t.updated_at::date BETWEEN $1::date AND $2::date))`,
    params,
  );
}

async function overdueWork(scope, filters, asOf) {
  const taskParams = [asOf];
  const taskWhere = projectWhere(scope, filters, taskParams);
  const projectParams = [asOf];
  const projectFilter = projectWhere(scope, filters, projectParams);
  const escParams = [asOf];
  const escWhere = escalationWhere(scope, filters, escParams);
  const [tasks, projects, escalations] = await Promise.all([
    rows(
      `SELECT t.id, t.title, p.title AS project, u.full_name AS owner, tm.name AS team, t.end_date AS due, t.priority,
        ($1::date - t.end_date)::int AS days
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN teams tm ON tm.code = t.team_code
       WHERE ${taskWhere} AND t.status IN ${OPEN_TASK} AND t.end_date < $1::date
       ORDER BY t.end_date LIMIT 8`,
      taskParams,
    ),
    rows(
      `SELECT p.id, p.title, p.customer_name AS project, u.full_name AS owner, p.target_date AS due, p.priority,
        ($1::date - p.target_date)::int AS days
       FROM projects p
       LEFT JOIN users u ON u.id = p.project_manager_id
       WHERE ${projectFilter} AND p.status NOT IN ('COMPLETED','CANCELLED') AND p.target_date IS NOT NULL AND p.target_date < $1::date
       ORDER BY p.target_date LIMIT 8`,
      projectParams,
    ),
    rows(
      `SELECT e.id, e.title, COALESCE(p.title, e.customer_name) AS project, u.full_name AS owner, tm.name AS team, e.due_date AS due, e.priority,
        ($1::date - e.due_date)::int AS days
       FROM escalations e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users u ON u.id = e.assigned_to
       LEFT JOIN teams tm ON tm.id = e.team_id
       WHERE ${escWhere} AND e.status IN ${OPEN_ESCALATION} AND e.due_date IS NOT NULL AND e.due_date < $1::date
       ORDER BY e.due_date LIMIT 8`,
      escParams,
    ),
  ]);
  return { tasks, projects, escalations };
}

async function teamRows(scope, filters) {
  const params = [];
  const where = projectWhere(scope, filters, params);
  const teamLimit = scope.level === 'org'
    ? 't.status <> \'ARCHIVED\''
    : scope.level === 'lead'
      ? `t.id = ANY(${mark(params, scope.teamIds)}::uuid[])`
      : `t.id IN (SELECT team_id FROM team_members WHERE user_id = ${mark(params, scope.userId)}::uuid AND status = 'ACTIVE')`;
  return rows(
    `SELECT t.id, t.name,
      (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = 'ACTIVE')::int AS members,
      (SELECT COUNT(DISTINCT pt.project_id) FROM project_teams pt JOIN projects p ON p.id = pt.project_id
        WHERE pt.team_id = t.id AND p.status IN ${OPEN_PROJECT} AND ${where})::int AS active_projects,
      (SELECT COUNT(*) FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
        WHERE tk.team_code = t.code AND tk.status <> 'CANCELLED' AND ${where})::int AS assigned,
      (SELECT COUNT(*) FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
        WHERE tk.team_code = t.code AND tk.status = 'COMPLETED' AND ${where})::int AS completed,
      (SELECT COUNT(*) FROM project_tasks tk JOIN projects p ON p.id = tk.project_id
        WHERE tk.team_code = t.code AND tk.status IN ${OPEN_TASK} AND tk.end_date < CURRENT_DATE AND ${where})::int AS overdue
     FROM teams t
     WHERE ${teamLimit}
     ORDER BY t.name`,
    params,
  );
}

function dailyQuery(scope, filters, from, to) {
  const params = [from, to];
  const people = peopleSql(scope, params);
  const project = filters.projectId ? ` AND project_id = ${mark(params, filters.projectId)}::uuid` : '';
  return { params, people, project };
}

async function dailyStats(scope, filters, from, to) {
  const countParams = [];
  const count = { params: countParams, people: peopleSql(scope, countParams) };
  const submittedQuery = dailyQuery(scope, filters, from, to);
  const pendingQuery = dailyQuery(scope, filters, from, to);
  const contributorsQuery = dailyQuery(scope, filters, from, to);
  const gapsQuery = dailyQuery(scope, filters, from, to);
  const [peopleRow, submitted, pending, contributors, teamGaps] = await Promise.all([
    rows(`SELECT COUNT(*)::int AS people FROM (${count.people}) people`, count.params),
    rows(
      `SELECT COUNT(DISTINCT (employee_id, update_date))::int AS days
       FROM daily_work_updates
       WHERE employee_id IN (${submittedQuery.people}) AND update_date BETWEEN $1::date AND $2::date${submittedQuery.project}`,
      submittedQuery.params,
    ),
    rows(
      `SELECT u.full_name AS name
       FROM users u
       WHERE u.id IN (${pendingQuery.people})
         AND EXISTS (SELECT 1 FROM daily_work_items i WHERE i.employee_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM daily_work_updates d
           WHERE d.employee_id = u.id AND d.update_date BETWEEN $1::date AND $2::date
         )
       ORDER BY u.full_name LIMIT 6`,
      pendingQuery.params,
    ),
    rows(
      `SELECT u.full_name AS name, COUNT(*)::int AS updates
       FROM daily_work_updates d
       JOIN users u ON u.id = d.employee_id
       WHERE d.employee_id IN (${contributorsQuery.people}) AND d.update_date BETWEEN $1::date AND $2::date${contributorsQuery.project.replace('project_id', 'd.project_id')}
       GROUP BY u.full_name
       ORDER BY updates DESC LIMIT 5`,
      contributorsQuery.params,
    ),
    rows(
      `SELECT t.name, COUNT(DISTINCT m.user_id)::int AS missing
       FROM teams t
       JOIN team_members m ON m.team_id = t.id AND m.status = 'ACTIVE'
       WHERE m.user_id IN (${gapsQuery.people})
         AND EXISTS (SELECT 1 FROM daily_work_items i WHERE i.employee_id = m.user_id)
         AND NOT EXISTS (
           SELECT 1 FROM daily_work_updates d
           WHERE d.employee_id = m.user_id AND d.update_date BETWEEN $1::date AND $2::date
         )
       GROUP BY t.name
       ORDER BY missing DESC LIMIT 5`,
      gapsQuery.params,
    ),
  ]);
  return {
    people: peopleRow[0]?.people || 0,
    submitted: submitted[0]?.days || 0,
    pending: pending.map((row) => row.name),
    contributors,
    teamGaps,
  };
}

function timeQuery(scope, from, to) {
  const params = [from, to];
  return { params, people: peopleSql(scope, params) };
}

async function timeStats(scope, from, to) {
  const totalsQuery = timeQuery(scope, from, to);
  const daysQuery = timeQuery(scope, from, to);
  const capacityParams = [];
  const capacityQuery = { params: capacityParams, people: peopleSql(scope, capacityParams) };
  const attendanceQuery = timeQuery(scope, from, to);
  const [totals, days, capacity, attendance] = await Promise.all([
    rows(
      `SELECT COALESCE(SUM(hours), 0)::float AS total,
        COALESCE(SUM(hours) FILTER (WHERE billable), 0)::float AS billable,
        COALESCE(SUM(hours) FILTER (WHERE NOT billable), 0)::float AS non_billable,
        COUNT(DISTINCT user_id)::int AS people
       FROM project_time_entries
       WHERE work_date BETWEEN $1::date AND $2::date AND user_id IN (${totalsQuery.people})`,
      totalsQuery.params,
    ),
    rows(
      `SELECT work_date, COALESCE(SUM(hours), 0)::float AS hours
       FROM project_time_entries
       WHERE work_date BETWEEN $1::date AND $2::date AND user_id IN (${daysQuery.people})
       GROUP BY work_date ORDER BY work_date`,
      daysQuery.params,
    ),
    rows(`SELECT COALESCE(SUM(weekly_capacity_hours), 0)::float AS weekly FROM users WHERE id IN (${capacityQuery.people})`, capacityQuery.params),
    rows(
      `SELECT COALESCE(SUM(total_worked_minutes), 0)::float AS minutes
       FROM attendance_sessions
       WHERE work_date BETWEEN $1::date AND $2::date AND user_id IN (${attendanceQuery.people})`,
      attendanceQuery.params,
    ),
  ]);
  return { ...(totals[0] || {}), days, weekly: capacity[0]?.weekly || 0, attendanceMinutes: attendance[0]?.minutes || 0 };
}

async function leadStats(scope, from, to) {
  const params = [from, to];
  const where = leadWhere(scope, params);
  const result = await rows(
    `SELECT
      COUNT(*) FILTER (WHERE l.created_at::date BETWEEN $1::date AND $2::date)::int AS created,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE l.status = 'DRAFT')::int AS draft,
      COUNT(*) FILTER (WHERE l.status = 'SUBMITTED_TO_PM')::int AS submitted,
      COUNT(*) FILTER (WHERE l.status = 'CHANGES_REQUESTED')::int AS changes,
      COUNT(*) FILTER (WHERE l.status = 'PM_APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE l.status = 'ON_HOLD')::int AS on_hold,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM feasibility_studies f WHERE f.lead_id = l.id))::int AS feasibility,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM solution_costings c WHERE c.lead_id = l.id))::int AS costing,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = l.id))::int AS won
     FROM leads l
     WHERE ${where}`,
    params,
  );
  return result[0];
}

async function feasibilityStats(scope, filters) {
  const summaryParams = [];
  const summaryWhere = leadWhere(scope, summaryParams);
  const teamParams = [];
  const teamWhere = leadWhere(scope, teamParams);
  const teamFilter = filters.teamId
    ? ` AND a.team_code = (SELECT code FROM teams WHERE id = ${mark(teamParams, filters.teamId)}::uuid)`
    : '';
  const averageParams = [];
  const averageWhere = leadWhere(scope, averageParams);
  const [summary, teams, average] = await Promise.all([
    rows(
      `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE f.status = 'IN_PROGRESS')::int AS in_progress,
        COUNT(*) FILTER (WHERE f.status = 'FEASIBLE')::int AS feasible,
        COUNT(*) FILTER (WHERE f.status = 'FEASIBLE_WITH_CONDITIONS')::int AS conditional,
        COUNT(*) FILTER (WHERE f.status = 'NOT_FEASIBLE')::int AS not_feasible,
        COUNT(*) FILTER (WHERE f.status = 'PENDING_TEAM_INPUT')::int AS pending_input
       FROM feasibility_studies f
       JOIN leads l ON l.id = f.lead_id
       WHERE ${summaryWhere}`,
      summaryParams,
    ),
    rows(
      `SELECT a.team_code AS code, COUNT(*)::int AS studies,
        COUNT(*) FILTER (WHERE a.status = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE a.status = 'BLOCKED')::int AS blocked
       FROM feasibility_team_assignments a
       JOIN feasibility_studies f ON f.id = a.feasibility_id
       JOIN leads l ON l.id = f.lead_id
       WHERE ${teamWhere}${teamFilter}
       GROUP BY a.team_code ORDER BY a.team_code`,
      teamParams,
    ),
    rows(
      `SELECT COALESCE(ROUND(AVG((f.reviewed_at::date - f.started_at::date))), 0)::int AS days
       FROM feasibility_studies f
       JOIN leads l ON l.id = f.lead_id
       WHERE ${averageWhere} AND f.started_at IS NOT NULL AND f.reviewed_at IS NOT NULL`,
      averageParams,
    ),
  ]);
  return { ...(summary[0] || {}), teams, averageDays: average[0]?.days || 0 };
}

async function costingStats(scope, commercial) {
  const params = [];
  const where = leadWhere(scope, params);
  const money = commercial
    ? `COALESCE(SUM((v.totals->>'totalInternal')::numeric) FILTER (WHERE v.status = 'APPROVED'), 0)::float AS internal,
       COALESCE(SUM((v.totals->>'selling')::numeric) FILTER (WHERE v.status = 'APPROVED'), 0)::float AS selling,
       COALESCE(ROUND(AVG((v.totals->>'marginPercent')::numeric) FILTER (WHERE v.status = 'APPROVED')), 0)::float AS margin,`
    : '';
  const result = await rows(
    `SELECT ${money}
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE v.status IN ('DRAFT','IN_PROGRESS'))::int AS draft,
      COUNT(*) FILTER (WHERE v.status IN ('INTERNAL_REVIEW','SUBMITTED_FOR_APPROVAL','CHANGES_REQUESTED'))::int AS review,
      COUNT(*) FILTER (WHERE v.status = 'APPROVED')::int AS approved,
      COUNT(*) FILTER (WHERE v.status = 'REJECTED')::int AS rejected,
      COUNT(*) FILTER (WHERE v.status = 'SUPERSEDED')::int AS superseded
     FROM solution_costing_versions v
     JOIN solution_costings c ON c.id = v.costing_id
     JOIN leads l ON l.id = c.lead_id
     WHERE v.is_current AND ${where}`,
    params,
  );
  return result[0] || {};
}

async function procurementStats(scope, filters, asOf) {
  const params = [asOf];
  const parts = ['TRUE'];
  if (scope.level === 'member') parts.push(`r.requested_by = ${mark(params, scope.userId)}::uuid`);
  if (scope.level === 'lead') parts.push(`(r.team_id = ANY(${mark(params, scope.teamIds)}::uuid[]) OR r.requested_by = ${mark(params, scope.userId)}::uuid OR r.project_id IN (SELECT p.id FROM projects p WHERE ${projectWhere(scope, filters, params)}))`);
  if (scope.level === 'org' && (filters.projectId || filters.teamId || filters.managerId || filters.customer || filters.status)) {
    parts.push(`(r.project_id IN (SELECT p.id FROM projects p WHERE ${projectWhere(scope, filters, params)}) OR r.project_id IS NULL)`);
  }
  if (filters.projectId && scope.level !== 'org') parts.push(`r.project_id = ${mark(params, filters.projectId)}::uuid`);
  const where = parts.join(' AND ');
  const [summary, delayed, lead] = await Promise.all([
    rows(
      `SELECT
        COUNT(*) FILTER (WHERE r.status NOT IN ('RECEIVED','CANCELLED','REJECTED'))::int AS open,
        COUNT(*) FILTER (WHERE r.status IN ('SUBMITTED','UNDER_REVIEW'))::int AS pending,
        COUNT(*) FILTER (WHERE r.status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE r.status = 'ORDERED')::int AS ordered,
        COUNT(*) FILTER (WHERE r.status = 'RECEIVED')::int AS received,
        COUNT(*) FILTER (WHERE r.status NOT IN ('RECEIVED','CANCELLED','REJECTED') AND r.needed_by IS NOT NULL AND r.needed_by < $1::date)::int AS delayed
       FROM procurement_requests r WHERE ${where}`,
      params,
    ),
    rows(
      `SELECT r.id, r.title, r.vendor_name, r.needed_by, ($1::date - r.needed_by)::int AS days, p.title AS project
       FROM procurement_requests r
       LEFT JOIN projects p ON p.id = r.project_id
       WHERE ${where} AND r.status NOT IN ('RECEIVED','CANCELLED','REJECTED') AND r.needed_by IS NOT NULL AND r.needed_by < $1::date
       ORDER BY r.needed_by LIMIT 5`,
      params,
    ),
    rows(
      `SELECT COALESCE(ROUND(AVG((r.updated_at::date - r.created_at::date))), 0)::int AS days
       FROM procurement_requests r
       WHERE ${where} AND r.status = 'RECEIVED' AND $1::date IS NOT NULL`,
      params,
    ),
  ]);
  return { ...(summary[0] || {}), delayed, leadDays: lead[0]?.days || 0 };
}

async function escalationStats(scope, filters, from, to, asOf) {
  const params = [from, to, asOf];
  const where = escalationWhere(scope, filters, params);
  const [summary, byTeam, byType, events] = await Promise.all([
    rows(
      `SELECT
        COUNT(*) FILTER (WHERE e.status IN ${OPEN_ESCALATION})::int AS open,
        COUNT(*) FILTER (WHERE e.status IN ${OPEN_ESCALATION} AND e.priority = 'CRITICAL')::int AS critical,
        COUNT(*) FILTER (WHERE e.status IN ${OPEN_ESCALATION} AND e.due_date IS NOT NULL AND e.due_date < $3::date)::int AS overdue,
        COUNT(*) FILTER (WHERE e.status = 'UNDER_REVIEW')::int AS under_review,
        COUNT(*) FILTER (WHERE e.status IN ('RESOLVED','CLOSED') AND COALESCE(e.resolved_at, e.closed_at, e.updated_at)::date BETWEEN $1::date AND $2::date)::int AS resolved
       FROM escalations e WHERE ${where}`,
      params,
    ),
    rows(
      `SELECT COALESCE(t.name, 'Unassigned') AS name, COUNT(*)::int AS total
       FROM escalations e LEFT JOIN teams t ON t.id = e.team_id
       WHERE ${where} AND e.status IN ${OPEN_ESCALATION} AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL
       GROUP BY t.name ORDER BY total DESC LIMIT 6`,
      params,
    ),
    rows(
      `SELECT e.type, COUNT(*)::int AS total
       FROM escalations e WHERE ${where} AND e.status IN ${OPEN_ESCALATION} AND $1::date IS NOT NULL AND $2::date IS NOT NULL AND $3::date IS NOT NULL
       GROUP BY e.type ORDER BY total DESC LIMIT 6`,
      params,
    ),
    rows(
      `SELECT e.created_at::date AS created_on, COALESCE(e.resolved_at, e.closed_at)::date AS resolved_on, e.status
       FROM escalations e
       WHERE ${where}
         AND $3::date IS NOT NULL
         AND (e.created_at::date BETWEEN $1::date AND $2::date
           OR COALESCE(e.resolved_at, e.closed_at)::date BETWEEN $1::date AND $2::date)`,
      params,
    ),
  ]);
  return { ...(summary[0] || {}), byTeam, byType, events };
}

function attentionQuery(scope, filters, asOf, kind) {
  const params = [asOf];
  if (kind === 'project') return { params, where: projectWhere(scope, filters, params) };
  if (kind === 'escalation') return { params, where: escalationWhere(scope, filters, params) };
  if (kind === 'lead') return { params, where: leadWhere(scope, params) };
  if (kind === 'procurement') return { params, where: projectWhere(scope, filters, params) };
  return { params, people: peopleSql(scope, params) };
}

async function attention(scope, filters, asOf) {
  const criticalQuery = attentionQuery(scope, filters, asOf, 'escalation');
  const taskQuery = attentionQuery(scope, filters, asOf, 'project');
  const deadlineQuery = attentionQuery(scope, filters, asOf, 'project');
  const blockedQuery = attentionQuery(scope, filters, asOf, 'lead');
  const approvalQuery = attentionQuery(scope, filters, asOf, 'lead');
  const procurementQuery = attentionQuery(scope, filters, asOf, 'procurement');
  const waitingQuery = attentionQuery(scope, filters, asOf, 'people');
  const [critical, tasks, deadlines, blocked, approvals, procurement, waiting] = await Promise.all([
    rows(
      `SELECT e.id, e.title, COALESCE(p.title, '') AS project, u.full_name AS owner, e.due_date
       FROM escalations e
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN users u ON u.id = COALESCE(e.assigned_to, e.raised_by)
       WHERE ${criticalQuery.where} AND e.status IN ${OPEN_ESCALATION} AND e.priority = 'CRITICAL' AND $1::date IS NOT NULL
       ORDER BY e.due_date NULLS LAST LIMIT 5`,
      criticalQuery.params,
    ),
    rows(
      `SELECT t.id, t.title, p.title AS project, u.full_name AS owner, t.end_date AS due
       FROM project_tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE ${taskQuery.where} AND t.status IN ${OPEN_TASK} AND t.end_date < $1::date
       ORDER BY t.end_date LIMIT 5`,
      taskQuery.params,
    ),
    rows(
      `SELECT p.id, p.title, u.full_name AS owner, p.target_date AS due
       FROM projects p LEFT JOIN users u ON u.id = p.project_manager_id
       WHERE ${deadlineQuery.where} AND p.status IN ${OPEN_PROJECT} AND p.target_date BETWEEN $1::date AND ($1::date + 7)
       ORDER BY p.target_date LIMIT 5`,
      deadlineQuery.params,
    ),
    rows(
      `SELECT f.id, l.title, a.team_code, a.due_date
       FROM feasibility_team_assignments a
       JOIN feasibility_studies f ON f.id = a.feasibility_id
       JOIN leads l ON l.id = f.lead_id
       WHERE a.status = 'BLOCKED' AND ${blockedQuery.where} AND $1::date IS NOT NULL
       LIMIT 4`,
      blockedQuery.params,
    ),
    rows(
      `SELECT c.id, l.title, v.status
       FROM solution_costing_versions v
       JOIN solution_costings c ON c.id = v.costing_id
       JOIN leads l ON l.id = c.lead_id
       WHERE v.is_current AND v.status = 'SUBMITTED_FOR_APPROVAL' AND ${approvalQuery.where} AND $1::date IS NOT NULL
       LIMIT 4`,
      approvalQuery.params,
    ),
    rows(
      `SELECT r.id, r.title, p.title AS project, r.needed_by
       FROM procurement_requests r LEFT JOIN projects p ON p.id = r.project_id
       WHERE r.status NOT IN ('RECEIVED','CANCELLED','REJECTED') AND r.needed_by IS NOT NULL AND r.needed_by < $1::date
         AND (r.project_id IN (SELECT p.id FROM projects p WHERE ${procurementQuery.where}) OR r.requested_by = ${mark(procurementQuery.params, scope.userId)}::uuid)
       ORDER BY r.needed_by LIMIT 4`,
      procurementQuery.params,
    ),
    rows(
      `SELECT d.id, d.description, p.title AS project, u.full_name AS owner, d.task_deadline AS due
       FROM daily_work_updates d
       LEFT JOIN projects p ON p.id = d.project_id
       LEFT JOIN users u ON u.id = d.employee_id
       WHERE d.status = 'WAITING_CUSTOMER' AND d.employee_id IN (${waitingQuery.people}) AND $1::date IS NOT NULL
       ORDER BY d.update_date DESC LIMIT 4`,
      waitingQuery.params,
    ),
  ]);
  return { critical, tasks, deadlines, blocked, approvals, procurement, waiting };
}

async function activity(scope, filters, from, to) {
  const params = [from, to];
  const projects = projectWhere(scope, filters, params);
  const people = peopleSql(scope, params);
  const leads = leadWhere(scope, params);
  return rows(
    `SELECT * FROM (
      SELECT u.full_name AS actor, a.action, p.title AS record, a.created_at, '/projects/' || p.id AS href
      FROM project_activity a
      JOIN projects p ON p.id = a.project_id
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.created_at::date BETWEEN $1::date AND $2::date AND ${projects}
      UNION ALL
      SELECT u.full_name, a.action, e.title, a.created_at, '/escalations/' || e.id
      FROM escalation_activity a
      JOIN escalations e ON e.id = a.escalation_id
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.created_at::date BETWEEN $1::date AND $2::date
        AND (e.project_id IN (SELECT p.id FROM projects p WHERE ${projects}) OR e.raised_by IN (${people}) OR e.assigned_to IN (${people}))
      UNION ALL
      SELECT u.full_name, a.action, l.title, a.created_at, '/lead-pipeline/' || l.id
      FROM lead_activity a
      JOIN leads l ON l.id = a.lead_id
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.created_at::date BETWEEN $1::date AND $2::date AND ${leads}
      UNION ALL
      SELECT u.full_name, a.action, t.name, a.created_at, '/teams/' || t.id
      FROM team_activity a
      JOIN teams t ON t.id = a.team_id
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.created_at::date BETWEEN $1::date AND $2::date AND a.actor_id IN (${people})
    ) events
    ORDER BY created_at DESC
    LIMIT 12`,
    params,
  );
}

module.exports = {
  options, projectStats, projectProgress, taskStats, taskEvents, overdueWork, teamRows,
  dailyStats, timeStats, leadStats, feasibilityStats, costingStats, procurementStats,
  escalationStats, attention, activity,
};
