const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const daily = require('../controllers/dailyWork.controller');

const router = express.Router();
const ALLOWED = new Set(['pdf', 'xls', 'xlsx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv', 'dwg', 'dxf']);
const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'daily-work');
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename(req, file, callback) {
    const safe = String(file.originalname || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
    callback(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(ALLOWED.has(ext) ? null : new Error('This file type is not supported.'), ALLOWED.has(ext));
  },
});

router.use(requireAuth);
router.get('/summary', daily.summary);
router.get('/export/excel', daily.exportExcel);
router.get('/export/pdf', daily.exportPdf);
router.get('/employees/:employeeId', daily.employee);
router.get('/task/:taskId/history', daily.history);
router.get('/', daily.list);
router.post('/', daily.create);
router.get('/:id/history', daily.history);
router.post('/:id/attachments', upload.array('files', 8), daily.attach);
router.get('/:id/attachments/:fileId', daily.download);
router.delete('/:id/attachments/:fileId', daily.detach);
router.get('/:id', daily.get);
router.put('/:id', daily.update);
router.delete('/:id', daily.remove);

module.exports = router;
