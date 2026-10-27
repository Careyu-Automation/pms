const ApiError = require('../utils/ApiError');
const repository = require('../db/product.repository');

const TEAM_CATALOG = [
  ['vision', 'Vision Team'],
  ['robotics', 'Robotics Team'],
  ['software', 'Software Team'],
  ['procurement', 'Procurement Team'],
  ['execution', 'Execution Team'],
];

const DEPARTMENTS = [
  'Sales',
  'Pre-Sales',
  'Design',
  'Engineering',
  'Procurement',
  'Operations',
  'Projects',
  'Management',
  'Administration',
];

const STATUSES = new Set(['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

function canManage(user) {
  const code = user?.role?.code || '';
  return ['admin', 'super_admin', 'project_manager', 'management', 'employee'].includes(code);
}

function accessFor(user) {
  const manage = canManage(user);
  return { canCreate: manage, canEdit: manage, canDelete: manage };
}

function assertManage(user) {
  if (!canManage(user)) throw new ApiError(403, 'You do not have permission to change products.');
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : '';
}

async function teamOptions() {
  const stored = await repository.listStoredTeamCodes();
  const labels = new Map(TEAM_CATALOG);
  stored.forEach((code) => {
    if (!labels.has(code)) labels.set(code, code);
  });
  return [...labels.entries()].map(([code, name]) => ({ code, name }));
}

async function departmentOptions() {
  const stored = await repository.listDepartments();
  return [...new Set([...DEPARTMENTS, ...stored])].sort((a, b) => a.localeCompare(b));
}

async function catalog() {
  const [teams, departments, leads] = await Promise.all([
    teamOptions(),
    departmentOptions(),
    repository.listLeadOptions(),
  ]);
  return { teams, departments, leads };
}

function present(product, teams) {
  const team = teams.find((item) => item.code === product.teamCode);
  return { ...product, teamName: team?.name || product.teamCode };
}

async function list(user) {
  const [products, options] = await Promise.all([repository.list(), catalog()]);
  return {
    products: products.map((product) => present(product, options.teams)),
    ...options,
    access: accessFor(user),
  };
}

async function get(id, user) {
  const product = await repository.findById(id);
  if (!product) throw new ApiError(404, 'Product not found.');
  const options = await catalog();
  return { product: present(product, options.teams), ...options, access: accessFor(user) };
}

async function normalize(body, current) {
  const name = String(body.name ?? current?.name ?? '').trim();
  const fields = {};
  if (name.length < 2) fields.name = name ? 'Product name must be at least 2 characters.' : 'Product name is required.';
  const teams = await teamOptions();
  const teamCode = String(body.teamCode ?? current?.teamCode ?? '').trim();
  if (!teamCode) fields.teamCode = 'Team is required.';
  else if (!teams.some((team) => team.code === teamCode)) fields.teamCode = 'Select a team from the list.';
  const startDate = cleanDate(body.startDate ?? current?.startDate);
  if (!startDate) fields.startDate = 'Start date is required.';
  const endDate = body.endDate === '' || body.endDate == null
    ? (body.endDate === '' ? '' : cleanDate(current?.endDate))
    : cleanDate(body.endDate);
  if (body.endDate && !endDate) fields.endDate = 'End date is not valid.';
  if (startDate && endDate && endDate < startDate) fields.endDate = 'End date cannot be before start date.';
  const departments = await departmentOptions();
  const department = String(body.department ?? current?.department ?? '').trim();
  if (department && !departments.includes(department)) fields.department = 'Select a department from the list.';
  const status = STATUSES.has(body.status) ? body.status : (current?.status || 'PLANNING');
  if (body.status && !STATUSES.has(body.status)) fields.status = 'Select a valid status.';
  const priority = PRIORITIES.has(body.priority) ? body.priority : (current?.priority || 'MEDIUM');
  if (body.priority && !PRIORITIES.has(body.priority)) fields.priority = 'Select a valid priority.';
  const leadId = body.leadId === '' || body.leadId == null
    ? (body.leadId === '' ? null : (current?.leadId || null))
    : String(body.leadId).trim();
  if (leadId && !/^[0-9a-f-]{36}$/i.test(leadId)) fields.leadId = 'Select a valid lead.';
  else if (leadId && !(await repository.leadExists(leadId))) fields.leadId = 'Select a valid lead.';
  const productCode = String(body.productCode ?? '').trim().slice(0, 40);
  if (Object.keys(fields).length) throw new ApiError(400, Object.values(fields)[0], { fields });
  return {
    name: name.slice(0, 200),
    productCode: productCode || current?.productCode || '',
    description: String(body.description ?? current?.description ?? '').trim().slice(0, 4000),
    teamCode,
    department,
    leadId: leadId || null,
    status,
    priority,
    startDate,
    endDate: endDate || null,
  };
}

async function create(user, body) {
  assertManage(user);
  const input = await normalize(body);
  let id;
  try {
    id = await repository.insert(input, user.id);
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'That product code is already in use.', { fields: { productCode: 'That product code is already in use.' } });
    throw error;
  }
  const teams = await teamOptions();
  return present(await repository.findById(id), teams);
}

async function update(id, user, body) {
  assertManage(user);
  const current = await repository.findById(id);
  if (!current) throw new ApiError(404, 'Product not found.');
  const input = await normalize({ ...body, productCode: body.productCode || current.productCode }, current);
  if (!input.productCode) throw new ApiError(400, 'Product code is required.', { fields: { productCode: 'Product code is required.' } });
  try {
    const updated = await repository.update(id, input);
    if (!updated) throw new ApiError(404, 'Product not found.');
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'That product code is already in use.', { fields: { productCode: 'That product code is already in use.' } });
    throw error;
  }
  const teams = await teamOptions();
  return present(await repository.findById(id), teams);
}

async function remove(id, user) {
  assertManage(user);
  const current = await repository.findById(id);
  if (!current) throw new ApiError(404, 'Product not found.');
  const removed = await repository.remove(id);
  if (!removed) throw new ApiError(404, 'Product not found.');
  return { id };
}

module.exports = {
  list,
  get,
  create,
  update,
  remove,
};
