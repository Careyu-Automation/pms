const ApiError = require('../utils/ApiError');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const repository = require('../db/checklist.repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VISIBILITY = new Set(['EVERYONE', 'PRIVATE', 'SELECTED_USERS']);

function isAdmin(user) {
  return ['admin', 'super_admin'].includes(user?.role?.code || '');
}

function canAssign(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function accessFor(user, checklist) {
  const owner = checklist.employeeId === user.id || checklist.createdById === user.id;
  const manage = isAdmin(user) || owner;
  return {
    canEdit: manage,
    canDelete: manage,
    canToggle: true,
    canChangeVisibility: manage,
  };
}

async function people() {
  const users = await userRepository.listActive();
  return users.map(toPublicUser).map((person) => ({
    id: person.id,
    fullName: person.fullName,
    email: person.email,
  }));
}

async function assertUsers(ids) {
  const users = await people();
  const known = new Set(users.map((person) => person.id));
  ids.forEach((id) => {
    if (!known.has(id)) throw new ApiError(400, 'Select a valid person.');
  });
}

function itemInput(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new ApiError(400, 'Add at least one checklist item.', { fields: { items: 'Add at least one checklist item.' } });
  }
  if (items.length > 50) throw new ApiError(400, 'A checklist can have at most 50 items.');
  return items.map((item) => {
    const title = clean(item?.title, 200);
    if (title.length < 1) throw new ApiError(400, 'Each checklist item needs a name.', { fields: { items: 'Each checklist item needs a name.' } });
    const id = item?.id ? String(item.id) : null;
    if (id && !UUID.test(id)) throw new ApiError(400, 'A checklist item is not valid.');
    return { id, title };
  });
}

async function checklistInput(user, body, current) {
  const fields = {};
  const title = clean(body.title ?? current?.title, 200);
  if (title.length < 1) fields.title = 'Title is required.';
  let employeeId = body.employeeId || current?.employeeId || user.id;
  if (!canAssign(user)) employeeId = current?.employeeId || user.id;
  if (!UUID.test(employeeId)) fields.employeeId = 'Select an employee.';
  const visibility = body.visibility || current?.visibility || 'EVERYONE';
  if (!VISIBILITY.has(visibility)) fields.visibility = 'Select a valid visibility.';
  if (current && !accessFor(user, current).canChangeVisibility && visibility !== current.visibility) {
    throw new ApiError(403, 'You cannot change who can view this checklist.');
  }
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], { fields });
  await assertUsers([employeeId]);
  const viewerIds = visibility === 'SELECTED_USERS'
    ? [...new Set((Array.isArray(body.viewerIds) ? body.viewerIds : []).map(String))].filter((id) => id !== employeeId)
    : [];
  viewerIds.forEach((id) => {
    if (!UUID.test(id)) throw new ApiError(400, 'Select valid people.');
  });
  if (viewerIds.length) await assertUsers(viewerIds);
  return {
    employeeId,
    title,
    note: clean(body.note ?? current?.note, 4000),
    visitDate: body.visitDate === undefined && current ? (current.visitDate || null) : cleanDate(body.visitDate),
    visibility,
    viewerIds,
    items: body.items ? itemInput(body.items) : null,
  };
}

async function requireVisible(id, user) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Checklist is not valid.');
  const checklist = await repository.findById(id, { userId: user.id, isAdmin: isAdmin(user) });
  if (!checklist) throw new ApiError(404, 'Checklist not found.');
  return checklist;
}

function present(user, checklist) {
  return { ...checklist, access: accessFor(user, checklist) };
}

async function list(user, filters = {}) {
  const scope = ['mine', 'selected', 'all'].includes(filters.scope) ? filters.scope : 'all';
  const employeeIds = String(filters.employeeIds || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => UUID.test(id));
  const checklists = await repository.list({
    userId: user.id,
    isAdmin: isAdmin(user),
    scope: scope === 'selected' && !employeeIds.length ? 'selected' : scope,
    employeeIds,
    q: clean(filters.q, 80),
    sort: ['newest', 'oldest', 'visit', 'completion'].includes(filters.sort) ? filters.sort : 'newest',
  });
  return {
    checklists: checklists.map((checklist) => present(user, checklist)),
    access: { canAssignEmployee: canAssign(user), canViewAll: isAdmin(user) },
  };
}

async function detail(id, user) {
  return present(user, await requireVisible(id, user));
}

async function users() {
  return people();
}

