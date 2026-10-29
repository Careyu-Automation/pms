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

const uploadDocuments = asyncHandler(async (req, res) => {
  const data = await requests.addDocuments(req.user, req.params.id, req.files || [], req.body?.documentType);
  sendSuccess(res, { message: 'Documents uploaded.', data });
});

const downloadDocument = asyncHandler(async (req, res) => {
  const file = await requests.openDocument(req.params.id, req.params.documentId);
  res.download(file.filePath, file.name);
});

const deleteDocument = asyncHandler(async (req, res) => {
  const data = await requests.removeDocument(req.user, req.params.id, req.params.documentId);
  sendSuccess(res, { message: 'Document deleted.', data });
});

module.exports = {
  home, create, update, status, remove, uploadDocuments, downloadDocument, deleteDocument,
};
