const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const repository = require('../db/feasibility.repository');
const {
  TEAM_LABELS,
  DOCUMENT_TYPES,
  isLocked,
  calculateProgress,
  workingStatus,
  submitErrors,
  buildAccess,
  normalizeDraft,
  cleanText,
} = require('./feasibility.rules');

function uploadDir(id) {
  return path.join(__dirname, '..', 'uploads', 'feasibility', id);
}

function summaryOf(study) {
  const progress = calculateProgress(study);
  const openRisks = (study.risks || []).filter((risk) => risk.status === 'OPEN' || risk.status === 'MITIGATING');
  const pendingInputs = (study.customerInputs || []).filter((item) => item.status === 'PENDING');
  return {
    progress,
    openRisks: openRisks.length,
    openCriticalRisks: openRisks.filter((risk) => (risk.riskLevel || risk.risk_level) === 'CRITICAL').length,
    pendingInputs: pendingInputs.length,
    pendingCriticalInputs: pendingInputs.filter((item) => item.critical).length,
    documentCount: (study.documents || []).length,
    pocStatus: study.validation?.testStatus || 'NOT_REQUIRED',
  };
}

function present(study, user) {
  const summary = summaryOf(study);
  return {
    ...study,
    progress: summary.progress,
    summary,
    access: user ? buildAccess(user, study) : undefined,
  };
}

function presentListItem(row) {
  const study = {
    ...row,
    risks: (row.risks || []).map((risk) => ({
      status: risk.status,
      riskLevel: risk.risk_level || risk.riskLevel,
    })),
  };
  const summary = summaryOf(study);
  return {
    id: row.id,
    leadId: row.leadId,
    leadCode: row.leadCode,
    title: row.title,
    customerName: row.customerName,
    priority: row.priority,
    status: row.status,
    ownerName: row.ownerName,
    assignedPm: row.assignedPm,
    targetCompletionDate: row.targetCompletionDate,
    updatedAt: row.updatedAt,
    startedAt: row.startedAt,
    solutionCostingId: row.solutionCostingId,
    progress: summary.progress,
    summary,
  };
}

async function getOrThrow(id) {
  const study = await repository.findById(id);
  if (!study) throw new ApiError(404, 'Feasibility study not found.');
  return study;
}

function saveScope(access) {
  if (access.canEditCore) return 'full';
  if (access.editableTeamIds.length) return 'assessment';
  if (access.canUpdateCustomerInputs || access.canEditCommunications) return 'sales';
  return null;
}

async function logDraftChanges(id, userId, before, after) {
  const events = ['Draft Saved'];
  const beforeCodes = new Set((before.teams || []).map((team) => team.teamCode));
  for (const team of after.teams || []) {
    const label = TEAM_LABELS[team.teamCode] || 'Team';
    if (!beforeCodes.has(team.teamCode)) events.push(`${label} Assigned`);
    const previous = (before.teams || []).find((item) => item.teamCode === team.teamCode);
    if (previous && previous.status !== 'COMPLETED' && team.status === 'COMPLETED') {
      events.push(`${label} Assessment Completed`);
    }
  }
  const beforePoc = before.validation?.testStatus;
  const afterPoc = after.validation?.testStatus;
  if (beforePoc !== 'IN_PROGRESS' && afterPoc === 'IN_PROGRESS') events.push('POC Started');
  if (beforePoc !== 'COMPLETED' && afterPoc === 'COMPLETED') events.push('POC Completed');
  if ((after.risks || []).length > (before.risks || []).length) events.push('Risk Added');
  if ((after.customerInputs || []).length > (before.customerInputs || []).length) events.push('Customer Input Requested');
  if ((after.communications || []).length > (before.communications || []).length) events.push('Communication Recorded');
  for (const action of events) {
    await repository.addActivity(id, userId, action);
  }
}

