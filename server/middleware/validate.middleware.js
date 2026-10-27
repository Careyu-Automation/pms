const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const fields = {};
  for (const issue of result.array()) {
    const key = issue.path || 'form';
    if (!fields[key]) fields[key] = issue.msg;
  }

  return next(new ApiError(422, 'Please correct the highlighted fields.', { fields }));
}

module.exports = { validate };
