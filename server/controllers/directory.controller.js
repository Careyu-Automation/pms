const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const service = require('../services/directory.service');

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.user, {
    search: req.query.search || '',
    status: req.query.status || '',
    role: req.query.role || '',
    teamId: req.query.teamId || '',
    department: req.query.department || '',
    activeOnly: req.query.activeOnly === 'true',
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  sendSuccess(res, { message: 'Users loaded.', data });
});

const get = asyncHandler(async (req, res) => {
  const data = await service.detail(req.user, req.params.id);
  sendSuccess(res, { message: 'User loaded.', data });
});

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'User created.', data });
});

const update = asyncHandler(async (req, res) => {
  const user = await service.update(req.user, req.params.id, req.body || {});
  sendSuccess(res, { message: 'User updated.', data: { user } });
});

const setStatus = asyncHandler(async (req, res) => {
  const user = await service.setStatus(req.user, req.params.id, req.body?.status);
  sendSuccess(res, { message: 'Account status updated.', data: { user } });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await service.resetPassword(req.user, req.params.id);
  sendSuccess(res, { message: 'Password reset.', data });
});

const resetInitialPassword = asyncHandler(async (req, res) => {
  const user = await service.resetInitialPassword(req.user, req.params.id);
  sendSuccess(res, { message: 'Initial password restored. The employee must choose a new password at the next sign-in.', data: { user } });
});

const remove = asyncHandler(async (req, res) => {
  const data = await service.remove(req.user, req.params.id);
  sendSuccess(res, { message: data.archived ? 'User archived.' : 'User deleted.', data });
});

module.exports = { list, get, create, update, setStatus, resetPassword, resetInitialPassword, remove };
