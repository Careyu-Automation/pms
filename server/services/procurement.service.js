const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const leaveRepository = require('../db/leave.repository');
const repository = require('../db/procurement.repository');
const { query } = require('../db');
const { isPm, actorKind } = require('./workflow.roles');

const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const NEXT = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ORDERED', 'CANCELLED'],
  ORDERED: ['RECEIVED', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  RECEIVED: [],
  CANCELLED: [],
};
const REVIEW = new Set(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isAdmin(user) {
  const kind = actorKind(user);
  return kind === 'ADMIN' || kind === 'PM' || kind === 'CEO' || ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function linesOf(body) {
  if (!Array.isArray(body.items)) return [];
  return body.items.map((item) => ({
    description: clean(item.description, 240),
    quantity: Math.max(Number(item.quantity) || 0, 0),
    unit: clean(item.unit, 40),
    estimatedCost: Math.max(Number(item.estimatedCost) || 0, 0),
  })).filter((item) => item.description && item.quantity > 0);
}

function inputOf(body, current, user) {
  const title = clean(body.title ?? current?.title, 200);
  const description = clean(body.description ?? current?.description, 8000);
  if (title.length < 2) throw new ApiError(400, 'Request title is required.');
  if (description.length < 2) throw new ApiError(400, 'Describe what needs to be procured.');
  const priority = PRIORITIES.has(body.priority) ? body.priority : (current?.priority || 'MEDIUM');
  const noPurchaseRequired = body.noPurchaseRequired === true
    || body.noPurchaseRequired === 'true'
    || (current?.noPurchaseRequired && body.noPurchaseRequired !== false && body.noPurchaseRequired !== 'false');
  const justification = clean(body.justification ?? current?.justification, 4000);
  if (noPurchaseRequired && justification.length < 2) {
    throw new ApiError(400, 'Explain why no purchase is required.');
  }
  return {
    title,
    description,
    priority,
    status: current?.status || 'DRAFT',
    projectId: body.projectId === '' ? null : (UUID.test(body.projectId || '') ? body.projectId : (current?.projectId || null)),
    teamId: body.teamId === '' ? null : (UUID.test(body.teamId || '') ? body.teamId : (current?.teamId || null)),
    leadId: body.leadId === '' ? null : (UUID.test(body.leadId || '') ? body.leadId : (current?.leadId || null)),
    feasibilityId: body.feasibilityId === '' ? null : (UUID.test(body.feasibilityId || '') ? body.feasibilityId : (current?.feasibilityId || null)),
    noPurchaseRequired,
    vendorName: clean(body.vendorName ?? current?.vendorName, 200),
    neededBy: body.neededBy === '' ? null : (cleanDate(body.neededBy) || current?.neededBy || null),
    justification,
    requestedBy: current?.requestedById || user.id,
  };
}

async function present(row) {
  const [items, documents] = await Promise.all([
    repository.items(row.id),
    repository.documents(row.id),
  ]);
  const open = !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(row.status);
  return { ...row, items, documents, overdue: Boolean(row.neededBy && row.neededBy < today() && open) };
}

function scope(user) {
  if (isAdmin(user)) return { sql: '', params: [] };
  return { sql: 'WHERE r.requested_by = $1', params: [user.id] };
}

async function home(user, queryParams) {
  await repository.ensureSchema();
  const base = scope(user);
  const params = [...base.params];
  const parts = [];
  const add = (sql, value) => {
    params.push(value);
    parts.push(sql.replace('?', `$${params.length}`));
  };
  if (NEXT[queryParams.status]) add('r.status = ?', queryParams.status);
  if (PRIORITIES.has(queryParams.priority)) add('r.priority = ?', queryParams.priority);
  if (UUID.test(queryParams.projectId || '')) add('r.project_id = ?', queryParams.projectId);
  if (UUID.test(queryParams.leadId || '')) add('r.lead_id = ?', queryParams.leadId);
  if (queryParams.q) {
    params.push(`%${clean(queryParams.q, 80)}%`);
    const mark = `$${params.length}`;
    parts.push(`(r.title ILIKE ${mark} OR r.vendor_name ILIKE ${mark} OR ('PR-' || LPAD(r.request_number::text, 5, '0')) ILIKE ${mark} OR COALESCE(l.lead_code,'') ILIKE ${mark})`);
  }
  const where = `${base.sql}${parts.length ? `${base.sql ? ' AND ' : 'WHERE '}${parts.join(' AND ')}` : ''}`;
  const [rows, kpis, choices] = await Promise.all([
    repository.list(where, params),
    repository.counts(base.sql, base.params),
    repository.options(),
  ]);
  const detailed = [];
  for (const row of rows) detailed.push(await present(row));
  return {
    kpis,
    rows: detailed,
    options: choices,
    access: { canCreate: true, canReview: isAdmin(user) || isPm(user) },
  };
}

async function guard(user, id) {
  const row = await repository.find(id);
  if (!row) throw new ApiError(404, 'Procurement request not found.');
  if (!isAdmin(user) && !isPm(user) && row.requestedById !== user.id) {
    throw new ApiError(403, 'You cannot view this request.');
  }
  return row;
}

async function create(user, body) {
  const input = inputOf(body, null, user);
  if (input.leadId) {
    const lead = await query('SELECT id, status, title FROM leads WHERE id = $1', [input.leadId]);
    if (!lead.rows[0]) throw new ApiError(400, 'Choose a valid lead.');
    if (!['FEASIBILITY_APPROVED', 'PROCUREMENT_SUBMITTED', 'PROCUREMENT_APPROVED'].includes(lead.rows[0].status)) {
      throw new ApiError(409, 'Procurement opens after the project manager approves feasibility.');
    }
  }
  const id = await repository.insert(input);
  const lines = linesOf(body);
  if (!input.noPurchaseRequired && !lines.length && body.requireItems !== false) {
    // Allow empty draft; submit will validate.
  }
  await repository.setItems(id, lines);
  return present(await repository.find(id));
}

async function update(user, id, body) {
  const current = await guard(user, id);
  if (!isAdmin(user) && !isPm(user) && current.requestedById !== user.id) {
    throw new ApiError(403, 'You cannot edit this request.');
  }
  if (!['DRAFT', 'REJECTED'].includes(current.status) && !isAdmin(user) && !isPm(user)) {
    throw new ApiError(400, 'Only a draft or rejected request can be edited.');
  }
  const input = inputOf(body, current, user);
  input.status = current.status;
  input.leadId = current.leadId || input.leadId;
  input.feasibilityId = current.feasibilityId || input.feasibilityId;
  await repository.update(id, input);
  if (Array.isArray(body.items)) await repository.setItems(id, linesOf(body));
  return present(await repository.find(id));
}

async function syncLeadStatus(request, status, user) {
  if (!request.leadId) return;
  const workflow = require('./workflow.service');
  if (status === 'SUBMITTED' || status === 'UNDER_REVIEW') {
    await workflow.markLead(request.leadId, 'PROCUREMENT_SUBMITTED', 'Procurement', user.id, `Procurement ${request.number} submitted`);
    await workflow.notify(
      await workflow.usersByKind(['PM']),
      `Procurement submitted: ${request.title}`,
      `${request.number} is waiting for PM approval.`,
      '/procurement-requests',
    );
  }
  if (status === 'APPROVED') {
    await workflow.markLead(request.leadId, 'PROCUREMENT_APPROVED', 'Solution Costing', user.id, `Procurement ${request.number} approved`);
    await workflow.notify(
      await workflow.usersByKind(['PM', 'BH']),
      `Procurement approved: ${request.title}`,
      'Solution costing can now open for this lead.',
      '/solution-costing',
    );
  }
  if (status === 'REJECTED') {
    await workflow.markLead(request.leadId, 'FEASIBILITY_APPROVED', 'Procurement', user.id, `Procurement ${request.number} rejected`);
  }
}

async function setStatus(user, id, status) {
  const current = await guard(user, id);
  if (!(NEXT[current.status] || []).includes(status)) throw new ApiError(400, 'That status change is not allowed.');
  if (REVIEW.has(status) && !isAdmin(user) && !isPm(user) && status !== 'CANCELLED') {
    throw new ApiError(403, 'A project manager needs to review this request.');
  }
  if (status === 'SUBMITTED' && current.requestedById !== user.id && !isAdmin(user) && !isPm(user)) {
    throw new ApiError(403, 'Only the requester can submit this request.');
  }
  if (status === 'SUBMITTED') {
    const items = await repository.items(id);
    if (!current.noPurchaseRequired && !items.length) {
      throw new ApiError(422, 'Add purchase items, or mark that no purchase is required with a justification.');
    }
    if (current.noPurchaseRequired && clean(current.justification, 4000).length < 2) {
      throw new ApiError(422, 'Explain why no purchase is required before submitting.');
    }
  }
  const input = inputOf(current, current, user);
  input.status = status;
  await repository.update(id, input);
  await syncLeadStatus(current, status, user);
  if (status !== 'SUBMITTED') {
    await leaveRepository.notify(
      [current.requestedById],
      `Procurement ${status.replace(/_/g, ' ').toLowerCase()}: ${current.title}`,
      current.number,
      '/procurement-requests',
    );
  }
  return present(await repository.find(id));
}

async function remove(user, id) {
  const current = await guard(user, id);
  const ownDraft = current.requestedById === user.id && current.status === 'DRAFT';
  if (!isAdmin(user) && !isPm(user) && !ownDraft) throw new ApiError(403, 'Cancel this request instead of deleting it.');
  await repository.remove(id);
  fs.rmSync(repository.uploadDir(id), { recursive: true, force: true });
}

async function seedForLead(lead, feasibilityId, actorId) {
  if (!lead?.id) return null;
  await repository.ensureSchema();
  const existing = await repository.findByLead(lead.id);
  const open = existing.find((row) => !['CANCELLED', 'REJECTED'].includes(row.status));
  if (open) return open;
  const procurementTeam = await query(
    `SELECT id FROM teams WHERE status = 'ACTIVE' AND (LOWER(code) = 'procurement' OR name ILIKE '%procur%') ORDER BY name LIMIT 1`,
  );
  const id = await repository.insert({
    title: `Procurement: ${lead.title || lead.leadCode || 'Lead'}`,
    description: `Record component purchases and supporting documents for ${lead.leadCode || lead.title || 'this lead'} after feasibility approval.`,
    priority: 'MEDIUM',
    status: 'DRAFT',
    projectId: null,
    teamId: procurementTeam.rows[0]?.id || null,
    leadId: lead.id,
    feasibilityId: feasibilityId || null,
    noPurchaseRequired: false,
    vendorName: '',
    neededBy: null,
    justification: '',
    requestedBy: actorId,
  });
  return repository.find(id);
}

async function addDocuments(user, id, files, documentType) {
  const current = await guard(user, id);
  if (!['DRAFT', 'REJECTED', 'SUBMITTED', 'UNDER_REVIEW'].includes(current.status) && !isAdmin(user) && !isPm(user)) {
    throw new ApiError(409, 'Documents can only be added while the request is open.');
  }
  if (!files?.length) throw new ApiError(400, 'Choose at least one file.');
  repository.ensureUploadDir(id);
  for (const file of files) {
    await repository.addDocument(id, file, user.id, clean(documentType, 80) || 'Supporting');
  }
  return present(await repository.find(id));
}

async function openDocument(id, documentId) {
  const row = await repository.find(id);
  if (!row) throw new ApiError(404, 'Procurement request not found.');
  const doc = await repository.findDocument(id, documentId);
  if (!doc) throw new ApiError(404, 'Document not found.');
  const filePath = path.join(repository.uploadDir(id), doc.stored_name);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Document file is missing.');
  return { filePath, name: doc.original_name, mimeType: doc.mime_type || 'application/octet-stream' };
}

async function removeDocument(user, id, documentId) {
  const current = await guard(user, id);
  if (!['DRAFT', 'REJECTED'].includes(current.status) && !isAdmin(user) && !isPm(user)) {
    throw new ApiError(409, 'Documents can only be removed from a draft or rejected request.');
  }
  const removed = await repository.removeDocument(id, documentId);
  if (!removed) throw new ApiError(404, 'Document not found.');
  fs.rmSync(path.join(repository.uploadDir(id), removed.stored_name), { force: true });
  return present(await repository.find(id));
}

async function leadReadyForCosting(leadId) {
  if (!leadId) return false;
  const lead = await query('SELECT status FROM leads WHERE id = $1', [leadId]);
  if (lead.rows[0]?.status === 'PROCUREMENT_APPROVED') return true;
  if (['COSTING', 'COSTING_SUBMITTED', 'COSTING_CHANGES_REQUESTED', 'COSTING_APPROVED', 'QUOTATION', 'QUOTATION_SENT', 'NEGOTIATION', 'WON', 'CONVERTED'].includes(lead.rows[0]?.status)) {
    return true;
  }
  return repository.leadApproved(leadId);
}

module.exports = {
  home,
  create,
  update,
  setStatus,
  remove,
  seedForLead,
  addDocuments,
  openDocument,
  removeDocument,
  leadReadyForCosting,
};
