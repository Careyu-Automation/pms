const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const reports = require('../controllers/emailReport.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', reports.home);
router.get('/templates', reports.home);
router.post('/preview', reports.preview);
router.post('/preview/file', reports.previewFile);
router.get('/history', reports.history);
router.get('/runs/:id/file', reports.download);
router.get('/runs/:id', reports.run);
router.post('/runs/:id/retry', reports.retry);
router.get('/settings', reports.readSettings);
router.put('/settings', reports.writeSettings);
router.post('/settings/test-connection', reports.testConnection);
router.post('/settings/test-email', reports.testSmtpEmail);
router.post('/templates', reports.saveTemplate);
router.put('/templates/:id', reports.saveTemplate);
router.post('/', reports.create);
router.get('/:id', reports.detail);
router.put('/:id', reports.update);
router.delete('/:id', reports.remove);
router.post('/:id/duplicate', reports.duplicate);
router.patch('/:id/status', reports.status);
router.post('/:id/send', reports.send);
router.post('/:id/test', reports.test);

module.exports = router;
