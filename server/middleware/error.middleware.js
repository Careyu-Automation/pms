const logger = require('../utils/logger');
const env = require('../config/env');

const CLIENT_STATUSES = new Set([400, 401, 403, 404, 409, 422, 429]);

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
  const status = parseError ? 400 : Number(err.statusCode) || 500;
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
