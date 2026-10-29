const ApiError = require('../utils/ApiError');
const { toPublicUser } = require('../utils/publicUser');
const leaveRepository = require('../db/leave.repository');
const repository = require('../db/emailReport.repository');
const generate = require('./emailReport.generate');
const files = require('./emailReport.export');
const mail = require('./emailReport.mail');
const { dailyWorkEmailsPaused, firstRunAfterPause, nextRunAt, PAUSE_MESSAGE, kolkataDate } = require('./emailReport.pause');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(['TO', 'CC', 'BCC']);
const SCOPES = new Set(['ORGANIZATION', 'TEAM', 'PROJECT', 'EMPLOYEE', 'CUSTOMER']);
const FREQUENCIES = new Set(['MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM']);
const STATUSES = new Set(['ACTIVE', 'PAUSED', 'DRAFT', 'FAILED']);
const ATTACHMENTS = new Set(['NONE', 'PDF', 'EXCEL']);

let ticking = false;
const queued = new Set();

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function ownerFilter(user) {
  if (isAdmin(user)) return { sql: '', params: [] };
  return { sql: 'WHERE r.owner_id = $1', params: [user.id] };
}

function assertOwner(user, report) {
  if (!report) throw new ApiError(404, 'Report not found.');
  if (!isAdmin(user) && report.ownerId !== user.id) throw new ApiError(403, 'You can only change reports you created.');
}

function configuration(body) {
  const source = body.configuration || {};
  const sections = Array.isArray(source.sections) ? source.sections.filter((item) => generate.CUSTOM_SECTIONS.includes(item)) : [];
  return {
    teamId: UUID.test(source.teamId || '') ? source.teamId : '',
    projectId: UUID.test(source.projectId || '') ? source.projectId : '',
    employeeId: UUID.test(source.employeeId || '') ? source.employeeId : '',
    customer: clean(source.customer, 200),
    dateFrom: DATE.test(source.dateFrom || '') ? source.dateFrom : '',
    dateTo: DATE.test(source.dateTo || '') ? source.dateTo : '',
    status: clean(source.status, 40),
    priority: clean(source.priority, 20),
    department: clean(source.department, 100),
    overdueOnly: Boolean(source.overdueOnly),
    period: source.period === 'EVENING' ? 'EVENING' : source.period === 'MORNING' ? 'MORNING' : 'FULL',
    includeCompleted: source.includeCompleted !== false,
    sections,
  };
}

function recipientsOf(body) {
  const rows = Array.isArray(body.recipients) ? body.recipients : [];
  return rows.map((row) => {
    const kind = KINDS.has(row.kind) ? row.kind : 'TO';
    const recipientType = row.recipientType || 'EMAIL';
    const email = clean(row.email, 200).toLowerCase();
    if (recipientType === 'EMAIL' && !EMAIL.test(email)) throw new ApiError(400, 'Enter a valid email address.');
    if (recipientType === 'USER' && !UUID.test(row.userId || '')) throw new ApiError(400, 'Choose a person for each internal recipient.');
    if (recipientType === 'TEAM' && !UUID.test(row.teamId || '')) throw new ApiError(400, 'Choose a team for that recipient.');
    return {
      kind,
      recipientType,
      userId: UUID.test(row.userId || '') ? row.userId : null,
      teamId: UUID.test(row.teamId || '') ? row.teamId : null,
      email,
      name: clean(row.name, 160),
    };
  });
}

