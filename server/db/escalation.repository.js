const { query } = require('./index');

const FROM = `
  FROM escalations e
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN teams t ON t.id = e.team_id
  JOIN users raiser ON raiser.id = e.raised_by
  LEFT JOIN users assignee ON assignee.id = e.assigned_to
  LEFT JOIN project_tasks task ON task.id = e.task_id
`;

const SELECT = `
  SELECT e.*,
    p.title AS project_title,
    p.customer_name AS project_customer,
    t.name AS team_name,
    raiser.full_name AS raised_by_name,
    assignee.full_name AS assigned_to_name,
    task.title AS task_title
  ${FROM}
`;

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: `ESC-${String(row.escalation_number).padStart(5, '0')}`,
    escalationNumber: row.escalation_number,
    title: row.title,
    type: row.type,
    priority: row.priority,
    status: row.status,
    level: row.level,
    description: row.description,
    impactArea: row.impact_area || '',
    impactSeverity: row.impact_severity || '',
    recommendedAction: row.recommended_action || '',
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    customerName: row.customer_name || row.project_customer || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
    raisedById: row.raised_by,
    raisedByName: row.raised_by_name || '',
    assignedToId: row.assigned_to,
    assignedToName: row.assigned_to_name || '',
    taskId: row.task_id,
    taskTitle: row.task_title || '',
    workRequestId: row.work_request_id,
    leadId: row.lead_id,
    feasibilityId: row.feasibility_id,
    costingId: row.costing_id,
    dueDate: isoDate(row.due_date),
    rootCause: row.root_cause || '',
    correctiveAction: row.corrective_action || '',
    preventiveAction: row.preventive_action || '',
    resolutionNotes: row.resolution_notes || '',
    resolvedBy: row.resolved_by,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER = {
  created: 'e.created_at DESC',
  updated: 'e.updated_at DESC',
  due: 'e.due_date ASC NULLS LAST, e.created_at ASC',
  age: 'e.created_at ASC',
  status: 'e.status ASC, e.created_at ASC',
  priority: "CASE e.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 ELSE 3 END, e.created_at ASC",
};

async function list(where, params, sort) {
  const order = ORDER[sort] || ORDER.priority;
  const result = await query(`${SELECT} ${where} ORDER BY ${order}`, params);
  return result.rows.map(mapRow);
}

async function find(id) {
  const result = await query(`${SELECT} WHERE e.id = $1`, [id]);
  return mapRow(result.rows[0]);
}

