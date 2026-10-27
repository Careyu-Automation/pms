const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const requests = require('../services/procurement.service');

const home = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Procurement requests loaded.', data: await requests.home(req.user, req.query || {}) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Procurement request created.', data: await requests.create(req.user, req.body || {}) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Procurement request updated.', data: await requests.update(req.user, req.params.id, req.body || {}) });
});

const status = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Status updated.', data: await requests.setStatus(req.user, req.params.id, req.body?.status) });
});

const remove = asyncHandler(async (req, res) => {
  await requests.remove(req.user, req.params.id);
  sendSuccess(res, { message: 'Procurement request deleted.' });
});

module.exports = { home, create, update, status, remove };
