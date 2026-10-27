const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const service = require('../services/organization.service');

const home = asyncHandler(async (req, res) => {
  const data = await service.home(req.user);
  sendSuccess(res, { message: 'Organization loaded.', data });
});

const create = asyncHandler(async (req, res) => {
  const id = await service.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Employee created.', data: { id } });
});

const update = asyncHandler(async (req, res) => {
  await service.update(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Employee updated.' });
});

const status = asyncHandler(async (req, res) => {
  await service.status(req.user, req.params.id, req.body?.status);
  sendSuccess(res, { message: 'Status updated.' });
});

const access = asyncHandler(async (req, res) => {
  const data = await service.access(req.user, req.params.id);
  sendSuccess(res, { message: 'Access loaded.', data });
});

const saveAccess = asyncHandler(async (req, res) => {
  await service.saveAccess(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'Access updated.' });
});

const addMember = asyncHandler(async (req, res) => {
  await service.addMember(req.user, req.params.teamId, req.body || {});
  sendSuccess(res, { message: 'Team membership updated.' });
});

const removeMember = asyncHandler(async (req, res) => {
  await service.removeMember(req.user, req.params.teamId, req.params.userId);
  sendSuccess(res, { message: 'Removed from team.' });
});

const lead = asyncHandler(async (req, res) => {
  await service.lead(req.user, req.params.teamId, req.params.userId, req.body?.lead);
  sendSuccess(res, { message: 'Team lead updated.' });
});

module.exports = { home, create, update, status, access, saveAccess, addMember, removeMember, lead };
