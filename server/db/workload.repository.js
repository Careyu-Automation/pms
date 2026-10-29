const { query } = require('./index');

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return '';
}

function num(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function people(whereSql, params) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.designation, u.department, u.is_active,
        u.weekly_capacity_hours, u.employee_code, u.work_location, u.created_at,
        r.code AS role_code, r.name AS role_name,
        tm.team_id, tm.team_name, tm.member_role, tm.joined_at, tm.manager_name, tm.is_lead
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN LATERAL (
       SELECT t.id AS team_id, t.name AS team_name, m.role AS member_role, m.joined_at,
         lead.full_name AS manager_name,
         (t.lead_id = u.id OR m.role = 'TEAM_LEAD') AS is_lead
       FROM team_members m
       JOIN teams t ON t.id = m.team_id AND t.status = 'ACTIVE'
       LEFT JOIN users lead ON lead.id = t.lead_id
       WHERE m.user_id = u.id AND m.status = 'ACTIVE'
       ORDER BY CASE WHEN m.role = 'TEAM_LEAD' OR t.lead_id = u.id THEN 0 ELSE 1 END, t.name
       LIMIT 1
     ) tm ON TRUE
     ${whereSql}
     ORDER BY u.full_name`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    designation: row.designation || '',
    department: row.department || '',
    isActive: row.is_active,
    weeklyCapacity: num(row.weekly_capacity_hours) || 40,
    employeeCode: row.employee_code || '',
    workLocation: row.work_location || '',
    createdAt: row.created_at,
    roleCode: row.role_code,
    roleName: row.role_name,
    teamId: row.team_id,
    teamName: row.team_name || '',
    memberRole: row.member_role || '',
    joinedAt: isoDate(row.joined_at) || isoDate(row.created_at),
    managerName: row.manager_name || '',
    isLead: Boolean(row.is_lead),
  }));
}

async function leadTeams(userIds) {
  if (!userIds.length) return [];
  const result = await query(
    `SELECT t.id, t.name, t.lead_id, t.department,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id AND m.status = 'ACTIVE') AS members
     FROM teams t
     WHERE t.status = 'ACTIVE' AND (
       t.lead_id = ANY($1::uuid[])
       OR t.id IN (
         SELECT team_id FROM team_members
         WHERE user_id = ANY($1::uuid[]) AND role = 'TEAM_LEAD' AND status = 'ACTIVE'
       )
     )
     ORDER BY t.name`,
    [userIds],
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    leadId: row.lead_id,
    department: row.department || '',
    members: Number(row.members) || 0,
  }));
}

async function memberTeamIds(userId) {
  const result = await query(
    `SELECT team_id FROM team_members WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  return result.rows.map((row) => row.team_id);
}

async function teamMemberIds(teamIds) {
  if (!teamIds.length) return [];
  const result = await query(
    `SELECT team_id, user_id FROM team_members
     WHERE status = 'ACTIVE' AND team_id = ANY($1::uuid[])`,
    [teamIds],
  );
  return result.rows.map((row) => ({ teamId: row.team_id, userId: row.user_id }));
}

async function tasks(userIds, start, end, projectId) {
  if (!userIds.length) return [];
  const params = [userIds, start, end];
  let projectSql = '';
  if (projectId) {
    params.push(projectId);
    projectSql = `AND t.project_id = $${params.length}`;
  }
  const result = await query(
    `SELECT t.id, t.assignee_id, t.title, t.status, t.priority, t.start_date, t.end_date,
        t.estimated_hours, t.progress, t.project_id, t.product_id, t.updated_at, t.task_code,
        COALESCE(p.title, pr.name, '') AS project_title
     FROM project_tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN products pr ON pr.id = t.product_id
     WHERE t.assignee_id = ANY($1::uuid[])
       AND t.status <> 'CANCELLED'
       AND (
         (t.start_date <= $3 AND t.end_date >= $2)
         OR (t.status <> 'COMPLETED' AND t.end_date < CURRENT_DATE)
       )
       ${projectSql}`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    assigneeId: row.assignee_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    estimatedHours: row.estimated_hours == null ? null : num(row.estimated_hours),
    progress: Number(row.progress) || 0,
    projectId: row.project_id,
    productId: row.product_id,
    projectTitle: row.project_title || '',
    taskCode: row.task_code,
    updatedAt: row.updated_at,
  }));
}

async function loggedHours(userIds, start, end, projectId) {
  if (!userIds.length) return [];
  const params = [userIds, start, end];
  let projectSql = '';
  if (projectId) {
    params.push(projectId);
    projectSql = `AND project_id = $${params.length}`;
  }
  const result = await query(
    `SELECT user_id, COALESCE(SUM(hours), 0) AS hours
     FROM project_time_entries
     WHERE user_id = ANY($1::uuid[]) AND work_date BETWEEN $2 AND $3
       ${projectSql}
     GROUP BY user_id`,
    params,
  );
  return result.rows.map((row) => ({ userId: row.user_id, hours: num(row.hours) }));
}

async function dailyHours(userId, start, end) {
  const result = await query(
    `SELECT work_date, COALESCE(SUM(hours), 0) AS hours
     FROM project_time_entries
     WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
     GROUP BY work_date
     ORDER BY work_date`,
    [userId, start, end],
  );
  return result.rows.map((row) => ({ date: isoDate(row.work_date), hours: num(row.hours) }));
}

