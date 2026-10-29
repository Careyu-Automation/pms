const ApiError = require('../utils/ApiError');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const repository = require('../db/team.repository');
const leaveRepository = require('../db/leave.repository');
const workload = require('./workload.service');
const { query } = require('../db');

const DEPARTMENTS = ['Engineering', 'Software', 'Robotics', 'Procurement', 'Execution', 'Vision', 'Sales & Marketing', 'Operations', 'Management', 'Other'];
const ROLES = new Set(['TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER', 'OVERSIGHT', 'PROJECT_COORDINATION']);
const PROJECT_ROLES = new Set(['PRIMARY', 'MAJOR', 'SUPPORTING', 'MINOR']);
const RULES = new Set(['TEAM_LEAD_ONLY', 'ANY_TEAM_MEMBER', 'PM_ONLY', 'ADMIN_ONLY', 'LEAD_AND_PM']);
const PLATFORMS = new Set(['TEAMS', 'MEET', 'ZOOM', 'OTHER']);
const REQUEST_STATUS = new Set(['REQUESTED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']);
const REQUEST_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function canDelete(user) {
  return ['admin', 'super_admin'].includes(user?.role?.code || '');
}

function leadsTeam(user, team) {
  if (!team || !user) return false;
  if (team.leadId === user.id) return true;
  return Array.isArray(team.leadIds) && team.leadIds.includes(user.id);
}

function isStrictAdmin(user) {
  return ['admin', 'super_admin'].includes(user?.role?.code || '');
}

function accessFor(user, team) {
  const lead = leadsTeam(user, team);
  return {
    canCreate: isAdmin(user),
    canManage: isAdmin(user) || lead,
    canArchive: isAdmin(user),
    canDelete: canDelete(user),
    canRequest: Boolean(user?.id),
    canEditMeetings: Boolean(user?.id),
  };
}

function assertCreate(user) {
  if (!isAdmin(user)) throw new ApiError(403, 'You do not have permission to create teams.');
}

function assertTeamManage(user, team) {
  if (!isAdmin(user) && !leadsTeam(user, team)) throw new ApiError(403, 'You do not have permission to change this team.');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

async function people() {
  const users = await userRepository.listActive();
  return users.map(toPublicUser).map((person) => ({
    id: person.id,
    fullName: person.fullName,
    email: person.email,
    designation: person.designation || '',
    department: person.department || '',
  }));
}

async function requireTeam(ref) {
  const team = await repository.findByRef(ref);
  if (!team) throw new ApiError(404, 'Team not found.');
  return team;
}

function slugCode(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  return base.length >= 2 ? base : 'team';
}

function teamInput(body, current) {
  const fields = {};
  const name = clean(body.name ?? current?.name, 120);
  const code = clean(body.code ?? current?.code, 40);
  if (name.length < 2) fields.name = 'Team name is required.';
  if (name.length > 120) fields.name = 'Team name is too long.';
  if (current && code.length < 2) fields.code = 'Team code is required.';
  const department = clean(body.department ?? current?.department, 100);
  if (department && !DEPARTMENTS.includes(department)) fields.department = 'Select a department from the list.';
  const status = body.status || current?.status || 'ACTIVE';
  if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) fields.status = 'Select a valid status.';
  const assignmentRule = body.assignmentRule || current?.assignmentRule || 'TEAM_LEAD_ONLY';
  if (!RULES.has(assignmentRule)) fields.assignmentRule = 'Select who can assign tasks.';
  const leadId = body.leadId === '' ? null : (body.leadId ?? current?.leadId ?? null);
  if (leadId && !UUID.test(leadId)) fields.leadId = 'Select a valid team lead.';
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], { fields });
  return {
    name,
    code,
    department,
    description: clean(body.description ?? current?.description, 4000),
    status,
    leadId: leadId || null,
    assignmentRule,
    category: clean(body.category ?? current?.category, 100),
  };
}