async function create(user, body) {
  const input = await checklistInput(user, body);
  if (!input.items) throw new ApiError(400, 'Add at least one checklist item.', { fields: { items: 'Add at least one checklist item.' } });
  const id = await repository.withTransaction(async (client) => {
    const checklistId = await repository.insertChecklist(client, { ...input, createdById: user.id });
    await repository.syncItems(client, checklistId, input.items);
    await repository.replaceViewers(client, checklistId, input.viewerIds);
    await repository.addActivity(checklistId, user.id, `${user.fullName} created "${input.title}"`, client);
    return checklistId;
  });
  return detail(id, user);
}

async function update(id, user, body) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canEdit) throw new ApiError(403, 'You cannot edit this checklist.');
  const input = await checklistInput(user, body, current);
  if (!input.items) throw new ApiError(400, 'Add at least one checklist item.', { fields: { items: 'Add at least one checklist item.' } });
  await repository.withTransaction(async (client) => {
    await repository.updateChecklist(client, current.id, input);
    await repository.syncItems(client, current.id, input.items);
    await repository.replaceViewers(client, current.id, input.viewerIds);
    await repository.addActivity(current.id, user.id, `${user.fullName} updated "${input.title}"`, client);
    if (input.visibility !== current.visibility) {
      await repository.addActivity(current.id, user.id, `${user.fullName} changed visibility`, client);
    }
  });
  return detail(current.id, user);
}

async function remove(id, user) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canDelete) throw new ApiError(403, 'You cannot delete this checklist.');
  await repository.withTransaction(async (client) => {
    await repository.addActivity(current.id, user.id, `${user.fullName} deleted "${current.title}"`, client);
    await client.query('DELETE FROM checklists WHERE id = $1', [current.id]);
  });
  return { id: current.id };
}

async function addItem(id, user, body) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canEdit) throw new ApiError(403, 'You cannot edit this checklist.');
  const [item] = itemInput([{ title: body.title }]);
  const saved = await repository.addItem(current.id, item.title);
  await repository.addActivity(current.id, user.id, `${user.fullName} added "${saved.title}"`);
  return detail(current.id, user);
}

async function updateItem(id, itemId, user, body) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canEdit) throw new ApiError(403, 'You cannot edit this checklist.');
  if (!UUID.test(itemId || '')) throw new ApiError(400, 'Checklist item is not valid.');
  const [item] = itemInput([{ id: itemId, title: body.title }]);
  const saved = await repository.updateItem(current.id, itemId, item.title);
  if (!saved) throw new ApiError(404, 'Checklist item not found.');
  return detail(current.id, user);
}

async function removeItem(id, itemId, user) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canEdit) throw new ApiError(403, 'You cannot edit this checklist.');
  if (!UUID.test(itemId || '')) throw new ApiError(400, 'Checklist item is not valid.');
  if (current.items.length < 2) throw new ApiError(400, 'A checklist needs at least one item.');
  const removed = await repository.deleteItem(current.id, itemId);
  if (!removed) throw new ApiError(404, 'Checklist item not found.');
  return detail(current.id, user);
}

async function toggleItem(id, itemId, user) {
  const current = await requireVisible(id, user);
  if (!UUID.test(itemId || '')) throw new ApiError(400, 'Checklist item is not valid.');
  const saved = await repository.toggleItem(current.id, itemId);
  if (!saved) throw new ApiError(404, 'Checklist item not found.');
  const verb = saved.completed ? 'completed' : 'reopened';
  await repository.addActivity(current.id, user.id, `${user.fullName} ${verb} "${saved.title}"`);
  const next = await detail(current.id, user);
  return { checklist: next, item: saved };
}

async function setVisibility(id, user, body) {
  const current = await requireVisible(id, user);
  if (!accessFor(user, current).canChangeVisibility) throw new ApiError(403, 'You cannot change who can view this checklist.');
  const input = await checklistInput(user, {
    ...current,
    visibility: body.visibility,
    viewerIds: body.viewerIds,
    items: current.items,
  }, current);
  await repository.withTransaction(async (client) => {
    await repository.updateChecklist(client, current.id, { ...input, employeeId: current.employeeId });
    await repository.replaceViewers(client, current.id, input.viewerIds);
    await repository.addActivity(current.id, user.id, `${user.fullName} changed visibility`, client);
  });
  return detail(current.id, user);
}

module.exports = {
  list,
  detail,
  users,
  create,
  update,
  remove,
  addItem,
  updateItem,
  removeItem,
  toggleItem,
  setVisibility,
};