function inputOf(body, current, schedule) {
  const name = clean(body.name ?? current?.name, 160);
  const type = body.type || current?.type;
  if (name.length < 2) throw new ApiError(400, 'Report name is required.');
  if (!generate.TYPES[type]) throw new ApiError(400, 'Select a report type.');
  const scope = SCOPES.has(body.scope) ? body.scope : (current?.scope || 'ORGANIZATION');
  const frequency = FREQUENCIES.has(body.frequency) ? body.frequency : (current?.frequency || 'MANUAL');
  const sendTime = TIME.test(body.sendTime || '') ? body.sendTime : (current?.sendTime || '09:00');
  const status = schedule ? 'ACTIVE' : (STATUSES.has(body.status) ? body.status : (current?.status || 'ACTIVE'));
  if (schedule && frequency === 'MANUAL') throw new ApiError(400, 'Choose a daily, weekly, or monthly schedule.');
  const config = configuration(body.configuration ? body : { configuration: current?.configuration || {} });
  if (body.configuration) Object.assign(config, configuration(body));
  const attachment = ATTACHMENTS.has(body.attachment) ? body.attachment : (current?.attachment || 'PDF');
  const timezone = clean(body.timezone || current?.timezone || 'Asia/Kolkata', 64) || 'Asia/Kolkata';
  const draft = {
    name,
    type,
    description: clean(body.description ?? current?.description, 2000),
    scope,
    scopeId: UUID.test(body.scopeId || config.teamId || config.projectId || config.employeeId || '') ? (body.scopeId || config.teamId || config.projectId || config.employeeId) : null,
    status: schedule ? 'ACTIVE' : status,
    subject: clean(body.subject ?? current?.subject, 240) || `[CareYu] {{reportName}} - {{period}}`,
    configuration: body.configuration ? configuration(body) : config,
    attachment,
    frequency: schedule && frequency === 'MANUAL' ? 'WEEKLY' : frequency,
    sendTime,
    dayOfWeek: body.dayOfWeek === 0 || body.dayOfWeek ? Number(body.dayOfWeek) : (current?.dayOfWeek ?? 1),
    dayOfMonth: body.dayOfMonth ? Number(body.dayOfMonth) : (current?.dayOfMonth ?? 1),
    timezone,
  };
  draft.nextRunAt = nextRunAt(draft);
  return draft;
}

