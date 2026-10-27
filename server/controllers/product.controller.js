const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');
const products = require('../services/product.service');
const planning = require('../services/planning.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertId(id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Product id is not valid.');
}

const list = asyncHandler(async (req, res) => {
  const data = await products.list(req.user);
  sendSuccess(res, { message: 'Products loaded.', data });
});

const get = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const data = await products.get(req.params.id, req.user);
  sendSuccess(res, { message: 'Product loaded.', data });
});

const create = asyncHandler(async (req, res) => {
  const product = await products.create(req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Product created successfully.', data: { product } });
});

const update = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const product = await products.update(req.params.id, req.user, req.body || {});
  sendSuccess(res, { message: 'Product updated.', data: { product } });
});

const createTask = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  const task = await planning.createProductTask(req.params.id, req.user, req.body || {});
  sendSuccess(res, { status: 201, message: 'Task created.', data: { task } });
});

const remove = asyncHandler(async (req, res) => {
  assertId(req.params.id);
  await products.remove(req.params.id, req.user);
  sendSuccess(res, { message: 'Product deleted.' });
});

module.exports = {
  list,
  get,
  create,
  update,
  remove,
  createTask,
};