async function refreshStatus(study) {
  if (isLocked(study)) return study;
  const next = workingStatus(study);
  if (next !== study.status) {
    await repository.setStatus(study.id, next);
    return repository.findById(study.id);
  }
  return study;
}

async function list(user) {
  await repository.syncApproved(null);
  const rows = await repository.list();
  return rows.map(presentListItem);
}

async function get(id, user) {
  const study = await refreshStatus(await getOrThrow(id));
  const users = (await userRepository.listActive()).map(toPublicUser).map((person) => ({
    id: person.id,
    fullName: person.fullName,
    email: person.email,
    department: person.department,
    designation: person.designation,
    roleCode: person.role.code,
    roleName: person.role.name,
  }));
  return { study: present(study, user), users };
}

async function ensure(leadId, user) {
  const id = await repository.ensureForLead(leadId, user.id);
  if (!id) throw new ApiError(409, 'Feasibility starts after the project manager approves the lead.');
  return get(id, user);
}

async function save(id, body, user, { silent = false } = {}) {
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  const scope = saveScope(access);
  if (!scope || !access.canSave) {
    throw new ApiError(403, 'You cannot edit this feasibility study.');
  }
  const input = normalizeDraft(body);
  if (scope === 'assessment') {
    const allowed = new Set(current.teams.filter((team) => access.editableTeamIds.includes(team.id)).map((team) => team.teamCode));
    input.teams = input.teams.filter((team) => allowed.has(team.teamCode));
    if (!input.teams.length) throw new ApiError(403, 'You can update only your own team assessment.');
  }
  try {
    await repository.saveDraft(id, input, user.id, scope);
  } catch (error) {
    if (error.code === '23503') throw new ApiError(400, 'One of the selected people is no longer available.');
    throw error;
  }
  let saved = await getOrThrow(id);
  saved = await refreshStatus(saved);
  if (!silent) await logDraftChanges(id, user.id, current, saved);
  return present(await getOrThrow(id), user);
}

async function start(id, body, user) {
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  if (!access.canStart) {
    if (current.startedAt) throw new ApiError(409, 'Feasibility has already been started.');
    throw new ApiError(403, 'You cannot start this feasibility study.');
  }
  const input = normalizeDraft(body || {});
  const ownerId = input.ownerId || current.ownerId || user.id;
  const started = await repository.start(id, user.id, ownerId, input.targetCompletionDate);
  if (!started) throw new ApiError(409, 'Feasibility has already been started.');
  await repository.addActivity(id, user.id, 'Feasibility Started');
  const db = require('../db');
  await db.query(
    'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
    [current.leadId, user.id, 'Feasibility Started'],
  );
  return present(await refreshStatus(await getOrThrow(id)), user);
}

async function submit(id, body, user) {
  if (body && Object.keys(body).length) await save(id, body, user, { silent: true });
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  if (!access.canSubmit) throw new ApiError(403, 'You cannot submit this feasibility study.');
  if (current.status === 'UNDER_REVIEW') {
    throw new ApiError(409, 'This feasibility study is already waiting for PM review.');
  }
  const fields = submitErrors(current);
  if (Object.keys(fields).length) {
    throw new ApiError(422, Object.values(fields)[0], { fields });
  }
  const today = new Date().toISOString().slice(0, 10);
  await repository.setStatus(id, 'UNDER_REVIEW', {
    prepared_by: user.id,
    prepared_at: new Date(),
    submitted_by: user.id,
    submitted_at: new Date(),
    reviewed_by: null,
    reviewed_at: null,
    approved_by: null,
    approved_at: null,
    completion_date: current.completionDate || today,
  });
  await repository.addActivity(id, user.id, current.submittedAt ? 'Resubmitted to PM' : 'Submitted to PM');
  const workflow = require('./workflow.service');
  await workflow.markLead(current.leadId, 'FEASIBILITY_SUBMITTED', 'Feasibility Review', user.id, 'Feasibility submitted');
  const pms = await workflow.usersByKind(['PM']);
  await workflow.notify(pms, `Feasibility submitted: ${current.lead?.title || 'Lead'}`, 'A feasibility study is waiting for PM approval.', `/feasibility-studies/${id}`);
  return present(await getOrThrow(id), user);
}

