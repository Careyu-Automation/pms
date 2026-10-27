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

const TEAM_STATS = `
  SELECT t.*,
    lead.full_name AS lead_name,
    (SELECT COUNT(*)::int FROM team_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.team_id = t.id AND m.status = 'ACTIVE'
        AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        AND u.is_active AND u.account_status = 'ACTIVE') AS member_count,
    (SELECT COUNT(DISTINCT p.id)::int FROM projects p
      WHERE p.status NOT IN ('COMPLETED', 'CANCELLED')
        AND (
          EXISTS (SELECT 1 FROM project_teams pt WHERE pt.project_id = p.id AND pt.team_id = t.id)
          OR p.team_code = t.code
          OR EXISTS (
            SELECT 1 FROM project_tasks k
            WHERE k.project_id = p.id
              AND (k.team_code = t.code OR k.assignee_id IN (
                SELECT m.user_id FROM team_members m
                WHERE m.team_id = t.id AND m.status = 'ACTIVE'
                  AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
              ))
          )
        )) AS active_projects,
    (SELECT COUNT(DISTINCT k.id)::int FROM project_tasks k
      WHERE k.status NOT IN ('COMPLETED', 'CANCELLED')
        AND (k.team_code = t.code OR k.assignee_id IN (
          SELECT m.user_id FROM team_members m
          WHERE m.team_id = t.id AND m.status = 'ACTIVE'
            AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        ))) AS active_tasks,
    (SELECT COUNT(DISTINCT k.id)::int FROM project_tasks k
      WHERE k.status = 'COMPLETED'
        AND (k.team_code = t.code OR k.assignee_id IN (
          SELECT m.user_id FROM team_members m
          WHERE m.team_id = t.id AND m.status = 'ACTIVE'
            AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        ))) AS completed_tasks,
    (SELECT COUNT(DISTINCT k.id)::int FROM project_tasks k
      WHERE k.end_date < CURRENT_DATE AND k.status NOT IN ('COMPLETED', 'CANCELLED')
        AND (k.team_code = t.code OR k.assignee_id IN (
          SELECT m.user_id FROM team_members m
          WHERE m.team_id = t.id AND m.status = 'ACTIVE'
            AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        ))) AS overdue_tasks,
    (SELECT ROUND(AVG(k.progress))::int FROM project_tasks k WHERE k.team_code = t.code AND k.status <> 'CANCELLED') AS completion,
    (SELECT COALESCE(SUM(k.estimated_hours), 0) FROM project_tasks k WHERE k.team_code = t.code AND k.status NOT IN ('COMPLETED', 'CANCELLED')) AS assigned_hours,
    (SELECT string_agg(u.full_name, ' ') FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = t.id AND m.status = 'ACTIVE' AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        AND u.is_active AND u.account_status = 'ACTIVE') AS member_names,
    (SELECT COALESCE(json_agg(name), '[]'::json) FROM (
      SELECT u.full_name AS name FROM team_members m JOIN users u ON u.id = m.user_id
      WHERE m.team_id = t.id AND m.status = 'ACTIVE' AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        AND u.is_active AND u.account_status = 'ACTIVE'
      ORDER BY u.full_name LIMIT 8
    ) preview) AS member_preview,
    (SELECT COALESCE(json_agg(m.user_id), '[]'::json) FROM team_members m WHERE m.team_id = t.id AND m.status = 'ACTIVE' AND m.role = 'TEAM_LEAD') AS lead_ids,
    (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = t.id AND m.status = 'ACTIVE' AND m.role = 'TEAM_LEAD') AS lead_names,
    meeting.id AS meeting_id,
    meeting.name AS meeting_name,
    meeting.url AS meeting_url,
    meeting.platform AS meeting_platform
  FROM teams t
  LEFT JOIN users lead ON lead.id = t.lead_id
  LEFT JOIN LATERAL (
    SELECT id, name, url, platform FROM team_meetings
    WHERE team_id = t.id
    ORDER BY is_primary DESC, created_at
    LIMIT 1
  ) meeting ON TRUE
`;

