const ApiError = require('../utils/ApiError');
const { query } = require('../db');
const leaveRepository = require('../db/leave.repository');
const { sendMail } = require('./emailReport.mail');
const repository = require('../db/escalation.repository');
const { pdf } = require('./timeExport');

function sheet(name, columns, rows) {
  const escapeXml = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const body = [columns, ...rows].map((line) => `<Row>${line.map((cell) => `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`).join('')}</Row>`).join('');
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="${escapeXml(name)}"><Table>${body}</Table></Worksheet></Workbook>`;
}

const TYPES = ['PROJECT_DELAY', 'TECHNICAL', 'CUSTOMER', 'PROCUREMENT', 'VENDOR', 'RESOURCE', 'QUALITY', 'SAFETY', 'INTEGRATION', 'REQUIREMENT', 'COMMERCIAL', 'PRODUCTION', 'INSTALLATION', 'OTHER'];
const TYPE_LABEL = {
  PROJECT_DELAY: 'Project Delay', TECHNICAL: 'Technical Issue', CUSTOMER: 'Customer Issue', PROCUREMENT: 'Procurement Issue',
  VENDOR: 'Vendor Issue', RESOURCE: 'Resource Issue', QUALITY: 'Quality Issue', SAFETY: 'Safety Issue', INTEGRATION: 'Integration Issue',
  REQUIREMENT: 'Requirement Change', COMMERCIAL: 'Commercial Issue', PRODUCTION: 'Production Issue', INSTALLATION: 'Installation Issue', OTHER: 'Other',
};
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const LEVELS = new Set(['TEAM', 'PROJECT', 'DEPARTMENT', 'MANAGEMENT']);
const IMPACTS = new Set(['', 'SCHEDULE', 'COST', 'CUSTOMER', 'QUALITY', 'SAFETY', 'PRODUCTION', 'TECHNICAL', 'RESOURCE', 'PROCUREMENT', 'OTHER']);
const OPEN = new Set(['OPEN', 'ASSIGNED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'WAITING_FOR_RESPONSE']);
const NEXT = {
  OPEN: ['ASSIGNED', 'UNDER_REVIEW', 'REJECTED', 'CANCELLED'],
  ASSIGNED: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CANCELLED'],
  UNDER_REVIEW: ['ACTION_REQUIRED', 'WAITING_FOR_RESPONSE', 'RESOLVED', 'CANCELLED'],
  ACTION_REQUIRED: ['WAITING_FOR_RESPONSE', 'UNDER_REVIEW', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_RESPONSE: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
  REJECTED: ['OPEN'],
  CANCELLED: ['OPEN'],
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function notify(userIds, title, body, link) {
  await leaveRepository.notify(userIds, title, body, link);
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return;
  setImmediate(() => {
    emailCopy(ids, title, body, link).catch(() => {});
  });
}

async function emailCopy(ids, title, body, link) {
  const settings = await query('SELECT * FROM email_settings WHERE id = 1');
  const row = settings.rows[0];
  if (!row?.host || !row?.from_email || !row?.password_enc) return;
  const people = await query('SELECT email FROM users WHERE id = ANY($1::uuid[]) AND email <> \'\'', [ids]);
  const to = people.rows.map((item) => item.email).filter(Boolean);
  if (!to.length) return;
  await sendMail(row, {
    to,
    cc: [],
    bcc: [],
    subject: title,
    html: `<p>${escapeHtml(body)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    attachment: [],
  });
}

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function isStrictAdmin(user) {
  return ['admin', 'super_admin'].includes(user?.role?.code || '');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function ageLabel(from, to) {
  const start = new Date(from).getTime();
  const end = new Date(to || Date.now()).getTime();
  const hours = Math.max(1, Math.round((end - start) / 3600000));
  if (hours < 48) return `${hours} hours`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}

function present(row) {
  const closed = !OPEN.has(row.status);
  const overdue = Boolean(row.dueDate && row.dueDate < today() && OPEN.has(row.status));
  return {
    ...row,
    typeLabel: TYPE_LABEL[row.type] || row.type,
    overdue,
    age: row.resolvedAt ? `Resolved in ${ageLabel(row.createdAt, row.resolvedAt)}` : ageLabel(row.createdAt),
    resolutionHours: row.resolvedAt ? Math.round((new Date(row.resolvedAt) - new Date(row.createdAt)) / 3600000) : null,
    closed,
  };
}

async function scope(user) {
  if (isAdmin(user)) return { sql: '', params: [] };
  const teams = await repository.leadTeamIds(user.id);
  const params = [user.id];
  let extra = '';
  if (teams.length) {
    params.push(teams);
    extra = ` OR e.team_id = ANY($${params.length}::uuid[])`;
  }
  return { sql: `WHERE (e.raised_by = $1 OR e.assigned_to = $1${extra})`, params };
}

function canSee(user, row, leadTeams) {
  if (isAdmin(user)) return true;
  if (row.raisedById === user.id || row.assignedToId === user.id) return true;
  return Boolean(row.teamId && leadTeams.includes(row.teamId));
}

function canEdit(user, row, leadTeams) {
  return canSee(user, row, leadTeams);
}

async function guard(user, id) {
  const row = await repository.find(id);
  if (!row) throw new ApiError(404, 'Escalation not found.');
  const teams = isAdmin(user) ? [] : await repository.leadTeamIds(user.id);
  if (!canSee(user, row, teams)) throw new ApiError(403, 'You cannot view this escalation.');
  return { row, teams };
}

function inputOf(body, current, user) {
  const title = clean(body.title ?? current?.title, 200);
  const description = clean(body.description ?? current?.description, 8000);
  const fields = {};
  if (title.length < 2) fields.title = 'Escalation title is required.';
  if (description.length < 2) fields.description = 'Describe the issue.';
  const type = body.type || current?.type;
  if (!TYPES.includes(type)) fields.type = 'Select an escalation type.';
  const priority = body.priority || current?.priority || 'MEDIUM';
  if (!PRIORITIES.has(priority)) fields.priority = 'Select a priority.';
  const level = LEVELS.has(body.level) ? body.level : (current?.level || 'TEAM');
  const impactArea = body.impactArea ?? current?.impactArea ?? '';
  if (!IMPACTS.has(impactArea)) fields.impactArea = 'Select an impact area.';
  const impactSeverity = body.impactSeverity || current?.impactSeverity || '';
  if (impactSeverity && !PRIORITIES.has(impactSeverity)) fields.impactSeverity = 'Select an impact severity.';
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], { fields });
  const projectId = body.projectId === '' ? null : (UUID.test(body.projectId || '') ? body.projectId : (current?.projectId || null));
  return {
    title,
    type,
    priority,
    status: current?.status || (UUID.test(body.assignedTo || '') ? 'ASSIGNED' : 'OPEN'),
    level,
    description,
    impactArea,
    impactSeverity,
    recommendedAction: clean(body.recommendedAction ?? current?.recommendedAction, 4000),
    projectId,
    customerName: clean(body.customerName ?? current?.customerName, 200),
    teamId: body.teamId === '' ? null : (UUID.test(body.teamId || '') ? body.teamId : (current?.teamId || null)),
    raisedBy: current?.raisedById || user.id,
    assignedTo: body.assignedTo === '' ? null : (UUID.test(body.assignedTo || '') ? body.assignedTo : (current?.assignedToId || null)),
    taskId: UUID.test(body.taskId || '') ? body.taskId : (body.taskId === '' ? null : (current?.taskId || null)),
    workRequestId: UUID.test(body.workRequestId || '') ? body.workRequestId : (current?.workRequestId || null),
    leadId: UUID.test(body.leadId || '') ? body.leadId : (current?.leadId || null),
    feasibilityId: UUID.test(body.feasibilityId || '') ? body.feasibilityId : (current?.feasibilityId || null),
    costingId: UUID.test(body.costingId || '') ? body.costingId : (current?.costingId || null),
    dueDate: body.dueDate === '' ? null : (cleanDate(body.dueDate) || current?.dueDate || null),
    rootCause: clean(body.rootCause ?? current?.rootCause, 4000),
    correctiveAction: clean(body.correctiveAction ?? current?.correctiveAction, 4000),
    preventiveAction: clean(body.preventiveAction ?? current?.preventiveAction, 4000),
    resolutionNotes: clean(body.resolutionNotes ?? current?.resolutionNotes, 4000),
    resolvedBy: current?.resolvedBy || null,
    resolvedAt: current?.resolvedAt || null,
    closedAt: current?.closedAt || null,
    archivedAt: current?.archivedAt || null,
  };
}

