const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const escalations = require('../controllers/escalation.controller');

const router = express.Router();
const ALLOWED = new Set(['pdf', 'xls', 'xlsx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'txt', 'csv', 'dwg', 'dxf']);
const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'escalations');
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
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    callback(ALLOWED.has(ext) ? null : new Error('This file type is not supported.'), ALLOWED.has(ext));
  },
});

router.use(requireAuth);
router.get('/export', escalations.exportFile);
router.get('/', escalations.home);
router.post('/', escalations.create);
router.get('/:id', escalations.detail);
router.patch('/:id', escalations.update);
router.delete('/:id', escalations.remove);
router.post('/:id/assign', escalations.assign);
router.post('/:id/status', escalations.status);
router.post('/:id/escalate', escalations.escalate);
router.post('/:id/comments', escalations.comment);
router.patch('/:id/comments/:commentId', escalations.editComment);
router.delete('/:id/comments/:commentId', escalations.removeComment);
router.post('/:id/resolve', escalations.resolve);
router.post('/:id/reopen', escalations.reopen);
router.post('/:id/archive', escalations.archive);
router.post('/:id/duplicate', escalations.duplicate);
router.post('/:id/attachments', upload.single('file'), escalations.attach);
router.get('/:id/attachments/:fileId', escalations.download);
router.delete('/:id/attachments/:fileId', escalations.removeFile);

module.exports = router;