function mapTeam(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    department: row.department || '',
    description: row.description || '',
    status: row.status,
    leadId: row.lead_id,
    leadName: row.lead_name || '',
    leadIds: Array.isArray(row.lead_ids) ? row.lead_ids : [],
    leadNames: row.lead_names || row.lead_name || '',
    category: row.category || '',
    members: Number(row.member_count) || 0,
    activeProjects: Number(row.active_projects) || 0,
    activeTasks: Number(row.active_tasks) || 0,
    completedTasks: Number(row.completed_tasks) || 0,
    overdueTasks: Number(row.overdue_tasks) || 0,
    completion: Number(row.completion) || 0,
    assignedHours: Number(row.assigned_hours) || 0,
    assignmentRule: row.assignment_rule || 'TEAM_LEAD_ONLY',
    memberNames: row.member_names || '',
    memberPreview: Array.isArray(row.member_preview) ? row.member_preview : [],
    meetingId: row.meeting_id || '',
    meetingName: row.meeting_name || '',
    meetingUrl: row.meeting_url || '',
    meetingPlatform: row.meeting_platform || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function list() {
  const result = await query(`${TEAM_STATS} ORDER BY t.name`);
  return result.rows.map(mapTeam);
}

async function findByRef(ref) {
  const result = await query(
    `${TEAM_STATS} WHERE t.id::text = $1 OR lower(t.code) = lower($1) LIMIT 1`,
    [ref],
  );
  return result.rows[0] ? mapTeam(result.rows[0]) : null;
}

async function codeTaken(code, exceptId) {
  const result = await query(
    'SELECT id FROM teams WHERE lower(code) = lower($1) AND id <> COALESCE($2::uuid, \'00000000-0000-0000-0000-000000000000\')',
    [code, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function nameTaken(name, exceptId) {
  const result = await query(
    `SELECT id FROM teams
     WHERE lower(name) = lower($1) AND status <> 'ARCHIVED'
       AND id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000')`,
    [name, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function projectChoices() {
  const result = await query(
    `SELECT id, title FROM projects WHERE status <> 'CANCELLED' ORDER BY title LIMIT 200`,
  );
  return result.rows.map((row) => ({ id: row.id, title: row.title }));
}

async function memberTeamIds(userId) {
  const result = await query(
    `SELECT team_id FROM team_members WHERE user_id = $1 AND status = 'ACTIVE'`,
    [userId],
  );
  return result.rows.map((row) => row.team_id);
}

async function insertTeam(input, actorId) {
  const result = await query(
    `INSERT INTO teams (code, name, department, description, status, lead_id, assignment_rule, category, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [input.code, input.name, input.department, input.description, input.status, input.leadId, input.assignmentRule, input.category || '', actorId],
  );
  return result.rows[0].id;
}

async function updateTeam(id, input) {
  const result = await query(
    `UPDATE teams SET code = $2, name = $3, department = $4, description = $5, status = $6, lead_id = $7, assignment_rule = $8, category = $9
     WHERE id = $1 RETURNING id`,
    [id, input.code, input.name, input.department, input.description, input.status, input.leadId, input.assignmentRule || 'TEAM_LEAD_ONLY', input.category || ''],
  );
  return result.rows[0] || null;
}

async function renameCode(previous, next) {
  if (!previous || previous === next) return;
  await query('UPDATE project_tasks SET team_code = $2 WHERE team_code = $1', [previous, next]);
  await query('UPDATE products SET team_code = $2 WHERE team_code = $1', [previous, next]);
  await query('UPDATE projects SET team_code = $2 WHERE team_code = $1', [previous, next]);
}

async function setStatus(id, status) {
  const result = await query('UPDATE teams SET status = $2 WHERE id = $1 RETURNING id', [id, status]);
  return result.rows[0] || null;
}

async function removeTeam(id) {
  const result = await query('DELETE FROM teams WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

async function relationshipCounts(team) {
  const result = await query(
    `SELECT
      (SELECT COUNT(*)::int FROM team_members WHERE team_id = $1) AS members,
      (SELECT COUNT(*)::int FROM project_teams WHERE team_id = $1) AS projects,
      (SELECT COUNT(*)::int FROM project_tasks WHERE team_code = $2) AS tasks,
      (SELECT COUNT(*)::int FROM products WHERE team_code = $2) AS products`,
    [team.id, team.code],
  );
  return result.rows[0];
}

async function listMembers(teamId) {
  const result = await query(
    `SELECT m.*, u.full_name, u.email, u.designation, u.department,
            (SELECT COUNT(*)::int FROM project_tasks k
             WHERE k.assignee_id = m.user_id
               AND k.team_code = (SELECT code FROM teams WHERE id = m.team_id)
               AND k.status NOT IN ('COMPLETED', 'CANCELLED')) AS open_tasks
     FROM team_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1
     ORDER BY CASE m.role WHEN 'TEAM_LEAD' THEN 0 WHEN 'SENIOR_MEMBER' THEN 1 ELSE 2 END, u.full_name`,
    [teamId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    name: row.full_name,
    email: row.email,
    designation: row.designation || '',
    department: row.department || '',
    role: row.role,
    status: row.status,
    joinedAt: isoDate(row.joined_at),
    openTasks: Number(row.open_tasks) || 0,
  }));
}

async function findMember(teamId, memberId) {
  const result = await query('SELECT * FROM team_members WHERE team_id = $1 AND id = $2', [teamId, memberId]);
  return result.rows[0] || null;
}

async function insertMember(teamId, input) {
  const result = await query(
    `INSERT INTO team_members (team_id, user_id, role, status, joined_at)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [teamId, input.userId, input.role, input.status, input.joinedAt],
  );
  return result.rows[0].id;
}

async function updateMember(teamId, memberId, input) {
  const result = await query(
    `UPDATE team_members SET role = $3, status = $4, joined_at = $5
     WHERE team_id = $1 AND id = $2 RETURNING id`,
    [teamId, memberId, input.role, input.status, input.joinedAt],
  );
  return result.rows[0] || null;
}

async function deleteMember(teamId, memberId) {
  const result = await query('DELETE FROM team_members WHERE team_id = $1 AND id = $2 RETURNING id, user_id, role', [teamId, memberId]);
  return result.rows[0] || null;
}

async function clearLeadRole(teamId, exceptUserId) {
  await query(
    `UPDATE team_members SET role = 'MEMBER'
     WHERE team_id = $1 AND role = 'TEAM_LEAD' AND user_id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000')`,
    [teamId, exceptUserId || null],
  );
}

async function listProjects(teamId) {
  const result = await query(
    `SELECT pt.*, p.project_code, p.title, p.customer_name, p.status, p.target_date,
      manager.full_name AS manager_name,
      (SELECT ROUND(AVG(k.progress))::int FROM project_tasks k WHERE k.project_id = p.id AND k.status <> 'CANCELLED') AS project_progress,
      (SELECT COUNT(*)::int FROM project_tasks k WHERE k.project_id = p.id AND k.team_code = t.code) AS task_count
     FROM project_teams pt
     JOIN teams t ON t.id = pt.team_id
     JOIN projects p ON p.id = pt.project_id
     LEFT JOIN users manager ON manager.id = p.project_manager_id
     WHERE pt.team_id = $1
     ORDER BY p.title`,
    [teamId],
  );
  return result.rows.map(mapProjectLink);
}

async function listProjectLinks(projectId) {
  const result = await query(
    `SELECT pt.*, t.code, t.name AS team_name, p.project_code, p.title, p.customer_name, p.status, p.target_date,
      manager.full_name AS manager_name,
      (SELECT ROUND(AVG(k.progress))::int FROM project_tasks k WHERE k.project_id = p.id AND k.status <> 'CANCELLED') AS project_progress,
      (SELECT COUNT(*)::int FROM project_tasks k WHERE k.project_id = p.id AND k.team_code = t.code) AS task_count
     FROM project_teams pt
     JOIN teams t ON t.id = pt.team_id
     JOIN projects p ON p.id = pt.project_id
     LEFT JOIN users manager ON manager.id = p.project_manager_id
     WHERE pt.project_id = $1
     ORDER BY t.name`,
    [projectId],
  );
  return result.rows.map((row) => ({ ...mapProjectLink(row), teamName: row.team_name, teamCode: row.code }));
}

function mapProjectLink(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    projectCode: row.project_code,
    projectName: row.title,
    customerName: row.customer_name || '',
    managerName: row.manager_name || '',
    projectStatus: row.status,
    dueDate: isoDate(row.target_date),
    teamRole: row.team_role,
    contributionPercent: Number(row.contribution_percent) || 0,
    projectProgress: Number(row.project_progress) || 0,
    taskCount: Number(row.task_count) || 0,
    assignedAt: row.assigned_at,
  };
}

async function assignProject(projectId, teamId, input) {
  const result = await query(
    `INSERT INTO project_teams (project_id, team_id, team_role, contribution_percent)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [projectId, teamId, input.teamRole, input.contributionPercent],
  );
  return result.rows[0].id;
}

async function updateProjectLink(projectId, teamId, input) {
  const result = await query(
    `UPDATE project_teams SET team_role = $3, contribution_percent = $4
     WHERE project_id = $1 AND team_id = $2 RETURNING id`,
    [projectId, teamId, input.teamRole, input.contributionPercent],
  );
  return result.rows[0] || null;
}

async function removeProjectLink(projectId, teamId) {
  const result = await query('DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2 RETURNING id', [projectId, teamId]);
  return result.rows[0] || null;
}

async function listTasks(code) {
  const result = await query(
    `SELECT t.id, t.title, t.status, t.priority, t.start_date, t.end_date, t.progress, t.estimated_hours,
      t.project_id, t.assignee_id, u.full_name AS assignee_name, p.title AS project_title, p.project_code,
      COALESCE(logged.actual_hours, 0) AS actual_hours
     FROM project_tasks t
     LEFT JOIN users u ON u.id = t.assignee_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN (
       SELECT task_id, SUM(hours) AS actual_hours FROM project_time_entries GROUP BY task_id
     ) logged ON logged.task_id = t.id
     WHERE t.team_code = $1
        OR t.assignee_id IN (
          SELECT m.user_id FROM team_members m
          JOIN teams tm ON tm.id = m.team_id
          WHERE tm.code = $1 AND m.status = 'ACTIVE'
            AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
        )
     ORDER BY t.end_date, t.title`,
    [code],
  );
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    progress: Number(row.progress) || 0,
    estimatedHours: row.estimated_hours == null ? null : Number(row.estimated_hours),
    actualHours: Number(row.actual_hours) || 0,
    projectId: row.project_id,
    projectName: row.project_title || '',
    projectCode: row.project_code || '',
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name || '',
  }));
}

async function memberTaskStats(code) {
  const result = await query(
    `SELECT assignee_id,
      COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED'))::int AS active_tasks,
      COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed_tasks,
      COUNT(*) FILTER (WHERE end_date < CURRENT_DATE AND status NOT IN ('COMPLETED', 'CANCELLED'))::int AS overdue_tasks,
      COALESCE(SUM(estimated_hours), 0) AS estimated_hours,
      COALESCE(ROUND(AVG(progress))::int, 0) AS progress
     FROM project_tasks
     WHERE assignee_id IS NOT NULL
       AND (team_code = $1 OR assignee_id IN (
         SELECT m.user_id FROM team_members m
         JOIN teams tm ON tm.id = m.team_id
         WHERE tm.code = $1 AND m.status = 'ACTIVE'
           AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
       ))
     GROUP BY assignee_id`,
    [code],
  );
  const actual = await query(
    `SELECT e.user_id, COALESCE(SUM(e.hours), 0) AS actual_hours
     FROM project_time_entries e
     JOIN project_tasks t ON t.id = e.task_id
     WHERE t.team_code = $1 AND e.user_id IS NOT NULL
     GROUP BY e.user_id`,
    [code],
  );
  const hours = new Map(actual.rows.map((row) => [row.user_id, Number(row.actual_hours) || 0]));
  return result.rows.map((row) => ({
    userId: row.assignee_id,
    activeTasks: Number(row.active_tasks) || 0,
    completedTasks: Number(row.completed_tasks) || 0,
    overdueTasks: Number(row.overdue_tasks) || 0,
    estimatedHours: Number(row.estimated_hours) || 0,
    actualHours: hours.get(row.assignee_id) || 0,
    progress: Number(row.progress) || 0,
  }));
}

async function listActivity(teamId) {
  const result = await query(
    `SELECT a.*, u.full_name AS actor_name
     FROM team_activity a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.team_id = $1
     ORDER BY a.created_at DESC
     LIMIT 100`,
    [teamId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    actorName: row.actor_name || 'CareYu',
    createdAt: row.created_at,
  }));
}

async function addActivity(teamId, actorId, action) {
  await query(
    'INSERT INTO team_activity (team_id, actor_id, action) VALUES ($1,$2,$3)',
    [teamId, actorId, action],
  );
}

async function codeExists(code) {
  const result = await query('SELECT 1 FROM teams WHERE lower(code) = lower($1)', [code]);
  return Boolean(result.rows[0]);
}

async function listAllMeetings() {
  const result = await query(
    `SELECT m.*, t.name AS team_name, t.status AS team_status, u.full_name AS created_by_name
     FROM team_meetings m
     JOIN teams t ON t.id = m.team_id
     LEFT JOIN users u ON u.id = m.created_by
     WHERE t.status <> 'ARCHIVED'
     ORDER BY m.is_primary DESC, t.name, m.name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    name: row.name,
    platform: row.platform,
    url: row.url,
    description: row.description || '',
    isPrimary: row.is_primary,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
  }));
}

async function listMeetings(teamId) {
  const result = await query(
    `SELECT m.*, u.full_name AS created_by_name
     FROM team_meetings m
     LEFT JOIN users u ON u.id = m.created_by
     WHERE m.team_id = $1
     ORDER BY m.is_primary DESC, m.created_at`,
    [teamId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    name: row.name,
    platform: row.platform,
    url: row.url,
    description: row.description || '',
    isPrimary: row.is_primary,
    createdBy: row.created_by,
    createdByName: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function findMeeting(teamId, meetingId) {
  const rows = await listMeetings(teamId);
  return rows.find((row) => row.id === meetingId) || null;
}

async function insertMeeting(teamId, input, actorId) {
  if (input.isPrimary) await query('UPDATE team_meetings SET is_primary = FALSE WHERE team_id = $1', [teamId]);
  const result = await query(
    `INSERT INTO team_meetings (team_id, name, platform, url, description, is_primary, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [teamId, input.name, input.platform, input.url, input.description, input.isPrimary, actorId],
  );
  return result.rows[0].id;
}

async function updateMeeting(teamId, meetingId, input) {
  if (input.isPrimary) await query('UPDATE team_meetings SET is_primary = FALSE WHERE team_id = $1 AND id <> $2', [teamId, meetingId]);
  const result = await query(
    `UPDATE team_meetings SET name = $3, platform = $4, url = $5, description = $6, is_primary = $7
     WHERE team_id = $1 AND id = $2 RETURNING id`,
    [teamId, meetingId, input.name, input.platform, input.url, input.description, input.isPrimary],
  );
  return result.rows[0] || null;
}

async function deleteMeeting(teamId, meetingId) {
  const result = await query('DELETE FROM team_meetings WHERE team_id = $1 AND id = $2 RETURNING id', [teamId, meetingId]);
  return result.rows[0] || null;
}

async function listRequests(teamId) {
  const result = await query(
    `SELECT r.*, requester.full_name AS requester_name, assignee.full_name AS assignee_name, p.title AS project_title
     FROM team_work_requests r
     JOIN users requester ON requester.id = r.requester_id
     LEFT JOIN users assignee ON assignee.id = r.assigned_to
     LEFT JOIN projects p ON p.id = r.project_id
     WHERE r.team_id = $1
     ORDER BY r.created_at DESC`,
    [teamId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    number: `WR-${String(row.id).slice(0, 8).toUpperCase()}`,
    teamId: row.team_id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    deadline: isoDate(row.deadline),
    startDate: isoDate(row.start_date),
    estimatedMinutes: Number(row.estimated_minutes) || 0,
    tag: row.tag || '',
    checklist: Array.isArray(row.checklist) ? row.checklist : [],
    taskId: row.task_id || '',
    status: row.status,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name || '',
    createdAt: row.created_at,
  }));
}

async function insertRequest(teamId, input) {
  const result = await query(
    `INSERT INTO team_work_requests
      (team_id, requester_id, project_id, title, description, priority, deadline, start_date, estimated_minutes, tag, checklist)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING id`,
    [teamId, input.requesterId, input.projectId, input.title, input.description, input.priority, input.deadline || null, input.startDate || null, input.estimatedMinutes || 0, input.tag || '', JSON.stringify(input.checklist || [])],
  );
  return result.rows[0].id;
}

async function updateRequest(teamId, requestId, input) {
  const result = await query(
    `UPDATE team_work_requests SET status = $3, assigned_to = $4, task_id = COALESCE($5, task_id)
     WHERE team_id = $1 AND id = $2 RETURNING id`,
    [teamId, requestId, input.status, input.assignedTo, input.taskId || null],
  );
  return result.rows[0] || null;
}

module.exports = {
  list,
  findByRef,
  codeTaken,
  insertTeam,
  updateTeam,
  renameCode,
  setStatus,
  removeTeam,
  relationshipCounts,
  listMembers,
  findMember,
  insertMember,
  updateMember,
  deleteMember,
  clearLeadRole,
  listProjects,
  listProjectLinks,
  assignProject,
  updateProjectLink,
  removeProjectLink,
  listTasks,
  memberTaskStats,
  listActivity,
  addActivity,
  codeExists,
  nameTaken,
  projectChoices,
  memberTeamIds,
  listAllMeetings,
  listMeetings,
  findMeeting,
  insertMeeting,
  updateMeeting,
  deleteMeeting,
  listRequests,
  insertRequest,
  updateRequest,
};
