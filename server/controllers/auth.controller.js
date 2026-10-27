const authService = require('../services/auth.service');
const env = require('../config/env');
const { sendSuccess } = require('../utils/response');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookies');

async function signup(req, res) {
  const user = await authService.signup(req.body);
  return sendSuccess(res, {
    status: 201,
    message: 'Account created.',
    data: { user },
  });
}

async function login(req, res) {
  const result = await authService.login(req.body);
  setAuthCookie(res, result.token, result.remember);
  return sendSuccess(res, {
    message: 'Signed in.',
    data: { user: result.user },
  });
}

function logout(req, res) {
  clearAuthCookie(res);
  return sendSuccess(res, {
    message: 'Signed out.',
    data: {},
  });
}

function me(req, res) {
  return sendSuccess(res, {
    message: 'Authenticated user.',
    data: { user: req.user },
  });
}

function realtimeTicket(req, res) {
  return sendSuccess(res, {
    message: 'Realtime ticket.',
    data: {
      ticket: authService.signRealtimeTicket(req.user.id),
      url: env.realtimePublicUrl,
    },
  });
}

async function changePassword(req, res) {
  const settings = require('../services/settings.service');
  await settings.changePassword(req.user, req.body || {});
  const user = await require('../db/user.repository').findById(req.user.id);
  return sendSuccess(res, { message: 'Password updated.', data: { user: require('../utils/publicUser').toPublicUser(user) } });
}

async function forgotPassword(req, res) {
  const result = await authService.forgotPassword(req.body || {});
  return sendSuccess(res, { message: result.message, data: {} });
}

async function resetPassword(req, res) {
  const result = await authService.resetWithToken(req.body || {});
  return sendSuccess(res, { message: result.message, data: {} });
}

module.exports = {
  signup,
  login,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  me,
  realtimeTicket,
};