function filters(query, base) {
  const params = [...base.params];
  const parts = [];
  const add = (sql, value) => {
    params.push(value);
    parts.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (query.archived !== 'true' && query.archived !== '1') parts.push('e.archived_at IS NULL');
  if (query.status && NEXT[query.status]) add('e.status = ?', query.status);
  if (PRIORITIES.has(query.priority)) add('e.priority = ?', query.priority);
  if (TYPES.includes(query.type)) add('e.type = ?', query.type);
  if (UUID.test(query.projectId || '')) add('e.project_id = ?', query.projectId);
  if (UUID.test(query.teamId || '')) add('e.team_id = ?', query.teamId);
  if (UUID.test(query.assignedTo || '')) add('e.assigned_to = ?', query.assignedTo);
  if (UUID.test(query.raisedBy || '')) add('e.raised_by = ?', query.raisedBy);
  if (UUID.test(query.taskId || '')) add('e.task_id = ?', query.taskId);
  if (cleanDate(query.from)) add('e.created_at::date >= ?', query.from);
  if (cleanDate(query.to)) add('e.created_at::date <= ?', query.to);
  if (query.quick === 'open') parts.push("e.status IN ('OPEN','ASSIGNED','UNDER_REVIEW','ACTION_REQUIRED','WAITING_FOR_RESPONSE')");
  if (query.quick === 'critical') parts.push("e.priority = 'CRITICAL' AND e.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED')");
  if (query.quick === 'overdue' || query.overdue === 'true') parts.push("e.due_date < CURRENT_DATE AND e.status NOT IN ('RESOLVED','CLOSED','CANCELLED','REJECTED')");
  if (query.quick === 'resolved') parts.push("e.status IN ('RESOLVED','CLOSED')");
  if (query.q) {
    params.push(`%${clean(query.q, 80)}%`);
    const mark = `$${params.length}`;
    parts.push(`(e.title ILIKE ${mark} OR e.customer_name ILIKE ${mark} OR ('ESC-' || LPAD(e.escalation_number::text, 5, '0')) ILIKE ${mark} OR COALESCE(p.title,'') ILIKE ${mark} OR COALESCE(t.name,'') ILIKE ${mark} OR COALESCE(raiser.full_name,'') ILIKE ${mark} OR COALESCE(assignee.full_name,'') ILIKE ${mark})`);
  }
  const where = `${base.sql}${parts.length ? `${base.sql ? ' AND ' : 'WHERE '}${parts.join(' AND ')}` : ''}`;
  return { where, params };
}

function trendOf(rows, days) {
  const span = [7, 30, 90].includes(Number(days)) ? Number(days) : 30;
  const buckets = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (span - 1));
  for (let index = 0; index < span; index += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    buckets.push({ date: key, created: 0, resolved: 0 });
  }
  const index = new Map(buckets.map((item) => [item.date, item]));
  const dayKey = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  rows.forEach((row) => {
    const created = index.get(dayKey(row.created_at));
    if (created) created.created += 1;
    if (row.resolved_at) {
      const resolved = index.get(dayKey(row.resolved_at));
      if (resolved) resolved.resolved += 1;
    }
  });
  return buckets;
}

