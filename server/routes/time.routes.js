const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const time = require('../controllers/time.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/catalog', time.catalog);
router.post('/attendance/check-in', time.checkIn);
router.post('/attendance/check-out', time.checkOut);
router.get('/attendance/:date', time.attendance);
router.post('/breaks/start', time.startBreak);
router.post('/breaks/:id/end', time.endBreak);
router.get('/breaks/:date', time.breaks);
router.get('/entries', time.entries);
router.post('/entries', time.createEntry);
router.put('/entries/:id', time.updateEntry);
router.delete('/entries/:id', time.removeEntry);
router.get('/daily-reports', time.reports);
router.get('/team-reports', time.teamReports);
router.get('/export/timesheet', time.exportTimesheet);
router.get('/export/daily-report', time.exportReports);
router.get('/daily-report/:date', time.report);
router.post('/daily-report', time.saveReport);
router.put('/daily-report/:id', time.updateReport);
router.post('/daily-report/:id/submit', time.submitReport);
router.post('/daily-report/:id/reopen', time.reopenReport);

module.exports = router;
