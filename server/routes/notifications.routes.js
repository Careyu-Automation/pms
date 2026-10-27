const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const leave = require('../services/leave.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', asyncHandler(async (req, res) => {
  const items = await leave.notifications(req.user);
  sendSuccess(res, { message: 'Notifications loaded.', data: { notifications: items } });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  await leave.readNotification(req.user, req.params.id);
  sendSuccess(res, { message: 'Notification marked as read.' });
}));

module.exports = router;
