const express = require('express');
const { requireAuth } = require('../middleware/auth.middleware');
const workload = require('../controllers/workload.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/export/excel', workload.exportExcel);
router.get('/export/pdf', workload.exportPdf);
router.get('/', workload.board);
router.post('/rebalance', workload.rebalance);
router.get('/employees/:id/tasks', workload.tasks);
router.get('/employees/:id/insights', workload.insights);
router.get('/employees/:id/hours', workload.hours);
router.get('/employees/:id/attendance', workload.attendance);
router.get('/employees/:id/rebalance', workload.rebalanceOptions);
router.get('/employees/:id', workload.employee);

module.exports = router;
