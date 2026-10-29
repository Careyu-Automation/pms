const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const repository = require('../db/planning.repository');
const teamService = require('./team.service');

const TASK_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'ON_HOLD', 'CANCELLED', 'BLOCKED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const TEAMS = new Set(['vision', 'robotics', 'software', 'procurement', 'execution']);
const MILESTONE_STATUSES = new Set(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'MISSED']);
const TASK_STATUS_LABEL = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  CANCELLED: 'Cancelled',
};

function uploadDir(projectId) {
  return path.join(__dirname, '..', 'uploads', 'projects', projectId);
}

function shortDate(value) {
  if (!value) return 'unset';
  const parts = String(value).slice(0, 10).split('-').map(Number);
  if (parts.length < 3 || parts.some((part) => !part)) return String(value);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[parts[1] - 1]} ${parts[2]}`;
}

function canPlan(user) {
  const code = user?.role?.code || '';
  return ['admin', 'super_admin', 'project_manager', 'management', 'team_lead', 'employee'].includes(code);
}

function assertPlan(user) {
  if (!canPlan(user)) throw new ApiError(403, 'You cannot change this project plan.');
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function optionalUuid(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^[0-9a-f-]{36}$/i.test(text)) throw new ApiError(400, 'Select a valid person.');
  return text;
}

function progressValue(value, status) {
  const number = Math.round(Number(value));
  if (status === 'COMPLETED') return 100;
  if (!Number.isFinite(number)) return 0;
  return Math.min(100, Math.max(0, number));
}

async function requireProject(id) {
  const project = await repository.findProjectHeader(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  return project;
}

function summarize(tasks, milestones, project, baseline) {
  const active = tasks.filter((task) => task.status !== 'CANCELLED');
  const completed = active.filter((task) => task.status === 'COMPLETED').length;
  const overdue = active.filter((task) => task.overdue).length;
  // Default progress = completed tasks / eligible tasks (cancelled excluded).
  const progress = active.length ? Math.round((completed / active.length) * 100) : null;
  const progressWeighted = active.length
    ? Math.round(active.reduce((sum, task) => sum + task.progress, 0) / active.length)
    : null;
  const milestoneDone = milestones.filter((item) => item.status === 'COMPLETED').length;
  const missed = milestones.filter((item) => item.missed).length;
  let health = 'ON TRACK';
  if (!active.length && project.status === 'NOT_STARTED') health = 'NOT ASSESSED';
  else if (project.status === 'ON_HOLD') health = 'ON HOLD';
  else if (overdue > 0 || missed > 0 || (project.targetDate && project.targetDate < new Date().toISOString().slice(0, 10) && project.status !== 'COMPLETED')) health = 'DELAYED';
  else if (project.status === 'AT_RISK' || active.some((task) => task.status === 'AT_RISK')) health = 'AT RISK';
  else if (project.status === 'CANCELLED') health = 'CANCELLED';
  else if (project.status === 'COMPLETED') health = 'COMPLETED';
  let varianceDays = null;
  if (baseline?.plannedEnd && project.targetDate) {
    const planned = new Date(`${baseline.plannedEnd}T00:00:00`);
    const current = new Date(`${project.targetDate}T00:00:00`);
    varianceDays = Math.round((current - planned) / 86400000);
  }
  return {
    progress,
    progressWeighted,
    taskTotal: active.length,
    taskCompleted: completed,
    overdue,
    milestoneTotal: milestones.length,
    milestoneCompleted: milestoneDone,
    missedMilestones: missed,
    health,
    varianceDays,
  };
}

async function people() {
  const users = await userRepository.listActive();
  return users.map(toPublicUser).map((person) => ({ id: person.id, fullName: person.fullName }));
}

async function getPlan(projectId) {
  const project = await requireProject(projectId);
  const [phases, tasks, dependencies, milestones, baseline, users, timeEntries] = await Promise.all([
    repository.listPhases(projectId),
    repository.listTasks({ projectId }),
    repository.listDependencies(projectId),
    repository.listMilestones(projectId),
    repository.latestBaseline(projectId),
    people(),
    repository.listTimeEntries(projectId),
  ]);
  return {
    project,
    phases,
    tasks,
    dependencies,
    milestones,
    baseline,
    users,
    timeEntries,
    summary: summarize(tasks, milestones, project, baseline),
  };
}

async function assigneeName(id) {
  if (!id) return '';
  const users = await people();
  return users.find((person) => person.id === id)?.fullName || '';
}

async function getTask(taskId) {
  const task = await repository.findTask(taskId);
  if (!task) throw new ApiError(404, 'Task not found.');
  return task;
}

function localIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function todayIso() {
  return localIso(new Date());
}

function addDaysIso(iso, days) {
  const parts = String(iso).split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  date.setDate(date.getDate() + days);
  return localIso(date);
}

function weekBounds() {
  const today = new Date();
  const shift = today.getDay() === 0 ? -6 : 1 - today.getDay();
  const start = new Date(today);
  start.setDate(today.getDate() + shift);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localIso(start), end: localIso(end) };
}

function isOpen(task) {
  return task.status !== 'COMPLETED' && task.status !== 'CANCELLED';
}

function matchesAssigned(task, query) {
  if (query.status && TASK_STATUSES.has(query.status) && task.status !== query.status) return false;
  if (query.priority && PRIORITIES.has(query.priority) && task.priority !== query.priority) return false;
  if (query.projectId && task.projectId !== query.projectId) return false;
  if (query.productId && task.productId !== query.productId) return false;
  const search = String(query.q || '').trim().toLowerCase();
  if (search) {
    const haystack = `${task.title} ${task.taskCode} ${task.projectTitle} ${task.productName} ${task.projectCode} ${task.productCode}`.toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  const today = todayIso();
  if (query.due === 'overdue' && !task.overdue) return false;
  if (query.due === 'today' && !(isOpen(task) && task.endDate === today)) return false;
  if (query.due === 'week') {
    const bounds = weekBounds();
    if (!task.endDate || task.endDate < bounds.start || task.endDate > bounds.end) return false;
  }
  if (query.due === 'none' && task.endDate) return false;
  return true;
}

function summarizeAssigned(tasks) {
  const today = todayIso();
  return {
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
    dueToday: tasks.filter((task) => isOpen(task) && task.endDate === today).length,
    overdue: tasks.filter((task) => task.overdue).length,
    completed: tasks.filter((task) => task.status === 'COMPLETED').length,
  };
}

function highlightsFor(tasks) {
  const today = todayIso();
  const upcomingEnd = addDaysIso(today, 7);
  const overdue = tasks.filter((task) => task.overdue);
  const dueToday = tasks.filter((task) => isOpen(task) && task.endDate === today && !task.overdue);
  const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS' && !task.overdue && task.endDate !== today);
  const upcoming = tasks
    .filter((task) => isOpen(task) && task.endDate > today && task.endDate <= upcomingEnd)
    .sort((left, right) => left.endDate.localeCompare(right.endDate));
  return { today: [...overdue, ...dueToday, ...inProgress], upcoming, overdue };
}

function sourceOptions(tasks) {
  const projects = [];
  const products = [];
  const seenProjects = new Set();
  const seenProducts = new Set();
  tasks.forEach((task) => {
    if (task.projectId && !seenProjects.has(task.projectId)) {
      seenProjects.add(task.projectId);
      projects.push({ id: task.projectId, title: task.projectTitle, code: task.projectCode });
    }
    if (task.productId && !seenProducts.has(task.productId)) {
      seenProducts.add(task.productId);
      products.push({ id: task.productId, title: task.productName, code: task.productCode });
    }
  });
  return { projects, products };
}

async function listTasks(user, query = {}) {
  if (query.scope === 'mine') {
    const tasks = await repository.listTasks({ assigneeId: user.id });
    return {
      tasks: tasks.filter((task) => matchesAssigned(task, query)),
      summary: summarizeAssigned(tasks),
      highlights: highlightsFor(tasks),
      ...sourceOptions(tasks),
      people: await people(),
    };
  }
  const filters = {};
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (query.projectId && id.test(query.projectId)) filters.projectId = query.projectId;
  if (query.productId && id.test(query.productId)) filters.productId = query.productId;
  if (query.assigneeId && id.test(query.assigneeId)) filters.assigneeId = query.assigneeId;
  if (query.team && TEAMS.has(query.team)) filters.teamCode = query.team;
  const tasks = await repository.listTasks(filters);
  if (query.scope === 'team') return tasks.filter((task) => task.teamCode);
  return tasks;
}

function outsideParent(start, end, parentStart, parentEnd) {
  if (parentStart && start && start < parentStart) return true;
  if (parentEnd && end && end > parentEnd) return true;
  return false;
}

async function assertSchedule(projectId, { phaseId, start, end, confirm }) {
  if (start && end && end < start) throw new ApiError(400, 'The start date must be on or before the deadline.');
  const header = await repository.findProjectHeader(projectId);
  let parentStart = header?.startDate || '';
  let parentEnd = header?.targetDate || '';
  if (phaseId) {
    const phases = await repository.listPhases(projectId);
    const phase = phases.find((item) => item.id === phaseId);
    if (phase?.startDate) parentStart = phase.startDate;
    if (phase?.endDate) parentEnd = phase.endDate;
  }
  if (outsideParent(start, end, parentStart, parentEnd) && !confirm) {
    throw new ApiError(409, 'These dates sit outside the parent project or submodule range. Confirm to save them anyway.');
  }
}

function phaseInput(body) {
  const name = cleanText(body.name, 200);
  if (!name) throw new ApiError(400, 'Phase name is required.');
  const startDate = cleanDate(body.startDate);
  const endDate = cleanDate(body.endDate);
  if (startDate && endDate && endDate < startDate) throw new ApiError(400, 'Phase end date cannot be before the start date.');
  return { name, description: cleanText(body.description, 2000), startDate, endDate };
}

async function createPhase(projectId, user, body) {
  assertPlan(user);
  await requireProject(projectId);
  const input = phaseInput(body);
  await assertSchedule(projectId, { start: input.startDate, end: input.endDate, confirm: body.confirmOutside === true });
  const id = await repository.insertPhase(projectId, input);
  await repository.addActivity(projectId, user.id, 'Phase added', body.name);
  return getPlan(projectId).then((plan) => ({ ...plan, createdId: id }));
}

async function updatePhase(projectId, phaseId, user, body) {
  assertPlan(user);
  const input = phaseInput(body);
  await assertSchedule(projectId, { start: input.startDate, end: input.endDate, confirm: body.confirmOutside === true });
  const updated = await repository.updatePhase(phaseId, projectId, input);
  if (!updated) throw new ApiError(404, 'Phase not found.');
  return getPlan(projectId);
}

async function removePhase(projectId, phaseId, user) {
  assertPlan(user);
  const removed = await repository.deletePhase(phaseId, projectId);
  if (!removed) throw new ApiError(404, 'Phase not found.');
  await repository.addActivity(projectId, user.id, 'Phase removed', '');
  return getPlan(projectId);
}

async function activeAssignee(assigneeId, previousId) {
  if (!assigneeId || assigneeId === previousId) return assigneeId || null;
  const person = await userRepository.findById(assigneeId);
  if (!person || !person.is_active || person.account_status !== 'ACTIVE') {
    throw new ApiError(400, 'Inactive users cannot receive a new assignment.');
  }
  return assigneeId;
}

async function taskInput(projectId, body, current) {
  const title = cleanText(body.title ?? current?.title, 200);
  const startDate = cleanDate(body.startDate ?? current?.startDate);
  const endDate = cleanDate(body.endDate ?? current?.endDate);
  if (!title) throw new ApiError(400, 'Task name is required.');
  if (!startDate || !endDate) throw new ApiError(400, 'Start date and end date are required.');
  if (endDate < startDate) throw new ApiError(400, 'End date cannot be before the start date.');
  const status = TASK_STATUSES.has(body.status) ? body.status : (current?.status || 'NOT_STARTED');
  const phaseId = body.phaseId === '' ? null : (body.phaseId ?? current?.phaseId ?? null);
  if (projectId) await assertSchedule(projectId, { phaseId, start: startDate, end: endDate, confirm: body.confirmOutside === true });
  if (phaseId && !projectId) throw new ApiError(400, 'Product tasks do not use project phases.');
  if (phaseId) {
    const phases = await repository.listPhases(projectId);
    if (!phases.some((phase) => phase.id === phaseId)) throw new ApiError(400, 'Select a phase from this project.');
  }
  const teamCode = body.teamCode === '' ? '' : (body.teamCode ?? current?.teamCode ?? '');
  if (teamCode) await require('../services/team.service').assertTeamCode(teamCode);
  const hours = body.estimatedHours === '' || body.estimatedHours == null
    ? (current ? current.estimatedHours : null)
    : Number(body.estimatedHours);
  return {
    phaseId: phaseId || null,
    title,
    description: cleanText(body.description ?? current?.description, 4000),
    assigneeId: await activeAssignee(body.assigneeId === undefined ? (current?.assigneeId || null) : optionalUuid(body.assigneeId), current?.assigneeId),
    teamCode,
    priority: PRIORITIES.has(body.priority) ? body.priority : (current?.priority || 'MEDIUM'),
    status,
    startDate,
    endDate,
    estimatedHours: Number.isFinite(Number(hours)) ? Number(hours) : null,
    progress: progressValue(body.progress ?? current?.progress, status),
    tags: cleanText(body.tags ?? current?.tags, 400),
  };
}

async function createNamedTask(user, body) {
  assertPlan(user);
  const title = cleanText(body.projectTitle, 200);
  if (title.length < 2) throw new ApiError(400, 'Project name is required.');
  const projectId = await repository.projectUuid(title);
  const existing = await repository.findProjectHeader(projectId);
  if (existing) return createTask(projectId, user, body);
  const input = await taskInput(null, { ...body, phaseId: '' });
  await teamService.assertCanAssign(user, input.teamCode);
  const id = await repository.insertTask(projectId, { ...input, projectTitle: title }, user.id);
  if (!id) throw new ApiError(400, 'The task could not be saved.');
  return repository.findTask(id);
}

async function createTask(projectId, user, body) {
  assertPlan(user);
  await requireProject(projectId);
  const input = await taskInput(projectId, body);
  await teamService.assertCanAssign(user, input.teamCode);
  const id = await repository.insertTask(projectId, input, user.id);
  const name = await assigneeName(input.assigneeId);
  await repository.addActivity(
    projectId,
    user.id,
    name ? `${name} was assigned to ${input.title}` : 'Task added',
    input.title,
  );
  const plan = await getPlan(projectId);
  return { ...plan, createdId: id };
}

async function updateTask(projectId, taskId, user, body) {
  assertPlan(user);
  const current = await repository.findTask(taskId);
  if (!current || current.projectId !== projectId) throw new ApiError(404, 'Task not found.');
  const input = await taskInput(projectId, { ...current, ...body, phaseId: body.phaseId === undefined ? current.phaseId : body.phaseId }, current);
  await teamService.assertCanAssign(user, input.teamCode);
  const updated = await repository.updateTask(taskId, projectId, input);
  if (!updated) throw new ApiError(404, 'Task not found.');
  await logTaskChanges({ projectId, productId: null }, user, current, input);
  return getPlan(projectId);
}

async function logTaskChanges(owner, user, current, input) {
  const actor = user.fullName || 'A user';
  const notes = [];
  if (input.status !== current.status) {
    notes.push(input.status === 'COMPLETED'
      ? `${actor} completed ${input.title}`
      : `${actor} changed status from ${TASK_STATUS_LABEL[current.status] || current.status} to ${TASK_STATUS_LABEL[input.status] || input.status}`);
  }
  if (Number(input.progress) !== Number(current.progress)) {
    notes.push(`${actor} changed progress from ${current.progress}% to ${input.progress}%`);
  }
  if (input.startDate !== current.startDate || input.endDate !== current.endDate) {
    notes.push(`Deadline changed: ${shortDate(current.endDate)} → ${shortDate(input.endDate)}`);
  }
  if ((input.assigneeId || null) !== (current.assigneeId || null)) {
    const name = await assigneeName(input.assigneeId);
    notes.push(name ? `${name} was assigned to ${input.title}` : 'Assignee removed');
  }
  if (!notes.length) notes.push('Task updated');
  await notes.reduce((chain, action) => chain.then(() => repository.addActivity(owner.projectId, user.id, action, input.title, owner.productId)), Promise.resolve());
}

async function createProductTask(productId, user, body) {
  assertPlan(user);
  const productRepository = require('../db/product.repository');
  const product = await productRepository.findById(productId);
  if (!product) throw new ApiError(404, 'Product not found.');
  const input = await taskInput(null, body);
  const id = await repository.insertProductTask(productId, input, user.id);
  const name = await assigneeName(input.assigneeId);
  await repository.addActivity(
    null,
    user.id,
    name ? `${name} was assigned to ${input.title}` : 'Task added',
    input.title,
    productId,
  );
  return repository.findTask(id);
}

async function updateProductTask(productId, taskId, user, body) {
  assertPlan(user);
  const current = await repository.findTask(taskId);
  if (!current || current.productId !== productId) throw new ApiError(404, 'Task not found.');
  const input = await taskInput(null, { ...current, ...body, phaseId: '' }, current);
  const updated = await repository.updateTaskById(taskId, input);
  if (!updated) throw new ApiError(404, 'Task not found.');
  await logTaskChanges({ projectId: null, productId }, user, current, input);
  return repository.findTask(taskId);
}

async function patchTask(taskId, user, body) {
  const current = await repository.findTask(taskId);
  if (!current) throw new ApiError(404, 'Task not found.');
  if (current.projectId) {
    await updateTask(current.projectId, taskId, user, body);
  } else {
    await updateProductTask(current.productId, taskId, user, body);
  }
  return repository.findTask(taskId);
}

async function removeOwnedTask(taskId, user) {
  assertPlan(user);
  const current = await repository.findTask(taskId);
  if (!current) throw new ApiError(404, 'Task not found.');
  if (current.projectId) return removeTask(current.projectId, taskId, user);
  const removed = await repository.deleteTaskById(taskId);
  if (!removed) throw new ApiError(404, 'Task not found.');
  await repository.addActivity(null, user.id, 'Task removed', current.title || '', current.productId);
  return { id: taskId };
}

async function removeTask(projectId, taskId, user) {
  assertPlan(user);
  const current = await repository.findTask(taskId);
  const removed = await repository.deleteTask(taskId, projectId);
  if (!removed) throw new ApiError(404, 'Task not found.');
  await repository.addActivity(projectId, user.id, 'Task removed', current?.title || '');
  try {
    return await getPlan(projectId);
  } catch (error) {
    if (error.statusCode === 404) return { id: taskId, projectId };
    throw error;
  }
}

async function wouldCycle(projectId, predecessorId, successorId) {
  const dependencies = await repository.listDependencies(projectId);
  const next = new Map();
  dependencies.forEach((item) => {
    const list = next.get(item.predecessorId) || [];
    list.push(item.successorId);
    next.set(item.predecessorId, list);
  });
  const stack = [successorId];
  const seen = new Set();
  while (stack.length) {
    const current = stack.pop();
    if (current === predecessorId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    (next.get(current) || []).forEach((item) => stack.push(item));
  }
  return false;
}

async function createDependency(projectId, user, body) {
  assertPlan(user);
  const predecessorId = String(body.predecessorId || '');
  const successorId = String(body.successorId || '');
  if (predecessorId === successorId) throw new ApiError(400, 'A task cannot depend on itself.');
  const tasks = await repository.listTasks({ projectId });
  if (!tasks.some((task) => task.id === predecessorId) || !tasks.some((task) => task.id === successorId)) {
    throw new ApiError(400, 'Both tasks must belong to this project.');
  }
  if (await wouldCycle(projectId, predecessorId, successorId)) {
    throw new ApiError(409, 'That dependency would create a cycle.');
  }
  try {
    await repository.insertDependency(projectId, predecessorId, successorId);
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'That dependency already exists.');
    throw error;
  }
  await repository.addActivity(projectId, user.id, 'Dependency added', '');
  return getPlan(projectId);
}

async function removeDependency(projectId, dependencyId, user) {
  assertPlan(user);
  const removed = await repository.deleteDependency(dependencyId, projectId);
  if (!removed) throw new ApiError(404, 'Dependency not found.');
  return getPlan(projectId);
}

function milestoneInput(body) {
  const name = cleanText(body.name, 200);
  const date = cleanDate(body.date);
  if (!name || !date) throw new ApiError(400, 'Milestone name and date are required.');
  return {
    name,
    date,
    ownerId: optionalUuid(body.ownerId),
    description: cleanText(body.description, 2000),
    status: MILESTONE_STATUSES.has(body.status) ? body.status : 'PENDING',
  };
}

async function createMilestone(projectId, user, body) {
  assertPlan(user);
  await requireProject(projectId);
  const input = milestoneInput(body);
  await repository.insertMilestone(projectId, input);
  await repository.addActivity(projectId, user.id, 'Milestone added', input.name);
  return getPlan(projectId);
}

async function updateMilestone(projectId, milestoneId, user, body) {
  assertPlan(user);
  const input = milestoneInput(body);
  const updated = await repository.updateMilestone(milestoneId, projectId, input);
  if (!updated) throw new ApiError(404, 'Milestone not found.');
  const action = input.status === 'COMPLETED' ? `Milestone ${input.name} completed` : 'Milestone updated';
  await repository.addActivity(projectId, user.id, action, input.name);
  return getPlan(projectId);
}

async function removeMilestone(projectId, milestoneId, user) {
  assertPlan(user);
  const removed = await repository.deleteMilestone(milestoneId, projectId);
  if (!removed) throw new ApiError(404, 'Milestone not found.');
  return getPlan(projectId);
}

async function logTime(projectId, user, body) {
  assertPlan(user);
  await requireProject(projectId);
  const hours = Number(body.hours);
  const workDate = cleanDate(body.workDate);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) throw new ApiError(400, 'Enter hours between 0 and 24.');
  if (!workDate) throw new ApiError(400, 'A work date is required.');
  const userId = optionalUuid(body.userId || user.id);
  let taskId = null;
  if (body.taskId) {
    const task = await repository.findTask(body.taskId);
    if (!task || task.projectId !== projectId) throw new ApiError(400, 'Select a task from this project.');
    taskId = task.id;
  }
  await repository.insertTimeEntry(projectId, {
    taskId,
    userId,
    hours,
    workDate,
    billable: body.billable !== false && body.billable !== 'false',
    note: cleanText(body.note, 500),
  }, user.id);
  const name = await assigneeName(userId);
  await repository.addActivity(projectId, user.id, 'Hours logged', `${name || 'Member'} · ${hours}h`);
  return getPlan(projectId);
}

async function removeTime(projectId, entryId, user) {
  assertPlan(user);
  const removed = await repository.deleteTimeEntry(entryId, projectId);
  if (!removed) throw new ApiError(404, 'Time entry not found.');
  await repository.addActivity(projectId, user.id, 'Hours entry removed', '');
  return getPlan(projectId);
}

async function addDocuments(projectId, files, user) {
  assertPlan(user);
  await requireProject(projectId);
  for (const file of files || []) {
    await repository.insertDocument(projectId, {
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: user.id,
    });
    await repository.addActivity(projectId, user.id, 'Document uploaded', file.originalname);
  }
  return repository.listDocuments(projectId);
}

async function openDocument(projectId, documentId) {
  const row = await repository.findDocument(projectId, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const root = path.resolve(uploadDir(projectId));
  const filePath = path.resolve(root, row.stored_name);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new ApiError(400, 'Document path is not valid.');
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'Document file is missing.');
  return { filePath, name: row.original_name, mimeType: row.mime_type || 'application/octet-stream' };
}

async function removeDocument(projectId, documentId, user) {
  assertPlan(user);
  const row = await repository.findDocument(projectId, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const removed = await repository.deleteDocument(projectId, documentId);
  if (removed?.stored_name) fs.rmSync(path.join(uploadDir(projectId), removed.stored_name), { force: true });
  await repository.addActivity(projectId, user.id, 'Document removed', row.original_name);
  return repository.listDocuments(projectId);
}

async function setBaseline(projectId, user) {
  assertPlan(user);
  await requireProject(projectId);
  await repository.setBaseline(projectId, user.id);
  await repository.addActivity(projectId, user.id, 'Baseline set', '');
  return getPlan(projectId);
}

module.exports = {
  getPlan,
  listTasks,
  createPhase,
  updatePhase,
  removePhase,
  createTask,
  createNamedTask,
  updateTask,
  removeTask,
  createDependency,
  removeDependency,
  createMilestone,
  updateMilestone,
  removeMilestone,
  setBaseline,
  getTask,
  createProductTask,
  patchTask,
  removeOwnedTask,
  logTime,
  removeTime,
  addDocuments,
  openDocument,
  removeDocument,
  uploadDir,
};
