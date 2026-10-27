const fs = require('fs');
const path = require('path');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const messages = require('../services/messages.service');

const lookup = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Messages loaded.', data: await messages.lookup(req.user) });
});
const direct = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Direct messages loaded.', data: await messages.direct(req.user, req.query || {}) });
});
const groups = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Groups loaded.', data: await messages.groups(req.user, req.query || {}) });
});
const openDirect = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Conversation ready.', data: await messages.openDirect(req.user, req.body?.userId) });
});
const createGroup = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Group created.', data: await messages.createGroup(req.user, req.body || {}) });
});
const conversation = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Conversation loaded.', data: await messages.conversation(req.user, req.params.id, req.query || {}) });
});
const send = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Message sent.', data: await messages.send(req.user, req.params.id, req.body || {}, req.files || []) });
});
const edit = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Message updated.', data: await messages.edit(req.user, req.params.messageId, req.body || {}) });
});
const remove = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Message deleted.', data: await messages.remove(req.user, req.params.messageId) });
});
const react = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Reaction updated.', data: await messages.react(req.user, req.params.messageId, req.body || {}) });
});
const read = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Conversation marked read.', data: await messages.read(req.user, req.params.id, req.body || {}) });
});
const unread = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Conversation marked unread.', data: await messages.unread(req.user, req.params.id) });
});
const pin = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Pin updated.', data: { pins: await messages.pinMessage(req.user, req.params.messageId, true) } });
});
const unpin = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Pin removed.', data: { pins: await messages.pinMessage(req.user, req.params.messageId, false) } });
});
const history = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Edit history loaded.', data: { edits: await messages.history(req.user, req.params.messageId) } });
});
const addMember = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Member added.', data: { members: await messages.addGroupMember(req.user, req.params.id, req.body?.userId) } });
});
const removeMember = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Member removed.', data: { members: await messages.removeGroupMember(req.user, req.params.id, req.params.userId) } });
});
const role = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Role updated.', data: { members: await messages.setRole(req.user, req.params.id, req.params.userId, req.body?.role) } });
});
const presence = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Presence loaded.', data: await messages.presence() });
});
const search = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Search complete.', data: await messages.search(req.user, req.query || {}) });
});
const unreadCount = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Unread count loaded.', data: await messages.unreadTotal(req.user) });
});
const threads = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Threads loaded.', data: await messages.threads(req.user, req.query || {}) });
});
const createThread = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Thread posted.', data: await messages.createThread(req.user, req.body || {}, req.files || []) });
});
const thread = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Thread loaded.', data: await messages.thread(req.user, req.params.id) });
});
const reply = asyncHandler(async (req, res) => {
  sendSuccess(res, { status: 201, message: 'Reply posted.', data: await messages.reply(req.user, req.params.id, req.body || {}) });
});
const editReply = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Reply updated.', data: await messages.editReply(req.user, req.params.replyId, req.body || {}) });
});
const removeReply = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Reply deleted.', data: await messages.removeReply(req.user, req.params.replyId) });
});
const reactReply = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Reaction updated.', data: await messages.reactReply(req.user, req.params.replyId, req.body || {}) });
});
const status = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Thread updated.', data: await messages.status(req.user, req.params.id, req.body || {}) });
});
const follow = asyncHandler(async (req, res) => {
  sendSuccess(res, { message: 'Follow updated.', data: await messages.followThread(req.user, req.params.id, req.body?.follow !== false) });
});

function sendFile(res, file, root) {
  const target = path.resolve(root, file.stored_name);
  if (!target.startsWith(path.resolve(root)) || !fs.existsSync(target)) {
    return res.status(404).json({ success: false, message: 'File not found.' });
  }
  return res.download(target, file.file_name);
}

const attachment = asyncHandler(async (req, res) => {
  const file = await require('../db/messages.repository').attachmentFile(req.params.attachmentId, req.user.id);
  if (!file) return res.status(404).json({ success: false, message: 'File not found.' });
  return sendFile(res, file, path.join(__dirname, '..', 'uploads', 'messages'));
});

const forumFile = asyncHandler(async (req, res) => {
  const file = await require('../db/messages.repository').forumFile(req.params.attachmentId);
  if (!file) return res.status(404).json({ success: false, message: 'File not found.' });
  return sendFile(res, file, path.join(__dirname, '..', 'uploads', 'messages'));
});

module.exports = {
  lookup, direct, groups, openDirect, createGroup, conversation, send, edit, remove, react, read, unread,
  pin, unpin, history, addMember, removeMember, role, presence, search, unreadCount, threads, createThread,
  thread, reply, editReply, removeReply, reactReply, status, follow, attachment, forumFile,
};
