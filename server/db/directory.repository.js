const { query } = require('./index');

const DIRECTORY = `
  SELECT u.id, u.full_name, u.email, u.phone, u.employee_code, u.designation, u.department,
         u.is_active, u.account_status, u.access_scope, u.reporting_manager_id, u.last_login_at,
         u.must_change_password, u.credentials_initialized_at,
         u.created_at, u.updated_at,
         r.id AS role_id, r.code AS role_code, r.name AS role_name,
         manager.full_name AS manager_name,
         memberships.teams,
         (SELECT COUNT(*)::int FROM project_tasks k
           WHERE k.assignee_id = u.id AND k.status NOT IN ('COMPLETED', 'CANCELLED')) AS open_tasks
  FROM users u
  JOIN roles r ON r.id = u.role_id
  LEFT JOIN users manager ON manager.id = u.reporting_manager_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(json_agg(json_build_object(
      'id', t.id, 'name', t.name, 'code', t.code, 'role', m.role, 'primary', m.is_primary
    ) ORDER BY m.is_primary DESC, t.name), '[]'::json) AS teams
    FROM team_members m
    JOIN teams t ON t.id = m.team_id
    WHERE m.user_id = u.id AND m.status = 'ACTIVE'
  ) memberships ON TRUE
`;

async function directory({ search = '', status = '', role = '', teamId = '', department = '', activeOnly = false, page = 1, pageSize = 20 } = {}) {
  const params = [];
  const clauses = [];
  const push = (column, value) => {
    params.push(value);
    clauses.push(`${column} = $${params.length}`);
  };
  if (activeOnly) clauses.push(`u.is_active = TRUE AND u.account_status = 'ACTIVE'`);
  if (status) push('u.account_status', status);
  if (role) push('r.code', role);
  if (department) push('u.department', department);
  if (teamId) {
    params.push(teamId);
    clauses.push(`EXISTS (
      SELECT 1 FROM team_members membership
      WHERE membership.user_id = u.id AND membership.team_id = $${params.length} AND membership.status = 'ACTIVE'
    )`);
  }
  const text = String(search || '').trim();
  if (text) {
    params.push(`%${text}%`);
    const slot = `$${params.length}`;
    clauses.push(`(u.full_name ILIKE ${slot} OR u.email ILIKE ${slot} OR COALESCE(u.employee_code,'') ILIKE ${slot} OR COALESCE(u.designation,'') ILIKE ${slot} OR COALESCE(u.department,'') ILIKE ${slot} OR COALESCE(manager.full_name,'') ILIKE ${slot} OR r.name ILIKE ${slot} OR EXISTS (
      SELECT 1 FROM team_members search_member
      JOIN teams search_team ON search_team.id = search_member.team_id
      WHERE search_member.user_id = u.id AND search_member.status = 'ACTIVE' AND search_team.name ILIKE ${slot}
    ))`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  if (activeOnly) {
    const result = await query(`${DIRECTORY} ${where} ORDER BY u.full_name`, params);
    return { rows: result.rows, total: result.rows.length, page: 1, pageSize: result.rows.length || 1 };
  }
  const counted = await query(`SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN users manager ON manager.id = u.reporting_manager_id ${where}`, params);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const current = Math.max(1, Number(page) || 1);
  const offset = (current - 1) * size;
  const result = await query(`${DIRECTORY} ${where} ORDER BY u.full_name LIMIT ${size} OFFSET ${offset}`, params);
  return { rows: result.rows, total: counted.rows[0].total, page: current, pageSize: size };
}

async function findById(id) {
  const result = await query(`${DIRECTORY} WHERE u.id = $1`, [id]);
  return result.rows[0] || null;
}

async function activityFor(userId) {
  const result = await query(
    `SELECT a.action, a.previous_value, a.new_value, a.created_at, actor.full_name AS actor_name
     FROM organization_activity a
     LEFT JOIN users actor ON actor.id = a.actor_id
     WHERE a.target_user_id = $1
     ORDER BY a.created_at DESC
     LIMIT 8`,
    [userId],
  );
  return result.rows;
}

async function departments() {
  const result = await query(`SELECT DISTINCT department FROM users WHERE btrim(department) <> '' ORDER BY department`);
  return result.rows.map((row) => row.department);
}

async function dependencyCount(userId) {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM project_tasks WHERE assignee_id = $1) AS tasks,
       (SELECT COUNT(*)::int FROM projects WHERE created_by = $1 OR project_manager_id = $1) AS projects,
       (SELECT COUNT(*)::int FROM organization_activity WHERE actor_id = $1 OR target_user_id = $1) AS activity,
       (SELECT COUNT(*)::int FROM users WHERE reporting_manager_id = $1 OR co_manager_id = $1) AS reports`,
    [userId],
  );
  return result.rows[0];
}

async function counts() {
  const result = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE account_status = 'ACTIVE' AND is_active = TRUE)::int AS active,
       COUNT(*) FILTER (WHERE account_status = 'INACTIVE')::int AS inactive,
       COUNT(*) FILTER (WHERE account_status = 'SUSPENDED')::int AS suspended,
       COUNT(*) FILTER (WHERE account_status = 'PENDING_INVITATION')::int AS pending
     FROM users`,
  );
  return result.rows[0];
}

module.exports = { directory, counts, findById, activityFor, departments, dependencyCount };