function meetingUrl(value) {
  let text = clean(value, 2000);
  if (!text) return '';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
  try {
    const url = new URL(text);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.')) return text;
  } catch {
    return '';
  }
  return '';
}

async function list(user, filters = {}) {
  const [teams, users, projects] = await Promise.all([
    repository.list(),
    people(),
    repository.projectChoices(),
  ]);
  const search = clean(filters.q, 80).toLowerCase();
  const visible = teams.filter((team) => {
    if (filters.status) {
      if (team.status !== filters.status) return false;
    } else if (team.status === 'ARCHIVED') return false;
    if (filters.department && team.department !== filters.department) return false;
    if (filters.leadId && team.leadId !== filters.leadId) return false;
    if (filters.assignmentRule && team.assignmentRule !== filters.assignmentRule) return false;
    if (!search) return true;
    return `${team.name} ${team.code} ${team.description} ${team.leadName} ${team.department} ${team.memberNames}`.toLowerCase().includes(search);
  }).map((team) => ({
    ...team,
    canManage: isAdmin(user) || leadsTeam(user, team),
    canEditMeetings: Boolean(user?.id),
  }));
  const leads = teams.filter((team) => team.leadId).map((team) => ({ id: team.leadId, name: team.leadName }));
  const uniqueLeads = [...new Map(leads.map((lead) => [lead.id, lead])).values()];
  const live = teams.filter((team) => team.status !== 'ARCHIVED');
  const summary = {
    teams: live.length,
    members: live.reduce((sum, team) => sum + team.members, 0),
    leads: new Set(live.flatMap((team) => [...(team.leadIds || []), team.leadId]).filter(Boolean)).size,
    openTasks: live.reduce((sum, team) => sum + team.activeTasks, 0),
    overdueTasks: live.reduce((sum, team) => sum + team.overdueTasks, 0),
    activeProjects: live.reduce((sum, team) => sum + team.activeProjects, 0),
  };
  return { teams: visible, summary, departments: DEPARTMENTS, leads: uniqueLeads, people: users, projects, access: accessFor(user) };
}

async function detail(ref, user) {
  const team = await requireTeam(ref);
  const [members, projects, tasks, activity, stats, users, meetings, requests] = await Promise.all([
    repository.listMembers(team.id),
    repository.listProjects(team.id),
    repository.listTasks(team.code),
    repository.listActivity(team.id),
    repository.memberTaskStats(team.code),
    people(),
    repository.listMeetings(team.id),
    repository.listRequests(team.id),
  ]);
  const metrics = await workload.weekMetrics(members.filter((member) => member.status === 'ACTIVE').map((member) => member.userId)).catch(() => []);
  const byUser = new Map(stats.map((item) => [item.userId, item]));
  const memberRows = members.map((member) => {
    const work = byUser.get(member.userId) || { activeTasks: 0, completedTasks: 0, overdueTasks: 0, estimatedHours: 0, actualHours: 0, progress: 0 };
    const utilization = work.estimatedHours > 0 ? Math.min(100, Math.round((work.actualHours / work.estimatedHours) * 100)) : 0;
    const projectCount = new Set(tasks.filter((task) => task.assigneeId === member.userId && task.projectId).map((task) => task.projectId)).size;
    return { ...member, ...work, utilization, projects: projectCount };
  });
  const loadByUser = new Map(metrics.map((row) => [row.id, row]));
  const open = tasks.filter((task) => !['COMPLETED', 'CANCELLED'].includes(task.status));
  const performance = {
    completed: tasks.filter((task) => task.status === 'COMPLETED').length,
    pending: open.length,
    overdue: team.overdueTasks,
    averageCompletion: team.completion,
    projectsSupported: projects.length,
  };
  return {
    team,
    members: memberRows,
    projects,
    tasks,
    activity,
    workload: {
      members: memberRows.filter((member) => member.status === 'ACTIVE').length,
      assigned: open.length,
      inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      completed: performance.completed,
      overdue: team.overdueTasks,
      assignedHours: metrics.reduce((sum, row) => sum + (row.assigned || 0), 0),
      loggedHours: metrics.reduce((sum, row) => sum + (row.logged || 0), 0),
      capacityHours: metrics.reduce((sum, row) => sum + (row.capacity || 0), 0),
      overloaded: metrics.filter((row) => row.status === 'OVER_CAPACITY' || row.status === 'OVERLOADED').length,
      rows: memberRows.map((row) => {
        const load = loadByUser.get(row.userId);
        if (!load) return row;
        return {
          ...row,
          capacity: load.capacity,
          assignedHours: load.assigned,
          loggedHours: load.logged,
          utilization: load.utilization || 0,
          loadStatus: load.status,
          openTasks: load.openTasks,
        };
      }),
    },
    performance,
    meetings,
    requests,
    capacity: metrics,
    people: users,
    departments: DEPARTMENTS,
    access: accessFor(user, team),
  };
}

