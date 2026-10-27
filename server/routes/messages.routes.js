const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
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
router.get('/lookup', messages.lookup);
router.get('/unread', messages.unreadCount);
router.get('/presence', messages.presence);
router.get('/search', messages.search);
router.get('/direct', messages.direct);
router.get('/groups', messages.groups);
router.post('/conversations/direct', messages.openDirect);
router.post('/groups', messages.createGroup);
router.get('/conversations/:id', messages.conversation);
router.post('/conversations/:id/messages', upload.array('files', 6), messages.send);
router.post('/conversations/:id/read', messages.read);
router.post('/conversations/:id/unread', messages.unread);
router.post('/groups/:id/members', messages.addMember);
router.delete('/groups/:id/members/:userId', messages.removeMember);
router.patch('/groups/:id/members/:userId', messages.role);
router.patch('/messages/:messageId', messages.edit);
router.delete('/messages/:messageId', messages.remove);
router.post('/messages/:messageId/reactions', messages.react);
router.post('/messages/:messageId/pin', messages.pin);
router.delete('/messages/:messageId/pin', messages.unpin);
router.get('/messages/:messageId/history', messages.history);
router.get('/attachments/:attachmentId', messages.attachment);

module.exports = router;
