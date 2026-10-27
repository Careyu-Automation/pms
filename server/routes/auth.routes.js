const express = require('express');
const authController = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');
const { validate } = require('../middleware/validate.middleware');
const { requireAuth } = require('../middleware/auth.middleware');
const { signupRules, loginRules } = require('../validators/auth.validator');
const { createRateLimiter } = require('../utils/rateLimit');

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Try again shortly.',
});

const router = express.Router();

router.post('/signup', authLimiter, signupRules, validate, asyncHandler(authController.signup));
router.post('/login', authLimiter, loginRules, validate, asyncHandler(authController.login));
router.post('/forgot-password', authLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', authLimiter, asyncHandler(authController.resetPassword));
router.post('/logout', asyncHandler(authController.logout));
router.get('/me', asyncHandler(requireAuth), asyncHandler(authController.me));
router.get('/realtime-ticket', asyncHandler(requireAuth), asyncHandler(authController.realtimeTicket));
router.post('/change-password', asyncHandler(requireAuth), asyncHandler(authController.changePassword));

module.exports = router;
