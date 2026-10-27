const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const leads = require('../db/lead.repository');
const { EDITABLE, REVIEWABLE, normalizeLeadInput, submitErrors } = require('./lead.rules');
const { canCreateLead, leadSource, leadAccess, isPm } = require('./workflow.roles');
const workflow = require('./workflow.service');

function uploadDir(leadId) {
  return path.join(__dirname, '..', 'uploads', 'leads', leadId);
}

async function getOrThrow(id) {
  const lead = await leads.findById(id);
  if (!lead) throw new ApiError(404, 'Lead not found.');
  return lead;
}

async function create(body, user) {
  if (!canCreateLead(user)) {
    throw new ApiError(403, 'Only the Business Head or Engineering Director can create a lead.');
  }
  const input = normalizeLeadInput(body);
  input.source = leadSource(user);
  const id = await leads.insert(input, user.id);
  await workflow.record('lead', id, 'LEAD_CREATED', user.id, input.source);
  return withAccess(await leads.findById(id), user);
}

function withAccess(lead, user) {
  if (!lead) return lead;
  return { ...lead, access: leadAccess(user, lead) };
}

async function update(id, body, user) {
  const current = await getOrThrow(id);
  if (current.createdById !== user.id) {
    throw new ApiError(403, 'Only the person who created this lead can edit it.');
  }
  if (!EDITABLE.has(current.status)) {
    throw new ApiError(409, 'This lead can only be edited while it is a draft or changes have been requested.');
  }
  const input = normalizeLeadInput(body);
  const action = current.status === 'DRAFT' ? 'Draft Saved' : 'Lead Updated';
  await leads.update(id, input, user.id, action);
  return withAccess(await leads.findById(id), user);
}

async function submit(id, user) {
  const current = await getOrThrow(id);
  if (current.createdById !== user.id) {
    throw new ApiError(403, 'Only the person who created this lead can submit it.');
  }
  if (!EDITABLE.has(current.status)) {
    throw new ApiError(409, 'This lead has already been submitted to the project manager.');
  }
  const input = normalizeLeadInput(current);
  const fields = submitErrors(input);
  if (Object.keys(fields).length) {
    throw new ApiError(422, 'Complete the required fields before submitting to the project manager.', { fields });
  }
  await leads.submit(id, user.id);
  await workflow.record('lead', id, 'LEAD_SUBMITTED', user.id, '');
  await workflow.notify(await workflow.usersByKind(['PM']), `Lead submitted: ${current.title || current.leadCode}`, 'A lead is waiting in the PM review queue.', `/lead-pipeline/${id}`);
  return withAccess(await leads.findById(id), user);
}

async function review(id, body, user) {
  if (!isPm(user)) {
    throw new ApiError(403, 'Only the project manager can review this lead.');
  }
  const current = await getOrThrow(id);
  if (!REVIEWABLE.has(current.status) && current.status !== 'PM_REVIEW') {
    throw new ApiError(409, 'This lead is not waiting for project manager review.');
  }
  const note = String(body.note || '').trim().slice(0, 1000);
  const actions = {
    accept: { status: 'READY_FOR_TEAM_ASSIGNMENT', stage: 'Team Assignment', action: 'PM Approved' },
    changes: { status: 'CHANGES_REQUESTED', stage: 'PM Review', action: 'Changes Requested' },
    hold: { status: 'ON_HOLD', stage: 'PM Review', action: 'Put On Hold' },
    reject: { status: 'REJECTED', stage: 'Rejected', action: 'Rejected' },
  };
  const next = actions[body.action];
  if (!next) throw new ApiError(400, 'Choose accept, request changes, reject, or put the lead on hold.');
  if (body.action === 'reject' && !note) throw new ApiError(400, 'A rejection note is required.');
  await leads.review(id, user.id, { ...next, note });
  await workflow.record('lead', id, 'PM_REVIEWED', user.id, next.action);
  if (body.action === 'changes') {
    await workflow.notify([current.createdById], `Changes requested: ${current.title || current.leadCode}`, note || 'The project manager requested changes.', `/lead-pipeline/${id}`);
  }
  return withAccess(await leads.findById(id), user);
}

async function remove(id) {
  const current = await getOrThrow(id);
  const stored = await leads.remove(id);
  const dir = uploadDir(current.id);
  for (const name of stored) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { id: current.id, leadCode: current.leadCode };
}

async function addDocuments(id, files, user) {
  await getOrThrow(id);
  const saved = [];
  for (const file of files) {
    saved.push(await leads.addDocument(id, {
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    }));
  }
  if (saved.length) {
    await require('../db').query(
      'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
      [id, user.id, saved.length === 1 ? 'Document Uploaded' : `${saved.length} documents uploaded`],
    );
  }
  return leads.findById(id);
}

async function openDocument(leadId, documentId) {
  const row = await leads.findDocument(leadId, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const filePath = path.join(uploadDir(leadId), row.stored_name);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Document file is missing.');
  return { filePath, name: row.original_name, mimeType: row.mime_type };
}

async function list(user) {
  return {
    leads: await leads.list(),
    access: leadAccess(user, null),
  };
}

async function get(id, user) {
  const lead = await getOrThrow(id);
  const commercial = await workflow.quotationsFor(id);
  const teamAssignments = await workflow.listLeadAssignments(id, user);
  return { ...withAccess(lead, user), ...commercial, teamAssignments };
}

module.exports = {
  list,
  get,
  create,
  update,
  submit,
  review,
  remove,
  addDocuments,
  openDocument,
};