async function create(user, body) {
  assertCreate(user);
  const input = teamInput(body);
  input.code = input.code || await uniqueCode(input.name);
  if (await repository.nameTaken(input.name)) {
    throw new ApiError(409, 'A team with this name already exists.', { fields: { name: 'A team with this name already exists.' } });
  }
  if (await repository.codeTaken(input.code)) {
    throw new ApiError(409, 'That team code is already in use.', { fields: { code: 'That team code is already in use.' } });
  }
  if (input.leadId) await assertUser(input.leadId);
  const meeting = body.meetingUrl ? meetingInput({ name: body.meetingName || 'Team meeting', url: body.meetingUrl, platform: body.meetingPlatform, isPrimary: true }) : null;
  const id = await repository.insertTeam(input, user.id);
  if (input.leadId) {
    await repository.insertMember(id, { userId: input.leadId, role: 'TEAM_LEAD', status: 'ACTIVE', joinedAt: new Date().toISOString().slice(0, 10) });
  }
  const memberIds = Array.isArray(body.memberIds) ? [...new Set(body.memberIds.map((value) => String(value || '')).filter(Boolean))] : [];
  for (const memberId of memberIds) {
    if (memberId === input.leadId) continue;
    await assertUser(memberId);
    await repository.insertMember(id, { userId: memberId, role: 'MEMBER', status: 'ACTIVE', joinedAt: new Date().toISOString().slice(0, 10) });
  }
  if (meeting) await repository.insertMeeting(id, meeting, user.id);
  await repository.addActivity(id, user.id, `${input.name} was created`);
  return repository.findByRef(id);
}

async function uniqueCode(name) {
  let code = slugCode(name);
  let n = 1;
  while (await repository.codeTaken(code)) {
    n += 1;
    code = `${slugCode(name).slice(0, 28)}-${n}`;
  }
  return code;
}

async function update(ref, user, body) {
  const current = await requireTeam(ref);
  assertTeamManage(user, current);
  const input = teamInput(body, current);
  if (await repository.nameTaken(input.name, current.id)) {
    throw new ApiError(409, 'A team with this name already exists.', { fields: { name: 'A team with this name already exists.' } });
  }
  if (await repository.codeTaken(input.code, current.id)) {
    throw new ApiError(409, 'That team code is already in use.', { fields: { code: 'That team code is already in use.' } });
  }
  if (input.leadId) await assertUser(input.leadId);
  const previousLead = current.leadName;
  await repository.updateTeam(current.id, input);
  if (input.code !== current.code) await repository.renameCode(current.code, input.code);
  if (input.leadId && input.leadId !== current.leadId) {
    await ensureLeadMember(current.id, input.leadId);
    const next = await repository.findByRef(current.id);
    await repository.addActivity(current.id, user.id, `Team lead added. Primary lead is now ${next.leadName || previousLead || 'assigned'}`);
  }
  if (input.status !== current.status) {
    await repository.addActivity(current.id, user.id, `Team status changed to ${input.status === 'ACTIVE' ? 'Active' : 'Inactive'}`);
  } else if (input.assignmentRule !== current.assignmentRule) {
    await repository.addActivity(current.id, user.id, `Assignment rule changed to ${input.assignmentRule === 'ANY_TEAM_MEMBER' ? 'any member can assign' : 'team lead assigns'}`);
  } else if (input.name !== current.name || input.code !== current.code || input.department !== current.department || input.description !== current.description) {
    await repository.addActivity(current.id, user.id, `${input.name} was updated`);
  }
  return repository.findByRef(current.id);
}

