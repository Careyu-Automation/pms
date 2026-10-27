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

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    date: isoDate(row.work_date),
    checkIn: row.check_in,
    checkOut: row.check_out,
    totalWorkedMinutes: row.total_worked_minutes,
  };
}

function mapBreak(row) {
  return {
    id: row.id,
    attendanceSessionId: row.attendance_session_id,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
    type: row.break_type,
  };
}

function mapEntry(row) {
  return {
    id: row.id,
    userId: row.user_id,
    employeeName: row.employee_name || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    taskId: row.task_id,
    taskTitle: row.task_title || '',
    date: isoDate(row.work_date),
    startAt: row.start_at,
    endAt: row.end_at,
    durationMinutes: row.duration_minutes == null ? Math.round((Number(row.hours) || 0) * 60) : Number(row.duration_minutes),
    hours: Number(row.hours) || 0,
    description: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ENTRY_FROM = `
  FROM project_time_entries e
  LEFT JOIN users u ON u.id = e.user_id
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN project_tasks t ON t.id = e.task_id
`;

async function findSession(userId, date) {
  const result = await query(
    'SELECT * FROM attendance_sessions WHERE user_id = $1 AND work_date = $2',
    [userId, date],
  );
  return mapSession(result.rows[0]);
}

async function insertSession(userId, date, checkIn) {
  const result = await query(
    `INSERT INTO attendance_sessions (user_id, work_date, check_in)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, date, checkIn],
  );
  return mapSession(result.rows[0]);
}

async function checkoutSession(id, checkOut, worked) {
  const result = await query(
    `UPDATE attendance_sessions
     SET check_out = $2, total_worked_minutes = $3
     WHERE id = $1 RETURNING *`,
    [id, checkOut, worked],
  );
  return mapSession(result.rows[0]);
}

async function listBreaks(sessionId) {
  if (!sessionId) return [];
  const result = await query(
    'SELECT * FROM break_entries WHERE attendance_session_id = $1 ORDER BY start_time',
    [sessionId],
  );
  return result.rows.map(mapBreak);
}

async function breaksForSessions(sessionIds) {
  if (!sessionIds.length) return [];
  const result = await query(
    'SELECT * FROM break_entries WHERE attendance_session_id = ANY($1::uuid[]) ORDER BY start_time',
    [sessionIds],
  );
  return result.rows.map(mapBreak);
}

async function findBreak(id) {
  const result = await query('SELECT * FROM break_entries WHERE id = $1', [id]);
  return result.rows[0] ? mapBreak(result.rows[0]) : null;
}

async function insertBreak(sessionId, startTime, type) {
  const result = await query(
    `INSERT INTO break_entries (attendance_session_id, start_time, break_type)
     VALUES ($1, $2, $3) RETURNING *`,
    [sessionId, startTime, type],
  );
  return mapBreak(result.rows[0]);
}

async function endBreak(id, endTime, minutes) {
  const result = await query(
    `UPDATE break_entries SET end_time = $2, duration_minutes = $3 WHERE id = $1 RETURNING *`,
    [id, endTime, minutes],
  );
  return mapBreak(result.rows[0]);
}

async function findSessionById(id) {
  const result = await query('SELECT * FROM attendance_sessions WHERE id = $1', [id]);
  return mapSession(result.rows[0]);
}

async function sessionsBetween(userId, from, to) {
  const result = await query(
    `SELECT * FROM attendance_sessions
     WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
     ORDER BY work_date`,
    [userId, from, to],
  );
  return result.rows.map(mapSession);
}

async function listEntries(filters) {
  const params = [];
  const where = [];
  if (filters.userId) {
    params.push(filters.userId);
    where.push(`e.user_id = $${params.length}`);
  }
  if (filters.userIds) {
    params.push(filters.userIds);
    where.push(`e.user_id = ANY($${params.length}::uuid[])`);
  }
  if (filters.date) {
    params.push(filters.date);
    where.push(`e.work_date = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`e.work_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`e.work_date <= $${params.length}`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`e.project_id = $${params.length}`);
  }
  if (filters.taskId) {
    params.push(filters.taskId);
    where.push(`e.task_id = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(e.note ILIKE $${params.length} OR COALESCE(p.title, '') ILIKE $${params.length} OR COALESCE(t.title, '') ILIKE $${params.length})`);
  }
  const result = await query(
    `SELECT e.*, u.full_name AS employee_name, p.title AS project_name, t.title AS task_title
     ${ENTRY_FROM}
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY e.work_date DESC, e.start_at NULLS LAST, e.created_at DESC
     LIMIT 500`,
    params,
  );
  return result.rows.map(mapEntry);
}

async function findEntry(id) {
  const result = await query(
    `SELECT e.*, u.full_name AS employee_name, p.title AS project_name, t.title AS task_title
     ${ENTRY_FROM} WHERE e.id = $1`,
    [id],
  );
  return result.rows[0] ? mapEntry(result.rows[0]) : null;
}

async function overlap(userId, startAt, endAt, exceptId) {
  const result = await query(
    `SELECT id FROM project_time_entries
     WHERE user_id = $1
       AND start_at IS NOT NULL AND end_at IS NOT NULL
       AND start_at < $3 AND end_at > $2
       AND id <> COALESCE($4::uuid, '00000000-0000-0000-0000-000000000000')
     LIMIT 1`,
    [userId, startAt, endAt, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function insertEntry(input) {
  const result = await query(
    `INSERT INTO project_time_entries
      (project_id, task_id, user_id, hours, work_date, billable, note, created_by, start_at, end_at, duration_minutes)
     VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      input.projectId, input.taskId, input.userId, input.hours, input.date,
      input.description, input.createdBy, input.startAt, input.endAt, input.durationMinutes,
    ],
  );
  return findEntry(result.rows[0].id);
}

async function updateEntry(id, input) {
  await query(
    `UPDATE project_time_entries
     SET project_id = $2, task_id = $3, hours = $4, work_date = $5, note = $6,
         start_at = $7, end_at = $8, duration_minutes = $9
     WHERE id = $1`,
    [id, input.projectId, input.taskId, input.hours, input.date, input.description, input.startAt, input.endAt, input.durationMinutes],
  );
  return findEntry(id);
}

async function deleteEntry(id) {
  const result = await query('DELETE FROM project_time_entries WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}

async function findTask(id) {
  const result = await query(
    'SELECT id, title, project_id, status, end_date, assignee_id FROM project_tasks WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    status: row.status,
    deadline: isoDate(row.end_date),
    assigneeId: row.assignee_id,
  };
}

async function findProject(id) {
  const result = await query('SELECT id, title FROM projects WHERE id = $1', [id]);
  return result.rows[0] ? { id: result.rows[0].id, title: result.rows[0].title } : null;
}

async function dailyUpdates(userId, date) {
  const result = await query(
    `SELECT u.id, u.description, u.status, i.title
     FROM daily_work_updates u
     JOIN daily_work_items i ON i.id = u.work_item_id
     WHERE u.employee_id = $1 AND u.update_date = $2
     ORDER BY u.created_at`,
    [userId, date],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
  }));
}

async function projectActivity(userId, date) {
  const result = await query(
    `SELECT a.id, a.action, p.title AS project_title
     FROM project_activity a
     LEFT JOIN projects p ON p.id = a.project_id
     WHERE a.actor_id = $1 AND a.created_at::date = $2::date
     ORDER BY a.created_at
     LIMIT 20`,
    [userId, date],
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    projectName: row.project_title || '',
  }));
}