function normalizePerson(value) {
  return String(value || '').toLowerCase().replace(/^(mr\.?|mrs\.?|ms\.?)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function matchDirectoryPeople(people, matchers) {
  const found = [];
  const seen = new Set();
  for (const matcher of matchers) {
    const person = (people || []).find((row) => {
      const name = normalizePerson(row.name || row.fullName);
      const email = String(row.email || '').toLowerCase();
      const designation = String(row.designation || '').toLowerCase();
      if (matcher.emailPrefix && email.startsWith(String(matcher.emailPrefix).toLowerCase())) return true;
      if (matcher.designation && matcher.designation.test(designation)) return true;
      return (matcher.keys || []).some((key) => name === key || name.startsWith(`${key} `) || name.includes(key));
    });
    if (person?.id && !seen.has(person.id)) {
      seen.add(person.id);
      found.push(person.id);
    }
  }
  return found;
}

function dailyWorkRecipientDefaults(people) {
  const toIds = matchDirectoryPeople(people, [
    { keys: ['arivan'], emailPrefix: 'robotlead1@' },
    { keys: ['sabarigiri'], emailPrefix: 'engg1.director@' },
    { keys: ['bernard', 'ceo'], emailPrefix: 'ceo@', designation: /\bceo\b/i },
  ]);
  const ccIds = matchDirectoryPeople(people, [
    { keys: ['raja'], emailPrefix: 'raja@' },
    { keys: ['shradha'], emailPrefix: 'businesshead@' },
  ]).filter((id) => !toIds.includes(id));
  return { toIds, ccIds };
}

async function home(user, filters = {}) {
  const owner = ownerFilter(user);
  const clauses = [];
  const params = [...owner.params];
  if (filters.type && generate.TYPES[filters.type]) {
    params.push(filters.type);
    clauses.push(`r.type = $${params.length}`);
  }
  if (filters.status && STATUSES.has(filters.status)) {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }
  if (filters.frequency && FREQUENCIES.has(filters.frequency)) {
    params.push(filters.frequency);
    clauses.push(`r.frequency = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${clean(filters.q, 80).toLowerCase()}%`);
    clauses.push(`lower(r.name) LIKE $${params.length}`);
  }
  const where = `${owner.sql}${clauses.length ? `${owner.sql ? ' AND' : ' WHERE'} ${clauses.join(' AND ')}` : ''}`;
  // Sequential reads keep pool usage low on shared Aiven plans (parallel home loads caused 53300).
  const reports = await repository.listReports(where, params);
  const configured = await repository.reportCount(owner.sql, owner.params);
  const counts = await repository.kpis(owner.sql, owner.params);
  const upcoming = await repository.upcoming(owner.sql, owner.params);
  const recent = await repository.recentRuns(owner.sql, owner.params);
  const templateRows = await repository.templates();
  const choices = await repository.options();
  const settings = await repository.settings();
  const defaults = dailyWorkRecipientDefaults(choices.people || []);
  return {
    configured: configured > 0,
    kpis: counts,
    reports,
    upcoming,
    recent,
    templates: templateRows,
    options: choices,
    types: generate.TYPES,
    sections: generate.CUSTOM_SECTIONS,
    defaultRecipientIds: defaults.toIds,
    defaultToRecipientIds: defaults.toIds,
    defaultCcRecipientIds: defaults.ccIds,
    mail: mail.publicSettings(settings),
    access: { canCreate: true, canSettings: isAdmin(user), canSend: true },
  };
}

async function detail(user, id) {
  const report = await repository.findReport(id);
  assertOwner(user, report);
  return { report, recipients: await repository.recipients(id) };
}

async function save(user, body, id, schedule) {
  const current = id ? await repository.findReport(id) : null;
  if (id) assertOwner(user, current);
  const input = inputOf(body, current, schedule);
  const recipients = recipientsOf(body.recipients ? body : { recipients: id ? await repository.recipients(id) : [] });
  if (body.recipients && !recipients.length && input.status === 'ACTIVE' && input.frequency !== 'MANUAL') {
    throw new ApiError(400, 'Add at least one recipient before scheduling.');
  }
  const reportId = id || await repository.insertReport({ ...input, ownerId: user.id });
  if (id) await repository.updateReport(id, input);
  if (body.recipients) await repository.replaceRecipients(reportId, recipients);
  await repository.activity(reportId, user.id, id ? 'Report edited' : 'Report created');
  if (schedule) await repository.activity(reportId, user.id, 'Report scheduled');
  return detail(user, reportId);
}

async function duplicate(user, id) {
  const current = await repository.findReport(id);
  assertOwner(user, current);
  const recipients = await repository.recipients(id);
  const copyId = await repository.insertReport({
    ...current,
    name: `${current.name} copy`.slice(0, 160),
    status: 'DRAFT',
    ownerId: user.id,
    nextRunAt: null,
    scopeId: current.scopeId,
  });
  await repository.replaceRecipients(copyId, recipients);
  await repository.activity(copyId, user.id, 'Report duplicated');
  return detail(user, copyId);
}

async function setReportStatus(user, id, status) {
  const report = await repository.findReport(id);
  assertOwner(user, report);
  if (!['ACTIVE', 'PAUSED', 'DRAFT'].includes(status)) throw new ApiError(400, 'Select a valid report status.');
  const next = status === 'ACTIVE' ? nextRunAt({ ...report, status }) : null;
  await repository.setStatus(id, status, next);
  await repository.activity(id, user.id, status === 'PAUSED' ? 'Report paused' : 'Report resumed');
  return detail(user, id);
}

async function remove(user, id) {
  const report = await repository.findReport(id);
  assertOwner(user, report);
  await repository.activity(id, user.id, 'Report deleted');
  await repository.removeReport(id);
}

async function preview(user, body) {
  const input = inputOf({ ...body, status: 'DRAFT', frequency: body.frequency || 'MANUAL' }, null, false);
  const snapshot = await generate.build({ ...input, name: input.name }, user);
  const files = require('./emailReport.export');
  const subject = input.type === 'DAILY_WORK'
    ? generate.dailySubject(snapshot.period.from, snapshot.shift)
    : generate.applyVariables(input.subject, snapshot.variables);
  return { snapshot, subject, html: files.htmlEmail({ ...snapshot, subject }), recordCount: snapshot.recordCount || 0, reportDate: snapshot.period.from };
}

async function previewFile(user, body, format) {
  const { snapshot } = await preview(user, body);
  return fileFor(snapshot, format);
}

function fileFor(snapshot, format) {
  if (format === 'excel') return { name: `${snapshot.title}.xls`, type: 'application/vnd.ms-excel', body: files.excelBuffer(snapshot) };
  return { name: `${snapshot.title}.pdf`, type: 'application/pdf', body: files.pdfBuffer(snapshot) };
}

async function queueSend(user, id, { test = false, attemptOf = null } = {}) {
  const report = await repository.findReport(id);
  assertOwner(user, report);
  const recipients = await repository.recipients(id);
  if (!test && !recipients.length) throw new ApiError(400, 'Add at least one recipient.');
  const mailSettings = mail.publicSettings(await repository.settings());
  if (!mailSettings.configured) {
    throw new ApiError(400, 'Email is not configured. An administrator needs to save the SMTP settings.');
  }
  const key = `${id}:${test ? 'test' : 'send'}`;
  if (queued.has(key)) throw new ApiError(409, 'This report is already being sent.');
  queued.add(key);
  try {
    const runId = await repository.insertRun({
      reportId: id,
      reportName: report.name,
      reportType: report.type,
      attachment: test ? 'NONE' : report.attachment,
      sentBy: user.id,
      isTest: test,
      attemptOf,
      snapshot: {},
    });
    await repository.activity(id, user.id, test ? 'Test email requested' : 'Report send requested');
    await processRun(runId);
    const finished = await repository.findRun(runId);
    if (!finished || finished.status === 'FAILED') throw new ApiError(400, finished?.error || 'The email could not be delivered.');
    if (finished.status !== 'SENT') throw new ApiError(400, 'The email provider did not accept the message.');
    return { runId, status: finished.status, recordCount: Number(finished.recordCount || 0) };
  } finally {
    queued.delete(key);
  }
}

function enqueue(runId) {
  if (queued.has(runId)) return;
  queued.add(runId);
  setImmediate(() => {
    processRun(runId).catch(() => {}).finally(() => queued.delete(runId));
  });
}

function withReportDate(report) {
  const config = { ...(report.configuration || {}) };
  if (report.type === 'DAILY_WORK') {
    const today = kolkataDate();
    if (!DATE.test(config.dateFrom || '')) config.dateFrom = today;
    if (!DATE.test(config.dateTo || '')) config.dateTo = config.dateFrom || today;
    if (!config.period) config.period = 'EVENING';
  }
  return { ...report, configuration: config };
}

async function processRun(runId) {
  const run = await repository.findRun(runId);
  if (!run || run.status !== 'QUEUED') return;
  const report = run.reportId ? await repository.findReport(run.reportId) : null;
  if (!report) {
    await repository.finishRun(runId, { status: 'FAILED', error: 'The report is no longer available.', snapshot: {} });
    return;
  }
  if (report.type === 'DAILY_WORK' && dailyWorkEmailsPaused()) {
    await repository.finishRun(runId, { status: 'FAILED', error: PAUSE_MESSAGE, snapshot: {} });
    return;
  }
  const actorRow = await repository.userById(run.sentBy || report.ownerId);
  const actor = actorRow
    ? toPublicUser(actorRow)
    : { id: report.ownerId, role: { code: 'admin' }, email: '' };
  // Org-wide digests must not be limited by the sender's personal task visibility.
  if (report.type === 'DAILY_WORK' && report.scope === 'ORGANIZATION') {
    actor.role = { ...(actor.role || {}), code: actor.role?.code || 'admin' };
  }
  try {
    const prepared = withReportDate(report);
    if (!run.isTest && report.type === 'DAILY_WORK' && report.frequency === 'DAILY') {
      const duplicateId = await repository.alreadySentToday(report.id, prepared.configuration.dateFrom);
      if (duplicateId) {
        await repository.finishRun(runId, {
          status: 'FAILED',
          error: 'A report for this date was already delivered. Duplicate send blocked.',
          snapshot: {},
        });
        return;
      }
    }
    const snapshot = await generate.build(prepared, actor);
    if (report.type === 'DAILY_WORK' && snapshot.empty) {
      throw new ApiError(400, 'No daily work updates found for the selected date.');
    }
    const subject = report.type === 'DAILY_WORK'
      ? generate.dailySubject(snapshot.period.from, snapshot.shift)
      : generate.applyVariables(report.subject, snapshot.variables);
    const attachment = run.isTest ? null : fileFor(snapshot, report.attachment === 'EXCEL' ? 'excel' : 'pdf');
    const resolved = await resolveRecipients(report, await repository.recipients(report.id), run.isTest ? actor.email : '');
    const flat = [...resolved.to, ...resolved.cc, ...resolved.bcc];
    if (!flat.length) throw new ApiError(400, 'No valid recipients were found for this report.');
    const settings = await repository.settings();
    if (!mail.resolveSettings(settings).configured) {
      throw new ApiError(400, 'Email is not configured. An administrator needs to save the SMTP settings.');
    }
    const delivery = await mail.sendMail(settings, {
      to: resolved.to.map((item) => item.email),
      cc: resolved.cc.map((item) => item.email),
      bcc: resolved.bcc.map((item) => item.email),
      subject,
      html: files.htmlEmail(snapshot),
      attachment: attachment && report.attachment !== 'NONE' && !run.isTest ? [{ filename: attachment.name, content: attachment.body }] : [],
    });
    for (const item of flat) {
      await repository.insertDelivery(runId, { ...item, status: 'SENT', sentAt: new Date() });
    }
    const snapshotForHistory = {
      ...snapshot,
      recordCount: snapshot.recordCount || (snapshot.dailyRows || []).length,
      configuration: prepared.configuration,
    };
    await repository.finishRun(runId, {
      status: 'SENT', subject, snapshot: snapshotForHistory, recipientCount: flat.length,
      fileName: attachment && !run.isTest && report.attachment !== 'NONE' ? attachment.name : '',
      fileBody: attachment && !run.isTest && report.attachment !== 'NONE' ? attachment.body : null,
    });
    if (!run.isTest) await repository.touchSent(report.id, new Date(), nextRunAt(report), report.status === 'FAILED' ? 'ACTIVE' : report.status);
    await repository.activity(report.id, actor.id, run.isTest ? 'Test email sent' : 'Report sent');
    return delivery;
  } catch (error) {
    const message = error.statusCode ? error.message : (mail.classifySmtpError(error).message || 'The email could not be delivered.');
    if (!error.statusCode) {
      try {
        const logger = require('../utils/logger');
        logger.error('email_report_send_failed', { runId, code: error.code || '', message: error.message });
      } catch {
        /* optional logger */
      }
    }
    await repository.finishRun(runId, { status: 'FAILED', error: message, snapshot: {} });
    if (!run.isTest && report.frequency !== 'MANUAL') {
      // Keep schedule active after a delivery failure so the next day still runs.
      await repository.setNext(report.id, nextRunAt({ ...report, status: 'ACTIVE' }));
      await leaveRepository.notify([report.ownerId], `Report failed: ${report.name}`, message, '/email-reports');
    }
    await repository.activity(report.id, actor.id, 'Report failed');
  }
}

async function resolveRecipients(report, rows, testEmail) {
  if (testEmail) {
    if (!EMAIL.test(testEmail)) throw new ApiError(400, 'Your account does not have an email address for a test.');
    return { to: [{ kind: 'TO', email: testEmail, name: '' }], cc: [], bcc: [] };
  }
  const buckets = { TO: [], CC: [], BCC: [] };
  for (const row of rows) {
    const people = await peopleFor(row, report);
    people.forEach((person) => {
      if (EMAIL.test(person.email)) buckets[row.kind].push({ kind: row.kind, email: person.email.toLowerCase(), name: person.name || person.full_name || '' });
    });
  }
  ['TO', 'CC', 'BCC'].forEach((kind) => {
    const seen = new Set();
    buckets[kind] = buckets[kind].filter((item) => {
      if (seen.has(item.email)) return false;
      seen.add(item.email);
      return true;
    });
  });
  return { to: buckets.TO, cc: buckets.CC, bcc: buckets.BCC };
}

async function peopleFor(row, report) {
  if (row.recipientType === 'USER' && row.userId) return repository.emailsForUsers([row.userId]);
  if (row.recipientType === 'TEAM' && row.teamId) return repository.emailsForTeam(row.teamId);
  if (row.recipientType === 'EMAIL') return [{ email: row.email, full_name: row.name }];
  if (row.recipientType === 'MANAGEMENT') return repository.roleEmails('management');
  const config = report.configuration || {};
  if (row.recipientType === 'TEAM_LEAD' && (config.teamId || row.teamId)) return teamLead(config.teamId || row.teamId);
  if (row.recipientType === 'TEAM_MEMBERS' && (config.teamId || row.teamId)) return repository.emailsForTeam(config.teamId || row.teamId);
  if (row.recipientType === 'PROJECT_MANAGER' && config.projectId) return projectPeople(config.projectId, 'manager');
  if (row.recipientType === 'TASK_ASSIGNEES' && config.projectId) return projectPeople(config.projectId, 'assignees');
  if (row.recipientType === 'SALES_OWNER' && config.projectId) return projectPeople(config.projectId, 'sales');
  return [];
}

async function teamLead(teamId) {
  const { query } = require('../db');
  const result = await query(
    `SELECT u.full_name, u.email FROM teams t JOIN users u ON u.id = t.lead_id WHERE t.id = $1`,
    [teamId],
  );
  return result.rows;
}

async function projectPeople(projectId, mode) {
  const { query } = require('../db');
  if (mode === 'manager') {
    const result = await query(
      `SELECT u.full_name, u.email FROM projects p JOIN users u ON u.id = p.project_manager_id WHERE p.id = $1`,
      [projectId],
    );
    return result.rows;
  }
  if (mode === 'assignees') {
    const result = await query(
      `SELECT DISTINCT u.full_name, u.email FROM project_tasks t JOIN users u ON u.id = t.assignee_id WHERE t.project_id = $1 AND u.is_active = TRUE`,
      [projectId],
    );
    return result.rows;
  }
  const result = await query(
    `SELECT u.full_name, u.email FROM projects p JOIN leads l ON l.id = p.lead_id JOIN users u ON u.id = l.created_by WHERE p.id = $1`,
    [projectId],
  );
  return result.rows;
}

async function history(user) {
  const owner = ownerFilter(user);
  return { runs: await repository.recentRuns(owner.sql, owner.params) };
}

async function runDetail(user, id) {
  const run = await repository.findRun(id);
  if (!run) throw new ApiError(404, 'Email history was not found.');
  if (!isAdmin(user) && run.sentBy !== user.id) {
    const report = run.reportId ? await repository.findReport(run.reportId) : null;
    if (!report || report.ownerId !== user.id) throw new ApiError(403, 'You cannot view this email.');
  }
  const { fileBody, ...safe } = run;
  return { run: { ...safe, hasFile: Boolean(fileBody) }, deliveries: await repository.deliveries(id) };
}

async function downloadRun(user, id) {
  const packed = await runDetail(user, id);
  const run = await repository.findRun(id);
  if (run.fileBody) {
    const excel = String(run.fileName).endsWith('.xls');
    return { name: run.fileName, type: excel ? 'application/vnd.ms-excel' : 'application/pdf', body: run.fileBody };
  }
  if (!run.reportId) throw new ApiError(404, 'The report file is no longer available.');
  const report = await repository.findReport(run.reportId);
  const actorRow = await repository.userById(user.id);
  const snapshot = await generate.build(report, toPublicUser(actorRow));
  return fileFor(snapshot, report.attachment === 'EXCEL' ? 'excel' : 'pdf');
}

async function retry(user, id) {
  const run = await repository.findRun(id);
  if (!run) throw new ApiError(404, 'Email history was not found.');
  if (!run.reportId) throw new ApiError(400, 'The original report was deleted.');
  return queueSend(user, run.reportId, { test: run.isTest, attemptOf: id });
}

async function saveTemplate(user, body, id) {
  if (id) {
    const current = await repository.findTemplate(id);
    if (!current) throw new ApiError(404, 'Template not found.');
    if (current.isSystem && !isAdmin(user)) throw new ApiError(403, 'System templates can only be changed by an administrator.');
    if (!current.isSystem && current.createdBy !== user.id && !isAdmin(user)) throw new ApiError(403, 'You cannot change this template.');
  }
  const name = clean(body.name, 160);
  if (name.length < 2 || !generate.TYPES[body.type]) throw new ApiError(400, 'Template name and type are required.');
  const input = { name, type: body.type, description: clean(body.description, 2000), configuration: configuration(body), createdBy: user.id };
  const templateId = id || await repository.insertTemplate(input);
  if (id) await repository.updateTemplate(id, input);
  return repository.findTemplate(templateId);
}

async function readSettings(user) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can view email settings.');
  return mail.publicSettings(await repository.settings());
}

async function writeSettings(user, body) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can change email settings.');
  let host = clean(body.host, 200);
  const fromEmail = clean(body.fromEmail, 200).toLowerCase();
  const replyTo = clean(body.replyTo, 200).toLowerCase();
  let port = Number(body.port);
  let secure = Boolean(body.secure);
  if (host && EMAIL.test(host)) {
    throw new ApiError(400, 'SMTP host must be a server name like smtp.gmail.com, not an email address.');
  }
  if (/gmail\.com$/i.test(host) && !/^smtp\./i.test(host)) {
    host = 'smtp.gmail.com';
  }
  if (host.toLowerCase() === 'smtp.gmail.com') {
    if (!port || port === 25) port = secure ? 465 : 587;
    if (port === 465) secure = true;
    if (port === 587) secure = false;
  }
  if (host && !fromEmail) throw new ApiError(400, 'A from address is required when SMTP host is set.');
  if (fromEmail && !EMAIL.test(fromEmail)) throw new ApiError(400, 'Enter a valid From email address.');
  if (replyTo && !EMAIL.test(replyTo)) throw new ApiError(400, 'Enter a valid reply-to address.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ApiError(400, 'Enter a valid SMTP port.');
  const current = await repository.settings();
  const password = String(body.password || '');
  if (host && !password && !current?.password_enc && !(require('../config/env').smtp.pass)) {
    throw new ApiError(400, 'Enter the SMTP password (or app password) to complete configuration.');
  }
  await repository.saveSettings({
    provider: 'SMTP',
    host,
    port,
    username: clean(body.username, 200) || fromEmail,
    passwordEnc: password ? mail.encrypt(password) : '',
    fromName: clean(body.fromName, 120) || 'CareYu Automation',
    fromEmail,
    replyTo,
    secure,
    updatedBy: user.id,
  });
  return mail.publicSettings(await repository.settings());
}

async function testSmtpConnection(user) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can test email settings.');
  return mail.verifyConnection(await repository.settings());
}

