const logger = require('../utils/logger');
const env = require('../config/env');

const CLIENT_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

const DATABASE_ERRORS = {
  '22P02': [400, 'A submitted value has the wrong format.'],
  '23502': [400, 'A required value is missing.'],
  '23503': [409, 'A related record is missing or still in use.'],
  '23505': [409, 'This record already exists.'],
  '23514': [400, 'A submitted value is not allowed.'],
};

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    message: 'Resource not found',
    error: {},
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const parseError = err.type === 'entity.parse.failed';
  const databaseError = DATABASE_ERRORS[err.code];
  const status = parseError ? 400 : databaseError?.[0] || Number(err.statusCode) || 500;
  const safeStatus = CLIENT_STATUSES.has(status) ? status : 500;

  if (safeStatus === 500) {
    logger.error('unhandled_error', {
      method: req.method,
      path: req.path,
      code: err.code,
      ...(env.isProduction ? {} : { detail: err.message }),
    });
  }

  let message = 'Something went wrong. Please try again.';
  if (parseError) message = 'Invalid JSON body.';
  else if (databaseError && !err.statusCode) message = databaseError[1];
  else if (safeStatus !== 500 && err.message) message = err.message;

  return res.status(safeStatus).json({
    success: false,
    message,
    error: safeStatus === 500 ? {} : err.details || {},
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
