const bcrypt = require('bcryptjs');
const ApiError = require('../utils/ApiError');
const repository = require('../db/organization.repository');

const MODULES = [
  ['dashboard', 'Dashboard'],
  ['team_dashboard', 'Team Dashboard'],
  ['leads', 'Lead Pipeline'],
  ['feasibility', 'Feasibility Studies'],
  ['costing', 'Solution & Costing'],
  ['projects', 'Active Projects'],
  ['planning', 'Project Gantt & Planning'],
  ['my_work', 'My Assigned Work'],
  ['team_tasks', 'Team Tasks'],
  ['daily_work', 'Daily Work Updates'],
  ['messages', 'Messages'],
  ['meetings', 'Meetings'],
  ['email_reports', 'Email Reports'],
  ['escalations', 'Escalations'],
  ['procurement', 'Procurement Requests'],
  ['organization', 'Organization Management'],
  ['users', 'User Management'],
  ['audit', 'Audit Trail'],
  ['settings', 'Settings'],
];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function canManage(user) {
  return ['admin', 'super_admin', 'management'].includes(user?.role?.code || '');
}

function assertManage(user) {
  if (!canManage(user)) throw new ApiError(403, 'You cannot change the organization.');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function day(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function defaultsFor(code) {
  const grants = new Set();
  const add = (modules, actions) => modules.forEach((module) => actions.forEach((action) => grants.add(`${module}:${action}`)));
  if (['admin', 'super_admin'].includes(code)) add(MODULES.map(([id]) => id), ACTIONS);
  else if (code === 'management') {
    add(MODULES.map(([id]) => id), ['view']);
    add(['organization', 'users', 'projects', 'team_tasks', 'escalations'], ['create', 'edit', 'approve']);
  } else if (code === 'project_manager') {
    add(['dashboard', 'team_dashboard', 'leads', 'feasibility', 'costing', 'projects', 'planning', 'team_tasks', 'daily_work', 'messages', 'meetings', 'escalations', 'procurement', 'organization'], ['view', 'create', 'edit']);
    add(['projects', 'team_tasks'], ['approve']);
  } else if (code === 'team_lead') {
    add(['dashboard', 'team_dashboard', 'team_tasks', 'daily_work', 'messages', 'meetings', 'my_work'], ['view', 'create', 'edit']);
  } else {
    add(['dashboard', 'my_work', 'messages', 'daily_work', 'meetings'], ['view']);
    add(['my_work', 'messages', 'daily_work'], ['create', 'edit']);
  }
  return grants;
}

async function ensureDefaults(roles) {
  for (const role of roles) {
    const grants = defaultsFor(role.code);
    for (const grant of grants) {
      const [module, action] = grant.split(':');
      await repository.ensureRoleGrant(role.id, module, action);
    }
  }
}

function accessFor(roleCode, roleRows, overrides) {
  const allowed = new Set(roleRows.filter((row) => row.role_code === roleCode).map((row) => `${row.module}:${row.action}`));
  overrides.forEach((row) => {
    const key = `${row.module}:${row.action}`;
    if (row.allowed) allowed.add(key);
    else allowed.delete(key);
  });
  return MODULES.map(([id, label]) => ({
    id,
    label,
    actions: Object.fromEntries(ACTIONS.map((action) => [action, allowed.has(`${id}:${action}`)])),
  }));
}

function summaryLine(roleCode, modules) {
  const viewable = modules.filter((module) => module.actions.view).map((module) => module.label);
  if (['admin', 'super_admin'].includes(roleCode)) return 'Monitor all modules';
  if (!viewable.length) return 'No module access';
  if (viewable.length > 6) return `Monitor ${viewable.length} modules`;
  return `Monitor ${viewable.join(', ')}`;
}

function wouldCycle(people, userId, managerId) {
  let cursor = managerId;
  const seen = new Set();
  while (cursor) {
    if (cursor === userId || seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = people.find((person) => person.id === cursor)?.reporting_manager_id || null;
  }
  return false;
}

function present(row, memberships, teams) {
  const mine = memberships.filter((item) => item.user_id === row.id);
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
    status: row.account_status === 'SUSPENDED' || row.account_status === 'INACTIVE' ? row.account_status : (row.employment_status || (row.is_active ? 'ACTIVE' : 'INACTIVE')),
    accountStatus: row.account_status || (row.is_active ? 'ACTIVE' : 'INACTIVE'),
    accessScope: row.access_scope || 'TEAM_ONLY',
    managerId: row.reporting_manager_id,
    managerName: row.manager_name || '',
    coManagerId: row.co_manager_id || '',
    coManagerName: row.co_manager_name || '',
    joiningDate: row.joining_date ? String(row.joining_date).slice(0, 10) : '',
    teams: mine.map((item) => {
      const team = teams.find((entry) => entry.id === item.team_id);
      return team ? { id: team.id, name: team.name, lead: item.role === 'TEAM_LEAD', primary: item.is_primary, role: item.role } : null;
    }).filter(Boolean),
  };
}

async function home(user) {
  const [people, roleRows, teamRows, memberships, grants] = await Promise.all([
    repository.employees(),
    repository.roles(),
    repository.teams(),
    repository.memberships(),
    repository.roleGrants(),
  ]);
  if (!grants.length) await ensureDefaults(roleRows);
  const roleGrants = grants.length ? grants : await repository.roleGrants();
  const employees = people.map((row) => present(row, memberships, teamRows));
  const byRole = new Map();
  employees.forEach((person) => {
    if (!byRole.has(person.roleCode)) byRole.set(person.roleCode, accessFor(person.roleCode, roleGrants, []));
  });
  const accessSummary = employees.map((person) => ({
    id: person.id,
    name: person.name,
    role: person.role,
    summary: summaryLine(person.roleCode, byRole.get(person.roleCode) || []),
  }));
  return {
    organization: 'CareYu Automation',
    access: { canManage: canManage(user) },
    kpis: {
      employees: employees.length,
      teams: teamRows.length,
      active: employees.filter((person) => person.status === 'ACTIVE').length,
      inactive: employees.filter((person) => person.status === 'INACTIVE').length,
      management: employees.filter((person) => ['admin', 'super_admin', 'management', 'project_manager'].includes(person.roleCode)).length,
      functional: employees.filter((person) => !['admin', 'super_admin', 'management', 'project_manager'].includes(person.roleCode)).length,
    },
    employees,
    teams: teamRows.map((row) => {
      const leads = employees.filter((person) => person.teams.some((team) => team.id === row.id && team.lead)).map((person) => person.name);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        department: row.department || '',
        lead: row.lead_name || leads[0] || '',
        leads,
        members: row.members,
        openTasks: row.open_tasks,
        overdueTasks: row.overdue_tasks,
        activeProjects: row.active_projects,
      };
    }),
    roles: roleRows.map((row) => ({ id: row.id, code: row.code, name: row.name })),
    modules: MODULES.map(([id, label]) => ({ id, label })),
    actions: ACTIONS,
    accessSummary,
  };
}

async function inputOf(body, currentId) {
  const first = clean(body.firstName, 60);
  const last = clean(body.lastName, 60);
  const fullName = clean(body.name, 150) || `${first} ${last}`.trim();
  const email = clean(body.email, 255).toLowerCase();
  const designation = clean(body.designation, 100);
  if (fullName.length < 2) throw new ApiError(400, 'Employee name is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, 'A valid email is required.');
  if (designation.length < 2) throw new ApiError(400, 'Designation is required.');
  const roles = await repository.roles();
  const role = roles.find((item) => item.id === Number(body.roleId) || item.code === body.roleCode);
  if (!role) throw new ApiError(400, 'Choose a role.');
  const status = ['ACTIVE', 'INACTIVE', 'ON_LEAVE'].includes(body.status) ? body.status : 'ACTIVE';
  const managerId = UUID.test(body.managerId || '') ? body.managerId : null;
  if (managerId && managerId === currentId) throw new ApiError(400, 'An employee cannot report to themselves.');
  if (managerId) {
    const people = await repository.employees();
    if (!people.some((person) => person.id === managerId)) throw new ApiError(400, 'Choose a valid reporting manager.');
    if (currentId && wouldCycle(people, currentId, managerId)) throw new ApiError(400, 'That reporting line would create a cycle.');
  }
  const employeeCode = clean(body.employeeCode, 40);
  if (await repository.emailTaken(email, currentId)) throw new ApiError(409, 'That email is already in use.');
  if (employeeCode && await repository.codeTaken(employeeCode, currentId)) throw new ApiError(409, 'That employee ID is already in use.');
  return {
    fullName,
    email,
    phone: clean(body.phone, 40),
    department: clean(body.department, 100),
    designation,
    roleId: role.id,
    employeeCode: employeeCode || null,
    status,
    joiningDate: day(body.joiningDate),
    managerId,
    teamId: UUID.test(body.teamId || '') ? body.teamId : '',
    secondaryTeamIds: [...new Set((Array.isArray(body.secondaryTeamIds) ? body.secondaryTeamIds : []).filter((id) => UUID.test(id) && id !== body.teamId))],
  };
}

async function syncTeams(userId, primaryId, secondaryIds) {
  const desired = [...new Set([primaryId, ...secondaryIds].filter(Boolean))];
  const memberships = await repository.memberships();
  const current = memberships.filter((item) => item.user_id === userId).map((item) => item.team_id);
  for (const teamId of desired) {
    await repository.setMembership(teamId, userId, { role: 'MEMBER', primary: teamId === primaryId });
  }
  if (primaryId) await repository.clearPrimary(userId, primaryId);
  for (const teamId of current) {
    if (!desired.includes(teamId)) await repository.removeMember(teamId, userId);
  }
}

async function create(user, body) {
  assertManage(user);
  const input = await inputOf(body, null);
  const password = String(body.password || '');
  if (password.length < 8) throw new ApiError(400, 'A temporary password of at least 8 characters is required.');
  input.passwordHash = await bcrypt.hash(password, 12);
  const id = await repository.insertEmployee(input);
  await syncTeams(id, input.teamId, input.secondaryTeamIds);
  await repository.log({ actorId: user.id, action: 'Employee created', userId: id, next: input.fullName });
  return id;
}

async function update(user, id, body) {
  assertManage(user);
  const people = await repository.employees();
  const current = people.find((person) => person.id === id);
  if (!current) throw new ApiError(404, 'Employee not found.');
  const input = await inputOf({ ...body, name: body.name || current.full_name }, id);
  const previousManager = current.reporting_manager_id || '';
  await repository.updateEmployee(id, input);
  await syncTeams(id, input.teamId, input.secondaryTeamIds);
  if (previousManager !== (input.managerId || '')) {
    await repository.log({ actorId: user.id, action: 'Reporting manager changed', userId: id, previous: previousManager, next: input.managerId || '' });
  } else {
    await repository.log({ actorId: user.id, action: 'Employee updated', userId: id, next: input.fullName });
  }
}

async function status(user, id, nextStatus) {
  assertManage(user);
  if (!['ACTIVE', 'INACTIVE', 'ON_LEAVE'].includes(nextStatus)) throw new ApiError(400, 'Choose a valid status.');
  const people = await repository.employees();
  const current = people.find((person) => person.id === id);
  if (!current) throw new ApiError(404, 'Employee not found.');
  await repository.setStatus(id, nextStatus);
  await repository.log({
    actorId: user.id,
    action: nextStatus === 'INACTIVE' ? 'Employee deactivated' : 'Employee status changed',
    userId: id,
    previous: current.employment_status,
    next: nextStatus,
  });
}

async function access(user, id) {
  const people = await repository.employees();
  const current = people.find((person) => person.id === id);
  if (!current) throw new ApiError(404, 'Employee not found.');
  const [grants, overrides, events] = await Promise.all([
    repository.roleGrants(),
    repository.userGrants(id),
    repository.activity(id),
  ]);
  return {
    modules: accessFor(current.role_code, grants, overrides),
    activity: events.map((row) => ({
      action: row.action,
      actor: row.actor || 'System',
      previous: row.previous_value,
      next: row.new_value,
      at: row.created_at,
    })),
  };
}

async function saveAccess(user, id, body) {
  assertManage(user);
  const people = await repository.employees();
  if (!people.some((person) => person.id === id)) throw new ApiError(404, 'Employee not found.');
  const grants = [];
  (body.modules || []).forEach((module) => {
    if (!MODULES.some(([item]) => item === module.id)) return;
    ACTIONS.forEach((action) => {
      if (typeof module.actions?.[action] === 'boolean') grants.push({ module: module.id, action, allowed: module.actions[action] });
    });
  });
  await repository.replaceAccess(id, grants);
  await repository.log({ actorId: user.id, action: 'Access permission changed', userId: id, next: `${grants.length} rules` });
}

async function addMember(user, teamId, body) {
  assertManage(user);
  if (!UUID.test(body.userId || '')) throw new ApiError(400, 'Choose an employee.');
  await repository.setMembership(teamId, body.userId, { role: body.lead ? 'TEAM_LEAD' : 'MEMBER', primary: Boolean(body.primary) });
  if (body.primary) await repository.clearPrimary(body.userId, teamId);
  await repository.log({ actorId: user.id, action: 'Team added', userId: body.userId, teamId, next: teamId });
}

async function removeMember(user, teamId, userId) {
  assertManage(user);
  const removed = await repository.removeMember(teamId, userId);
  if (!removed) throw new ApiError(404, 'Team member not found.');
  await repository.log({ actorId: user.id, action: 'Team removed', userId, teamId });
}

async function lead(user, teamId, userId, enabled) {
  assertManage(user);
  const updated = await repository.setLead(teamId, userId, Boolean(enabled));
  if (!updated) throw new ApiError(404, 'Team member not found.');
  await repository.log({ actorId: user.id, action: 'Team lead changed', userId, teamId, next: enabled ? 'Lead' : 'Member' });
}

module.exports = { home, create, update, status, access, saveAccess, addMember, removeMember, lead };
