const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const escalations = require('../services/escalation.service');

const home = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalations loaded.', data: await escalations.home(req.user, req.query || {}) });
});

const detail = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation loaded.', data: await escalations.detail(req.user, req.params.id) });
});

const create = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Escalation created.', data: await escalations.create(req.user, req.body || {}) });
});

const update = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation updated.', data: await escalations.update(req.user, req.params.id, req.body || {}) });
});

const remove = asyncHandler(async (req, res) => {
  await escalations.remove(req.user, req.params.id);
  sendSuccess(res, { message: 'Escalation deleted.' });
});

const assign = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation assigned.', data: await escalations.assign(req.user, req.params.id, req.body || {}) });
});

const status = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Status updated.', data: await escalations.setStatus(req.user, req.params.id, req.body?.status) });
});

const escalate = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation raised further.', data: await escalations.escalate(req.user, req.params.id, req.body || {}) });
});

const comment = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Comment added.', data: await escalations.comment(req.user, req.params.id, req.body?.message) });
});

const editComment = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Comment updated.', data: await escalations.editComment(req.user, req.params.id, req.params.commentId, req.body?.message) });
});

const removeComment = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Comment removed.', data: await escalations.removeComment(req.user, req.params.id, req.params.commentId) });
});

const resolve = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation resolved.', data: await escalations.resolve(req.user, req.params.id, req.body || {}) });
});

const reopen = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation reopened.', data: await escalations.setStatus(req.user, req.params.id, 'OPEN') });
});

const archive = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Escalation archived.', data: await escalations.archive(req.user, req.params.id) });
});

const duplicate = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Escalation duplicated.', data: await escalations.duplicate(req.user, req.params.id) });
});

const attach = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Attachment added.', data: await escalations.attach(req.user, req.params.id, req.file) });
});

const download = asyncHandler(async (req, res) => {
  const file = await escalations.fileFor(req.user, req.params.id, req.params.fileId);
  res.download(path.join(__dirname, '..', 'uploads', 'escalations', file.stored_name), file.file_name);
});

const removeFile = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Attachment removed.', data: await escalations.removeFile(req.user, req.params.id, req.params.fileId) });
});

const exportFile = asyncHandler(async (req, res) => {
  const file = await escalations.exportFile(req.user, req.query || {});
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.name}"`);
  res.send(file.body);
});

module.exports = {
  home, detail, create, update, remove, assign, status, escalate, comment, editComment, removeComment,
  resolve, reopen, archive, duplicate, attach, download, removeFile, exportFile,
};
