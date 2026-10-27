const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth.middleware');
const controller = require('../controllers/settings.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/admin', asyncHandler(controller.admin));
router.put('/admin', asyncHandler(controller.saveAdmin));
router.get('/me', asyncHandler(controller.mine));
router.put('/me', asyncHandler(controller.saveMine));
router.post('/password', asyncHandler(controller.password));

module.exports = router;
