const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const leave = require('../services/leave.service');

const overview = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave overview loaded.', data: await leave.overview(req.user) });
});

const types = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave types loaded.', data: { types: await leave.types() } });
});

const balance = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave balance loaded.', data: await leave.balance(req.user, req.query || {}) });
});

const list = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave requests loaded.', data: await leave.requests(req.user, req.query || {}) });
});

const pending = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Pending approvals loaded.', data: await leave.pending(req.user) });
});

const create = asyncHandler(async (req, res) => {
  const file = req.file;
  const body = {
    ...(req.body || {}),
    attachmentName: file ? file.originalname : '',
    attachmentPath: file ? file.filename : '',
  };
  const request = await leave.createLeave(req.user, body);
  sendSuccess(res, { status: 201, message: 'Leave request submitted.', data: { request } });
});

const detail = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave request loaded.', data: await leave.leaveDetail(req.user, req.params.id) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave request updated.', data: await leave.updateLeave(req.user, req.params.id, req.body || {}) });
});

const withdraw = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave request withdrawn.', data: await leave.withdrawLeave(req.user, req.params.id) });
});

const approve = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave request approved.', data: await leave.approveLeave(req.user, req.params.id, req.body || {}) });
});

const reject = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Leave request rejected.', data: await leave.rejectLeave(req.user, req.params.id, req.body || {}) });
});

const attachment = asyncHandler(async (req, res) => {
  const data = await leave.leaveDetail(req.user, req.params.id);
  const name = data.request.attachmentPath;
  if (!name) return res.status(404).json({ success: false, message: 'No attachment on this request.' });
  const file = path.resolve(path.join(__dirname, '..', 'uploads', 'leave', name));
  const root = path.resolve(path.join(__dirname, '..', 'uploads', 'leave'));
  if (!file.startsWith(root) || !fs.existsSync(file)) {
    return res.status(404).json({ success: false, message: 'Attachment not found.' });
  }
  return res.download(file, data.request.attachmentName || 'attachment');
});

const permissions = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Permission requests loaded.', data: await leave.requests(req.user, { ...(req.query || {}), kind: 'PERMISSION' }) });
});

const createPermission = asyncHandler(async (req, res) => {
  const request = await leave.createPermission(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Permission request submitted.', data: { request } });
});

const permission = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Permission request loaded.', data: await leave.permissionDetail(req.user, req.params.id) });
});

const withdrawPermission = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Permission request withdrawn.', data: await leave.withdrawPermission(req.user, req.params.id) });
});

const approvePermission = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Permission request approved.', data: await leave.approvePermission(req.user, req.params.id, req.body || {}) });
});

const rejectPermission = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Permission request rejected.', data: await leave.rejectPermission(req.user, req.params.id, req.body || {}) });
});

const holiday = asyncHandler(async (req, res) => {
  const saved = await leave.saveHoliday(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Holiday saved.', data: { holiday: saved } });
});

const allocation = asyncHandler(async (req, res) => {
  const balances = await leave.updateAllocation(req.user, req.body || {});
  sendSuccess(res, { message: 'Allocation updated.', data: { balances } });
});

const holidays = asyncHandler(async (req, res) => {
  const calendar = await leave.calendar();
  sendSuccess(res, { message: 'Calendar loaded.', data: calendar });
});

module.exports = {
  overview,
  types,
  balance,
  list,
  pending,
  create,
  detail,
  update,
  withdraw,
  approve,
  reject,
  attachment,
  permissions,
  createPermission,
  permission,
  withdrawPermission,
  approvePermission,
  rejectPermission,
  holiday,
  holidays,
  allocation,
};
