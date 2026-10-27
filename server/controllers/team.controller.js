const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const teams = require('../services/team.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertUuid(id, label) {
  if (!UUID.test(id || '')) throw new ApiError(400, `${label} is not valid.`);
}

const list = asyncHandler(async (req, res) => {
  const data = await teams.list(req.user, req.query || {});
  sendSuccess(res, { message: 'Teams loaded.', data });
});

const get = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Team loaded.', data });
});

const create = asyncHandler(async (req, res) => {
  const team = await teams.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Team created.', data: { team } });
});

const update = asyncHandler(async (req, res) => {
  const team = await teams.update(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Team updated.', data: { team } });
});

const setStatus = asyncHandler(async (req, res) => {
  const team = await teams.setStatus(req.params.id, req.user, req.body?.status);
  sendSuccess(res, { message: 'Team status updated.', data: { team } });
});

const remove = asyncHandler(async (req, res) => {
  await teams.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Team deleted.' });
});

const addMember = asyncHandler(async (req, res) => {
  await teams.addMember(req.params.id, req.user, req.body || {});
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { status: 201, message: 'Member added.', data });
});

const updateMember = asyncHandler(async (req, res) => {
  assertUuid(req.params.memberId, 'Member id');
  await teams.updateMember(req.params.id, req.params.memberId, req.user, req.body || {});
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Member updated.', data });
});

const removeMember = asyncHandler(async (req, res) => {
  assertUuid(req.params.memberId, 'Member id');
  await teams.removeMember(req.params.id, req.params.memberId, req.user, req.query.allowLeaderless === '1');
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Member removed.', data });
});

const members = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Members loaded.', data: { members: data.members } });
});

const teamProjects = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Team projects loaded.', data: { projects: data.projects } });
});

const tasks = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Team tasks loaded.', data: { tasks: data.tasks } });
});

const allMeetings = asyncHandler(async (req, res) => {
  const data = await teams.allMeetings(req.user);
  sendSuccess(res, { message: 'Meetings loaded.', data });
});

const meetings = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Meetings loaded.', data: { meetings: data.meetings } });
});

const saveMeeting = asyncHandler(async (req, res) => {
  const rows = await teams.saveMeeting(req.params.id, req.user, req.body || {}, req.params.meetingId);
  sendSuccess(res, { status: req.params.meetingId ? 200 : 201, message: 'Meeting saved.', data: { meetings: rows } });
});

const removeMeeting = asyncHandler(async (req, res) => {
  const rows = await teams.removeMeeting(req.params.id, req.params.meetingId, req.user);
  sendSuccess(res, { message: 'Meeting removed.', data: { meetings: rows } });
});

const requests = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Work requests loaded.', data: { requests: data.requests } });
});

const createRequest = asyncHandler(async (req, res) => {
  await teams.createRequest(req.params.id, req.user, req.body || {});
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { status: 201, message: 'Work request submitted.', data });
});

const setRequest = asyncHandler(async (req, res) => {
  const rows = await teams.setRequest(req.params.id, req.params.requestId, req.user, req.body || {});
  sendSuccess(res, { message: 'Work request updated.', data: { requests: rows } });
});

const activity = asyncHandler(async (req, res) => {
  const data = await teams.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Team activity loaded.', data: { activity: data.activity } });
});

const projectTeams = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'Project id');
  const data = await teams.projectsFor(req.params.id);
  sendSuccess(res, { message: 'Project teams loaded.', data: { teams: data.links } });
});

const assignProjectTeam = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'Project id');
  const links = await teams.assignToProject(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Team assigned.', data: { teams: links } });
});

const updateProjectTeam = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'Project id');
  const links = await teams.updateProjectTeam(req.params.id, req.params.teamId, req.user, req.body || {});
  sendSuccess(res, { message: 'Team contribution updated.', data: { teams: links } });
});

const removeProjectTeam = asyncHandler(async (req, res) => {
  assertUuid(req.params.id, 'Project id');
  const links = await teams.removeFromProject(req.params.id, req.params.teamId, req.user);
  sendSuccess(res, { message: 'Team removed from project.', data: { teams: links } });
});

module.exports = {
  list,
  get,
  create,
  update,
  setStatus,
  remove,
  addMember,
  updateMember,
  removeMember,
  members,
  teamProjects,
  tasks,
  allMeetings,
  meetings,
  saveMeeting,
  removeMeeting,
  requests,
  createRequest,
  setRequest,
  activity,
  projectTeams,
  assignProjectTeam,
  updateProjectTeam,
  removeProjectTeam,
};