async function assignedSignals(userId, date) {
  const result = await query(
    `SELECT id, title, status, end_date
     FROM project_tasks
     WHERE assignee_id = $1
       AND status NOT IN ('COMPLETED', 'CANCELLED')
       AND (status IN ('BLOCKED', 'ON_HOLD') OR (end_date IS NOT NULL AND end_date < $2::date))
     ORDER BY end_date NULLS LAST
     LIMIT 8`,
    [userId, date],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    deadline: isoDate(row.end_date),
  }));
}

async function completedTasks(userId, date) {
  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM project_tasks
     WHERE assignee_id = $1 AND status = 'COMPLETED' AND updated_at::date = $2::date`,
    [userId, date],
  );
  return result.rows[0].count;
}

async function findReport(userId, date) {
  const result = await query(
    'SELECT * FROM daily_reports WHERE user_id = $1 AND report_date = $2',
    [userId, date],
  );
  return result.rows[0] ? mapReport(result.rows[0]) : null;
}

async function findReportById(id) {
  const result = await query('SELECT * FROM daily_reports WHERE id = $1', [id]);
  return result.rows[0] ? mapReport(result.rows[0]) : null;
}

function mapReport(row) {
  return {
    id: row.id,
    userId: row.user_id,
    date: isoDate(row.report_date),
    whatIDid: row.what_i_did || '',
    whatToImprove: row.what_to_improve || '',
    notes: row.notes || '',
    whatIDidEdited: Boolean(row.what_i_did_edited),
    whatToImproveEdited: Boolean(row.what_to_improve_edited),
    status: row.status,
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by,
  };
}

async function insertReport(input) {
  const result = await query(
    `INSERT INTO daily_reports
      (user_id, report_date, what_i_did, what_to_improve, notes, what_i_did_edited, what_to_improve_edited, status, submitted_at, submitted_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      input.userId, input.date, input.whatIDid, input.whatToImprove, input.notes,
      input.whatIDidEdited, input.whatToImproveEdited, input.status, input.submittedAt, input.submittedBy,
    ],
  );
  return mapReport(result.rows[0]);
}