async function home(user, query) {
  const base = await scope(user);
  if (query.quick === 'mine') query = { ...query, raisedBy: user.id };
  if (query.quick === 'assigned') query = { ...query, assignedTo: user.id };
  const filtered = filters(query, base);
  const [rows, kpis, viewKpis, groups, choices, stamps] = await Promise.all([
    repository.list(filtered.where, filtered.params, query.sort),
    repository.counts(base.sql, base.params),
    repository.counts(filtered.where, filtered.params),
    repository.grouped(base.sql, base.params),
    repository.options(),
    repository.stamps(base.sql, base.params),
  ]);
  return {
    kpis,
    viewKpis,
    rows: rows.map(present),
    ...groups,
    trend: trendOf(stamps, query.range),
    options: choices,
    types: TYPE_LABEL,
    access: { canCreate: true, canDelete: isStrictAdmin(user) },
  };
}

async function detail(user, id) {
  const { row } = await guard(user, id);
  const [activity, comments, files] = await Promise.all([
    repository.listActivity(id),
    repository.comments(id),
    repository.files(id),
  ]);
  return { escalation: present(row), activity, comments, files };
}

async function create(user, body) {
  const input = inputOf(body, null, user);
  if (input.projectId && !input.customerName) {
    const project = (await repository.options()).projects.find((item) => item.id === input.projectId);
    if (project) input.customerName = project.customerName;
  }
  const id = await repository.insert(input);
  await repository.activity(id, user.id, 'ESCALATION_CREATED', input.title);
  const workflow = require('./workflow.service');
  const severity = input.priority;
  const audience = severity === 'CRITICAL'
    ? ['PM', 'BH', 'ED', 'CEO']
    : severity === 'HIGH'
      ? ['PM', 'BH', 'ED']
      : severity === 'MEDIUM'
        ? ['PM', 'TEAM_LEAD']
        : ['TEAM_LEAD'];
  const recipients = new Set(await workflow.usersByKind(audience));
  if (input.assignedTo) recipients.add(input.assignedTo);
  if (input.assignedTo) {
    await repository.activity(id, user.id, 'ESCALATION_ASSIGNED', 'Assigned when the escalation was created');
  }
  await notify([...recipients], `Escalation ${severity.toLowerCase()}: ${input.title}`, input.description.slice(0, 180), `/escalations/${id}`);
  await workflow.record('escalation', id, 'ESCALATION_CREATED', user.id, severity);
  return detail(user, id);
}