async function sendSmtpTestEmail(user, body = {}) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can send a test email.');
  const settings = await repository.settings();
  const resolved = mail.resolveSettings(settings);
  if (!resolved.configured) {
    throw new ApiError(400, 'Email is not configured. An administrator needs to save the SMTP settings.');
  }
  const target = clean(body.to || user.email, 200).toLowerCase();
  if (!EMAIL.test(target)) throw new ApiError(400, 'Enter a valid email address for the test message.');
  const result = await mail.sendMail(resolved, {
    to: [target],
    cc: [],
    bcc: [],
    subject: 'CareYu SMTP test',
    html: `<p>This is a test message from CareYu Automation Project Hub.</p><p>SMTP host: <strong>${resolved.host}</strong></p><p>If you received this email, delivery is working.</p>`,
  });
  return { ok: true, to: target, messageId: result.messageId || '' };
}

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = new Date();
    const today = kolkataDate(now);
    const due = await repository.due(now);
    for (const report of due) {
      if (report.type === 'DAILY_WORK' && dailyWorkEmailsPaused(now)) {
        await repository.setNext(report.id, firstRunAfterPause({ ...report, status: 'ACTIVE' }));
        continue;
      }
      const next = nextRunAt({ ...report, status: 'ACTIVE' }, now);
      await repository.setNext(report.id, next);
      if (report.type === 'DAILY_WORK') {
        const already = await repository.alreadySentToday(report.id, today);
        if (already) {
          await repository.activity(report.id, report.ownerId, 'Duplicate scheduled send skipped');
          continue;
        }
      }
      const runId = await repository.insertRun({
        reportId: report.id,
        reportName: report.name,
        reportType: report.type,
        attachment: report.attachment,
        sentBy: report.ownerId,
        isTest: false,
        attemptOf: null,
        snapshot: {},
      });
      await repository.activity(report.id, report.ownerId, 'Report scheduled run');
      enqueue(runId);
    }
  } finally {
    ticking = false;
  }
}

module.exports = {
  home, detail, save, duplicate, setReportStatus, remove, preview, previewFile,
  queueSend, history, runDetail, downloadRun, retry, saveTemplate, readSettings, writeSettings,
  testSmtpConnection, sendSmtpTestEmail, tick,
};
