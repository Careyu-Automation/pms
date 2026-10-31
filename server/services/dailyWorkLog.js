const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const repository = require('../db/dailyWork.repository');
const { isoToday, rangeWindow, shiftIso } = require('./dailyWorkDelay');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const DEPENDENCIES = new Set(['', 'NONE', 'TEAM', 'EMPLOYEE', 'APPROVAL', 'CUSTOMER', 'VENDOR', 'PROCUREMENT', 'TECHNICAL', 'MATERIAL', 'SOFTWARE', 'HARDWARE', 'OTHER']);
const STATUS_LABEL = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  ON_HOLD: 'On Hold',
};

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function seesOrganization(user) {
  const { seesOrganization: orgWide } = require('./workflow.roles');
  return orgWide(user);
}

function canManage(user) {
  return seesOrganization(user);
}

function canFuture(user) {
  return ['admin', 'super_admin', 'management'].includes(user?.role?.code || '');
}

function attachShifts(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!row.id) return;
    const key = [row.employeeId, row.currentDate, row.taskId || row.workTitle || row.id].join('|');
    const group = groups.get(key) || {};
    group[row.period === 'EVENING' ? 'evening' : 'morning'] = row;
    groups.set(key, group);
  });
  return rows.map((row) => {
    const key = [row.employeeId, row.currentDate, row.taskId || row.workTitle || row.id].join('|');
    const group = groups.get(key) || {};
    return {
      ...row,
      morningWork: row.morningWork || (row.period === 'EVENING' ? (group.morning?.morningWork || '') : ''),
      eveningWork: row.eveningWork || (row.period === 'MORNING' ? (group.evening?.eveningWork || '') : ''),
    };
  });
}

function present(user, row) {
  const own = row.employeeId === user.id;
  const editable = own || seesOrganization(user);
  return {
    ...row,
    access: { canEdit: editable, canDelete: editable && Boolean(row.id) && row.entryKind !== 'ASSIGNED' },
  };
}

