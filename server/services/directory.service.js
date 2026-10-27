const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const ApiError = require('../utils/ApiError');
const directory = require('../db/directory.repository');
const organization = require('../db/organization.repository');
const userRepository = require('../db/user.repository');
const settings = require('./settings.service');
const { pool, query } = require('../db');

const MANAGERS = new Set(['admin', 'super_admin', 'management']);
const PRIVILEGED = new Set(['admin', 'super_admin']);
const SCOPES = new Set(['ORGANIZATION', 'ALL_TEAMS', 'ENGINEERING', 'BUSINESS', 'PROJECTS', 'TEAM_ONLY']);
const TEAM_ROLES = new Set(['TEAM_LEAD', 'MEMBER']);
const STATUSES = new Set(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITATION']);

function canManage(user) {
  return MANAGERS.has(user?.role?.code);
}

function canAssignPrivileged(user) {
  return PRIVILEGED.has(user?.role?.code);
}

function present(row) {
  const teams = Array.isArray(row.teams) ? row.teams : [];
  const primary = teams.find((team) => team.primary) || teams[0] || null;
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    phone: row.phone || '',
    employeeCode: row.employee_code || '',
    designation: row.designation || '',
    department: row.department || '',
    role: row.role_name,
    roleCode: row.role_code,
    roleId: row.role_id,
    status: row.account_status || (row.is_active ? 'ACTIVE' : 'INACTIVE'),
    accessScope: row.access_scope || 'TEAM_ONLY',
    managerId: row.reporting_manager_id || '',
    managerName: row.manager_name || '',
    teamId: primary?.id || '',
    team: primary?.name || '',
    teamCode: primary?.code || '',
    teamRole: primary?.role || '',
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      code: team.code,
      role: team.role,
      primary: Boolean(team.primary),
    })),
    openTasks: Number(row.open_tasks) || 0,
    lastLoginAt: row.last_login_at,
    loginEnabled: (row.account_status || 'ACTIVE') === 'ACTIVE' && row.is_active !== false,
    passwordSetup: !row.credentials_initialized_at ? 'Not set' : (row.must_change_password ? 'Change required' : 'Password set'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function temporaryPassword() {
  const policy = await settings.accessPolicy().catch(() => ({}));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(16);
  let value = 'Cy1!';
  const length = Math.max(12, Number(policy.minPasswordLength) || 8);
  while (value.length < length) value += alphabet[bytes[value.length % bytes.length] % alphabet.length];
  const problems = settings.passwordProblems(value, policy);
  if (problems.length) throw new ApiError(500, 'A temporary password could not be created.');
  return value;
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

async function list(user, queryText) {
  const [page, totals, roles, teams, departments] = await Promise.all([
    directory.directory(queryText),
    directory.counts(),
    organization.roles(),
    organization.teams(),
    directory.departments(),
  ]);
  return {
    users: page.rows.map(present),
    totals,
    roles: roles.map((role) => ({ id: role.id, code: role.code, name: role.name })),
    teams: teams.map((team) => ({ id: team.id, code: team.code, name: team.name })),
    departments,
    page: page.page,
    pageSize: page.pageSize,
    total: page.total,
    canManage: canManage(user),
    canAssignPrivileged: canAssignPrivileged(user),
  };
}

async function detail(actor, id) {
  const row = await directory.findById(id);
  if (!row) throw new ApiError(404, 'User not found.');
  const activity = await directory.activityFor(id);
  const person = present(row);
  return {
    user: {
      ...person,
      ...splitName(person.name),
    },
    activity: activity.map((item) => ({
      action: item.action,
      previous: item.previous_value || '',
      next: item.new_value || '',
      at: item.created_at,
      actor: item.actor_name || '',
    })),
    canManage: canManage(actor) && actor.id !== id,
  };
}

function membershipInput(input) {
  const rows = [];
  const primaryId = String(input.teamId || '');
  const primaryRole = TEAM_ROLES.has(input.teamRole) ? input.teamRole : 'MEMBER';
  if (primaryId) rows.push({ teamId: primaryId, role: primaryRole, primary: true });
  const extras = Array.isArray(input.extraTeamIds) ? input.extraTeamIds : [];
  extras.forEach((value) => {
    const teamId = String(value || '');
    if (!teamId || teamId === primaryId || rows.some((row) => row.teamId === teamId)) return;
    rows.push({ teamId, role: 'MEMBER', primary: false });
  });
  return rows;
}

async function assertRole(actor, roleId, currentCode) {
  const roles = await organization.roles();
  const role = roles.find((item) => String(item.id) === String(roleId));
  if (!role) throw new ApiError(400, 'Choose a valid role.');
  if (PRIVILEGED.has(role.code) && !canAssignPrivileged(actor)) {
    throw new ApiError(403, 'You cannot grant an administrator role.');
  }
  if (currentCode && PRIVILEGED.has(currentCode) && !canAssignPrivileged(actor)) {
    throw new ApiError(403, 'You cannot change an administrator account.');
  }
  return role;
}

async function syncMemberships(client, userId, memberships) {
  const existing = await client.query(
    `SELECT team_id, role FROM team_members WHERE user_id = $1`,
    [userId],
  );
  if (!memberships.length) {
    await client.query(`UPDATE team_members SET status = 'INACTIVE', is_primary = FALSE WHERE user_id = $1`, [userId]);
    await client.query(`UPDATE teams SET lead_id = NULL WHERE lead_id = $1`, [userId]);
    return existing.rows;
  }
  await client.query(
    `UPDATE team_members SET status = 'INACTIVE', is_primary = FALSE
     WHERE user_id = $1 AND NOT (team_id = ANY($2::uuid[]))`,
    [userId, memberships.map((item) => item.teamId)],
  );
  const leadTeams = memberships.filter((item) => item.role === 'TEAM_LEAD').map((item) => item.teamId);
  if (leadTeams.length) {
    await client.query(
      `UPDATE teams SET lead_id = NULL WHERE lead_id = $1 AND NOT (id = ANY($2::uuid[]))`,
      [userId, leadTeams],
    );
  } else {
    await client.query(`UPDATE teams SET lead_id = NULL WHERE lead_id = $1`, [userId]);
  }
  for (const item of memberships) {
    await client.query(
      `INSERT INTO team_members (team_id, user_id, role, status, is_primary)
       VALUES ($1,$2,$3,'ACTIVE',$4)
       ON CONFLICT (team_id, user_id) DO UPDATE
       SET role = EXCLUDED.role, status = 'ACTIVE', is_primary = EXCLUDED.is_primary`,
      [item.teamId, userId, item.role, item.primary],
    );
    if (item.role === 'TEAM_LEAD') {
      await client.query('UPDATE teams SET lead_id = $2 WHERE id = $1', [item.teamId, userId]);
    } else {
      await client.query('UPDATE teams SET lead_id = NULL WHERE id = $1 AND lead_id = $2', [item.teamId, userId]);
    }
  }
  return existing.rows;
}

async function create(actor, input) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to add users.');
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();
  if (!first || !last || !email || !phone) throw new ApiError(400, 'First name, last name, phone, and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) throw new ApiError(409, 'An account with this email already exists.');
  const role = await assertRole(actor, input.roleId);
  const scope = SCOPES.has(input.accessScope) ? input.accessScope : 'TEAM_ONLY';
  const managerId = String(input.managerId || '') || null;
  const status = STATUSES.has(input.status) ? input.status : 'ACTIVE';
  const code = String(input.employeeCode || '').trim();
  if (code) {
    const taken = await query(`SELECT id FROM users WHERE lower(employee_code) = lower($1)`, [code]);
    if (taken.rows[0]) throw new ApiError(409, 'That employee ID is already in use.');
  }
  const password = await temporaryPassword();
  const problems = settings.passwordProblems(password);
  if (problems.length) throw new ApiError(400, problems[0]);
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const created = await client.query(
      `INSERT INTO users (
         full_name, email, password_hash, department, designation, role_id, phone, employee_code,
         reporting_manager_id, access_scope, account_status, employment_status, is_active,
         must_change_password, credentials_initialized_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),$9,$10,$11,'ACTIVE',$12, TRUE, NOW())
       RETURNING id`,
      [
        `${first} ${last}`.trim(), email, passwordHash,
        String(input.department || '').trim(), String(input.designation || '').trim(), role.id,
        phone, code, managerId, scope, status, status === 'ACTIVE',
      ],
    );
    const userId = created.rows[0].id;
    await syncMemberships(client, userId, membershipInput(input));
    await client.query(
      `INSERT INTO organization_activity (actor_id, action, target_user_id, new_value)
       VALUES ($1,'User created',$2,$3)`,
      [actor.id, userId, email],
    );
    await client.query('COMMIT');
    const row = await directory.findById(userId);
    return { user: present(row), temporaryPassword: password };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function update(actor, id, input) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to edit users.');
  if (actor.id === id && String(input.roleId || '') && String(input.roleId) !== String(actor.role?.id || '')) {
    const current = await directory.findById(id);
    if (current && String(input.roleId) !== String(current.role_id)) {
      throw new ApiError(403, 'You cannot change your own role.');
    }
  }
  const current = await directory.findById(id);
  if (!current) throw new ApiError(404, 'User not found.');
  if (actor.id === id && input.accessScope && input.accessScope !== current.access_scope) {
    throw new ApiError(403, 'You cannot change your own access scope.');
  }
  const first = String(input.firstName || '').trim();
  const last = String(input.lastName || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  const phone = String(input.phone || '').trim();
  if (!first || !email || !phone) throw new ApiError(400, 'Name, phone, and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'Enter a valid email address.');
  const duplicate = await query('SELECT id FROM users WHERE email = $1 AND id <> $2', [email, id]);
  if (duplicate.rows[0]) throw new ApiError(409, 'An account with this email already exists.');
  const role = await assertRole(actor, input.roleId || current.role_id, current.role_code);
  const scope = SCOPES.has(input.accessScope) ? input.accessScope : current.access_scope;
  const managerId = String(input.managerId || '') || null;
  if (managerId === id) throw new ApiError(400, 'A person cannot report to themselves.');
  const status = STATUSES.has(input.status) ? input.status : current.account_status;
  const code = String(input.employeeCode || '').trim();
  if (code) {
    const taken = await query(`SELECT id FROM users WHERE lower(employee_code) = lower($1) AND id <> $2`, [code, id]);
    if (taken.rows[0]) throw new ApiError(409, 'That employee ID is already in use.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users
       SET full_name=$2, email=$3, phone=$4, employee_code=NULLIF($5,''), designation=$6, department=$7,
           role_id=$8, reporting_manager_id=$9, access_scope=$10, account_status=$11, is_active=$12
       WHERE id=$1`,
      [
        id, `${first} ${last}`.trim(), email, phone, code,
        String(input.designation || '').trim(), String(input.department || '').trim(),
        role.id, managerId, scope, status, status === 'ACTIVE',
      ],
    );
    await syncMemberships(client, id, membershipInput(input));
    await client.query(
      `INSERT INTO organization_activity (actor_id, action, target_user_id, previous_value, new_value)
       VALUES ($1,'User updated',$2,$3,$4)`,
      [actor.id, id, current.email, email],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  const row = await directory.findById(id);
  return present(row);
}

async function setStatus(actor, id, status) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to change account status.');
  if (actor.id === id) throw new ApiError(400, 'You cannot change your own account status.');
  if (!STATUSES.has(status) || status === 'PENDING_INVITATION') throw new ApiError(400, 'Choose active, inactive, or suspended.');
  const current = await directory.findById(id);
  if (!current) throw new ApiError(404, 'User not found.');
  if (PRIVILEGED.has(current.role_code) && !canAssignPrivileged(actor)) {
    throw new ApiError(403, 'You cannot change an administrator account.');
  }
  await query(
    `UPDATE users SET account_status=$2, is_active=$3 WHERE id=$1`,
    [id, status, status === 'ACTIVE'],
  );
  await organization.log({
    actorId: actor.id,
    action: 'Account status changed',
    userId: id,
    previous: current.account_status,
    next: status,
  });
  const row = await directory.findById(id);
  return present(row);
}

async function resetPassword(actor, id) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to reset passwords.');
  const current = await directory.findById(id);
  if (!current) throw new ApiError(404, 'User not found.');
  if (PRIVILEGED.has(current.role_code) && !canAssignPrivileged(actor) && actor.id !== id) {
    throw new ApiError(403, 'You cannot reset an administrator password.');
  }
  const password = await temporaryPassword();
  const passwordHash = await bcrypt.hash(password, 12);
  await userRepository.updatePassword(id, passwordHash, { mustChange: true });
  await organization.log({
    actorId: actor.id,
    action: 'Password reset',
    userId: id,
    next: 'Temporary password issued',
  });
  return { temporaryPassword: password };
}

async function resetInitialPassword(actor, id) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to reset passwords.');
  const current = await directory.findById(id);
  if (!current) throw new ApiError(404, 'User not found.');
  if (PRIVILEGED.has(current.role_code) && !canAssignPrivileged(actor) && actor.id !== id) {
    throw new ApiError(403, 'You cannot reset an administrator password.');
  }
  const policy = await query(`SELECT initial_password_hash FROM credential_policy WHERE id = 1`);
  if (!policy.rows[0]) throw new ApiError(409, 'Initial credentials have not been initialized.');
  await query(
    `UPDATE users
     SET password_hash = $2, must_change_password = TRUE, credentials_initialized_at = COALESCE(credentials_initialized_at, NOW())
     WHERE id = $1`,
    [id, policy.rows[0].initial_password_hash],
  );
  await organization.log({
    actorId: actor.id,
    action: 'Initial password reset',
    userId: id,
    next: 'Change required at next sign-in',
  });
  const row = await directory.findById(id);
  return present(row);
}

async function remove(actor, id) {
  if (!canManage(actor)) throw new ApiError(403, 'You do not have permission to delete users.');
  if (actor.id === id) throw new ApiError(400, 'You cannot delete your own account.');
  const current = await directory.findById(id);
  if (!current) throw new ApiError(404, 'User not found.');
  if (PRIVILEGED.has(current.role_code) && !canAssignPrivileged(actor)) {
    throw new ApiError(403, 'You cannot delete an administrator account.');
  }
  const deps = await directory.dependencyCount(id);
  const used = Number(deps.tasks) + Number(deps.projects) + Number(deps.activity) + Number(deps.reports);
  if (used > 0) {
    await query(
      `UPDATE users SET account_status='INACTIVE', is_active=FALSE, employment_status='INACTIVE' WHERE id=$1`,
      [id],
    );
    await query(`UPDATE team_members SET status='INACTIVE', is_primary=FALSE WHERE user_id=$1`, [id]);
    await query(`UPDATE teams SET lead_id=NULL WHERE lead_id=$1`, [id]);
    await organization.log({
      actorId: actor.id,
      action: 'User archived',
      userId: id,
      previous: current.account_status,
      next: 'INACTIVE',
    });
    return { archived: true, reason: 'This person has projects, tasks, reports, or history, so the account was deactivated instead of deleted.' };
  }
  try {
    await query('DELETE FROM team_members WHERE user_id=$1', [id]);
    await query('DELETE FROM users WHERE id=$1', [id]);
    return { archived: false };
  } catch (error) {
    if (error.code !== '23503') throw error;
    await query(
      `UPDATE users SET account_status='INACTIVE', is_active=FALSE, employment_status='INACTIVE' WHERE id=$1`,
      [id],
    );
    await organization.log({ actorId: actor.id, action: 'User archived', userId: id, previous: current.account_status, next: 'INACTIVE' });
    return { archived: true, reason: 'This person is referenced by other records, so the account was deactivated instead of deleted.' };
  }
}

module.exports = { list, detail, create, update, setStatus, resetPassword, resetInitialPassword, remove };
