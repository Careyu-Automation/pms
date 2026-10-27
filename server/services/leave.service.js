const ApiError = require('../utils/ApiError');
const repository = require('../db/leave.repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(['PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'CANCELLED']);

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function cleanDate(value) {
  const text = String(value || '').slice(0, 10);
  return DATE.test(text) ? text : '';
}

function shiftIso(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const monthText = String(date.getMonth() + 1).padStart(2, '0');
  const dayText = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${monthText}-${dayText}`;
}

function weekday(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

function workingDates(start, end, calendar) {
  const weekends = new Set((calendar.weekendDays || [0, 6]).map(Number));
  const holidays = new Map(calendar.holidays.map((item) => [item.date, item]));
  const dates = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 370) {
    const holiday = holidays.get(cursor);
    const weekend = weekends.has(weekday(cursor));
    const working = holiday ? holiday.isWorkingDay : !weekend;
    if (working) dates.push(cursor);
    cursor = shiftIso(cursor, 1);
    guard += 1;
  }
  return dates;
}

async function accessFor(user) {
  const admin = isAdmin(user);
  const teamIds = await repository.leadTeamIds(user.id);
  return {
    admin,
    teamIds,
    canApprove: admin || teamIds.length > 0,
    canConfigure: admin,
  };
}

function listFilters(actor, access, query, permission) {
  const filters = {
    q: String(query.q || '').trim().slice(0, 80),
    from: cleanDate(query.from),
    to: cleanDate(query.to),
    status: STATUSES.has(query.status) ? query.status : '',
    leaveTypeId: UUID.test(query.leaveTypeId || '') ? query.leaveTypeId : '',
    teamId: UUID.test(query.teamId || '') ? query.teamId : '',
    employeeId: UUID.test(query.employeeId || '') ? query.employeeId : '',
    permission,
  };
  if (!access.admin) {
    if (access.canApprove) {
      filters.teamIds = access.teamIds;
      filters.actorId = actor.id;
    } else {
      filters.userId = actor.id;
    }
  }
  return filters;
}

async function overview(actor) {
  const access = await accessFor(actor);
  const year = new Date().getFullYear();
  const [types, balanceRows, counts, teams, calendar, employees, ownLeave, ownPermissions] = await Promise.all([
    repository.listTypes(true),
    repository.balances(actor.id, year),
    repository.summaryCounts(actor.id, year),
    access.canApprove ? repository.teams() : Promise.resolve([]),
    repository.calendar(),
    repository.directory(access.admin, access.teamIds),
    repository.listLeave({ userId: actor.id, status: 'PENDING' }),
    repository.listPermissions({ userId: actor.id, status: 'PENDING' }),
  ]);
  const available = balanceRows.reduce((sum, row) => sum + row.availableDays, 0);
  const used = balanceRows.reduce((sum, row) => sum + row.usedDays, 0);
  return {
    year,
    types,
    balances: balanceRows,
    summary: {
      availableDays: available,
      usedDays: used,
      pendingRequests: counts.pendingRequests,
      approvedDays: counts.approvedDays,
    },
    teams: access.admin ? teams : teams.filter((team) => access.teamIds.includes(team.id)),
    employees,
    myPending: [...ownLeave, ...ownPermissions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt)),
    weekendDays: calendar.weekendDays,
    holidays: calendar.holidays,
    access,
  };
}

async function types() {
  return repository.listTypes(true);
}

async function balance(actor, query) {
  const year = Number(query.year) || new Date().getFullYear();
  const userId = isAdmin(actor) && UUID.test(query.userId || '') ? query.userId : actor.id;
  if (userId !== actor.id) {
    const access = await accessFor(actor);
    if (!access.admin && !access.canApprove) throw new ApiError(403, 'You can only view your own leave balance.');
  }
  return { year, balances: await repository.balances(userId, year) };
}

function durationOf(body, calendar) {
  const start = cleanDate(body.startDate);
  const end = cleanDate(body.endDate);
  if (!start || !end) throw new ApiError(400, 'Choose a start and end date.');
  if (end < start) throw new ApiError(400, 'End date cannot be before the start date.');
  const durationType = ['FULL', 'FIRST_HALF', 'SECOND_HALF'].includes(body.durationType) ? body.durationType : 'FULL';
  const working = workingDates(start, end, calendar);
  if (durationType !== 'FULL') {
    if (start !== end) throw new ApiError(400, 'A half day must start and end on the same date.');
    if (!working.length) throw new ApiError(400, 'That date is not a working day.');
    return { start, end, durationType, durationDays: 0.5, year: Number(start.slice(0, 4)) };
  }
  if (!working.length) throw new ApiError(400, 'The selected dates do not include a working day.');
  return { start, end, durationType, durationDays: working.length, year: Number(start.slice(0, 4)) };
}

async function createLeave(actor, body) {
  const type = await repository.findType(body.leaveTypeId);
  if (!type || !type.isActive) throw new ApiError(400, 'Select a leave type.');
  const calendar = await repository.calendar();
  const span = durationOf(body, calendar);
  const reason = String(body.reason || '').trim().slice(0, 2000);
  if (reason.length < 2) throw new ApiError(400, 'Reason is required.');
  const note = String(body.note || '').trim().slice(0, 2000);
  if (await repository.leaveOverlap(actor.id, span.start, span.end)) {
    throw new ApiError(409, 'You already have a leave request for this date range.');
  }
  await repository.ensureBalances(actor.id, span.year);
  const rows = await repository.balances(actor.id, span.year);
  const balanceRow = rows.find((item) => item.leaveTypeId === type.id);
  if (!balanceRow || balanceRow.availableDays < span.durationDays) {
    throw new ApiError(400, 'Insufficient leave balance for the selected dates.');
  }
  const teamId = await repository.primaryTeam(actor.id);
  const id = await repository.withTransaction(async (client) => {
    const requestId = await repository.insertLeave(client, {
      year: span.year,
      userId: actor.id,
      teamId,
      leaveTypeId: type.id,
      startDate: span.start,
      endDate: span.end,
      durationDays: span.durationDays,
      durationType: span.durationType,
      reason,
      note,
      attachmentName: body.attachmentName || '',
      attachmentPath: body.attachmentPath || '',
    });
    await repository.adjustPending(client, actor.id, type.id, span.year, span.durationDays);
    await repository.addLeaveHistory(client, requestId, 'REQUESTED', actor.id, reason);
    await repository.addActivity(client, {
      userId: actor.id,
      actorId: actor.id,
      leaveRequestId: requestId,
      action: 'Leave requested',
      comment: `${type.name} · ${span.durationDays} day(s)`,
    });
    return requestId;
  });
  const request = await repository.findLeave(id);
  const approvers = await repository.approverIds(actor.id);
  await repository.notify(approvers, 'Leave request submitted', `${actor.fullName} requested ${type.name}.`, '/leave');
  return request;
}

async function assertReview(actor, request) {
  if (!request) throw new ApiError(404, 'Request not found.');
  if (request.userId === actor.id) throw new ApiError(403, 'You cannot review your own request.');
  const access = await accessFor(actor);
  if (access.admin) return access;
  if (!access.teamIds.length) throw new ApiError(403, 'You cannot review this request.');
  const visible = await repository.listLeave({
    employeeId: request.userId,
    teamIds: access.teamIds,
    actorId: actor.id,
  });
  if (!visible.some((item) => item.id === request.id) && request.kind === 'LEAVE') {
    throw new ApiError(403, 'You cannot review this request.');
  }
  return access;
}

async function visibleLeave(actor, id) {
  const request = await repository.findLeave(id);
  if (!request) throw new ApiError(404, 'Leave request not found.');
  const access = await accessFor(actor);
  if (request.userId === actor.id || access.admin) return { request, access };
  const rows = await repository.listLeave({ employeeId: request.userId, teamIds: access.teamIds, actorId: actor.id });
  if (!rows.some((item) => item.id === request.id)) throw new ApiError(404, 'Leave request not found.');
  return { request, access };
}

async function visiblePermission(actor, id) {
  const request = await repository.findPermission(id);
  if (!request) throw new ApiError(404, 'Permission request not found.');
  const access = await accessFor(actor);
  if (request.userId === actor.id || access.admin) return { request, access };
  const rows = await repository.listPermissions({ employeeId: request.userId, teamIds: access.teamIds, actorId: actor.id });
  if (!rows.some((item) => item.id === request.id)) throw new ApiError(404, 'Permission request not found.');
  return { request, access };
}

async function leaveDetail(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Request is not valid.');
  const { request, access } = await visibleLeave(actor, id);
  const history = await repository.leaveHistory(id);
  return {
    request,
    history,
    canReview: request.status === 'PENDING' && request.userId !== actor.id && (access.admin || access.canApprove),
    canWithdraw: request.status === 'PENDING' && request.userId === actor.id,
  };
}

async function updateLeave(actor, id, body) {
  const { request } = await visibleLeave(actor, id);
  if (request.userId !== actor.id) throw new ApiError(403, 'You can only edit your own request.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be edited.');
  const calendar = await repository.calendar();
  const span = durationOf({
    startDate: body.startDate || request.startDate,
    endDate: body.endDate || request.endDate,
    durationType: body.durationType || request.durationType,
  }, calendar);
  const reason = String(body.reason || request.reason).trim().slice(0, 2000);
  if (reason.length < 2) throw new ApiError(400, 'Reason is required.');
  if (await repository.leaveOverlap(actor.id, span.start, span.end, id)) {
    throw new ApiError(409, 'You already have a leave request for this date range.');
  }
  const rows = await repository.balances(actor.id, span.year);
  const balanceRow = rows.find((item) => item.leaveTypeId === request.leaveTypeId);
  const availableWithThis = (balanceRow?.availableDays || 0) + request.durationDays;
  if (availableWithThis < span.durationDays) throw new ApiError(400, 'Insufficient leave balance for the selected dates.');
  await repository.withTransaction(async (client) => {
    await repository.adjustPending(client, actor.id, request.leaveTypeId, Number(request.startDate.slice(0, 4)), -request.durationDays);
    await repository.adjustPending(client, actor.id, request.leaveTypeId, span.year, span.durationDays);
    await client.query(
      `UPDATE leave_requests
       SET start_date = $2, end_date = $3, duration_days = $4, duration_type = $5, reason = $6, note = $7
       WHERE id = $1`,
      [id, span.start, span.end, span.durationDays, span.durationType, reason, String(body.note ?? request.note).trim().slice(0, 2000)],
    );
  });
  return leaveDetail(actor, id);
}

async function withdrawLeave(actor, id) {
  const { request } = await visibleLeave(actor, id);
  if (request.userId !== actor.id) throw new ApiError(403, 'You can only withdraw your own request.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be withdrawn.');
  const year = Number(request.startDate.slice(0, 4));
  await repository.withTransaction(async (client) => {
    await repository.reviewLeave(client, id, { status: 'WITHDRAWN', actorId: actor.id, approvalComment: '', rejectionReason: '' });
    await repository.adjustPending(client, actor.id, request.leaveTypeId, year, -request.durationDays);
    await repository.addLeaveHistory(client, id, 'WITHDRAWN', actor.id, '');
    await repository.addActivity(client, { userId: actor.id, actorId: actor.id, leaveRequestId: id, action: 'Leave withdrawn', comment: request.requestNumber });
  });
  const approvers = await repository.approverIds(actor.id);
  await repository.notify(approvers, 'Leave request withdrawn', `${actor.fullName} withdrew ${request.requestNumber}.`, '/leave');
  return leaveDetail(actor, id);
}

async function approveLeave(actor, id, body) {
  const { request } = await visibleLeave(actor, id);
  await assertReview(actor, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be approved.');
  const year = Number(request.startDate.slice(0, 4));
  const comment = String(body.comment || '').trim().slice(0, 2000);
  await repository.withTransaction(async (client) => {
    await repository.approveBalance(client, request.userId, request.leaveTypeId, year, request.durationDays);
    await repository.reviewLeave(client, id, { status: 'APPROVED', actorId: actor.id, approvalComment: comment, rejectionReason: '' });
    await repository.addLeaveHistory(client, id, 'APPROVED', actor.id, comment);
    await repository.addActivity(client, { userId: request.userId, actorId: actor.id, leaveRequestId: id, action: 'Leave approved', comment: request.requestNumber });
  });
  await repository.notify([request.userId], 'Leave approved', `${request.requestNumber} was approved.`, '/leave');
  return leaveDetail(actor, id);
}

async function rejectLeave(actor, id, body) {
  const { request } = await visibleLeave(actor, id);
  await assertReview(actor, request);
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be rejected.');
  const reason = String(body.reason || body.comment || '').trim().slice(0, 2000);
  if (reason.length < 2) throw new ApiError(400, 'A rejection reason is required.');
  const year = Number(request.startDate.slice(0, 4));
  await repository.withTransaction(async (client) => {
    await repository.adjustPending(client, request.userId, request.leaveTypeId, year, -request.durationDays);
    await repository.reviewLeave(client, id, { status: 'REJECTED', actorId: actor.id, approvalComment: '', rejectionReason: reason });
    await repository.addLeaveHistory(client, id, 'REJECTED', actor.id, reason);
    await repository.addActivity(client, { userId: request.userId, actorId: actor.id, leaveRequestId: id, action: 'Leave rejected', comment: reason });
  });
  await repository.notify([request.userId], 'Leave rejected', `${request.requestNumber}: ${reason}`, '/leave');
  return leaveDetail(actor, id);
}

async function requests(actor, query) {
  const access = await accessFor(actor);
  const next = { ...query };
  if (next.leaveTypeId === 'PERMISSION') {
    next.kind = 'PERMISSION';
    next.leaveTypeId = '';
  } else if (UUID.test(next.leaveTypeId || '')) {
    next.kind = 'LEAVE';
  }
  const kind = next.kind === 'PERMISSION' ? 'PERMISSION' : next.kind === 'LEAVE' ? 'LEAVE' : '';
  query = next;
  const leave = kind === 'PERMISSION' ? [] : await repository.listLeave(listFilters(actor, access, query, false));
  const permissions = kind === 'LEAVE' ? [] : await repository.listPermissions(listFilters(actor, access, query, true));
  const items = [...leave, ...permissions].sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return { requests: items, access };
}

async function pending(actor) {
  const access = await accessFor(actor);
  if (!access.canApprove) return { requests: [], access };
  const filters = { pendingForTeams: access.teamIds, admin: access.admin, actorId: actor.id };
  const [leave, permissions] = await Promise.all([
    repository.listLeave(filters),
    repository.listPermissions(filters),
  ]);
  const items = [...leave, ...permissions].sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  return { requests: items, access };
}

function permissionSpan(body) {
  const date = cleanDate(body.date);
  if (!date) throw new ApiError(400, 'Choose a date.');
  const start = new Date(body.startAt || '');
  const end = new Date(body.endAt || '');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new ApiError(400, 'Enter a start and end time.');
  if (end <= start) throw new ApiError(400, 'End time must be after the start time.');
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  if (minutes < 1) throw new ApiError(400, 'Duration must be at least one minute.');
  if (minutes > 480) throw new ApiError(400, 'Permission cannot be longer than 8 hours. Apply for leave instead.');
  const reason = String(body.reason || '').trim().slice(0, 2000);
  if (reason.length < 2) throw new ApiError(400, 'Reason is required.');
  return { date, start, end, minutes, reason, note: String(body.note || '').trim().slice(0, 2000), year: Number(date.slice(0, 4)) };
}

async function createPermission(actor, body) {
  const span = permissionSpan(body);
  if (await repository.permissionOverlap(actor.id, span.start, span.end)) {
    throw new ApiError(409, 'You already have a permission request for this time.');
  }
  const teamId = await repository.primaryTeam(actor.id);
  const id = await repository.withTransaction(async (client) => {
    const requestId = await repository.insertPermission(client, {
      year: span.year,
      userId: actor.id,
      teamId,
      date: span.date,
      startTime: span.start,
      endTime: span.end,
      durationMinutes: span.minutes,
      reason: span.reason,
      note: span.note,
    });
    await repository.addPermissionHistory(client, requestId, 'REQUESTED', actor.id, span.reason);
    await repository.addActivity(client, { userId: actor.id, actorId: actor.id, permissionRequestId: requestId, action: 'Permission requested', comment: `${span.minutes} minutes` });
    return requestId;
  });
  const request = await repository.findPermission(id);
  await repository.notify(await repository.approverIds(actor.id), 'Permission request submitted', `${actor.fullName} requested permission.`, '/leave');
  return request;
}

async function permissionDetail(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Request is not valid.');
  const { request, access } = await visiblePermission(actor, id);
  return {
    request,
    history: await repository.permissionHistory(id),
    canReview: request.status === 'PENDING' && request.userId !== actor.id && (access.admin || access.canApprove),
    canWithdraw: request.status === 'PENDING' && request.userId === actor.id,
  };
}

async function withdrawPermission(actor, id) {
  const { request } = await visiblePermission(actor, id);
  if (request.userId !== actor.id) throw new ApiError(403, 'You can only withdraw your own request.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be withdrawn.');
  await repository.withTransaction(async (client) => {
    await repository.reviewPermission(client, id, { status: 'WITHDRAWN', actorId: actor.id, approvalComment: '', rejectionReason: '' });
    await repository.addPermissionHistory(client, id, 'WITHDRAWN', actor.id, '');
    await repository.addActivity(client, { userId: actor.id, actorId: actor.id, permissionRequestId: id, action: 'Permission withdrawn', comment: request.requestNumber });
  });
  await repository.notify(await repository.approverIds(actor.id), 'Permission withdrawn', `${actor.fullName} withdrew ${request.requestNumber}.`, '/leave');
  return permissionDetail(actor, id);
}

async function approvePermission(actor, id, body) {
  const { request } = await visiblePermission(actor, id);
  if (request.userId === actor.id) throw new ApiError(403, 'You cannot review your own request.');
  const access = await accessFor(actor);
  if (!access.admin && !access.canApprove) throw new ApiError(403, 'You cannot review this request.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be approved.');
  const comment = String(body.comment || '').trim().slice(0, 2000);
  await repository.withTransaction(async (client) => {
    await repository.reviewPermission(client, id, { status: 'APPROVED', actorId: actor.id, approvalComment: comment, rejectionReason: '' });
    await repository.addPermissionHistory(client, id, 'APPROVED', actor.id, comment);
    await repository.addActivity(client, { userId: request.userId, actorId: actor.id, permissionRequestId: id, action: 'Permission approved', comment: request.requestNumber });
  });
  await repository.notify([request.userId], 'Permission approved', `${request.requestNumber} was approved.`, '/leave');
  return permissionDetail(actor, id);
}

async function rejectPermission(actor, id, body) {
  const { request } = await visiblePermission(actor, id);
  if (request.userId === actor.id) throw new ApiError(403, 'You cannot review your own request.');
  const access = await accessFor(actor);
  if (!access.admin && !access.canApprove) throw new ApiError(403, 'You cannot review this request.');
  if (request.status !== 'PENDING') throw new ApiError(400, 'Only a pending request can be rejected.');
  const reason = String(body.reason || '').trim().slice(0, 2000);
  if (reason.length < 2) throw new ApiError(400, 'A rejection reason is required.');
  await repository.withTransaction(async (client) => {
    await repository.reviewPermission(client, id, { status: 'REJECTED', actorId: actor.id, approvalComment: '', rejectionReason: reason });
    await repository.addPermissionHistory(client, id, 'REJECTED', actor.id, reason);
    await repository.addActivity(client, { userId: request.userId, actorId: actor.id, permissionRequestId: id, action: 'Permission rejected', comment: reason });
  });
  await repository.notify([request.userId], 'Permission rejected', `${request.requestNumber}: ${reason}`, '/leave');
  return permissionDetail(actor, id);
}

async function saveHoliday(actor, body) {
  if (!isAdmin(actor)) throw new ApiError(403, 'Only an admin can configure holidays.');
  const date = cleanDate(body.date);
  const name = String(body.name || '').trim().slice(0, 120);
  if (!date || name.length < 2) throw new ApiError(400, 'A holiday needs a date and a name.');
  return repository.addHoliday(date, name, Boolean(body.isWorkingDay));
}

async function updateAllocation(actor, body) {
  if (!isAdmin(actor)) throw new ApiError(403, 'Only an admin can change leave allocation.');
  const year = Number(body.year) || new Date().getFullYear();
  const days = Number(body.allocatedDays);
  if (!UUID.test(body.userId || '') || !UUID.test(body.leaveTypeId || '')) throw new ApiError(400, 'Choose an employee and a leave type.');
  if (!Number.isFinite(days) || days < 0 || days > 365) throw new ApiError(400, 'Enter a valid allocation.');
  const saved = await repository.setAllocation(body.userId, body.leaveTypeId, year, days);
  if (!saved) throw new ApiError(404, 'Leave balance not found.');
  await repository.addActivity(null, {
    userId: body.userId,
    actorId: actor.id,
    action: 'Balance adjusted',
    comment: `Allocated ${days} days for ${year}`,
  });
  return repository.balances(body.userId, year);
}

async function notifications(actor) {
  return repository.listNotifications(actor.id);
}

async function readNotification(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Notification is not valid.');
  await repository.markNotification(id, actor.id);
}

module.exports = {
  overview,
  types,
  balance,
  createLeave,
  leaveDetail,
  withdrawLeave,
  approveLeave,
  rejectLeave,
  requests,
  pending,
  createPermission,
  permissionDetail,
  withdrawPermission,
  approvePermission,
  rejectPermission,
  saveHoliday,
  updateAllocation,
  notifications,
  readNotification,
  calendar: () => repository.calendar(),
};
