const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth.middleware');
const leave = require('../controllers/leave.controller');

const router = express.Router();
const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'leave');
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
});

router.use(requireAuth);
router.get('/overview', leave.overview);
router.get('/types', leave.types);
router.get('/balance', leave.balance);
router.get('/pending-approvals', leave.pending);
router.get('/holidays', leave.holidays);
router.post('/holidays', leave.holiday);
router.put('/balance', leave.allocation);
router.get('/requests', leave.list);
router.get('/team-history', leave.list);
router.post('/requests', upload.single('attachment'), leave.create);
router.get('/requests/:id/attachment', leave.attachment);
router.get('/requests/:id', leave.detail);
router.put('/requests/:id', leave.update);
router.post('/requests/:id/withdraw', leave.withdraw);
router.post('/requests/:id/approve', leave.approve);
router.post('/requests/:id/reject', leave.reject);
router.get('/permissions', leave.permissions);
router.post('/permissions', leave.createPermission);
router.get('/permissions/:id', leave.permission);
router.post('/permissions/:id/withdraw', leave.withdrawPermission);
router.post('/permissions/:id/approve', leave.approvePermission);
router.post('/permissions/:id/reject', leave.rejectPermission);

module.exports = router;
