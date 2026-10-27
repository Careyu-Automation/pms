const ApiError = require('../utils/ApiError');
const leaveRepository = require('../db/leave.repository');
const repository = require('../db/procurement.repository');

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
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
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
  return {
    title,
    description,
    priority,
    status: current?.status || 'DRAFT',
    projectId: body.projectId === '' ? null : (UUID.test(body.projectId || '') ? body.projectId : (current?.projectId || null)),
    teamId: body.teamId === '' ? null : (UUID.test(body.teamId || '') ? body.teamId : (current?.teamId || null)),
    vendorName: clean(body.vendorName ?? current?.vendorName, 200),
    neededBy: body.neededBy === '' ? null : (cleanDate(body.neededBy) || current?.neededBy || null),
    justification: clean(body.justification ?? current?.justification, 4000),
    requestedBy: current?.requestedById || user.id,
  };
}

async function present(row) {
  const items = await repository.items(row.id);
  const open = !['RECEIVED', 'CANCELLED', 'REJECTED'].includes(row.status);
  return { ...row, items, overdue: Boolean(row.neededBy && row.neededBy < today() && open) };
}

function scope(user) {
  if (isAdmin(user)) return { sql: '', params: [] };
  return { sql: 'WHERE r.requested_by = $1', params: [user.id] };
}

async function home(user, query) {
  const base = scope(user);
  const params = [...base.params];
  const parts = [];
  const add = (sql, value) => {
    params.push(value);
    parts.push(sql.replace('?', `$${params.length}`));
  };
  if (NEXT[query.status]) add('r.status = ?', query.status);
  if (PRIORITIES.has(query.priority)) add('r.priority = ?', query.priority);
  if (UUID.test(query.projectId || '')) add('r.project_id = ?', query.projectId);
  if (query.q) {
    params.push(`%${clean(query.q, 80)}%`);
    const mark = `$${params.length}`;
    parts.push(`(r.title ILIKE ${mark} OR r.vendor_name ILIKE ${mark} OR ('PR-' || LPAD(r.request_number::text, 5, '0')) ILIKE ${mark})`);
  }
  const where = `${base.sql}${parts.length ? `${base.sql ? ' AND ' : 'WHERE '}${parts.join(' AND ')}` : ''}`;
  const [rows, kpis, choices] = await Promise.all([
    repository.list(where, params),
    repository.counts(base.sql, base.params),
    repository.options(),
  ]);
  const detailed = [];
  for (const row of rows) detailed.push(await present(row));
  return { kpis, rows: detailed, options: choices, access: { canCreate: true, canReview: isAdmin(user) } };
}

async function guard(user, id) {
  const row = await repository.find(id);
  if (!row) throw new ApiError(404, 'Procurement request not found.');
  if (!isAdmin(user) && row.requestedById !== user.id) throw new ApiError(403, 'You cannot view this request.');
  return row;
}

async function create(user, body) {
  const input = inputOf(body, null, user);
  const id = await repository.insert(input);
  await repository.setItems(id, linesOf(body));
  return present(await repository.find(id));
}

async function update(user, id, body) {
  const current = await guard(user, id);
  if (!isAdmin(user) && current.requestedById !== user.id) throw new ApiError(403, 'You cannot edit this request.');
  if (!['DRAFT', 'REJECTED'].includes(current.status) && !isAdmin(user)) {
    throw new ApiError(400, 'Only a draft or rejected request can be edited.');
  }
  const input = inputOf(body, current, user);
  input.status = current.status;
  await repository.update(id, input);
  if (Array.isArray(body.items)) await repository.setItems(id, linesOf(body));
  return present(await repository.find(id));
}

async function setStatus(user, id, status) {
  const current = await guard(user, id);
  if (!(NEXT[current.status] || []).includes(status)) throw new ApiError(400, 'That status change is not allowed.');
  if (REVIEW.has(status) && !isAdmin(user) && status !== 'CANCELLED') {
    throw new ApiError(403, 'A project manager needs to review this request.');
  }
  if (status === 'SUBMITTED' && current.requestedById !== user.id && !isAdmin(user)) {
    throw new ApiError(403, 'Only the requester can submit this request.');
  }
  const input = inputOf(current, current, user);
  input.status = status;
  await repository.update(id, input);
  if (status !== 'SUBMITTED') {
    await leaveRepository.notify([current.requestedById], `Procurement ${status.replace(/_/g, ' ').toLowerCase()}: ${current.title}`, current.number, '/procurement-requests');
  }
  return present(await repository.find(id));
}

async function remove(user, id) {
  const current = await guard(user, id);
  const ownDraft = current.requestedById === user.id && current.status === 'DRAFT';
  if (!isAdmin(user) && !ownDraft) throw new ApiError(403, 'Cancel this request instead of deleting it.');
  await repository.remove(id);
}

module.exports = { home, create, update, setStatus, remove };