async function approvedLeave(userIds, start, end) {
  if (!userIds.length) return [];
  const result = await query(
    `SELECT user_id, start_date, end_date, duration_days, duration_type
     FROM leave_requests
     WHERE user_id = ANY($1::uuid[]) AND status = 'APPROVED'
       AND start_date <= $3 AND end_date >= $2`,
    [userIds, start, end],
  );
  return result.rows.map((row) => ({
    userId: row.user_id,
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    durationDays: num(row.duration_days),
    durationType: row.duration_type,
  }));
}

async function completedTasks(userId, start, end) {
  const result = await query(
    `SELECT t.id, t.title, t.estimated_hours, t.end_date, t.updated_at, t.status,
        COALESCE((SELECT SUM(e.hours) FROM project_time_entries e WHERE e.task_id = t.id), 0) AS actual_hours
     FROM project_tasks t
     WHERE t.assignee_id = $1 AND t.status = 'COMPLETED'
       AND t.updated_at::date BETWEEN $2::date AND $3::date
     ORDER BY t.updated_at DESC`,
    [userId, start, end],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    estimatedHours: row.estimated_hours == null ? null : num(row.estimated_hours),
    actualHours: num(row.actual_hours),
    endDate: isoDate(row.end_date),
    updatedAt: row.updated_at,
  }));
}

async function dueInPeriod(userId, start, end) {
  const result = await query(
    `SELECT COUNT(*) AS total
     FROM project_tasks
     WHERE assignee_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')
       AND end_date BETWEEN $2 AND $3`,
    [userId, start, end],
  );
  return Number(result.rows[0].total) || 0;
}

async function timeEntries(userId, start, end) {
  const result = await query(
    `SELECT e.id, e.work_date, e.start_at, e.end_at, e.hours, e.duration_minutes, e.note,
        COALESCE(p.title, '') AS project_title, COALESCE(t.title, '') AS task_title, e.task_id
     FROM project_time_entries e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN project_tasks t ON t.id = e.task_id
     WHERE e.user_id = $1 AND e.work_date BETWEEN $2 AND $3
     ORDER BY e.work_date, e.start_at NULLS LAST`,
    [userId, start, end],
  );
  return result.rows.map((row) => ({
    id: row.id,
    date: isoDate(row.work_date),
    startAt: row.start_at,
    endAt: row.end_at,
    hours: num(row.hours),
    durationMinutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    description: row.note || '',
    projectTitle: row.project_title,
    taskTitle: row.task_title,
    taskId: row.task_id,
  }));
}

async function attendance(userId, start, end) {
  const result = await query(
    `SELECT a.work_date, a.check_in, a.check_out, a.total_worked_minutes,
        COALESCE((
          SELECT SUM(b.duration_minutes) FILTER (WHERE b.end_time IS NOT NULL)
          FROM break_entries b WHERE b.attendance_session_id = a.id
        ), 0) AS break_minutes
     FROM attendance_sessions a
     WHERE a.user_id = $1 AND a.work_date BETWEEN $2 AND $3
     ORDER BY a.work_date`,
    [userId, start, end],
  );
  return result.rows.map((row) => ({
    date: isoDate(row.work_date),
    checkIn: row.check_in,
    checkOut: row.check_out,
    workedMinutes: row.total_worked_minutes == null ? null : Number(row.total_worked_minutes),
    breakMinutes: Number(row.break_minutes) || 0,
  }));
}

async function projectsInScope(userIds) {
  if (!userIds.length) return [];
  const result = await query(
    `SELECT DISTINCT p.id, p.title
     FROM projects p
     JOIN project_tasks t ON t.project_id = p.id
     WHERE t.assignee_id = ANY($1::uuid[]) AND t.status <> 'CANCELLED'
     ORDER BY p.title`,
    [userIds],
  );
  return result.rows.map((row) => ({ id: row.id, title: row.title }));
}

async function managedProjects(userId, teamIds) {
  const result = await query(
    `SELECT COUNT(DISTINCT id) AS total FROM (
       SELECT id FROM projects WHERE project_manager_id = $1
       UNION
       SELECT project_id FROM project_teams WHERE team_id = ANY($2::uuid[])
     ) projects`,
    [userId, teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']],
  );
  return Number(result.rows[0].total) || 0;
}

async function findTasks(ids) {
  if (!ids.length) return [];
  const result = await query(
    `SELECT id, title, assignee_id, project_id, product_id, status, start_date, end_date, estimated_hours
     FROM project_tasks WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    assigneeId: row.assignee_id,
    projectId: row.project_id,
    productId: row.product_id,
    status: row.status,
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    estimatedHours: row.estimated_hours == null ? null : num(row.estimated_hours),
  }));
}

async function reassign(taskId, assigneeId) {
  await query(`UPDATE project_tasks SET assignee_id = $2 WHERE id = $1`, [taskId, assigneeId]);
}

async function userActive(id) {
  const result = await query(
    `SELECT id, full_name, is_active FROM users WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  return row ? { id: row.id, fullName: row.full_name, isActive: row.is_active } : null;
}

module.exports = {
  people,
  leadTeams,
  memberTeamIds,
  teamMemberIds,
  tasks,
  loggedHours,
  dailyHours,
  approvedLeave,
  completedTasks,
  dueInPeriod,
  timeEntries,
  attendance,
  projectsInScope,
  managedProjects,
  findTasks,
  reassign,
  userActive,
};