async function review(id, body, user) {
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  const action = body?.action;
  if (action === 'team_review') {
    const team = current.teams.find((item) => item.id === body.assignmentId || item.teamCode === body.teamCode);
    if (!team) throw new ApiError(404, 'That team assignment was not found.');
    if (!access.canReviewTeamIds.includes(team.id)) {
      throw new ApiError(403, 'Only the team lead or project manager can review this assessment.');
    }
    const marked = await repository.markTeamReviewed(id, team.teamCode, user.id);
    if (!marked) throw new ApiError(409, 'Save the team assessment before marking it reviewed.');
    await repository.addActivity(id, user.id, `${team.teamName} Assessment Reviewed`);
    return present(await getOrThrow(id), user);
  }
  if (action === 'changes') {
    if (!access.canRequestChanges) throw new ApiError(403, 'Only a project manager can request changes.');
    const note = cleanText(body.note, 1000);
    if (note.length < 2) throw new ApiError(400, 'Describe the changes the feasibility team must make.');
    const next = workingStatus({ ...current, status: 'IN_PROGRESS' });
    await repository.setStatus(id, next === 'NOT_STARTED' ? 'IN_PROGRESS' : next, {
      review_note: note,
      reviewed_by: user.id,
      reviewed_at: new Date(),
      approved_by: null,
      approved_at: null,
    });
    await repository.addActivity(id, user.id, 'Changes Requested');
    const workflow = require('./workflow.service');
    await workflow.markLead(current.leadId, 'FEASIBILITY_CHANGES_REQUESTED', 'Feasibility', user.id, 'Feasibility changes requested');
    const recipients = [...new Set([current.ownerId, ...(current.teams || []).flatMap((team) => [team.teamLeadId, ...(team.memberIds || [])])].filter(Boolean))];
    if (recipients.length) {
      await workflow.notify(recipients, `Changes requested: ${current.lead?.title || 'Feasibility'}`, note, `/feasibility-studies/${id}`);
    }
    return present(await getOrThrow(id), user);
  }
  if (action === 'reject') {
    if (!access.canApprove) throw new ApiError(403, 'Only a project manager can reject this feasibility study.');
    const note = cleanText(body.note, 1000);
    if (note.length < 2) throw new ApiError(400, 'A rejection reason is required.');
    await repository.setStatus(id, 'REJECTED', {
      reviewed_by: user.id,
      reviewed_at: new Date(),
      approved_by: null,
      approved_at: null,
      review_note: note,
      completion_date: current.completionDate || new Date().toISOString().slice(0, 10),
    });
    await repository.addActivity(id, user.id, 'Feasibility Rejected');
    const workflow = require('./workflow.service');
    await workflow.markLead(current.leadId, 'FEASIBILITY_REJECTED', 'Feasibility', user.id, 'Feasibility rejected');
    if (current.ownerId) {
      await workflow.notify([current.ownerId], `Feasibility rejected: ${current.lead?.title || 'Lead'}`, note, `/feasibility-studies/${id}`);
    }
    return present(await getOrThrow(id), user);
  }
  if (action === 'approve') {
    if (!access.canApprove) throw new ApiError(403, 'Only a project manager can approve this feasibility study.');
    if (!current.decision) throw new ApiError(422, 'Record a feasibility decision before approval.');
    const teams = current.teams || [];
    if (!teams.length || teams.some((team) => team.status !== 'COMPLETED')) {
      throw new ApiError(422, 'Complete every assigned team assessment before approving feasibility.');
    }
    const note = cleanText(body.note, 1000);
    await repository.setStatus(id, current.decision, {
      approved_by: user.id,
      approved_at: new Date(),
      reviewed_by: user.id,
      reviewed_at: new Date(),
      review_note: note || current.reviewNote,
      completion_date: current.completionDate || new Date().toISOString().slice(0, 10),
    });
    await repository.addActivity(id, user.id, 'Feasibility Approved');
    const workflow = require('./workflow.service');
    await workflow.markLead(current.leadId, 'FEASIBILITY_APPROVED', 'Procurement & Costing', user.id, 'Feasibility approved');
    return present(await getOrThrow(id), user);
  }
  throw new ApiError(400, 'Choose team review, request changes, reject, or approve.');
}

