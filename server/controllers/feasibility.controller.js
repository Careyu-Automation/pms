const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const feasibilityService = require('../services/feasibility.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Feasibility id is not valid.');
}

const list = asyncHandler(async (req, res) => {
  const studies = await feasibilityService.list(req.user);
  sendSuccess(res, { message: 'Feasibility studies loaded.', data: { studies } });
});

const ensure = asyncHandler(async (req, res) => {
  if (!UUID.test(req.body?.leadId || '')) throw new ApiError(400, 'Lead id is not valid.');
  const result = await feasibilityService.ensure(req.body.leadId, req.user);
  sendSuccess(res, { message: 'Feasibility study ready.', data: result });
});

const get = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const result = await feasibilityService.get(req.params.id, req.user);
  sendSuccess(res, { message: 'Feasibility study loaded.', data: result });
});

const save = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.save(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Draft saved.', data: { study } });
});

const start = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.start(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Feasibility study started.', data: { study } });
});

const submit = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.submit(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Feasibility submitted for review.', data: { study } });
});

const review = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.review(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Review recorded.', data: { study } });
});

const proceed = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const result = await feasibilityService.proceed(req.params.id, req.user);
  sendSuccess(res, { message: 'Solution and costing is ready.', data: result });
});

const upload = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.addDocuments(req.params.id, req.files || [], req.body, req.user);
  sendSuccess(res, { message: 'Documents saved.', data: { study } });
});

const download = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const file = await feasibilityService.openDocument(req.params.id, req.params.documentId);
  if (req.query.inline === '1') {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${String(file.name).replace(/"/g, '')}"`);
    return res.sendFile(file.filePath);
  }
  return res.download(file.filePath, file.name);
});

const removeDocument = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const study = await feasibilityService.removeDocument(req.params.id, req.params.documentId, req.user);
  sendSuccess(res, { message: 'Document deleted.', data: { study } });
});

module.exports = {
  list, ensure, get, save, start, submit, review, proceed, upload, download, removeDocument,
};
