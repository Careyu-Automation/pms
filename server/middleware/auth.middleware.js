const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { readAuthToken } = require('../utils/cookies');
const { toPublicUser } = require('../utils/publicUser');
const userRepository = require('../db/user.repository');

async function requireAuth(req, res, next) {
  const token = readAuthToken(req);
  if (!token) {
    return next(new ApiError(401, 'Authentication required'));
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, {
      issuer: 'careyu-pms',
      audience: 'careyu-pms-client',
    });
  } catch {
    return next(new ApiError(401, 'Invalid or expired session'));
  }

  const user = await userRepository.findById(payload.sub);
  if (!user || !user.is_active || user.account_status === 'INACTIVE' || user.account_status === 'SUSPENDED') {
    return next(new ApiError(401, 'Authentication required'));
  }

  req.user = toPublicUser(user);
  const path = req.originalUrl.split('?')[0];
  const passwordChangeAllowed = path === '/api/auth/change-password' || path === '/api/auth/me' || path === '/api/auth/logout';
  if (req.user.mustChangePassword && !passwordChangeAllowed) {
    return next(new ApiError(403, 'Change your password before continuing.'));
  }
  const settings = require('../services/settings.service');
  if (await settings.maintenanceEnabled() && !settings.isAdmin(req.user)) {
    return next(new ApiError(403, 'CareYu is in maintenance. Only an administrator can use the application right now.'));
  }
  return next();
}

module.exports = { requireAuth };