async function setStatus(ref, user, status) {
  if (!['ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) throw new ApiError(400, 'Select a valid status.');
  const existing = await requireTeam(ref);
  if (status === 'ARCHIVED' || existing.status === 'ARCHIVED') {
    if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can archive or restore a team.');
  } else {
    assertTeamManage(user, existing);
  }
  const team = existing;
  await repository.setStatus(team.id, status);
  const label = status === 'ARCHIVED' ? `${team.name} was archived` : status === 'INACTIVE' ? `${team.name} was deactivated` : `${team.name} was restored`;
  await repository.addActivity(team.id, user.id, label);
  return repository.findByRef(team.id);
}

async function remove(ref, user) {
  if (!canDelete(user)) throw new ApiError(403, 'Only an administrator can delete a team.');
  const team = await requireTeam(ref);
  const counts = await repository.relationshipCounts(team);
  const openTasks = Number((await query(
    `SELECT COUNT(*)::int AS n FROM project_tasks WHERE team_code = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
    [team.code],
  )).rows[0].n);
  const pending = Number((await query(
    `SELECT COUNT(*)::int AS n FROM team_work_requests WHERE team_id = $1 AND status IN ('REQUESTED', 'UNDER_REVIEW', 'ACCEPTED', 'ASSIGNED', 'IN_PROGRESS')`,
    [team.id],
  )).rows[0].n);
  if (Number(counts.members) || Number(counts.projects) || openTasks || pending || Number(counts.products)) {
    throw new ApiError(409, `This team has ${openTasks} open tasks, ${pending} open work requests, and ${Number(counts.projects)} linked projects. Archive the team instead.`);
  }
  await repository.removeTeam(team.id);
  return { id: team.id };
}

async function assertUser(userId) {
  const users = await people();
  if (!users.some((person) => person.id === userId)) throw new ApiError(400, 'Select a valid person.');
}

async function ensureLeadMember(teamId, userId) {
  const members = await repository.listMembers(teamId);
  const existing = members.find((member) => member.userId === userId);
  if (existing) {
    await repository.updateMember(teamId, existing.id, { role: 'TEAM_LEAD', status: 'ACTIVE', joinedAt: existing.joinedAt || new Date().toISOString().slice(0, 10) });
    return;
  }
  await repository.insertMember(teamId, { userId, role: 'TEAM_LEAD', status: 'ACTIVE', joinedAt: new Date().toISOString().slice(0, 10) });
}

function memberInput(body, current) {
  const role = body.role || current?.role || 'MEMBER';
  const status = body.status || current?.status || 'ACTIVE';
  if (!ROLES.has(role)) throw new ApiError(400, 'Select a valid team role.');
  if (!['ACTIVE', 'INACTIVE'].includes(status)) throw new ApiError(400, 'Select a valid status.');
  const joinedAt = cleanDate(body.joinedAt || current?.joined_at) || new Date().toISOString().slice(0, 10);
  return { role, status, joinedAt };
}

async function addMember(ref, user, body) {
  const team = await requireTeam(ref);
  assertTeamManage(user, team);
  if (team.status === 'ARCHIVED') throw new ApiError(400, 'Archived teams cannot receive new members.');
  const userId = String(body.userId || '');
  if (!UUID.test(userId)) throw new ApiError(400, 'Select a user.');
  await assertUser(userId);
  const members = await repository.listMembers(team.id);
  if (members.some((member) => member.userId === userId && member.status === 'ACTIVE')) {
    throw new ApiError(409, 'That person is already an active member of this team.');
  }
  const input = memberInput(body);
  if (input.role === 'TEAM_LEAD' && !team.leadId) {
    await repository.updateTeam(team.id, { ...team, leadId: userId });
  }
  const inactive = members.find((member) => member.userId === userId);
  let memberId;
  if (inactive) {
    await repository.updateMember(team.id, inactive.id, input);
    memberId = inactive.id;
  } else {
    memberId = await repository.insertMember(team.id, { userId, ...input });
  }
  const person = (await people()).find((item) => item.id === userId);
  await repository.addActivity(team.id, user.id, `${person?.fullName || 'A member'} was added to ${team.name}`);
  if (input.role === 'TEAM_LEAD') await repository.addActivity(team.id, user.id, `${person?.fullName || 'A member'} is a team lead`);
  await leaveRepository.notify([userId], `Added to ${team.name}`, `You were added to ${team.name}.`, `/teams/${team.id}`);
  return memberId;
}

async function updateMember(ref, memberId, user, body) {
  const team = await requireTeam(ref);
  assertTeamManage(user, team);
  const current = await repository.findMember(team.id, memberId);
  if (!current) throw new ApiError(404, 'Team member not found.');
  const input = memberInput(body, current);
  const person = (await people()).find((item) => item.id === current.user_id);
  if (current.role === 'TEAM_LEAD' && input.role !== 'TEAM_LEAD') {
    const leads = (await repository.listMembers(team.id)).filter((member) => member.role === 'TEAM_LEAD' && member.status === 'ACTIVE');
    if (leads.length <= 1 && !body.allowLeaderless) {
      throw new ApiError(409, 'This is the only team lead. Assign another lead before removing this role.');
    }
    await repository.addActivity(team.id, user.id, `${person?.fullName || 'A member'} is no longer a team lead`);
    await leaveRepository.notify([current.user_id], `Lead role removed on ${team.name}`, 'You are still a member of the team.', `/teams/${team.id}`);
  }
  if (input.role === 'TEAM_LEAD' && current.role !== 'TEAM_LEAD') {
    if (!team.leadId) await repository.updateTeam(team.id, { ...team, leadId: current.user_id });
    await repository.addActivity(team.id, user.id, `${person?.fullName || 'A member'} is a team lead`);
    await leaveRepository.notify([current.user_id], `You are a lead of ${team.name}`, 'You can assign work requests for this team.', `/teams/${team.id}`);
  }
  await repository.updateMember(team.id, memberId, input);
  return repository.findMember(team.id, memberId);
}

async function removeMember(ref, memberId, user, allowLeaderless) {
  const team = await requireTeam(ref);
  assertTeamManage(user, team);
  const current = await repository.findMember(team.id, memberId);
  if (!current) throw new ApiError(404, 'Team member not found.');
  if (current.role === 'TEAM_LEAD') {
    const leads = (await repository.listMembers(team.id)).filter((member) => member.role === 'TEAM_LEAD' && member.status === 'ACTIVE');
    if (leads.length <= 1 && !allowLeaderless) {
      throw new ApiError(409, 'This is the only team lead. Assign another lead before removing this member.');
    }
  }
  const removed = await repository.deleteMember(team.id, memberId);
  if (removed.user_id === team.leadId) {
    const nextLead = (await repository.listMembers(team.id)).find((member) => member.role === 'TEAM_LEAD');
    await repository.updateTeam(team.id, { ...team, leadId: nextLead?.userId || null });
  }
  const person = (await people()).find((item) => item.id === removed.user_id);
  await repository.addActivity(team.id, user.id, `${person?.fullName || 'A member'} was removed from ${team.name}. Existing task assignments remain.`);
  await leaveRepository.notify([removed.user_id], `Removed from ${team.name}`, 'Your existing tasks were not deleted.', `/teams`);
  return { id: memberId };
}

function projectInput(body) {
  const teamRole = body.teamRole || 'SUPPORTING';
  if (!PROJECT_ROLES.has(teamRole)) throw new ApiError(400, 'Select a valid team role.');
  const contributionPercent = Math.round(Number(body.contributionPercent ?? 0));
  if (!Number.isFinite(contributionPercent) || contributionPercent < 0 || contributionPercent > 100) {
    throw new ApiError(400, 'Contribution must be between 0 and 100.');
  }
  return { teamRole, contributionPercent };
}

async function projectsFor(projectId) {
  const project = await query('SELECT id, title FROM projects WHERE id = $1', [projectId]);
  if (!project.rows[0]) throw new ApiError(404, 'Project not found.');
  return { project: project.rows[0], links: await repository.listProjectLinks(projectId) };
}

async function assignToProject(projectId, user, body) {
  assertCreate(user);
  const { project } = await projectsFor(projectId);
  const team = await requireTeam(body.teamId);
  const input = projectInput(body);
  try {
    await repository.assignProject(projectId, team.id, input);
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'That team is already on this project.');
    throw error;
  }
  await repository.addActivity(team.id, user.id, `${team.name} was assigned to ${project.title}`);
  return repository.listProjectLinks(projectId);
}

async function updateProjectTeam(projectId, teamRef, user, body) {
  assertCreate(user);
  const { project } = await projectsFor(projectId);
  const team = await requireTeam(teamRef);
  const current = (await repository.listProjectLinks(projectId)).find((item) => item.teamId === team.id);
  if (!current) throw new ApiError(404, 'That team is not on this project.');
  const input = projectInput(body);
  await repository.updateProjectLink(projectId, team.id, input);
  if (input.teamRole !== current.teamRole) {
    await repository.addActivity(team.id, user.id, `${team.name} role on ${project.title} changed to ${input.teamRole}`);
  }
  if (input.contributionPercent !== current.contributionPercent) {
    await repository.addActivity(team.id, user.id, `${team.name} contribution updated`);
  }
  return repository.listProjectLinks(projectId);
}

async function removeFromProject(projectId, teamRef, user) {
  assertCreate(user);
  const { project } = await projectsFor(projectId);
  const team = await requireTeam(teamRef);
  const removed = await repository.removeProjectLink(projectId, team.id);
  if (!removed) throw new ApiError(404, 'That team is not on this project.');
  await repository.addActivity(team.id, user.id, `${team.name} was removed from ${project.title}`);
  return repository.listProjectLinks(projectId);
}

async function assertTeamCode(code) {
  if (!code) return;
  if (await repository.codeExists(code)) return;
  throw new ApiError(400, 'Select a valid team.');
}

async function assertCanAssign(user, teamCode) {
  if (!teamCode) return;
  const team = await repository.findByRef(teamCode);
  if (!team) throw new ApiError(400, 'Select a valid team.');
  if (team.status === 'ARCHIVED') throw new ApiError(400, 'Archived teams cannot receive new tasks.');
  const rule = team.assignmentRule || 'TEAM_LEAD_ONLY';
  if (rule === 'ADMIN_ONLY') {
    if (isStrictAdmin(user)) return;
    throw new ApiError(403, 'Only an administrator can assign work for this team.');
  }
  if (rule === 'PM_ONLY') {
    if (isAdmin(user)) return;
    throw new ApiError(403, 'Only a project manager can assign work for this team.');
  }
  if (isAdmin(user) || leadsTeam(user, team)) return;
  if (rule === 'ANY_TEAM_MEMBER') {
    const ids = await repository.memberTeamIds(user.id);
    if (ids.includes(team.id)) return;
  }
  throw new ApiError(403, 'Only the team lead can assign work for this team.');
}

function meetingInput(body, current) {
  const name = clean(body.name ?? current?.name, 160);
  const url = meetingUrl(body.url ?? current?.url);
  const platform = body.platform || current?.platform || 'OTHER';
  if (name.length < 2) throw new ApiError(400, 'Meeting name is required.');
  if (!url) throw new ApiError(400, 'Enter a valid meeting link.');
  if (!PLATFORMS.has(platform)) throw new ApiError(400, 'Select a meeting platform.');
  const existing = current ? 1 : 0;
  return {
    name,
    url,
    platform,
    description: clean(body.description ?? current?.description, 2000),
    isPrimary: body.isPrimary === undefined ? (current ? current.isPrimary : existing === 0) : Boolean(body.isPrimary),
  };
}

async function allMeetings(user) {
  const [meetings, directory] = await Promise.all([
    repository.listAllMeetings(),
    list(user, {}),
  ]);
  return {
    meetings,
    teams: directory.teams.filter((team) => team.status === 'ACTIVE').map((team) => ({
      id: team.id,
      name: team.name,
      canManage: true,
    })),
  };
}

async function saveMeeting(ref, user, body, meetingId) {
  const team = await requireTeam(ref);
  if (!user?.id) throw new ApiError(401, 'Sign in to continue.');
  if (team.status === 'ARCHIVED') throw new ApiError(400, 'Archived teams cannot be changed.');
  const current = meetingId ? await repository.findMeeting(team.id, meetingId) : null;
  if (meetingId && !current) throw new ApiError(404, 'Meeting not found.');
  const input = meetingInput(body, current);
  if (!current && body.isPrimary === undefined) {
    const meetings = await repository.listMeetings(team.id);
    input.isPrimary = meetings.length === 0;
  }
  if (current) await repository.updateMeeting(team.id, meetingId, input);
  else await repository.insertMeeting(team.id, input, user.id);
  await repository.addActivity(team.id, user.id, current ? `Meeting updated: ${input.name}` : `Meeting added: ${input.name}`);
  return repository.listMeetings(team.id);
}

async function removeMeeting(ref, meetingId, user) {
  const team = await requireTeam(ref);
  if (!user?.id) throw new ApiError(401, 'Sign in to continue.');
  if (team.status === 'ARCHIVED') throw new ApiError(400, 'Archived teams cannot be changed.');
  const current = await repository.findMeeting(team.id, meetingId);
  if (!current) throw new ApiError(404, 'Meeting not found.');
  await repository.deleteMeeting(team.id, meetingId);
  await repository.addActivity(team.id, user.id, `Meeting removed: ${current.name}`);
  return repository.listMeetings(team.id);
}

async function createRequest(ref, user, body) {
  const team = await requireTeam(ref);
  if (team.status === 'ARCHIVED') throw new ApiError(400, 'Archived teams cannot receive work requests.');
  const title = clean(body.title, 200);
  const description = clean(body.description, 4000);
  if (title.length < 2) throw new ApiError(400, 'Request title is required.');
  const startDate = cleanDate(body.startDate);
  const deadline = cleanDate(body.dueDate || body.deadline);
  if (startDate && deadline && deadline < startDate) throw new ApiError(400, 'Due date cannot be before the start date.');
  const hours = Math.max(0, Number(body.hours) || 0);
  const minutes = Math.max(0, Number(body.minutes) || 0);
  const estimatedMinutes = Math.round(hours * 60 + minutes) || Math.max(0, Number(body.estimatedMinutes) || 0);
  const checklist = Array.isArray(body.checklist)
    ? body.checklist.map((item) => clean(item.text || item, 200)).filter((text) => text.length > 0).slice(0, 30).map((text) => ({ text, done: false }))
    : [];
  const priority = REQUEST_PRIORITY.has(body.priority) ? body.priority : 'MEDIUM';
  const projectId = UUID.test(body.projectId || '') ? body.projectId : null;
  const id = await repository.insertRequest(team.id, {
    requesterId: user.id,
    projectId,
    title,
    description,
    priority,
    deadline,
    startDate,
    estimatedMinutes,
    tag: clean(body.tag, 80),
    checklist,
  });
  await repository.addActivity(team.id, user.id, `Work request created: ${title}`);
  const leads = [...new Set([...(team.leadIds || []), team.leadId].filter(Boolean))];
  if (leads.length) {
    await leaveRepository.notify(leads, `Work request for ${team.name}`, title, `/teams/${team.id}?tab=requests`);
  }
  return id;
}

async function setRequest(ref, requestId, user, body) {
  const team = await requireTeam(ref);
  assertTeamManage(user, team);
  if (!UUID.test(requestId || '')) throw new ApiError(400, 'Request is not valid.');
  const status = String(body.status || '');
  if (!REQUEST_STATUS.has(status)) throw new ApiError(400, 'Select a valid request status.');
  const assignedTo = UUID.test(body.assignedTo || '') ? body.assignedTo : null;
  const current = (await repository.listRequests(team.id)).find((row) => row.id === requestId);
  if (!current) throw new ApiError(404, 'Work request not found.');
  let taskId = current.taskId || null;
  if (status === 'ASSIGNED') {
    if (!assignedTo) throw new ApiError(400, 'Choose a team member to assign this request.');
    const members = await repository.listMembers(team.id);
    const member = members.find((item) => item.userId === assignedTo && item.status === 'ACTIVE');
    if (!member) throw new ApiError(400, 'Only members of this team can be assigned.');
    if (current.projectId && !taskId) {
      const planningRepository = require('../db/planning.repository');
      const today = new Date().toISOString().slice(0, 10);
      const startDate = current.startDate || today;
      const endDate = current.deadline && current.deadline >= startDate ? current.deadline : startDate;
      taskId = await planningRepository.insertTask(current.projectId, {
        phaseId: null,
        title: current.title,
        description: current.description,
        assigneeId: assignedTo,
        teamCode: team.code,
        priority: current.priority === 'URGENT' ? 'CRITICAL' : (['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(current.priority) ? current.priority : 'MEDIUM'),
        status: 'NOT_STARTED',
        startDate,
        endDate,
        estimatedHours: current.estimatedMinutes ? Math.round((current.estimatedMinutes / 60) * 10) / 10 : null,
        progress: 0,
        tags: current.tag || '',
      }, user.id);
    }
    await leaveRepository.notify([assignedTo], `You have been assigned: ${current.title}`, `${team.name}${current.projectTitle ? ` · ${current.projectTitle}` : ''}`, `/teams/${team.id}?tab=requests`);
  }
  if (status === 'REJECTED') {
    await leaveRepository.notify([current.requesterId], `Work request declined: ${current.title}`, team.name, `/teams/${team.id}?tab=requests`);
  }
  const updated = await repository.updateRequest(team.id, requestId, { status, assignedTo, taskId });
  if (!updated) throw new ApiError(404, 'Work request not found.');
  await repository.addActivity(team.id, user.id, `Work request ${status.toLowerCase().replaceAll('_', ' ')}: ${current.title}`);
  return repository.listRequests(team.id);
}

module.exports = {
  list,
  detail,
  create,
  update,
  setStatus,
  remove,
  addMember,
  updateMember,
  removeMember,
  projectsFor,
  assignToProject,
  updateProjectTeam,
  removeFromProject,
  assertTeamCode,
  assertCanAssign,
  allMeetings,
  saveMeeting,
  removeMeeting,
  createRequest,
  setRequest,
};