function hoursLabel(rows) {
  const total = rows.reduce((sum, row) => sum + row.hours * 60 + row.minutes, 0);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (!hours && !minutes) return '0h';
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function summarize(rows) {
  return {
    activities: rows.length,
    completed: rows.filter((row) => row.status === 'COMPLETED').length,
    inProgress: rows.filter((row) => row.status === 'IN_PROGRESS').length,
    blocked: rows.filter((row) => row.status === 'BLOCKED').length,
    hoursLabel: hoursLabel(rows),
    employees: new Set(rows.map((row) => row.employeeId)).size,
    projectWork: rows.filter((row) => row.workType === 'PROJECT_WORK').length,
    internalWork: rows.filter((row) => row.workType === 'INTERNAL').length,
    productDevelopment: rows.filter((row) => row.workType === 'PRODUCT_DEVELOPMENT').length,
    research: rows.filter((row) => row.workType === 'RND' || row.workType === 'RESEARCH').length,
    support: rows.filter((row) => ['CUSTOMER_SUPPORT', 'TECHNICAL_SUPPORT', 'SALES_SUPPORT'].includes(row.workType)).length,
  };
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function workText(row) {
  const title = normalizeText(row.workTitle);
  const description = normalizeText(row.description);
  if (description && title && description !== title && title !== 'daily work') {
    return description.startsWith(title) ? description : `${title} ${description}`;
  }
  return description || title;
}

function roughlySameWork(a, b) {
  if (a.employeeId !== b.employeeId) return false;
  if (a.taskId && b.taskId && a.taskId === b.taskId) return true;
  if ((a.projectId || '') !== (b.projectId || '')) return false;
  const left = workText(a);
  const right = workText(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function preferSeedRow(current, next) {
  if (!current) return next;
  const curStart = current.startDate || '';
  const nextStart = next.startDate || '';
  if (nextStart > curStart) return next;
  if (nextStart < curStart) return current;
  if (next.period === 'EVENING' && current.period !== 'EVENING') return next;
  if (next.taskId && !current.taskId) return next;
  if (String(next.updatedAt || '') > String(current.updatedAt || '')) return next;
  return current;
}

function asCarriedRow(row, day) {
  return {
    ...row,
    id: '',
    entryKind: row.taskId ? 'ASSIGNED' : 'CARRIED',
    currentDate: day,
    period: 'MORNING',
    hours: 0,
    minutes: 0,
    loggedHours: 0,
    morningWork: '',
    eveningWork: '',
    reasonForDelay: row.reasonForDelay || '',
    nextAction: '',
    attachments: [],
    createdAt: undefined,
    updatedAt: undefined,
  };
}

function isOccupied(row, occupiedRows) {
  return occupiedRows.some((item) => roughlySameWork(item, row));
}

/** Prefer the latest In Progress copy of each work item; Completed never rolls forward. */
function carryForwardInProgress(previousRows, day, occupiedRows) {
  const latest = [];
  previousRows.forEach((row) => {
    if (row.status !== 'IN_PROGRESS') return;
    const index = latest.findIndex((item) => roughlySameWork(item, row));
    if (index < 0) latest.push(row);
    else latest[index] = preferSeedRow(latest[index], row);
  });
  return latest
    .filter((row) => !isOccupied(row, occupiedRows))
    .map((row) => asCarriedRow(row, day));
}

/** Keep one unsaved seed row per work item (assigned + carried). */
function dedupeSeedRows(rows) {
  const unique = [];
  rows.forEach((row) => {
    const index = unique.findIndex((item) => roughlySameWork(item, row));
    if (index < 0) unique.push(row);
    else unique[index] = preferSeedRow(unique[index], row);
  });
  return unique;
}

async function buildInput(user, body, current) {
  const employeeId = seesOrganization(user)
    ? (body.employeeId || current?.employeeId || user.id)
    : (current?.employeeId || user.id);
  if (!UUID.test(employeeId)) throw new ApiError(400, 'Select an employee.');
  const catalog = await repository.catalog();
  const workType = clean(body.workType || current?.workType, 40);
  if (!catalog.workTypes.some((item) => item.code === workType)) throw new ApiError(400, 'Select a work type.', { fields: { workType: 'Select a work type.' } });
  const workTitle = clean(body.workTitle || body.title, 200);
  if (workTitle.length < 2) throw new ApiError(400, 'Work title is required.', { fields: { workTitle: 'Enter a work title.' } });
  const description = clean(body.description, 4000);
  if (description.length < 2) throw new ApiError(400, 'Describe the work.', { fields: { description: 'Describe what you worked on.' } });
  const status = body.status || current?.status || 'IN_PROGRESS';
  if (!STATUSES.has(status)) throw new ApiError(400, 'Select a valid status.');
  const priority = body.priority || current?.priority || 'MEDIUM';
  if (!PRIORITIES.has(priority)) throw new ApiError(400, 'Select a valid priority.');
  const updateDate = cleanDate(body.workDate || body.currentDate || body.updateDate) || current?.currentDate || isoToday();
  if (!updateDate) throw new ApiError(400, 'Select a work date.');
  if (updateDate > isoToday() && !canFuture(user)) throw new ApiError(400, 'Future work dates need an admin.');
  const projectId = body.projectId && body.projectId !== 'none' ? String(body.projectId) : null;
  const productId = body.productId && body.productId !== 'none' ? String(body.productId) : null;
  if (projectId && !UUID.test(projectId)) throw new ApiError(400, 'Select a valid project.');
  if (productId && !UUID.test(productId)) throw new ApiError(400, 'Select a valid product.');
  if (projectId && !catalog.projects.some((item) => item.id === projectId)) throw new ApiError(400, 'Select a valid project.');
  if (productId && !catalog.products.some((item) => item.id === productId)) throw new ApiError(400, 'Select a valid product.');
  const memberships = catalog.memberships.filter((item) => item.userId === employeeId);
  let teamId = body.teamId ? String(body.teamId) : (current?.teamId || '');
  if (teamId && !UUID.test(teamId)) throw new ApiError(400, 'Select a valid team.');
  if (!teamId) teamId = memberships.find((item) => item.isPrimary)?.teamId || memberships[0]?.teamId || null;
  else if (memberships.length && !memberships.some((item) => item.teamId === teamId) && !canManage(user)) {
    throw new ApiError(400, 'Select one of your teams.');
  }
  const dependencyType = clean(body.dependencyType, 30).toUpperCase();
  const normalizedDependency = dependencyType === 'NONE' ? '' : dependencyType;
  if (!DEPENDENCIES.has(normalizedDependency)) throw new ApiError(400, 'Select a valid dependency.');
  const taskId = UUID.test(String(body.taskId || current?.taskId || '')) ? String(body.taskId || current.taskId) : null;
  let progress = body.progress;
  if (progress === '' || progress == null) progress = current?.progress ?? null;
  if (progress != null && progress !== '') {
    progress = Number(progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      throw new ApiError(400, 'Progress must be a whole number from 0 to 100.', { fields: { progress: 'Enter progress from 0 to 100.' } });
    }
    progress = Math.round(progress);
  } else progress = null;
  const period = String(body.period || current?.period || 'MORNING').toUpperCase();
  if (period !== 'MORNING' && period !== 'EVENING') throw new ApiError(400, 'Select Morning or Evening.');
  const logged = body.loggedHours != null && body.loggedHours !== '' ? Number(body.loggedHours) : null;
  const rawHours = logged != null ? logged : Number(body.hours ?? current?.hours ?? 0);
  const rawMinutes = logged != null ? 0 : Number(body.minutes ?? current?.minutes ?? 0);
  if (!Number.isFinite(rawHours) || rawHours < 0 || rawHours > 24) throw new ApiError(400, 'Hours must be between 0 and 24.', { fields: { hours: 'Enter hours from 0 to 24.' } });
  if (!Number.isFinite(rawMinutes) || rawMinutes < 0 || rawMinutes > 59) throw new ApiError(400, 'Minutes must be between 0 and 59.', { fields: { minutes: 'Enter minutes from 0 to 59.' } });
  const totalMinutes = Math.round(rawHours * 60 + rawMinutes);
  if (totalMinutes > 1440) throw new ApiError(400, 'Time for one update cannot exceed 24 hours.');
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const startDate = cleanDate(body.startDate || current?.startDate);
  const deadline = cleanDate(body.deadline || body.taskDeadline || current?.deadline);
  if (startDate && deadline && deadline < startDate) {
    throw new ApiError(400, 'The deadline cannot be before the start date.', { fields: { deadline: 'The deadline cannot be before the start date.' } });
  }
  const reasonForDelay = clean(body.reasonForDelay, 1000);
  const delayed = status === 'BLOCKED' || (deadline && deadline < updateDate && status !== 'COMPLETED');
  if (delayed && reasonForDelay.length < 2) {
    throw new ApiError(400, 'Explain why this work is delayed.', { fields: { reasonForDelay: 'A reason is required when work is blocked or overdue.' } });
  }
  return {
    employeeId,
    projectId: projectId || null,
    productId: productId || null,
    teamId: teamId || null,
    workType,
    workTitle,
    description,
    status,
    priority,
    updateDate,
    nextAction: clean(body.nextAction, 500),
    hours,
    minutes,
    dependencyType: normalizedDependency,
    dependencyDetails: clean(body.dependencyDetails, 1500),
    createdById: user.id,
    taskId,
    progress,
    period,
    projectName: clean(body.projectName, 200),
    startDate,
    deadline,
    reasonForDelay,
    morningWork: clean(body.morningWork, 4000),
    eveningWork: clean(body.eveningWork, 4000),
  };
}

async function audience(user) {
  // Daily Work Updates is personal by default. Org roles may browse others via filters;
  // email digests pass organization: true. Team leads must not see teammates mixed into their sheet.
  if (seesOrganization(user)) return { organization: true, employeeIds: null };
  return { organization: false, employeeIds: [user.id] };
}

async function list(user, filters = {}) {
  const anchor = cleanDate(filters.date) || isoToday();
  const window = rangeWindow(filters.range || 'today', anchor, cleanDate(filters.from), cleanDate(filters.to));
  if (window.from > window.to) throw new ApiError(400, 'The start date must be on or before the end date.');
  const scope = await audience(user);
  // Email reports and management digests can request organization-wide visibility.
  const organization = filters.organization === true || scope.organization;
  const rows = await repository.logList({
    ...window,
    organization,
    employeeIds: organization ? null : scope.employeeIds,
    period: clean(filters.period, 20).toUpperCase(),
    anchor: anchor,
    employeeId: UUID.test(filters.employeeId || '') ? filters.employeeId : '',
    teamId: UUID.test(filters.teamId || '') ? filters.teamId : '',
    projectId: filters.projectId === 'none' ? 'none' : (UUID.test(filters.projectId || '') ? filters.projectId : ''),
    productId: UUID.test(filters.productId || '') ? filters.productId : '',
    workType: clean(filters.workType, 40),
    status: STATUSES.has(filters.status) ? filters.status : '',
    priority: PRIORITIES.has(filters.priority) ? filters.priority : '',
    q: clean(filters.q, 80),
  }, user);
  const listFilters = {
    organization,
    employeeIds: organization ? null : scope.employeeIds,
    period: clean(filters.period, 20).toUpperCase(),
    anchor,
    employeeId: UUID.test(filters.employeeId || '') ? filters.employeeId : '',
    teamId: UUID.test(filters.teamId || '') ? filters.teamId : '',
    projectId: filters.projectId === 'none' ? 'none' : (UUID.test(filters.projectId || '') ? filters.projectId : ''),
    productId: UUID.test(filters.productId || '') ? filters.productId : '',
    workType: clean(filters.workType, 40),
    status: STATUSES.has(filters.status) ? filters.status : '',
    priority: PRIORITIES.has(filters.priority) ? filters.priority : '',
    q: clean(filters.q, 80),
  };
  const assigned = await repository.assignedForLog({
    ...window,
    ...listFilters,
    employeeIds: scope.employeeIds,
  }, user);
  const reported = new Set(rows.filter((row) => row.taskId).map((row) => `${row.taskId}:${row.employeeId}:${row.period || 'MORNING'}`));
  const skipSeed = Boolean(filters.period || filters.savedOnly);
  const pendingAssigned = skipSeed
    ? []
    : assigned.filter((row) => {
      if (reported.has(`${row.taskId}:${row.employeeId}:${row.period || 'MORNING'}`)) return false;
      return !isOccupied(row, rows);
    });

  let carried = [];
  const singleDay = window.from === window.to;
  const allowCarry = !skipSeed && singleDay && (!listFilters.status || listFilters.status === 'IN_PROGRESS');
  if (allowCarry) {
    const previousDay = shiftIso(window.from, -1);
    const previousRows = await repository.logList({
      from: previousDay,
      to: previousDay,
      ...listFilters,
      status: '',
      period: '',
    }, user);
    carried = carryForwardInProgress(previousRows, window.from, [...rows, ...pendingAssigned]);
  }

  const seeded = dedupeSeedRows([...pendingAssigned, ...carried]);
  const visible = attachShifts([...rows, ...seeded]).map((row) => present(user, row));
  visible.sort((a, b) => String(b.currentDate).localeCompare(String(a.currentDate)) || String(a.employeeName).localeCompare(String(b.employeeName)));
  const lookups = await repository.catalog();
  if (!organization) {
    lookups.people = lookups.people.filter((person) => person.id === user.id);
    lookups.memberships = lookups.memberships.filter((item) => item.userId === user.id);
  }
  return {
    updates: visible,
    summary: summarize(visible),
    window,
    today: isoToday(),
    lookups,
    access: { canAssignEmployee: organization },
  };
}

async function detailUpdate(id, user) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Update is not valid.');
  const row = await repository.findLog(id);
  if (!row) throw new ApiError(404, 'Daily work update not found.');
  const visible = await repository.logList({
    from: row.currentDate,
    to: row.currentDate,
    employeeId: row.employeeId,
    organization: seesOrganization(user),
  }, user);
  if (!visible.some((item) => item.id === row.id)) throw new ApiError(403, 'You cannot view this daily work update.');
  return present(user, row);
}

async function history(ref, user) {
  if (!UUID.test(ref || '')) throw new ApiError(400, 'Update is not valid.');
  const row = await detailUpdate(ref, user);
  const [related, activity] = await Promise.all([
    repository.relatedLogs(row.employeeId, row.workTitle, row.id),
    repository.activityForUpdate(row.id),
  ]);
  return { update: row, updates: [row, ...related].sort((a, b) => String(b.currentDate).localeCompare(String(a.currentDate))), activity };
}

async function create(user, body) {
  const input = await buildInput(user, body);
  if (!seesOrganization(user) && input.employeeId !== user.id) {
    throw new ApiError(403, 'You can only record your own daily work.');
  }
  const id = await repository.withTransaction(async (client) => {
    const linked = input.taskId ? await repository.linkAssignedTask(client, input.taskId, input) : null;
    if (linked?.updateId) {
      await repository.saveLog(client, linked.updateId, input);
      await repository.syncTimeEntry(client, linked.updateId, input);
      await repository.syncAssignedTask(client, input.taskId, input);
      await repository.addActivity(client, linked.itemId, linked.updateId, user.id, `${user.fullName} updated ${input.workTitle}`);
      return linked.updateId;
    }
    const updateId = await repository.insertLog(client, { ...input, workItemId: linked?.itemId || null });
    await repository.syncTimeEntry(client, updateId, input);
    if (input.taskId) await repository.syncAssignedTask(client, input.taskId, input);
    await repository.addActivity(client, linked?.itemId || null, updateId, user.id, `${user.fullName} added ${input.workTitle}`);
    return updateId;
  });
  return detailUpdate(id, user);
}

async function update(id, user, body) {
  const current = await detailUpdate(id, user);
  if (!current.access.canEdit) throw new ApiError(403, 'You cannot edit this daily work update.');
  const input = await buildInput(user, body, current);
  await repository.withTransaction(async (client) => {
    await repository.saveLog(client, current.id, input);
    await repository.syncTimeEntry(client, current.id, { ...input, createdById: current.createdById || user.id });
    if (input.status !== current.status) {
      await repository.addActivity(client, null, current.id, user.id, `${user.fullName} changed status to ${STATUS_LABEL[input.status]}`);
    }
    if (input.workTitle !== current.workTitle || input.description !== current.description) {
      await repository.addActivity(client, null, current.id, user.id, `${user.fullName} updated the work entry`);
    }
    if (current.taskId) await repository.syncAssignedTask(client, current.taskId, input);
  });
  return detailUpdate(current.id, user);
}

async function remove(id, user) {
  const current = await detailUpdate(id, user);
  if (!current.access.canDelete) throw new ApiError(403, 'You cannot delete this daily work update.');
  await repository.withTransaction(async (client) => {
    await repository.addActivity(client, null, null, user.id, `${user.fullName} deleted ${current.workTitle} on ${current.currentDate}`);
    await repository.removeUpdate(client, current.id);
  });
  return { id: current.id };
}

const uploadRoot = path.join(__dirname, '..', 'uploads', 'daily-work');

async function addAttachments(id, user, files) {
  const current = await detailUpdate(id, user);
  if (!current.access.canEdit) throw new ApiError(403, 'You cannot add files to this update.');
  fs.mkdirSync(uploadRoot, { recursive: true });
  const saved = [];
  for (const file of files || []) {
    saved.push(await repository.insertAttachment({
      updateId: current.id,
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype || '',
      size: file.size || 0,
      uploadedBy: user.id,
    }));
  }
  if (saved.length) {
    await repository.withTransaction(async (client) => {
      await repository.addActivity(client, null, current.id, user.id, `${user.fullName} added ${saved.length} attachment${saved.length === 1 ? '' : 's'}`);
    });
  }
  return detailUpdate(current.id, user);
}

async function attachmentFile(updateId, fileId, user) {
  await detailUpdate(updateId, user);
  const file = await repository.findAttachment(fileId);
  if (!file || file.update_id !== updateId) throw new ApiError(404, 'Attachment not found.');
  return { file, path: path.join(uploadRoot, file.stored_name) };
}

async function removeAttachment(updateId, fileId, user) {
  const current = await detailUpdate(updateId, user);
  if (!current.access.canEdit) throw new ApiError(403, 'You cannot remove this file.');
  const removed = await repository.removeAttachment(fileId);
  if (!removed || removed.update_id !== updateId) throw new ApiError(404, 'Attachment not found.');
  fs.rmSync(path.join(uploadRoot, removed.stored_name), { force: true });
  return detailUpdate(updateId, user);
}

module.exports = {
  list,
  detailUpdate,
  history,
  create,
  update,
  remove,
  addAttachments,
  attachmentFile,
  removeAttachment,
  STATUS_LABEL,
  seesOrganization,
  uploadRoot,
};
