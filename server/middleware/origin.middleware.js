const env = require('../config/env');
const ApiError = require('../utils/ApiError');

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requireAllowedOrigin(req, res, next) {
  if (!MUTATING.has(req.method)) return next();

  const origin = req.headers.origin;
  if (!origin) return next();

  if (!env.clientOrigins.includes(origin)) {
    return next(new ApiError(403, 'Origin not allowed'));
  }

  return next();
}

module.exports = { requireAllowedOrigin };
