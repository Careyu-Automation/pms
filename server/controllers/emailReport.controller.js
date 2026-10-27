const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const reports = require('../services/emailReport.service');

const home = asyncHandler(async (req, res) => {
  const data = await reports.home(req.user, req.query || {});
  sendSuccess(res, { message: 'Email reports loaded.', data });
});

const detail = asyncHandler(async (req, res) => {
  const data = await reports.detail(req.user, req.params.id);
  sendSuccess(res, { message: 'Report loaded.', data });
});

const create = asyncHandler(async (req, res) => {
  const data = await reports.save(req.user, req.body || {}, null, Boolean(req.body?.schedule));
  sendSuccess(res, { status: 201, message: 'Report saved.', data });
});

const update = asyncHandler(async (req, res) => {
  const data = await reports.save(req.user, req.body || {}, req.params.id, Boolean(req.body?.schedule));
  sendSuccess(res, { message: 'Report saved.', data });
});

const duplicate = asyncHandler(async (req, res) => {
  const data = await reports.duplicate(req.user, req.params.id);
  sendSuccess(res, { status: 201, message: 'Report duplicated.', data });
});

const status = asyncHandler(async (req, res) => {
  const data = await reports.setReportStatus(req.user, req.params.id, req.body?.status);
  sendSuccess(res, { message: 'Report updated.', data });
});

const remove = asyncHandler(async (req, res) => {
  await reports.remove(req.user, req.params.id);
  sendSuccess(res, { message: 'Report deleted.' });
});

const preview = asyncHandler(async (req, res) => {
  const data = await reports.preview(req.user, req.body || {});
  sendSuccess(res, { message: 'Preview ready.', data });
});

const previewFile = asyncHandler(async (req, res) => {
  const file = await reports.previewFile(req.user, req.body || {}, req.query.format);
  sendFile(res, file);
});

const send = asyncHandler(async (req, res) => {
  const data = await reports.queueSend(req.user, req.params.id, { test: false });
  sendSuccess(res, { status: 202, message: 'Report queued.', data });
});

const test = asyncHandler(async (req, res) => {
  const data = await reports.queueSend(req.user, req.params.id, { test: true });
  sendSuccess(res, { status: 202, message: 'Test email queued.', data });
});

const history = asyncHandler(async (req, res) => {
  const data = await reports.history(req.user);
  sendSuccess(res, { message: 'Email history loaded.', data });
});

const run = asyncHandler(async (req, res) => {
  const data = await reports.runDetail(req.user, req.params.id);
  sendSuccess(res, { message: 'Delivery loaded.', data });
});

const download = asyncHandler(async (req, res) => {
  const file = await reports.downloadRun(req.user, req.params.id);
  sendFile(res, file);
});

const retry = asyncHandler(async (req, res) => {
  const data = await reports.retry(req.user, req.params.id);
  sendSuccess(res, { status: 202, message: 'Retry queued.', data });
});

const saveTemplate = asyncHandler(async (req, res) => {
  const data = await reports.saveTemplate(req.user, req.body || {}, req.params.id);
  sendSuccess(res, { message: 'Template saved.', data });
});

const readSettings = asyncHandler(async (req, res) => {
  const data = await reports.readSettings(req.user);
  sendSuccess(res, { message: 'Email settings loaded.', data });
});

const writeSettings = asyncHandler(async (req, res) => {
  const data = await reports.writeSettings(req.user, req.body || {});
  sendSuccess(res, { message: 'Email settings saved.', data });
});

function sendFile(res, file) {
  res.setHeader('Content-Type', file.type);
  res.setHeader('Content-Disposition', `attachment; filename="${file.name.replace(/"/g, '')}"`);
  res.send(file.body);
}

module.exports = {
  home, detail, create, update, duplicate, status, remove, preview, previewFile,
  send, test, history, run, download, retry, saveTemplate, readSettings, writeSettings,
};