async function insert(input) {
  const result = await query(
    `INSERT INTO escalations (
      title, type, priority, status, level, description, impact_area, impact_severity, recommended_action,
      project_id, customer_name, team_id, raised_by, assigned_to, task_id, work_request_id, lead_id, feasibility_id, costing_id, due_date
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
    [
      input.title, input.type, input.priority, input.status, input.level, input.description, input.impactArea, input.impactSeverity, input.recommendedAction,
      input.projectId, input.customerName, input.teamId, input.raisedBy, input.assignedTo, input.taskId, input.workRequestId, input.leadId, input.feasibilityId, input.costingId, input.dueDate,
    ],
  );
  return result.rows[0].id;
}

async function update(id, input) {
  await query(
    `UPDATE escalations SET
      title=$2, type=$3, priority=$4, status=$5, level=$6, description=$7, impact_area=$8, impact_severity=$9, recommended_action=$10,
      project_id=$11, customer_name=$12, team_id=$13, assigned_to=$14, task_id=$15, work_request_id=$16, lead_id=$17, feasibility_id=$18, costing_id=$19,
      due_date=$20, root_cause=$21, corrective_action=$22, preventive_action=$23, resolution_notes=$24, resolved_by=$25, resolved_at=$26, closed_at=$27, archived_at=$28
     WHERE id=$1`,
    [
      id, input.title, input.type, input.priority, input.status, input.level, input.description, input.impactArea, input.impactSeverity, input.recommendedAction,
      input.projectId, input.customerName, input.teamId, input.assignedTo, input.taskId, input.workRequestId, input.leadId, input.feasibilityId, input.costingId,
      input.dueDate || null, input.rootCause, input.correctiveAction, input.preventiveAction, input.resolutionNotes, input.resolvedBy, input.resolvedAt, input.closedAt, input.archivedAt,
    ],
  );
}

async function remove(id) {
  await query('DELETE FROM escalations WHERE id=$1', [id]);
}

async function activity(escalationId, userId, action, description) {
  await query(
    'INSERT INTO escalation_activity (escalation_id, user_id, action, description) VALUES ($1,$2,$3,$4)',
    [escalationId, userId, action, description || ''],
  );
}

async function listActivity(escalationId) {
  const result = await query(
    `SELECT a.*, COALESCE(u.full_name, 'CareYu') AS actor_name
     FROM escalation_activity a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.escalation_id = $1 ORDER BY a.created_at`,
    [escalationId],
  );
  return result.rows.map((row) => ({
    id: row.id, action: row.action, description: row.description, actorName: row.actor_name, createdAt: row.created_at,
  }));
}

async function comments(escalationId) {
  const result = await query(
    `SELECT c.*, u.full_name, r.name AS role_name
     FROM escalation_comments c
     JOIN users u ON u.id = c.user_id
     JOIN roles r ON r.id = u.role_id
     WHERE c.escalation_id = $1 ORDER BY c.created_at`,
    [escalationId],
  );
  return result.rows.map((row) => ({
    id: row.id, userId: row.user_id, name: row.full_name, role: row.role_name, message: row.message, createdAt: row.created_at, updatedAt: row.updated_at,
  }));
}

async function addComment(escalationId, userId, message) {
  const result = await query(
    'INSERT INTO escalation_comments (escalation_id, user_id, message) VALUES ($1,$2,$3) RETURNING id',
    [escalationId, userId, message],
  );
  return result.rows[0].id;
}

async function findComment(id) {
  const result = await query('SELECT * FROM escalation_comments WHERE id=$1', [id]);
  return result.rows[0] || null;
}

async function editComment(id, message) {
  await query('UPDATE escalation_comments SET message=$2, updated_at=NOW() WHERE id=$1', [id, message]);
}

async function deleteComment(id) {
  await query('DELETE FROM escalation_comments WHERE id=$1', [id]);
}

async function addFile(escalationId, file, userId) {
  const result = await query(
    `INSERT INTO escalation_attachments (escalation_id, file_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [escalationId, file.originalname, file.filename, file.mimetype || '', file.size || 0, userId],
  );
  return result.rows[0].id;
}

async function files(escalationId) {
  const result = await query(
    `SELECT f.*, COALESCE(u.full_name, '') AS uploaded_by_name
     FROM escalation_attachments f LEFT JOIN users u ON u.id = f.uploaded_by
     WHERE f.escalation_id = $1 ORDER BY f.created_at`,
    [escalationId],
  );
  return result.rows.map((row) => ({
    id: row.id, fileName: row.file_name, storedName: row.stored_name, mimeType: row.mime_type, sizeBytes: row.size_bytes, uploadedByName: row.uploaded_by_name, createdAt: row.created_at,
  }));
}

async function findFile(id) {
  const result = await query('SELECT * FROM escalation_attachments WHERE id=$1', [id]);
  return result.rows[0] || null;
}

async function deleteFile(id) {
  await query('DELETE FROM escalation_attachments WHERE id=$1', [id]);
}

async function counts(where, params) {
  const result = await query(
    `SELECT
      COUNT(*) FILTER (WHERE e.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED') AND e.archived_at IS NULL)::int AS open,
      COUNT(*) FILTER (WHERE e.priority = 'CRITICAL' AND e.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED') AND e.archived_at IS NULL)::int AS critical,
      COUNT(*) FILTER (WHERE e.due_date < CURRENT_DATE AND e.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED') AND e.archived_at IS NULL)::int AS overdue,
      COUNT(*) FILTER (WHERE e.status = 'UNDER_REVIEW' AND e.archived_at IS NULL)::int AS under_review,
      COUNT(*) FILTER (WHERE e.resolved_at >= date_trunc('month', NOW()))::int AS resolved_month
     ${FROM} ${where}`,
    params,
  );
  const row = result.rows[0];
  return { open: row.open, critical: row.critical, overdue: row.overdue, underReview: row.under_review, resolvedThisMonth: row.resolved_month };
}

async function grouped(where, params) {
  const types = await query(
    `SELECT e.type, COUNT(*)::int AS n ${FROM} ${where} ${where ? 'AND' : 'WHERE'} e.archived_at IS NULL GROUP BY e.type ORDER BY n DESC`,
    params,
  );
  const teams = await query(
    `SELECT COALESCE(t.name, 'No team') AS name, COUNT(*)::int AS n
     ${FROM}
     ${where} ${where ? 'AND' : 'WHERE'} e.archived_at IS NULL
     GROUP BY t.name ORDER BY n DESC LIMIT 8`,
    params,
  );
  return {
    byType: types.rows.map((row) => ({ label: row.type, value: row.n })),
    byTeam: teams.rows.map((row) => ({ label: row.name, value: row.n })),
  };
}

async function options() {
  const [projects, teams, people, tasks, members, requests, leads, studies, costings] = await Promise.all([
    query(`SELECT id, title, customer_name FROM projects WHERE status <> 'CANCELLED' ORDER BY title LIMIT 200`),
    query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
    query(`SELECT id, full_name FROM users WHERE is_active = TRUE ORDER BY full_name`),
    query(`SELECT id, title, project_id FROM project_tasks WHERE status NOT IN ('COMPLETED','CANCELLED') ORDER BY title LIMIT 200`),
    query(`SELECT team_id, user_id FROM team_members WHERE status = 'ACTIVE'`),
    query(`SELECT id, title FROM team_work_requests ORDER BY created_at DESC LIMIT 100`),
    query(`SELECT id, title, lead_code FROM leads ORDER BY created_at DESC LIMIT 100`),
    query(`SELECT f.id, l.title FROM feasibility_studies f JOIN leads l ON l.id = f.lead_id ORDER BY f.updated_at DESC LIMIT 100`),
    query(`SELECT c.id, l.title FROM solution_costings c JOIN leads l ON l.id = c.lead_id ORDER BY c.updated_at DESC LIMIT 100`),
  ]);
  return {
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title, customerName: row.customer_name || '' })),
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name })),
    people: people.rows.map((row) => ({ id: row.id, name: row.full_name })),
    tasks: tasks.rows.map((row) => ({ id: row.id, name: row.title, projectId: row.project_id })),
    members: members.rows.map((row) => ({ teamId: row.team_id, userId: row.user_id })),
    requests: requests.rows.map((row) => ({ id: row.id, name: row.title })),
    leads: leads.rows.map((row) => ({ id: row.id, name: row.title || row.lead_code })),
    studies: studies.rows.map((row) => ({ id: row.id, name: row.title })),
    costings: costings.rows.map((row) => ({ id: row.id, name: row.title })),
  };
}

async function stamps(where, params) {
  const result = await query(`SELECT e.created_at, e.resolved_at ${FROM} ${where}`, params);
  return result.rows;
}

async function teamLeadIds(teamId) {
  if (!teamId) return [];
  const [team, members] = await Promise.all([
    query('SELECT lead_id FROM teams WHERE id = $1', [teamId]),
    query(`SELECT user_id FROM team_members WHERE team_id = $1 AND role = 'TEAM_LEAD' AND status = 'ACTIVE'`, [teamId]),
  ]);
  return [...new Set([team.rows[0]?.lead_id, ...members.rows.map((row) => row.user_id)].filter(Boolean))];
}

async function leadTeamIds(userId) {
  const result = await query(`SELECT id FROM teams WHERE lead_id = $1 OR id IN (SELECT team_id FROM team_members WHERE user_id = $1 AND role = 'TEAM_LEAD' AND status = 'ACTIVE')`, [userId]);
  return result.rows.map((row) => row.id);
}

module.exports = {
  list, find, insert, update, remove, activity, listActivity, comments, addComment, findComment, editComment, deleteComment,
  addFile, files, findFile, deleteFile, counts, grouped, options, leadTeamIds, stamps, teamLeadIds,
};
