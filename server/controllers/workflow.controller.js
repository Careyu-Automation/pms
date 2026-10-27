const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const workflow = require('../services/workflow.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'That id is not valid.');
}

const summary = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Workflow summary loaded.', data: await workflow.summary() });
});

const assignLead = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const lead = await workflow.assignLead(req.params.id, req.body || {}, req.user);
  const teamAssignments = await workflow.listLeadAssignments(req.params.id, req.user);
  sendSuccess(res, { message: 'Team assigned.', data: { lead, teamAssignments } });
});

const myAssignments = asyncHandler(async (req, res) => {
  const assignments = await workflow.myAssignments(req.user);
  sendSuccess(res, { message: 'Assignments loaded.', data: { assignments } });
});

const respondAssignment = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const assignment = await workflow.respondToAssignment(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { message: 'Assignment updated.', data: { assignment } });
});

const quote = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const quotation = await workflow.prepareQuotation(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { status: 201, message: 'Quotation created.', data: { quotation } });
});

const sendQuote = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const quotation = await workflow.sendQuotation(req.params.id, req.user);
  sendSuccess(res, { message: 'Quotation sent.', data: { quotation } });
});

const negotiate = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const negotiation = await workflow.negotiate(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { message: 'Negotiation recorded.', data: { negotiation } });
});

const assignProject = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const project = await workflow.assignProject(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { message: 'Project assigned.', data: { project } });
});

const reviewProject = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const project = await workflow.reviewProject(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { message: 'Team review recorded.', data: { project } });
});

const completeProject = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const project = await workflow.submitCompletion(req.params.id, req.user);
  sendSuccess(res, { message: 'Completion submitted.', data: { project } });
});

const handover = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const project = await workflow.handover(req.params.id, req.body || {}, req.user);
  sendSuccess(res, { message: 'Handover recorded.', data: { project } });
});

module.exports = {
  summary, assignLead, myAssignments, respondAssignment, quote, sendQuote, negotiate, assignProject, reviewProject, completeProject, handover,
};
