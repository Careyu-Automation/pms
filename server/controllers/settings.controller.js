const { sendSuccess } = require('../utils/response');
const service = require('../services/settings.service');

async function admin(req, res) {
  const data = await service.adminHome(req.user);
  sendSuccess(res, { message: 'Admin settings loaded.', data });
}

async function saveAdmin(req, res) {
  const data = await service.saveAdmin(req.user, req.body || {});
  sendSuccess(res, { message: 'Admin settings saved.', data });
}

async function mine(req, res) {
  const data = await service.myHome(req.user);
  sendSuccess(res, { message: 'Settings loaded.', data });
}

async function saveMine(req, res) {
  const data = await service.saveMine(req.user, req.body || {});
  sendSuccess(res, { message: 'Settings saved.', data });
}

async function password(req, res) {
  await service.changePassword(req.user, req.body || {});
  sendSuccess(res, { message: 'Password updated.' });
}

module.exports = { admin, saveAdmin, mine, saveMine, password };
