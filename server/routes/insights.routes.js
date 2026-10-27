const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const insights = require('../controllers/insights.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/export', insights.exportFile);
router.get('/', insights.overview);

module.exports = router;
