const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const leadService = require('../services/lead.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Lead id is not valid.');
}

const list = asyncHandler(async (req, res) => {
  const data = await leadService.list(req.user);
  sendSuccess(res, { message: 'Leads loaded.', data });
});

const get = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.get(req.params.id, req.user);
  sendSuccess(res, { message: 'Lead loaded.', data: { lead } });
});

const create = asyncHandler(async (req, res) => {
  const lead = await leadService.create(req.body, req.user);
  sendSuccess(res, { status: 201, message: 'Draft saved successfully.', data: { lead } });
});

const update = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.update(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Draft saved successfully.', data: { lead } });
});

const submit = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.submit(req.params.id, req.user);
  sendSuccess(res, { message: 'Lead submitted to the project manager.', data: { lead } });
});

const review = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.review(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Project manager review recorded.', data: { lead } });
});

const remove = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.remove(req.params.id);
  sendSuccess(res, { message: 'Lead deleted.', data: { lead } });
});

const upload = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await leadService.addDocuments(req.params.id, req.files || [], req.user);
  sendSuccess(res, { message: 'Documents saved.', data: { lead } });
});

const download = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const file = await leadService.openDocument(req.params.id, req.params.documentId);
  res.download(file.filePath, file.name);
});

module.exports = {
  list, get, create, update, submit, review, remove, upload, download,
};
