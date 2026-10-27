const ApiError = require('../utils/ApiError');
const repository = require('../db/dailyWork.repository');
const workLog = require('./dailyWorkLog');
const { evaluateDeadline, reasonRequired, rangeWindow, isoToday } = require('./dailyWorkDelay');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD', 'WAITING_CUSTOMER', 'WAITING_VENDOR', 'WAITING_INTERNAL', 'UNDER_REVIEW']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const DEPENDENCY_TYPES = new Set(['EMPLOYEE', 'TEAM', 'VENDOR', 'CUSTOMER', 'EXTERNAL', 'PROCUREMENT', 'TECHNICAL', 'MATERIAL', 'APPROVAL', 'OTHER']);
const STATUS_LABEL = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  ON_HOLD: 'On Hold',
  WAITING_CUSTOMER: 'Waiting for Customer',
  WAITING_VENDOR: 'Waiting for Vendor',
  WAITING_INTERNAL: 'Waiting for Internal Team',
  UNDER_REVIEW: 'Under Review',
};

function canManage(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function canEdit(user, row) {
  return canManage(user) || row.employeeId === user.id || row.createdById === user.id;
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

function present(user, row) {
  const delay = evaluateDeadline({
    updateDate: row.currentDate,
    deadline: row.taskDeadline,
    status: row.status,
    completionDate: row.completionDate,
  });
  return {
    ...row,
    delayStatus: row.delayStatus || delay.delayStatus,
    delayDays: row.delayDays || delay.delayDays,
    displayLabel: delay.displayLabel,
    access: { canEdit: canEdit(user, row), canDelete: canEdit(user, row) },
  };
}

function summarize(rows) {
  const employees = new Map();
  rows.forEach((row) => {
    const current = employees.get(row.employeeId) || {
      id: row.employeeId,
      name: row.employeeName,
      updates: 0,
      items: new Set(),
      completed: 0,
      inProgress: 0,
      overdue: 0,
      blocked: 0,
      onTime: 0,
    };
    current.updates += 1;
    current.items.add(row.workItemId);
    if (row.status === 'COMPLETED') current.completed += 1;
    if (row.status === 'IN_PROGRESS') current.inProgress += 1;
    if (row.delayStatus === 'OVERDUE') current.overdue += 1;
    if (row.status === 'BLOCKED') current.blocked += 1;
    if (['ON_TIME', 'DUE_TODAY', 'COMPLETED_ON_TIME'].includes(row.delayStatus)) current.onTime += 1;
    employees.set(row.employeeId, current);
  });
  return {
    updates: rows.length,
    inProgress: rows.filter((row) => row.status === 'IN_PROGRESS').length,
    completed: rows.filter((row) => row.status === 'COMPLETED').length,
    dueToday: rows.filter((row) => row.delayStatus === 'DUE_TODAY').length,
    overdue: rows.filter((row) => row.delayStatus === 'OVERDUE').length,
    delayed: rows.filter((row) => row.delayStatus === 'OVERDUE' || row.delayStatus === 'COMPLETED_LATE' || (row.delayStatus === 'BLOCKED' && row.delayDays > 0)).length,
    blocked: rows.filter((row) => row.status === 'BLOCKED').length,
    employees: [...employees.values()].map((row) => ({
      id: row.id,
      name: row.name,
      updates: row.updates,
      items: row.items.size,
      completed: row.completed,
      inProgress: row.inProgress,
      overdue: row.overdue,
      blocked: row.blocked,
      onTimePercent: row.updates ? Math.round((row.onTime / row.updates) * 100) : 0,
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function applyKpi(rows, kpi) {
  if (kpi === 'in_progress') return rows.filter((row) => row.status === 'IN_PROGRESS');
  if (kpi === 'completed') return rows.filter((row) => row.status === 'COMPLETED');
  if (kpi === 'due_today') return rows.filter((row) => row.delayStatus === 'DUE_TODAY');
  if (kpi === 'overdue') return rows.filter((row) => row.delayStatus === 'OVERDUE');
  if (kpi === 'delayed') return rows.filter((row) => row.delayStatus === 'OVERDUE' || row.delayStatus === 'COMPLETED_LATE' || (row.delayStatus === 'BLOCKED' && row.delayDays > 0));
  if (kpi === 'blocked') return rows.filter((row) => row.status === 'BLOCKED');
  return rows;
}

async function dependenciesOf(body) {
  if (!Array.isArray(body.dependencies)) return [];
  return body.dependencies.map((item) => {
    const type = item.type || 'EXTERNAL';
    if (!DEPENDENCY_TYPES.has(type)) throw new ApiError(400, 'Select a valid dependency type.');
    const employeeId = type === 'EMPLOYEE' ? String(item.employeeId || '') : null;
    const teamId = type === 'TEAM' ? String(item.teamId || '') : null;
    const named = ['VENDOR', 'CUSTOMER', 'EXTERNAL', 'OTHER'].includes(type);
    const externalName = named ? clean(item.externalName || item.description, 200) : clean(item.externalName, 200);
    if (employeeId && !UUID.test(employeeId)) throw new ApiError(400, 'Select a dependency person.');
    if (teamId && !UUID.test(teamId)) throw new ApiError(400, 'Select a dependency team.');
    if (named && externalName.length < 2 && clean(item.description, 500).length < 2) {
      throw new ApiError(400, 'Describe the dependency.');
    }
    if (type === 'EMPLOYEE' && !employeeId) throw new ApiError(400, 'Select a dependency person.');
    if (type === 'TEAM' && !teamId) throw new ApiError(400, 'Select a dependency team.');
    return { type, employeeId, teamId, externalName, description: clean(item.description, 500) };
  }).slice(0, 12);
}

async function buildInput(user, body, current) {
  const employeeId = canManage(user) ? (body.employeeId || current?.employeeId || user.id) : (current?.employeeId || user.id);
  if (!UUID.test(employeeId)) throw new ApiError(400, 'Select an employee.');
  const description = clean(body.description ?? current?.description, 4000);
  if (description.length < 2) throw new ApiError(400, 'Description is required.', { fields: { description: 'Description is required.' } });
  const status = body.status || current?.status || 'IN_PROGRESS';
  if (!STATUSES.has(status)) throw new ApiError(400, 'Select a valid status.');
  const priority = body.priority || current?.priority || 'MEDIUM';
  if (!PRIORITIES.has(priority)) throw new ApiError(400, 'Select a valid priority.');
  let updateDate = cleanDate(body.currentDate || body.updateDate || current?.currentDate);
  if (!canManage(user)) updateDate = current?.currentDate || isoToday();
  if (!updateDate) updateDate = isoToday();
  const taskDeadline = cleanDate(body.taskDeadline ?? current?.taskDeadline) || null;
  let completionDate = cleanDate(body.completionDate || current?.completionDate) || null;
  if (status === 'COMPLETED' && !completionDate) completionDate = updateDate;
  if (status !== 'COMPLETED') completionDate = null;
  const projectId = body.projectId === '' ? null : (body.projectId ?? current?.projectId ?? null);
  if (projectId && !UUID.test(projectId)) throw new ApiError(400, 'Select a valid project.');
  const delay = evaluateDeadline({ updateDate, deadline: taskDeadline, status, completionDate });
  const reason = clean(body.reasonForDelay ?? current?.reasonForDelay, 2000);
  if (reasonRequired(delay) && reason.length < 2) {
    throw new ApiError(400, 'A reason for delay is required.', { fields: { reasonForDelay: 'Explain the delay.' } });
  }
  return {
    employeeId,
    projectId: projectId || null,
    description,
    status,
    priority,
    updateDate,
    taskDeadline,
    completionDate,
    delayDays: delay.delayDays,
    delayStatus: delay.delayStatus,
    reasonForDelay: reasonRequired(delay) ? reason : '',
    remarks: clean(body.remarks ?? current?.remarks, 2000),
    dependencies: await dependenciesOf(body.dependencies ? body : { dependencies: current?.dependencies || [] }),
    title: clean(body.title || current?.title, 200),
    taskId: body.taskId || null,
    workItemId: body.workItemId || current?.workItemId || null,
  };
}

async function resolveItem(client, user, input) {
  if (input.workItemId) {
    const item = await repository.findItem(input.workItemId);
    if (!item) throw new ApiError(404, 'Work item not found.');
    await repository.updateItem(client, item.id, {
      title: input.title || item.title,
      employeeId: input.employeeId,
      projectId: input.projectId,
      priority: input.priority,
      deadline: input.taskDeadline,
    });
    return item.id;
  }
  if (input.taskId) {
    if (!UUID.test(input.taskId)) throw new ApiError(400, 'Select a valid task.');
    const task = await repository.findTask(input.taskId);
    if (!task) throw new ApiError(404, 'Task not found.');
    const existing = await repository.findItemByTask(task.id);
    if (existing) {
      await repository.updateItem(client, existing, {
        title: task.title,
        employeeId: input.employeeId,
        projectId: input.projectId || task.projectId,
        priority: input.priority,
        deadline: input.taskDeadline || task.deadline || null,
      });
      return existing;
    }
    return repository.insertItem(client, {
      taskId: task.id,
      title: task.title,
      employeeId: input.employeeId,
      projectId: input.projectId || task.projectId,
      priority: input.priority || task.priority,
      deadline: input.taskDeadline || task.deadline || null,
      createdById: user.id,
    });
  }
  if (input.title.length < 2) throw new ApiError(400, 'Task name is required.', { fields: { title: 'Task name is required.' } });
  return repository.insertItem(client, {
    taskId: null,
    title: input.title,
    employeeId: input.employeeId,
    projectId: input.projectId,
    priority: input.priority,
    deadline: input.taskDeadline,
    createdById: user.id,
  });
}

async function list(user, filters = {}) {
  return workLog.list(user, filters);
}

async function detailUpdate(id, user) {
  return workLog.detailUpdate(id, user);
}

async function history(ref, user) {
  return workLog.history(ref, user);
}

async function create(user, body) {
  return workLog.create(user, body);
}

async function update(id, user, body) {
  return workLog.update(id, user, body);
}

async function remove(id, user) {
  return workLog.remove(id, user);
}

async function summary(user, filters) {
  const data = await list(user, { ...filters, kpi: '' });
  return { summary: data.summary, window: data.window, today: data.today };
}

async function forEmployee(user, employeeId, filters) {
  if (!UUID.test(employeeId || '')) throw new ApiError(400, 'Employee is not valid.');
  if (!workLog.seesOrganization(user) && employeeId !== user.id) {
    throw new ApiError(403, 'You can only view your own daily work.');
  }
  return list(user, { ...filters, employeeId });
}

async function rowsForExport(user, filters) {
  const data = await list(user, filters);
  return data;
}

module.exports = {
  list,
  detailUpdate,
  history,
  create,
  update,
  remove,
  summary,
  forEmployee,
  rowsForExport,
  addAttachments: workLog.addAttachments,
  attachmentFile: workLog.attachmentFile,
  removeAttachment: workLog.removeAttachment,
  STATUS_LABEL,
};
