const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const daily = require('../services/dailyWork.service');
const { excel, pdf } = require('../services/dailyWorkExport');

const list = asyncHandler(async (req, res) => {
  const data = await daily.list(req.user, req.query || {});
  sendSuccess(res, { message: 'Daily work updates loaded.', data });
});

const summary = asyncHandler(async (req, res) => {
  const data = await daily.summary(req.user, req.query || {});
  sendSuccess(res, { message: 'Summary loaded.', data });
});

const employee = asyncHandler(async (req, res) => {
  const data = await daily.forEmployee(req.user, req.params.employeeId, req.query || {});
  sendSuccess(res, { message: 'Employee updates loaded.', data });
});

const history = asyncHandler(async (req, res) => {
  const ref = req.params.taskId || req.params.id;
  const update = await daily.detailUpdate(ref, req.user).catch((error) => {
    if (error.statusCode === 404) return null;
    throw error;
  });
  const data = await daily.history(update ? update.workItemId : ref, req.user);
  sendSuccess(res, { message: 'Work history loaded.', data });
});

const get = asyncHandler(async (req, res) => {
  const update = await daily.detailUpdate(req.params.id, req.user);
  sendSuccess(res, { message: 'Update loaded.', data: { update } });
});

const create = asyncHandler(async (req, res) => {
  const update = await daily.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Daily work update saved.', data: { update } });
});

const update = asyncHandler(async (req, res) => {
  const row = await daily.update(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Daily work update saved.', data: { update: row } });
});

const remove = asyncHandler(async (req, res) => {
  await daily.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Daily work update deleted.' });
});

const attach = asyncHandler(async (req, res) => {
  const update = await daily.addAttachments(req.params.id, req.user, req.files || []);
  sendSuccess(res, { message: 'Attachment saved.', data: { update } });
});

const download = asyncHandler(async (req, res) => {
  const found = await daily.attachmentFile(req.params.id, req.params.fileId, req.user);
  res.download(found.path, found.file.original_name);
});

const detach = asyncHandler(async (req, res) => {
  const update = await daily.removeAttachment(req.params.id, req.params.fileId, req.user);
  sendSuccess(res, { message: 'Attachment removed.', data: { update } });
});

const exportExcel = asyncHandler(async (req, res) => {
  const data = await daily.rowsForExport(req.user, req.query || {});
  const file = excel(data.updates);
  res.setHeader('Content-Type', 'application/vnd.ms-excel');
  res.setHeader('Content-Disposition', 'attachment; filename="daily-work-updates.xls"');
  res.send(file);
});

const exportPdf = asyncHandler(async (req, res) => {
  const data = await daily.rowsForExport(req.user, req.query || {});
  const employeeName = data.updates[0] && req.query.employeeId ? data.updates[0].employeeName : '';
  const file = pdf({
    rows: data.updates,
    summary: data.summary,
    window: data.window,
    employeeName,
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="daily-work-updates.pdf"');
  res.send(file);
});

module.exports = {
  list,
  summary,
  employee,
  history,
  get,
  create,
  update,
  remove,
  attach,
  download,
  detach,
  exportExcel,
  exportPdf,
};