async function proceed(id, user) {
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  if (!access.canProceed) {
    throw new ApiError(409, 'Solution and costing opens after the feasibility is feasible or feasible with conditions.');
  }
  if (current.decision === 'FEASIBLE_WITH_CONDITIONS' && !String(current.conditions || '').trim()) {
    throw new ApiError(422, 'Record the conditions before proceeding to solution and costing.');
  }
  const costingService = require('./costing.service');
  const costing = await costingService.create(id, user);
  return { costingId: costing.id, study: present(await getOrThrow(id), user) };
}

async function addDocuments(id, files, body, user) {
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  if (!access.canUpload) throw new ApiError(403, 'You cannot upload documents to this feasibility study.');
  const documentType = DOCUMENT_TYPES.has(body.documentType) ? body.documentType : 'Other';
  const assignment = current.teams.find((team) => team.id === body.assignmentId);
  if (body.assignmentId && !assignment) throw new ApiError(400, 'That team is not assigned to this feasibility study.');
  if (assignment && !access.canEditCore && !access.editableTeamIds.includes(assignment.id)) {
    throw new ApiError(403, 'You can attach files only to your own team.');
  }
  for (const file of files) {
    await repository.addDocument(id, {
      assignmentId: assignment?.id || null,
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      documentType,
      uploadedBy: user.id,
    });
  }
  if (files.length) await repository.addActivity(id, user.id, 'Document Uploaded');
  return present(await getOrThrow(id), user);
}

async function openDocument(id, documentId) {
  const study = await getOrThrow(id);
  const row = await repository.findDocument(id, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const fromLead = row.document_source === 'LEAD' || String(documentId || '').startsWith('lead:');
  const filePath = fromLead
    ? path.join(__dirname, '..', 'uploads', 'leads', String(row.lead_id || study.leadId), row.stored_name)
    : path.join(uploadDir(id), row.stored_name);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Document file is missing.');
  return { filePath, name: row.original_name, mimeType: row.mime_type || 'application/octet-stream' };
}

async function removeDocument(id, documentId, user) {
  if (String(documentId || '').startsWith('lead:')) {
    throw new ApiError(400, 'Lead creation documents stay with the lead. Remove them from the lead record if needed.');
  }
  const current = await getOrThrow(id);
  const access = buildAccess(user, current);
  const row = await repository.findDocument(id, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const own = row.uploaded_by === user.id;
  if (!access.canDeleteDocuments && !own) throw new ApiError(403, 'You cannot delete this document.');
  const removed = await repository.removeDocument(id, documentId);
  if (removed) fs.rmSync(path.join(uploadDir(id), removed.stored_name), { force: true });
  await repository.addActivity(id, user.id, 'Document Deleted');
  return present(await getOrThrow(id), user);
}

async function listCostings() {
  return repository.listCostings();
}

async function getCosting(id, user) {
  const costing = await repository.findCosting(id);
  if (!costing) throw new ApiError(404, 'Solution costing record not found.');
  const study = present(await getOrThrow(costing.feasibility_id), user);
  return { costingId: costing.id, study };
}

module.exports = {
  list,
  get,
  ensure,
  save,
  start,
  submit,
  review,
  proceed,
  addDocuments,
  openDocument,
  removeDocument,
  listCostings,
  getCosting,
  uploadDir,
};
