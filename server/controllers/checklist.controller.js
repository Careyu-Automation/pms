const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const checklists = require('../services/checklist.service');

const list = asyncHandler(async (req, res) => {
  const data = await checklists.list(req.user, req.query || {});
  sendSuccess(res, { message: 'Checklists loaded.', data });
});

const users = asyncHandler(async (req, res) => {
  const people = await checklists.users();
  sendSuccess(res, { message: 'People loaded.', data: { users: people } });
});

const get = asyncHandler(async (req, res) => {
  const checklist = await checklists.detail(req.params.id, req.user);
  sendSuccess(res, { message: 'Checklist loaded.', data: { checklist } });
});

const create = asyncHandler(async (req, res) => {
  const checklist = await checklists.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Checklist created.', data: { checklist } });
});

const update = asyncHandler(async (req, res) => {
  const checklist = await checklists.update(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Checklist updated.', data: { checklist } });
});

const remove = asyncHandler(async (req, res) => {
  await checklists.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Checklist deleted.' });
});

const addItem = asyncHandler(async (req, res) => {
  const checklist = await checklists.addItem(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Item added.', data: { checklist } });
});

const updateItem = asyncHandler(async (req, res) => {
  const checklist = await checklists.updateItem(req.params.id, req.params.itemId, req.user, req.body || {});
  sendSuccess(res, { message: 'Item updated.', data: { checklist } });
});

const removeItem = asyncHandler(async (req, res) => {
  const checklist = await checklists.removeItem(req.params.id, req.params.itemId, req.user);
  sendSuccess(res, { message: 'Item removed.', data: { checklist } });
});

const toggleItem = asyncHandler(async (req, res) => {
  const data = await checklists.toggleItem(req.params.id, req.params.itemId, req.user);
  sendSuccess(res, { message: 'Item updated.', data });
});

const setVisibility = asyncHandler(async (req, res) => {
  const checklist = await checklists.setVisibility(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Visibility updated.', data: { checklist } });
});

module.exports = {
  list,
  users,
  get,
  create,
  update,
  remove,
  addItem,
  updateItem,
  removeItem,
  toggleItem,
  setVisibility,
};
