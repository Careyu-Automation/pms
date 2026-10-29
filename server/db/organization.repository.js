const { query } = require('./index');

async function employees() {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.department, u.designation, u.employee_code,
            u.employment_status, u.is_active, u.access_scope, u.account_status, u.joining_date,
            u.reporting_manager_id, u.co_manager_id,
            u.role_id, r.code AS role_code, r.name AS role_name,
            m.full_name AS manager_name, c.full_name AS co_manager_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN users m ON m.id = u.reporting_manager_id
     LEFT JOIN users c ON c.id = u.co_manager_id
     ORDER BY u.full_name`,
  );
  return result.rows;
}

async function roles() {
  const result = await query('SELECT id, code, name FROM roles ORDER BY name');
  return result.rows;
}

async function teams() {
  const result = await query(
    `SELECT t.id, t.code, t.name, t.department, t.lead_id, lead.full_name AS lead_name,
      (SELECT COUNT(*) FROM team_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.team_id = t.id AND m.status = 'ACTIVE'
          AND m.role IN ('TEAM_LEAD','SENIOR_MEMBER','MEMBER')
          AND u.is_active AND u.account_status = 'ACTIVE')::int AS members,
      (SELECT COUNT(DISTINCT tk.id) FROM project_tasks tk
        WHERE tk.status NOT IN ('COMPLETED','CANCELLED')
          AND (tk.team_code = t.code OR tk.assignee_id IN (
            SELECT m.user_id FROM team_members m
            WHERE m.team_id = t.id AND m.status = 'ACTIVE'
              AND m.role IN ('TEAM_LEAD','SENIOR_MEMBER','MEMBER')
          )))::int AS open_tasks,
      (SELECT COUNT(*) FROM project_tasks tk WHERE tk.team_code = t.code AND tk.status NOT IN ('COMPLETED','CANCELLED') AND tk.end_date < CURRENT_DATE)::int AS overdue_tasks,
      (SELECT COUNT(DISTINCT pt.project_id) FROM project_teams pt JOIN projects p ON p.id = pt.project_id WHERE pt.team_id = t.id AND p.status NOT IN ('COMPLETED','CANCELLED'))::int AS active_projects
     FROM teams t
     LEFT JOIN users lead ON lead.id = t.lead_id
     WHERE t.status <> 'ARCHIVED'
     ORDER BY t.name`,
  );
  return result.rows;
}

async function memberships() {
  const result = await query(
    `SELECT team_id, user_id, role, status, is_primary
     FROM team_members
     WHERE status = 'ACTIVE'`,
  );
  return result.rows;
}

async function roleGrants() {
  const result = await query(
    `SELECT r.code AS role_code, p.module, p.action
     FROM role_permissions p
     JOIN roles r ON r.id = p.role_id`,
  );
  return result.rows;
}

async function userGrants(userId) {
  const result = await query(
    'SELECT module, action, allowed FROM user_permission_overrides WHERE user_id = $1',
    [userId],
  );
  return result.rows;
}

async function activity(userId) {
  const result = await query(
    `SELECT a.action, a.previous_value, a.new_value, a.created_at, u.full_name AS actor
     FROM organization_activity a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.target_user_id = $1
     ORDER BY a.created_at DESC
     LIMIT 8`,
    [userId],
  );
  return result.rows;
}

async function emailTaken(email, exceptId) {
  const result = await query(
    'SELECT id FROM users WHERE email = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)',
    [email, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function codeTaken(code, exceptId) {
  const result = await query(
    `SELECT id FROM users WHERE lower(employee_code) = lower($1) AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [code, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function insertEmployee(input) {
  const result = await query(
    `INSERT INTO users (
      full_name, email, password_hash, phone, department, designation, role_id,
      employee_code, employment_status, is_active, joining_date, reporting_manager_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    RETURNING id`,
    [
      input.fullName, input.email, input.passwordHash, input.phone, input.department, input.designation,
      input.roleId, input.employeeCode, input.status, input.status !== 'INACTIVE', input.joiningDate, input.managerId,
    ],
  );
  return result.rows[0].id;
}

async function updateEmployee(id, input) {
  await query(
    `UPDATE users SET full_name=$2, email=$3, phone=$4, department=$5, designation=$6, role_id=$7,
      employee_code=$8, employment_status=$9, is_active=$10, joining_date=$11, reporting_manager_id=$12
     WHERE id=$1`,
    [
      id, input.fullName, input.email, input.phone, input.department, input.designation, input.roleId,
      input.employeeCode, input.status, input.status !== 'INACTIVE', input.joiningDate, input.managerId,
    ],
  );
}

async function setStatus(id, status) {
  await query(
    'UPDATE users SET employment_status=$2, is_active=$3 WHERE id=$1',
    [id, status, status !== 'INACTIVE'],
  );
}

async function replaceAccess(userId, grants) {
  await query('DELETE FROM user_permission_overrides WHERE user_id = $1', [userId]);
  for (const grant of grants) {
    await query(
      'INSERT INTO user_permission_overrides (user_id, module, action, allowed) VALUES ($1,$2,$3,$4)',
      [userId, grant.module, grant.action, grant.allowed],
    );
  }
}

async function ensureRoleGrant(roleId, module, action) {
  await query(
    'INSERT INTO role_permissions (role_id, module, action) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [roleId, module, action],
  );
}

async function setMembership(teamId, userId, { role, primary }) {
  await query(
    `INSERT INTO team_members (team_id, user_id, role, status, is_primary)
     VALUES ($1,$2,$3,'ACTIVE',$4)`,
    [teamId, userId, role, primary],
  );
}

async function clearPrimary(userId, exceptTeamId) {
  await query(
    'UPDATE team_members SET is_primary = FALSE WHERE user_id = $1 AND team_id <> $2',
    [userId, exceptTeamId],
  );
}

async function removeMember(teamId, userId) {
  const removed = await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [teamId, userId]);
  if (!removed.rowCount) return false;
  await query('UPDATE teams SET lead_id = NULL WHERE id = $1 AND lead_id = $2', [teamId, userId]);
  return true;
}

async function setLead(teamId, userId, lead) {
  const updated = await query(
    `UPDATE team_members SET role = $3 WHERE team_id = $1 AND user_id = $2`,
    [teamId, userId, lead ? 'TEAM_LEAD' : 'MEMBER'],
  );
  if (!updated.rowCount) return false;
  if (lead) {
    await query('UPDATE teams SET lead_id = $2 WHERE id = $1 AND lead_id IS NULL', [teamId, userId]);
  } else {
    await query('UPDATE teams SET lead_id = NULL WHERE id = $1 AND lead_id = $2', [teamId, userId]);
  }
  return true;
}

async function log(entry) {
  await query(
    `INSERT INTO organization_activity (actor_id, action, target_user_id, target_team_id, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [entry.actorId, entry.action, entry.userId || null, entry.teamId || null, entry.previous || '', entry.next || ''],
  );
}

module.exports = {
  employees, roles, teams, memberships, roleGrants, userGrants, activity, emailTaken, codeTaken,
  insertEmployee, updateEmployee, setStatus, replaceAccess, ensureRoleGrant, setMembership,
  clearPrimary, removeMember, setLead, log,
};
