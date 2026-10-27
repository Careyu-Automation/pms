const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const planning = require('../services/planning.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id, label) {
  if (!UUID.test(id || '')) throw new ApiError(400, `${label} is not valid.`);
}

const getPlan = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.getPlan(req.params.id);
  sendSuccess(res, { message: 'Project plan loaded.', data: plan });
});

const createPhase = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.createPhase(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Phase created.', data: plan });
});

const updatePhase = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.phaseId, 'Phase id');
  const plan = await planning.updatePhase(req.params.id, req.params.phaseId, req.user, req.body || {});
  sendSuccess(res, { message: 'Phase updated.', data: plan });
});

const removePhase = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.phaseId, 'Phase id');
  const plan = await planning.removePhase(req.params.id, req.params.phaseId, req.user);
  sendSuccess(res, { message: 'Phase removed.', data: plan });
});

const createTask = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.createTask(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Task created.', data: plan });
});

const updateTask = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.taskId, 'Task id');
  const plan = await planning.updateTask(req.params.id, req.params.taskId, req.user, req.body || {});
  sendSuccess(res, { message: 'Task updated.', data: plan });
});

const removeTask = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.taskId, 'Task id');
  const plan = await planning.removeTask(req.params.id, req.params.taskId, req.user);
  sendSuccess(res, { message: 'Task removed.', data: plan });
});

const createDependency = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.createDependency(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Dependency created.', data: plan });
});

const removeDependency = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.dependencyId, 'Dependency id');
  const plan = await planning.removeDependency(req.params.id, req.params.dependencyId, req.user);
  sendSuccess(res, { message: 'Dependency removed.', data: plan });
});

const createMilestone = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.createMilestone(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Milestone created.', data: plan });
});

const updateMilestone = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.milestoneId, 'Milestone id');
  const plan = await planning.updateMilestone(req.params.id, req.params.milestoneId, req.user, req.body || {});
  sendSuccess(res, { message: 'Milestone updated.', data: plan });
});

const removeMilestone = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.milestoneId, 'Milestone id');
  const plan = await planning.removeMilestone(req.params.id, req.params.milestoneId, req.user);
  sendSuccess(res, { message: 'Milestone removed.', data: plan });
});

const setBaseline = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.setBaseline(req.params.id, req.user);
  sendSuccess(res, { message: 'Baseline saved.', data: plan });
});

const getTask = asyncHandler(async (req, res) => {
  assertId(req.params.taskId, 'Task id');
  const task = await planning.getTask(req.params.taskId);
  sendSuccess(res, { message: 'Task loaded.', data: { task } });
});

const logTime = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const plan = await planning.logTime(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Hours logged.', data: plan });
});

const removeTime = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.entryId, 'Time entry id');
  const plan = await planning.removeTime(req.params.id, req.params.entryId, req.user);
  sendSuccess(res, { message: 'Hours entry removed.', data: plan });
});

const uploadDocuments = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  const documents = await planning.addDocuments(req.params.id, req.files || [], req.user);
  sendSuccess(res, { status: 201, message: 'Documents uploaded.', data: { documents } });
});

const downloadDocument = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.documentId, 'Document id');
  const file = await planning.openDocument(req.params.id, req.params.documentId);
  if (req.query.inline === '1') {
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${String(file.name).replace(/"/g, '')}"`);
    return res.sendFile(file.filePath);
  }
  return res.download(file.filePath, file.name);
});

const removeDocument = asyncHandler(async (req, res) => {
  assertId(req.params.id, 'Project id');
  assertId(req.params.documentId, 'Document id');
  const documents = await planning.removeDocument(req.params.id, req.params.documentId, req.user);
  sendSuccess(res, { message: 'Document removed.', data: { documents } });
});

const createNamedTask = asyncHandler(async (req, res) => {
  const task = await planning.createNamedTask(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Task created.', data: { task } });
});

const listTasks = asyncHandler(async (req, res) => {
  const result = await planning.listTasks(req.user, req.query || {});
  const data = Array.isArray(result) ? { tasks: result } : result;
  sendSuccess(res, { message: 'Tasks loaded.', data });
});

const updateListedTask = asyncHandler(async (req, res) => {
  assertId(req.params.taskId, 'Task id');
  const task = await planning.patchTask(req.params.taskId, req.user, req.body || {});
  sendSuccess(res, { message: 'Task updated.', data: { task } });
});

const removeListedTask = asyncHandler(async (req, res) => {
  assertId(req.params.taskId, 'Task id');
  await planning.removeOwnedTask(req.params.taskId, req.user);
  sendSuccess(res, { message: 'Task removed.' });
});

module.exports = {
  getPlan,
  createPhase,
  updatePhase,
  removePhase,
  createTask,
  updateTask,
  removeTask,
  createDependency,
  removeDependency,
  createMilestone,
  updateMilestone,
  removeMilestone,
  setBaseline,
  listTasks,
  createNamedTask,
  updateListedTask,
  removeListedTask,
  getTask,
  logTime,
  removeTime,
  uploadDocuments,
  downloadDocument,
  removeDocument,
};