async function saveReport(id, input) {
  const result = await query(
    `UPDATE daily_reports
     SET what_i_did = $2, what_to_improve = $3, notes = $4,
         what_i_did_edited = $5, what_to_improve_edited = $6,
         status = $7, submitted_at = $8, submitted_by = $9
     WHERE id = $1 RETURNING *`,
    [
      id, input.whatIDid, input.whatToImprove, input.notes,
      input.whatIDidEdited, input.whatToImproveEdited,
      input.status, input.submittedAt, input.submittedBy,
    ],
  );
  return mapReport(result.rows[0]);
}

async function replaceActivities(reportId, items) {
  await query('DELETE FROM daily_report_activity WHERE daily_report_id = $1', [reportId]);
  for (const item of items) {
    await query(
      `INSERT INTO daily_report_activity (daily_report_id, activity_type, reference_id, summary)
       VALUES ($1, $2, $3, $4)`,
      [reportId, item.type, item.referenceId || null, item.summary],
    );
  }
}

async function listReports(filters) {
  const params = [];
  const where = [];
  if (filters.userId) {
    params.push(filters.userId);
    where.push(`r.user_id = $${params.length}`);
  }
  if (filters.userIds) {
    params.push(filters.userIds);
    where.push(`r.user_id = ANY($${params.length}::uuid[])`);
  }
  if (filters.from) {
    params.push(filters.from);
    where.push(`r.report_date >= $${params.length}`);
  }
  if (filters.to) {
    params.push(filters.to);
    where.push(`r.report_date <= $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`r.status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(r.what_i_did ILIKE $${params.length} OR r.notes ILIKE $${params.length} OR u.full_name ILIKE $${params.length})`);
  }
  const result = await query(
    `SELECT r.*, u.full_name AS employee_name,
      (SELECT t.name FROM team_members m JOIN teams t ON t.id = m.team_id
        WHERE m.user_id = r.user_id AND m.status = 'ACTIVE' ORDER BY t.name LIMIT 1) AS team_name,
      COALESCE((
        SELECT SUM(COALESCE(e.duration_minutes, ROUND(e.hours * 60)))
        FROM project_time_entries e
        WHERE e.user_id = r.user_id AND e.work_date = r.report_date
      ), 0)::int AS logged_minutes,
      COALESCE((
        SELECT COUNT(DISTINCT e.project_id)
        FROM project_time_entries e
        WHERE e.user_id = r.user_id AND e.work_date = r.report_date AND e.project_id IS NOT NULL
      ), 0)::int AS project_count,
      COALESCE((
        SELECT COUNT(*) FROM project_tasks t
        WHERE t.assignee_id = r.user_id AND t.status = 'COMPLETED' AND t.updated_at::date = r.report_date
      ), 0)::int AS tasks_completed
     FROM daily_reports r
     JOIN users u ON u.id = r.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.report_date DESC, u.full_name
     LIMIT 200`,
    params,
  );
  return result.rows.map((row) => ({
    ...mapReport(row),
    employeeName: row.employee_name,
    teamName: row.team_name || '',
    loggedMinutes: Number(row.logged_minutes) || 0,
    projectCount: Number(row.project_count) || 0,
    tasksCompleted: Number(row.tasks_completed) || 0,
  }));
}

async function leadTeamIds(userId) {
  const result = await query(
    `SELECT DISTINCT t.id
     FROM teams t
     LEFT JOIN team_members m ON m.team_id = t.id AND m.user_id = $1 AND m.status = 'ACTIVE'
     WHERE t.status = 'ACTIVE' AND (t.lead_id = $1 OR m.role = 'TEAM_LEAD')`,
    [userId],
  );
  return result.rows.map((row) => row.id);
}

async function userOnTeams(userId, teamIds) {
  if (!teamIds.length) return false;
  const result = await query(
    `SELECT 1 FROM team_members
     WHERE user_id = $1 AND status = 'ACTIVE' AND team_id = ANY($2::uuid[])
     LIMIT 1`,
    [userId, teamIds],
  );
  return Boolean(result.rows[0]);
}

async function teamSummary(date, teamIds) {
  const params = [date];
  let scope = '';
  if (teamIds) {
    params.push(teamIds);
    scope = `AND t.id = ANY($${params.length}::uuid[])`;
  }
  const result = await query(
    `SELECT t.id, t.name,
      COUNT(m.user_id)::int AS members,
      COUNT(r.id) FILTER (WHERE r.status = 'SUBMITTED')::int AS submitted
     FROM teams t
     JOIN team_members m ON m.team_id = t.id AND m.status = 'ACTIVE'
     LEFT JOIN daily_reports r ON r.user_id = m.user_id AND r.report_date = $1 AND r.status = 'SUBMITTED'
     WHERE t.status = 'ACTIVE' ${scope}
     GROUP BY t.id, t.name
     ORDER BY t.name`,
    params,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    members: Number(row.members) || 0,
    submitted: Number(row.submitted) || 0,
    notSubmitted: Math.max(0, Number(row.members) - Number(row.submitted)),
  }));
}

async function teamMembers(teamId, date) {
  const result = await query(
    `SELECT u.id, u.full_name, r.status AS report_status, r.submitted_at, r.id AS report_id,
      COALESCE((
        SELECT SUM(COALESCE(e.duration_minutes, ROUND(e.hours * 60)))
        FROM project_time_entries e
        WHERE e.user_id = u.id AND e.work_date = $2
      ), 0)::int AS logged_minutes
     FROM team_members m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN daily_reports r ON r.user_id = u.id AND r.report_date = $2
     WHERE m.team_id = $1 AND m.status = 'ACTIVE'
     ORDER BY u.full_name`,
    [teamId, date],
  );
  return result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    status: row.report_status || 'NOT_SUBMITTED',
    submittedAt: row.submitted_at,
    reportId: row.report_id,
    loggedMinutes: Number(row.logged_minutes) || 0,
  }));
}

async function lookups() {
  const [projects, tasks, people] = await Promise.all([
    query('SELECT id, title FROM projects ORDER BY title LIMIT 300'),
    query(
      `SELECT t.id, t.title, t.project_id, p.title AS project_title
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status <> 'CANCELLED'
       ORDER BY t.updated_at DESC
       LIMIT 300`,
    ),
    query(`SELECT id, full_name FROM users WHERE is_active = TRUE ORDER BY full_name`),
  ]);
  return {
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title })),
    tasks: tasks.rows.map((row) => ({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
      projectName: row.project_title || '',
    })),
    people: people.rows.map((row) => ({ id: row.id, fullName: row.full_name })),
  };
}

async function sessionsInRange(from, to, userIds) {
  const params = [from, to];
  let filter = '';
  if (userIds && userIds.length) {
    params.push(userIds);
    filter = `AND user_id = ANY($${params.length}::uuid[])`;
  }
  const result = await query(
    `SELECT * FROM attendance_sessions WHERE work_date BETWEEN $1 AND $2 ${filter} ORDER BY work_date`,
    params,
  );
  return result.rows.map(mapSession);
}

async function entryMinutesByDay(userId, from, to) {
  const result = await query(
    `SELECT work_date, COALESCE(SUM(COALESCE(duration_minutes, ROUND(hours * 60))), 0)::int AS minutes
     FROM project_time_entries
     WHERE user_id = $1 AND work_date BETWEEN $2 AND $3
     GROUP BY work_date`,
    [userId, from, to],
  );
  const map = new Map();
  result.rows.forEach((row) => map.set(isoDate(row.work_date), Number(row.minutes) || 0));
  return map;
}

module.exports = {
  findSession,
  findSessionById,
  insertSession,
  checkoutSession,
  listBreaks,
  breaksForSessions,
  findBreak,
  insertBreak,
  endBreak,
  sessionsBetween,
  listEntries,
  findEntry,
  overlap,
  insertEntry,
  updateEntry,
  deleteEntry,
  findTask,
  findProject,
  dailyUpdates,
  projectActivity,
  assignedSignals,
  completedTasks,
  findReport,
  findReportById,
  insertReport,
  saveReport,
  replaceActivities,
  listReports,
  leadTeamIds,
  userOnTeams,
  teamSummary,
  teamMembers,
  lookups,
  entryMinutesByDay,
  sessionsInRange,
};