async function update(user, id, body) {
  const { row, teams } = await guard(user, id);
  if (!canEdit(user, row, teams)) throw new ApiError(403, 'You cannot edit this escalation.');
  const input = inputOf(body, row, user);
  input.status = row.status;
  input.resolvedBy = row.resolvedBy;
  input.resolvedAt = row.resolvedAt;
  input.closedAt = row.closedAt;
  input.archivedAt = row.archivedAt;
  await repository.update(id, input);
  await repository.activity(id, user.id, 'ESCALATION_UPDATED', input.title);
  return detail(user, id);
}

async function setStatus(user, id, status) {
  const { row, teams } = await guard(user, id);
  if (!canEdit(user, row, teams)) throw new ApiError(403, 'You cannot change this escalation.');
  if (!(NEXT[row.status] || []).includes(status)) throw new ApiError(400, 'That status change is not allowed from the current state.');
  const input = inputOf(rowToBody(row), row, user);
  input.status = status;
  if (status === 'RESOLVED') {
    input.resolvedAt = new Date();
    input.resolvedBy = user.id;
  }
  if (status === 'CLOSED') input.closedAt = new Date();
  if (status === 'OPEN' && ['RESOLVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(row.status)) {
    input.resolvedAt = null;
    input.resolvedBy = null;
    input.closedAt = null;
    await repository.activity(id, user.id, 'ESCALATION_REOPENED', 'Escalation reopened');
    await notify([row.raisedById, row.assignedToId], `Escalation reopened: ${row.title}`, row.number, `/escalations/${id}`);
  } else {
    const label = status.replace(/_/g, ' ');
    await repository.activity(id, user.id, status === 'RESOLVED' ? 'ESCALATION_RESOLVED' : status === 'CLOSED' ? 'ESCALATION_CLOSED' : 'ESCALATION_STATUS_CHANGED', label);
    await notify([row.raisedById, row.assignedToId], `Escalation ${label.toLowerCase()}: ${row.title}`, row.number, `/escalations/${id}`);
  }
  await repository.update(id, input);
  return detail(user, id);
}

function rowToBody(row) {
  return { ...row, assignedTo: row.assignedToId, projectId: row.projectId, teamId: row.teamId };
}

async function assign(user, id, body) {
  const { row, teams } = await guard(user, id);
  if (!isAdmin(user) && !teams.includes(row.teamId) && row.raisedById !== user.id) {
    throw new ApiError(403, 'You cannot assign this escalation.');
  }
  if (!UUID.test(body.assignedTo || '')) throw new ApiError(400, 'Choose a person to assign.');
  const input = inputOf({ ...rowToBody(row), assignedTo: body.assignedTo, teamId: body.teamId || row.teamId }, row, user);
  input.status = row.status === 'OPEN' ? 'ASSIGNED' : row.status;
  await repository.update(id, input);
  await repository.activity(id, user.id, 'ESCALATION_ASSIGNED', 'Assignee updated');
  const leads = await repository.teamLeadIds(input.teamId);
  await notify([body.assignedTo, ...leads], `Escalation assigned: ${row.title}`, row.number, `/escalations/${id}`);
  return detail(user, id);
}

async function escalate(user, id, body) {
  const { row, teams } = await guard(user, id);
  if (!canEdit(user, row, teams)) throw new ApiError(403, 'You cannot escalate this further.');
  const level = body.level;
  if (!LEVELS.has(level)) throw new ApiError(400, 'Select who this should go to next.');
  const reason = clean(body.reason, 2000);
  if (reason.length < 2) throw new ApiError(400, 'Explain why this needs to be escalated further.');
  const input = inputOf({ ...rowToBody(row), level, assignedTo: UUID.test(body.assignedTo || '') ? body.assignedTo : row.assignedToId }, row, user);
  input.status = row.status === 'OPEN' ? 'UNDER_REVIEW' : row.status;
  await repository.update(id, input);
  await repository.activity(id, user.id, 'ESCALATION_ESCALATED', `${level}: ${reason}`);
  if (input.assignedTo) await notify([input.assignedTo], `Escalated further: ${row.title}`, reason.slice(0, 180), `/escalations/${id}`);
  return detail(user, id);
}

async function resolve(user, id, body) {
  const { row, teams } = await guard(user, id);
  if (!canEdit(user, row, teams)) throw new ApiError(403, 'You cannot resolve this escalation.');
  const input = inputOf({ ...rowToBody(row), ...body }, row, user);
  input.status = 'RESOLVED';
  input.resolvedAt = new Date();
  input.resolvedBy = user.id;
  await repository.update(id, input);
  await repository.activity(id, user.id, 'ESCALATION_RESOLVED', clean(body.resolutionNotes, 240) || 'Resolved');
  await notify([row.raisedById], `Escalation resolved: ${row.title}`, row.number, `/escalations/${id}`);
  return detail(user, id);
}

async function archive(user, id) {
  const { row, teams } = await guard(user, id);
  if (!isAdmin(user) && row.raisedById !== user.id && !teams.includes(row.teamId)) throw new ApiError(403, 'You cannot archive this escalation.');
  if (OPEN.has(row.status)) throw new ApiError(400, 'Resolve or close the escalation before archiving it.');
  const input = inputOf(rowToBody(row), row, user);
  input.archivedAt = new Date();
  await repository.update(id, input);
  await repository.activity(id, user.id, 'ESCALATION_ARCHIVED', 'Archived');
  return detail(user, id);
}

async function duplicate(user, id) {
  const { row } = await guard(user, id);
  const input = inputOf({ ...rowToBody(row), title: `Copy of ${row.title}`.slice(0, 200), assignedTo: '' }, row, user);
  input.status = 'OPEN';
  input.raisedBy = user.id;
  input.assignedTo = null;
  input.resolvedBy = null;
  input.resolvedAt = null;
  input.closedAt = null;
  input.archivedAt = null;
  const copyId = await repository.insert(input);
  await repository.activity(copyId, user.id, 'ESCALATION_CREATED', `Duplicated from ${row.number}`);
  return detail(user, copyId);
}

async function remove(user, id) {
  if (!isStrictAdmin(user)) throw new ApiError(403, 'Cancel or archive this escalation instead of deleting it.');
  await guard(user, id);
  await repository.remove(id);
}

async function comment(user, id, message) {
  await guard(user, id);
  const text = clean(message, 4000);
  if (text.length < 1) throw new ApiError(400, 'Write a comment.');
  await repository.addComment(id, user.id, text);
  await repository.activity(id, user.id, 'ESCALATION_COMMENT_ADDED', text.slice(0, 180));
  const row = await repository.find(id);
  await notify([row.raisedById, row.assignedToId].filter((item) => item && item !== user.id), `Comment on ${row.title}`, text.slice(0, 180), `/escalations/${id}`);
  return detail(user, id);
}

async function editComment(user, id, commentId, message) {
  await guard(user, id);
  const current = await repository.findComment(commentId);
  if (!current || current.escalation_id !== id) throw new ApiError(404, 'Comment not found.');
  if (current.user_id !== user.id && !isAdmin(user)) throw new ApiError(403, 'You can only edit your own comment.');
  const text = clean(message, 4000);
  if (text.length < 1) throw new ApiError(400, 'Write a comment.');
  await repository.editComment(commentId, text);
  return detail(user, id);
}

async function removeComment(user, id, commentId) {
  await guard(user, id);
  const current = await repository.findComment(commentId);
  if (!current || current.escalation_id !== id) throw new ApiError(404, 'Comment not found.');
  if (current.user_id !== user.id && !isStrictAdmin(user)) throw new ApiError(403, 'You can only delete your own comment.');
  await repository.deleteComment(commentId);
  return detail(user, id);
}

async function attach(user, id, file) {
  await guard(user, id);
  if (!file) throw new ApiError(400, 'Choose a file to attach.');
  await repository.addFile(id, file, user.id);
  await repository.activity(id, user.id, 'ESCALATION_UPDATED', `Attachment added: ${file.originalname}`);
  return detail(user, id);
}

async function fileFor(user, id, fileId) {
  await guard(user, id);
  const file = await repository.findFile(fileId);
  if (!file || file.escalation_id !== id) throw new ApiError(404, 'Attachment not found.');
  return file;
}

async function removeFile(user, id, fileId) {
  const file = await fileFor(user, id, fileId);
  if (file.uploaded_by !== user.id && !isAdmin(user)) throw new ApiError(403, 'You cannot remove this file.');
  await repository.deleteFile(fileId);
  return detail(user, id);
}

function exportRows(rows) {
  return rows.map((row) => [
    row.number, row.title, row.projectTitle, row.customerName, row.raisedByName, row.assignedToName, row.teamName,
    row.typeLabel, row.priority, row.status, row.dueDate, row.age, row.overdue ? 'Overdue' : '',
  ]);
}

async function exportFile(user, query) {
  const data = await home(user, query);
  const columns = ['ID', 'Title', 'Project', 'Customer', 'Raised by', 'Assigned to', 'Team', 'Type', 'Priority', 'Status', 'Due', 'Age', 'Overdue'];
  const rows = exportRows(data.rows);
  if (query.format === 'csv') {
    const lines = [columns, ...rows].map((line) => line.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','));
    return { name: 'escalations.csv', type: 'text/csv', body: Buffer.from(lines.join('\n'), 'utf8') };
  }
  if (query.format === 'pdf') {
    const lines = ['CareYu Automation', 'Escalations', ...rows.map((row) => row.join(' | '))];
    return { name: 'escalations.pdf', type: 'application/pdf', body: pdf('Escalations', lines) };
  }
  return { name: 'escalations.xls', type: 'application/vnd.ms-excel', body: Buffer.from(sheet('Escalations', columns, rows), 'utf8') };
}

module.exports = {
  home, detail, create, update, setStatus, assign, escalate, resolve, archive, remove, duplicate,
  comment, editComment, removeComment, attach, fileFor, removeFile, exportFile, TYPE_LABEL,
};
