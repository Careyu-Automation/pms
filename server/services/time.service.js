const ApiError = require('../utils/ApiError');
const repository = require('../db/time.repository');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${nextMonth}-${nextDay}`;
}

function weekStart(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  return shiftIso(iso, mondayOffset);
}

function todayInZone(timeZone) {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    return formatted;
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
}

function minutesBetween(start, end) {
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 0;
  return Math.round(diff / 60000);
}

function summarize(session, breaks, now) {
  if (!session) {
    return { status: 'NOT_CHECKED_IN', workedMinutes: 0, breakMinutes: 0, spanMinutes: 0 };
  }
  const end = session.checkOut || now;
  const span = minutesBetween(session.checkIn, end);
  let breakMinutes = 0;
  breaks.forEach((item) => {
    const stop = item.endTime || end;
    breakMinutes += minutesBetween(item.startTime, stop);
  });
  breakMinutes = Math.min(breakMinutes, span);
  return {
    status: session.checkOut ? 'CHECKED_OUT' : 'CHECKED_IN',
    workedMinutes: span - breakMinutes,
    breakMinutes,
    spanMinutes: span,
  };
}

async function accessFor(user) {
  const admin = isAdmin(user);
  const teamIds = admin ? null : await repository.leadTeamIds(user.id);
  return {
    admin,
    teamIds,
    canViewTeam: admin || Boolean(teamIds && teamIds.length),
    canExport: admin || Boolean(teamIds && teamIds.length),
  };
}

async function resolveUser(actor, requestedId) {
  const access = await accessFor(actor);
  const target = requestedId && UUID.test(requestedId) ? requestedId : actor.id;
  if (target === actor.id) return { userId: target, access };
  if (access.admin) return { userId: target, access };
  const allowed = await repository.userOnTeams(target, access.teamIds || []);
  if (!allowed) throw new ApiError(403, 'You can only view your own time.');
  return { userId: target, access, readOnly: true };
}

function assertToday(date, timeZone) {
  const today = todayInZone(timeZone);
  if (date !== today) throw new ApiError(400, 'Check in and check out are available for today.');
  return today;
}

async function day(actor, dateValue, query = {}) {
  const date = cleanDate(dateValue);
  if (!date) throw new ApiError(400, 'Choose a valid date.');
  const { userId, access, readOnly } = await resolveUser(actor, query.userId);
  const today = todayInZone(query.timeZone);
  const session = await repository.findSession(userId, date);
  const breaks = await repository.listBreaks(session?.id);
  const entries = await repository.listEntries({ userId, date });
  const now = new Date();
  const summary = summarize(session, breaks, now);
  const loggedMinutes = entries.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0);
  const start = weekStart(date);
  const days = Array.from({ length: 7 }, (_, index) => shiftIso(start, index));
  const sessions = await repository.sessionsBetween(userId, days[0], days[6]);
  const sessionByDay = new Map(sessions.map((item) => [item.date, item]));
  const allBreaks = await repository.breaksForSessions(sessions.map((item) => item.id));
  const minutesByDay = await repository.entryMinutesByDay(userId, days[0], days[6]);
  let weekTotal = 0;
  const week = days.map((dayDate) => {
    const daySession = sessionByDay.get(dayDate) || null;
    const dayBreaks = allBreaks.filter((item) => item.attendanceSessionId === daySession?.id);
    const daySummary = summarize(daySession, dayBreaks, now);
    const logged = minutesByDay.get(dayDate) || 0;
    const counted = daySession ? daySummary.workedMinutes : logged;
    weekTotal += counted;
    let indicator = 'empty';
    if (daySession && !daySession.checkOut) indicator = 'incomplete';
    else if (daySession || logged) indicator = 'worked';
    return { date: dayDate, indicator, workedMinutes: counted };
  });
  const openBreak = breaks.find((item) => !item.endTime) || null;
  const catalog = await repository.lookups();
  const self = userId === actor.id;
  const canCorrect = self || access.admin;
  return {
    date,
    today,
    userId,
    session,
    breaks,
    entries,
    summary,
    loggedMinutes,
    week,
    weekTotalMinutes: weekTotal,
    openBreak,
    lookups: { projects: catalog.projects, tasks: catalog.tasks },
    access: {
      canViewTeam: access.canViewTeam,
      canExport: access.canExport,
      canEdit: canCorrect && !readOnly,
      canCheckIn: canCorrect && date === today && !session,
      canCheckOut: canCorrect && date === today && Boolean(session && !session.checkOut && !openBreak),
      canBreak: canCorrect && date === today && Boolean(session && !session.checkOut),
      canLog: canCorrect && date <= today,
    },
  };
}

async function checkIn(actor, body) {
  const date = cleanDate(body.date) || todayInZone(body.timeZone);
  assertToday(date, body.timeZone);
  const userId = isAdmin(actor) && UUID.test(body.userId || '') ? body.userId : actor.id;
  const existing = await repository.findSession(userId, date);
  if (existing?.checkOut) throw new ApiError(409, 'You have already checked out for today.');
  if (existing) throw new ApiError(409, 'You are already checked in.');
  await repository.insertSession(userId, date, new Date());
  return day(actor, date, { userId, timeZone: body.timeZone });
}

async function checkOut(actor, body) {
  const date = cleanDate(body.date) || todayInZone(body.timeZone);
  assertToday(date, body.timeZone);
  const userId = isAdmin(actor) && UUID.test(body.userId || '') ? body.userId : actor.id;
  const session = await repository.findSession(userId, date);
  if (!session) throw new ApiError(400, 'Check in before checking out.');
  if (session.checkOut) throw new ApiError(409, 'You have already checked out for today.');
  const breaks = await repository.listBreaks(session.id);
  if (breaks.some((item) => !item.endTime)) throw new ApiError(400, 'End the current break before checking out.');
  const now = new Date();
  const summary = summarize(session, breaks, now);
  await repository.checkoutSession(session.id, now, summary.workedMinutes);
  return day(actor, date, { userId, timeZone: body.timeZone });
}

async function startBreak(actor, body) {
  const date = cleanDate(body.date) || todayInZone(body.timeZone);
  assertToday(date, body.timeZone);
  const userId = actor.id;
  const session = await repository.findSession(userId, date);
  if (!session) throw new ApiError(400, 'Check in before starting a break.');
  if (session.checkOut) throw new ApiError(400, 'You have already checked out.');
  const breaks = await repository.listBreaks(session.id);
  if (breaks.some((item) => !item.endTime)) throw new ApiError(409, 'A break is already in progress.');
  const type = String(body.type || 'Break').trim().slice(0, 40) || 'Break';
  if (type.length < 2) throw new ApiError(400, 'Name the break.');
  await repository.insertBreak(session.id, new Date(), type);
  return day(actor, date, { timeZone: body.timeZone });
}

async function endBreak(actor, id, body = {}) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Break is not valid.');
  const item = await repository.findBreak(id);
  if (!item) throw new ApiError(404, 'Break not found.');
  const session = await repository.findSessionById(item.attendanceSessionId);
  if (!session || (session.userId !== actor.id && !isAdmin(actor))) throw new ApiError(403, 'You cannot end this break.');
  if (item.endTime) throw new ApiError(409, 'This break has already ended.');
  const now = new Date();
  const minutes = Math.max(0, minutesBetween(item.startTime, now));
  await repository.endBreak(id, now, minutes);
  return day(actor, session.date, { userId: session.userId, timeZone: body.timeZone });
}

async function breaksFor(actor, dateValue, query) {
  const payload = await day(actor, dateValue, query);
  return payload.breaks;
}

function hoursOf(minutes) {
  return Math.round((minutes / 60) * 100) / 100;
}

async function entryInput(actor, body, current) {
  const userId = current?.userId || actor.id;
  if (current && current.userId !== actor.id && !isAdmin(actor)) throw new ApiError(403, 'You cannot edit this time entry.');
  const date = cleanDate(body.date || current?.date);
  if (!date) throw new ApiError(400, 'Choose a date.');
  if (date > todayInZone(body.timeZone)) throw new ApiError(400, 'Time cannot be logged in the future.');
  const startAt = new Date(body.startAt || '');
  const endAt = new Date(body.endAt || '');
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new ApiError(400, 'Enter a start and end time.');
  if (endAt <= startAt) throw new ApiError(400, 'End time must be after the start time.');
  const durationMinutes = minutesBetween(startAt, endAt);
  if (durationMinutes < 1) throw new ApiError(400, 'Duration must be at least one minute.');
  if (durationMinutes > 24 * 60) throw new ApiError(400, 'A time entry cannot be longer than 24 hours.');
  const description = String(body.description ?? current?.description ?? '').trim().slice(0, 2000);
  if (description.length < 2) throw new ApiError(400, 'Description is required.');
  let taskId = body.taskId || null;
  let projectId = body.projectId || null;
  if (taskId) {
    if (!UUID.test(taskId)) throw new ApiError(400, 'Select a valid task.');
    const task = await repository.findTask(taskId);
    if (!task) throw new ApiError(404, 'Task not found.');
    projectId = task.projectId || projectId;
  } else taskId = null;
  if (projectId) {
    if (!UUID.test(projectId)) throw new ApiError(400, 'Select a valid project.');
    const project = await repository.findProject(projectId);
    if (!project) throw new ApiError(404, 'Project not found.');
  } else projectId = null;
  if (await repository.overlap(userId, startAt, endAt, current?.id)) {
    throw new ApiError(409, 'Time entry overlaps with an existing entry.');
  }
  return {
    userId,
    projectId,
    taskId,
    date,
    startAt,
    endAt,
    durationMinutes,
    hours: hoursOf(durationMinutes),
    description,
    createdBy: actor.id,
  };
}

async function listEntries(actor, query) {
  const { userId } = await resolveUser(actor, query.userId);
  const entries = await repository.listEntries({
    userId: query.taskId || query.projectId ? userId : userId,
    date: cleanDate(query.date),
    from: cleanDate(query.from),
    to: cleanDate(query.to),
    projectId: UUID.test(query.projectId || '') ? query.projectId : '',
    taskId: UUID.test(query.taskId || '') ? query.taskId : '',
    q: String(query.q || '').trim().slice(0, 80),
  });
  return entries;
}

async function createEntry(actor, body) {
  const input = await entryInput(actor, body);
  return repository.insertEntry(input);
}

async function updateEntry(actor, id, body) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Time entry is not valid.');
  const current = await repository.findEntry(id);
  if (!current) throw new ApiError(404, 'Time entry not found.');
  const input = await entryInput(actor, body, current);
  return repository.updateEntry(id, input);
}

async function removeEntry(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Time entry is not valid.');
  const current = await repository.findEntry(id);
  if (!current) throw new ApiError(404, 'Time entry not found.');
  if (current.userId !== actor.id && !isAdmin(actor)) throw new ApiError(403, 'You cannot delete this time entry.');
  await repository.deleteEntry(id);
}

function bulletList(lines) {
  const seen = new Set();
  const items = [];
  lines.forEach((line) => {
    const text = String(line || '').replace(/\s+/g, ' ').trim().replace(/^•\s*/, '');
    const key = text.toLowerCase();
    if (text.length < 2 || seen.has(key)) return;
    seen.add(key);
    items.push(`• ${text}`);
  });
  return items.join('\n');
}

async function generated(userId, date, timeZone) {
  const [entries, updates, activity, signals, session] = await Promise.all([
    repository.listEntries({ userId, date }),
    repository.dailyUpdates(userId, date),
    repository.projectActivity(userId, date),
    repository.assignedSignals(userId, date),
    repository.findSession(userId, date),
  ]);
  const did = [];
  const sources = [];
  entries.forEach((entry) => {
    const name = entry.taskTitle || entry.projectName || 'general work';
    did.push(entry.description ? `${entry.description} (${name})` : `Worked on ${name}`);
    sources.push({ type: 'TIME_ENTRY', referenceId: entry.id, summary: entry.description || name });
  });
  updates.forEach((update) => {
    did.push(update.description || `Updated ${update.title}`);
    sources.push({ type: 'DAILY_WORK', referenceId: update.id, summary: update.description || update.title });
  });
  activity.forEach((item) => {
    did.push(item.projectName ? `${item.action} · ${item.projectName}` : item.action);
    sources.push({ type: 'PROJECT_ACTIVITY', referenceId: item.id, summary: item.action });
  });
  const improve = [];
  if (!entries.length && !session) improve.push('No time logged on the timesheet today — capture work hours next time.');
  if (session && !session.checkOut && date < todayInZone(timeZone)) improve.push('Check-out was not recorded for this day.');
  if (!updates.length) improve.push('A daily work update was not recorded for this date.');
  const blocked = signals.filter((item) => item.status === 'BLOCKED' || item.status === 'ON_HOLD');
  const overdue = signals.filter((item) => item.deadline && item.deadline < date && item.status !== 'BLOCKED');
  if (blocked.length) improve.push('A task is blocked or on hold. A short note on what is needed will help it move.');
  if (overdue.length) improve.push('Some assigned tasks are past their deadline. A status update would help the team plan the next step.');
  return {
    whatIDid: bulletList(did) || 'No recorded activity for this date yet.',
    whatToImprove: bulletList(improve) || 'Nothing stands out to improve from today’s records.',
    sources,
  };
}

async function reportFor(actor, dateValue, query = {}) {
  const date = cleanDate(dateValue);
  if (!date) throw new ApiError(400, 'Choose a valid date.');
  const { userId, access } = await resolveUser(actor, query.userId);
  const [draft, fresh, catalog] = await Promise.all([
    repository.findReport(userId, date),
    generated(userId, date, query.timeZone),
    repository.lookups(),
  ]);
  const whatIDid = draft && (draft.status === 'SUBMITTED' || draft.whatIDidEdited) ? draft.whatIDid : fresh.whatIDid;
  const whatToImprove = draft && (draft.status === 'SUBMITTED' || draft.whatToImproveEdited) ? draft.whatToImprove : fresh.whatToImprove;
  return {
    date,
    userId,
    report: draft,
    whatIDid,
    whatToImprove,
    notes: draft?.notes || '',
    status: draft?.status || 'NOT_STARTED',
    submittedAt: draft?.submittedAt || null,
    generated: fresh,
    lookups: { projects: catalog.projects, tasks: catalog.tasks },
    access: {
      canEdit: userId === actor.id && draft?.status !== 'SUBMITTED',
      canSubmit: userId === actor.id && draft?.status !== 'SUBMITTED',
      canReopen: draft?.status === 'SUBMITTED' && (access.admin || (access.canViewTeam && userId !== actor.id)),
      canViewTeam: access.canViewTeam,
      canExport: access.canExport,
    },
  };
}

function reportBody(body, fresh, submitting, actorId) {
  const whatIDid = String(body.whatIDid ?? fresh.whatIDid).trim().slice(0, 8000);
  const whatToImprove = String(body.whatToImprove ?? fresh.whatToImprove).trim().slice(0, 4000);
  const notes = String(body.notes || '').trim().slice(0, 4000);
  if (submitting && notes.length < 2) throw new ApiError(400, 'Notes are required before submitting the report.');
  if (submitting && whatIDid.length < 2) throw new ApiError(400, 'What I did needs a short summary.');
  return {
    whatIDid,
    whatToImprove,
    notes,
    whatIDidEdited: whatIDid !== fresh.whatIDid,
    whatToImproveEdited: whatToImprove !== fresh.whatToImprove,
    status: submitting ? 'SUBMITTED' : 'DRAFT',
    submittedAt: submitting ? new Date() : null,
    submittedBy: submitting ? actorId : null,
  };
}

async function saveReport(actor, body) {
  const date = cleanDate(body.date);
  if (!date) throw new ApiError(400, 'Choose a valid date.');
  if (date > todayInZone(body.timeZone)) throw new ApiError(400, 'A future daily report cannot be submitted.');
  const existing = await repository.findReport(actor.id, date);
  if (existing?.status === 'SUBMITTED') throw new ApiError(409, 'This daily report is already submitted.');
  const fresh = await generated(actor.id, date, body.timeZone);
  const submitting = Boolean(body.submit);
  const input = reportBody(body, fresh, submitting, actor.id);
  let saved;
  try {
    saved = existing
      ? await repository.saveReport(existing.id, input)
      : await repository.insertReport({ ...input, userId: actor.id, date });
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'A daily report for this date already exists.');
    throw error;
  }
  if (submitting) await repository.replaceActivities(saved.id, fresh.sources);
  return reportFor(actor, date);
}

async function updateReport(actor, id, body) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Report is not valid.');
  const existing = await repository.findReportById(id);
  if (!existing) throw new ApiError(404, 'Daily report not found.');
  if (existing.userId !== actor.id) throw new ApiError(403, 'You can only edit your own report.');
  if (existing.status === 'SUBMITTED') throw new ApiError(403, 'Submitted reports cannot be edited.');
  const fresh = await generated(existing.userId, existing.date, body.timeZone);
  const input = reportBody({ ...body, date: existing.date }, fresh, Boolean(body.submit), actor.id);
  await repository.saveReport(id, input);
  if (body.submit) await repository.replaceActivities(id, fresh.sources);
  return reportFor(actor, existing.date);
}

async function submitReport(actor, id, body) {
  return updateReport(actor, id, { ...body, submit: true });
}

async function reopenReport(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Report is not valid.');
  const existing = await repository.findReportById(id);
  if (!existing) throw new ApiError(404, 'Daily report not found.');
  const access = await accessFor(actor);
  if (!access.admin) {
    const allowed = await repository.userOnTeams(existing.userId, access.teamIds || []);
    if (!allowed) throw new ApiError(403, 'You cannot reopen this report.');
  }
  if (existing.status !== 'SUBMITTED') throw new ApiError(400, 'Only a submitted report can be reopened.');
  await repository.saveReport(id, {
    whatIDid: existing.whatIDid,
    whatToImprove: existing.whatToImprove,
    notes: existing.notes,
    whatIDidEdited: existing.whatIDidEdited,
    whatToImproveEdited: existing.whatToImproveEdited,
    status: 'DRAFT',
    submittedAt: null,
    submittedBy: null,
  });
  return reportFor(actor, existing.date, { userId: existing.userId });
}

async function reports(actor, query) {
  const access = await accessFor(actor);
  const requested = UUID.test(query.userId || '') ? query.userId : actor.id;
  if (requested !== actor.id) await resolveUser(actor, requested);
  const rows = await repository.listReports({
    userId: requested,
    from: cleanDate(query.from),
    to: cleanDate(query.to),
    status: query.status === 'SUBMITTED' || query.status === 'DRAFT' ? query.status : '',
    q: String(query.q || '').trim().slice(0, 80),
  });
  return { reports: rows, access: { canViewTeam: access.canViewTeam, canExport: access.canExport } };
}

async function teamReports(actor, query) {
  const access = await accessFor(actor);
  if (!access.canViewTeam) throw new ApiError(403, 'Team reports are available to team leads and admins.');
  const date = cleanDate(query.date) || todayInZone(query.timeZone);
  const teams = await repository.teamSummary(date, access.admin ? null : access.teamIds);
  let members = [];
  if (UUID.test(query.teamId || '')) {
    const allowed = access.admin || (access.teamIds || []).includes(query.teamId);
    if (!allowed) throw new ApiError(403, 'You cannot view this team.');
    members = await repository.teamMembers(query.teamId, date);
  }
  return { date, teams, members, teamId: query.teamId || '' };
}

async function exportRows(actor, query, kind) {
  const access = await accessFor(actor);
  if (!access.canExport) throw new ApiError(403, 'Export is available to team leads and admins.');
  const from = cleanDate(query.from) || todayInZone(query.timeZone);
  const to = cleanDate(query.to) || from;
  const requested = UUID.test(query.userId || '') ? query.userId : '';
  const scope = requested
    ? { userId: (await resolveUser(actor, requested)).userId }
    : (access.admin ? {} : { userIds: await teamMemberIds(actor, access) });
  if (kind === 'timesheet') {
    const entries = await repository.listEntries({ ...scope, from, to });
    const sessions = await repository.sessionsInRange(from, to, scope.userId ? [scope.userId] : scope.userIds || null);
    const breaks = await repository.breaksForSessions(sessions.map((session) => session.id));
    const sessionMap = new Map(sessions.map((session) => [`${session.userId}:${session.date}`, session]));
    const breakMap = new Map();
    breaks.forEach((item) => {
      breakMap.set(item.attendanceSessionId, (breakMap.get(item.attendanceSessionId) || 0) + (item.durationMinutes || 0));
    });
    const rows = entries.map((entry) => {
      const session = sessionMap.get(`${entry.userId}:${entry.date}`);
      return {
        ...entry,
        checkIn: session?.checkIn || null,
        checkOut: session?.checkOut || null,
        breakMinutes: session ? (breakMap.get(session.id) || 0) : 0,
        workedMinutes: session?.totalWorkedMinutes || entry.durationMinutes,
      };
    });
    return { kind, from, to, rows };
  }
  const reports = await repository.listReports({ ...scope, from, to, status: 'SUBMITTED' });
  return { kind, from, to, reports };
}

async function teamMemberIds(actor, access) {
  const ids = new Set([actor.id]);
  for (const teamId of access.teamIds || []) {
    const members = await repository.teamMembers(teamId, todayInZone('UTC'));
    members.forEach((member) => ids.add(member.id));
  }
  return [...ids];
}

async function catalog(actor) {
  const access = await accessFor(actor);
  const data = await repository.lookups();
  if (!access.canViewTeam) data.people = data.people.filter((person) => person.id === actor.id);
  else if (!access.admin) {
    const allowed = new Set([actor.id]);
    const teams = await repository.teamSummary(todayInZone('UTC'), access.teamIds);
    for (const team of teams) {
      const members = await repository.teamMembers(team.id, todayInZone('UTC'));
      members.forEach((member) => allowed.add(member.id));
    }
    data.people = data.people.filter((person) => allowed.has(person.id));
  }
  return { ...data, access: { canViewTeam: access.canViewTeam, canExport: access.canExport } };
}

module.exports = {
  day,
  checkIn,
  checkOut,
  startBreak,
  endBreak,
  breaksFor,
  listEntries,
  createEntry,
  updateEntry,
  removeEntry,
  reportFor,
  saveReport,
  updateReport,
  submitReport,
  reopenReport,
  reports,
  teamReports,
  exportRows,
  catalog,
  minutesBetween,
};
