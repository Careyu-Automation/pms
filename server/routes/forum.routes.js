const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth.middleware');
const messages = require('../controllers/messages.controller');

const router = express.Router();
const storage = multer.diskStorage({
  destination(req, file, callback) {
    const dir = path.join(__dirname, '..', 'uploads', 'messages');
    fs.mkdirSync(dir, { recursive: true });
    callback(null, dir);
  },
  filename(req, file, callback) {
    const safe = String(file.originalname || 'file').replace(/[^\w.\-]+/g, '_').slice(-80);
    callback(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 12 * 1024 * 1024 } });

router.use(requireAuth);
router.get('/threads', messages.threads);
router.post('/threads', upload.array('files', 6), messages.createThread);
router.get('/threads/:id', messages.thread);
router.post('/threads/:id/replies', messages.reply);
router.patch('/threads/:id/status', messages.status);
router.post('/threads/:id/follow', messages.follow);
router.patch('/replies/:replyId', messages.editReply);
router.delete('/replies/:replyId', messages.removeReply);
router.post('/replies/:replyId/reactions', messages.reactReply);
router.get('/attachments/:attachmentId', messages.forumFile);

module.exports = router;
