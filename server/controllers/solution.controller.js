const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const costingService = require('../services/costing.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Solution costing id is not valid.');
}

const list = asyncHandler(async (req, res) => {
  const data = await costingService.list();
  sendSuccess(res, { message: 'Solution costing records loaded.', data });
});

const sources = asyncHandler(async (req, res) => {
  const studies = await costingService.sources();
  sendSuccess(res, { message: 'Feasible studies loaded.', data: { studies } });
});

const create = asyncHandler(async (req, res) => {
  if (!UUID.test(req.body?.feasibilityId || '')) throw new ApiError(400, 'Feasibility id is not valid.');
  const costing = await costingService.create(req.body.feasibilityId, req.user);
  sendSuccess(res, { status: 201, message: 'Solution costing created.', data: { costing } });
});

const get = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.get(req.params.id, req.user);
  sendSuccess(res, { message: 'Solution costing loaded.', data: { costing } });
});

const save = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.save(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Draft saved.', data: { costing } });
});

const duplicate = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.duplicate(req.params.id, req.user);
  sendSuccess(res, { message: 'New costing version created.', data: { costing } });
});

const submitReview = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.submitReview(req.params.id, req.user);
  sendSuccess(res, { message: 'Costing submitted for internal review.', data: { costing } });
});

const submitApproval = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.submitApproval(req.params.id, req.user, req.body?.note);
  sendSuccess(res, { message: 'Costing submitted for approval.', data: { costing } });
});

const decide = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.decide(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Approval decision recorded.', data: { costing } });
});

const remove = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  await costingService.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Costing deleted.', data: {} });
});

const upload = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.addDocuments(req.params.id, req.files || [], req.body, req.user);
  sendSuccess(res, { message: 'Documents saved.', data: { costing } });
});

const download = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const file = await costingService.openDocument(req.params.id, req.params.documentId);
  if (req.query.inline === '1') {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${String(file.name).replace(/"/g, '')}"`);
    return res.sendFile(file.filePath);
  }
  return res.download(file.filePath, file.name);
});

const removeDocument = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.removeDocument(req.params.id, req.params.documentId, req.user);
  sendSuccess(res, { message: 'Document deleted.', data: { costing } });
});

const importBom = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.importBom(req.params.id, req.body?.rows, req.user);
  sendSuccess(res, { message: 'BOM imported.', data: { costing } });
});

const exportBom = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const costing = await costingService.get(req.params.id, req.user);
  const csv = costingService.bomCsv(costing);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${costing.costingCode || 'bom'}-v${costing.version?.versionNo || 1}.csv"`);
  res.send(csv);
});

const convert = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const result = await costingService.convert(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: `Project ${result.projectCode} created successfully.`, data: result });
});

const eligibleProjects = asyncHandler(async (req, res) => {
  const opportunities = await costingService.eligibleOpportunities(req.user);
  sendSuccess(res, { message: 'Approved opportunities loaded.', data: { opportunities } });
});

const updateProject = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  const project = await costingService.updateProject(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Project updated.', data: { project } });
});

const deleteProject = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  await costingService.deleteProject(req.params.id, req.user);
  sendSuccess(res, { message: 'Project deleted.' });
});

const projectHub = asyncHandler(async (req, res) => {
  const data = await costingService.projectHub();
  sendSuccess(res, { message: 'Active project teams loaded.', data });
});

const listProjects = asyncHandler(async (req, res) => {
  const data = await costingService.listProjects(req.query.view);
  sendSuccess(res, { message: 'Projects loaded.', data });
});

const updateProjectStatus = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  const project = await costingService.updateProjectStatus(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Project status updated.', data: { project } });
});

const confirmPayment = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  const project = await costingService.confirmPayment(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Payment confirmation saved.', data: { project } });
});

const activateProject = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  const project = await costingService.activateProject(req.params.id, req.user);
  sendSuccess(res, { message: 'Project activated for execution.', data: { project } });
});

const getProject = asyncHandler(async (req, res) => {
  if (!UUID.test(req.params.id || '')) throw new ApiError(400, 'Project id is not valid.');
  const project = await costingService.getProject(req.params.id, req.user);
  sendSuccess(res, { message: 'Project loaded.', data: { project } });
});

module.exports = {
  list,
  sources,
  create,
  get,
  save,
  duplicate,
  submitReview,
  submitApproval,
  decide,
  remove,
  upload,
  download,
  removeDocument,
  importBom,
  exportBom,
  convert,
  listProjects,
  projectHub,
  eligibleProjects,
  getProject,
  updateProject,
  deleteProject,
  updateProjectStatus,
  confirmPayment,
  activateProject,
};
