const { pool } = require('../db');
const ApiError = require('../utils/ApiError');
const repository = require('../db/messages.repository');
const leaveRepository = require('../db/leave.repository');
const hub = require('../realtime/hub');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMOJIS = new Set(['👍', '❤️', '😂', '🎉', '👀', '✅']);
const EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'zip', 'dwg', 'txt', 'csv']);
const STATUSES = {
  DISCUSSION: ['OPEN', 'CLOSED'],
  QUESTION: ['OPEN', 'ANSWERED', 'CLOSED'],
  IDEA: ['PROPOSED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED'],
};

function isAdmin(user) {
  return ['admin', 'super_admin', 'project_manager', 'management'].includes(user?.role?.code || '');
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function requireConversation(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Conversation is not valid.');
  const conversation = await repository.conversationFor(actor.id, id);
  if (!conversation) throw new ApiError(404, 'Conversation not found.');
  return conversation;
}

function groupReactions(rows, idKey) {
  const map = new Map();
  rows.forEach((row) => {
    const id = row[idKey];
    const list = map.get(id) || [];
    list.push({ emoji: row.emoji, userId: row.userId });
    map.set(id, list);
  });
  return map;
}

async function decorate(messages, viewerId, otherReadAt) {
  const ids = messages.map((message) => message.id);
  const [files, reactions] = await Promise.all([
    repository.attachmentsFor(ids),
    repository.reactionsFor(ids),
  ]);
  const reactionMap = groupReactions(reactions, 'messageId');
  return messages.map((message) => {
    const mine = message.senderId === viewerId;
    let receipt = '';
    if (mine && !message.deleted) {
      const read = otherReadAt && new Date(otherReadAt) >= new Date(message.createdAt);
      if (read) receipt = 'read';
      else if (message.deliveredAt) receipt = 'delivered';
      else receipt = 'sent';
    }
    return {
      ...message,
      attachments: files.filter((file) => file.messageId === message.id).map(({ storedName, ...file }) => file),
      reactions: reactionMap.get(message.id) || [],
      receipt,
    };
  });
}

async function direct(actor, query) {
  const text = clean(query.q, 80);
  const [conversations, people] = await Promise.all([
    repository.directList(actor.id, text),
    repository.directory(actor.id, text),
  ]);
  const known = new Set(conversations.map((item) => item.userId));
  const presence = await repository.presenceRows();
  const presenceMap = new Map(presence.map((person) => [person.id, person]));
  return {
    conversations: conversations.map((item) => ({ ...item, presence: presenceMap.get(item.userId)?.status || 'OFFLINE', lastSeenAt: presenceMap.get(item.userId)?.lastSeenAt || null })),
    people: people.filter((person) => !known.has(person.id)).map((person) => ({ ...person, presence: presenceMap.get(person.id)?.status || 'OFFLINE' })),
    active: presence.filter((person) => person.status !== 'OFFLINE').length,
  };
}

async function groups(actor, query) {
  const rows = await repository.groupList(actor.id, clean(query.q, 80));
  const presence = new Set((await repository.presenceRows()).filter((person) => person.status !== 'OFFLINE').map((person) => person.id));
  const detailed = [];
  for (const row of rows) {
    const ids = await repository.memberIds(row.id);
    detailed.push({ ...row, online: ids.filter((id) => presence.has(id)).length });
  }
  return { groups: detailed };
}

async function openDirect(actor, userId) {
  if (!UUID.test(userId || '')) throw new ApiError(400, 'Choose a teammate.');
  if (userId === actor.id) throw new ApiError(400, 'Choose another teammate.');
  const person = await repository.userActive(userId);
  if (!person || !person.active) throw new ApiError(404, 'Employee not found.');
  const existing = await repository.findDirect(actor.id, userId);
  if (existing) return conversation(actor, existing, {});
  const id = await withTransaction(async (client) => {
    const conversationId = await repository.insertConversation(client, { type: 'DIRECT', createdBy: actor.id });
    await repository.addMember(client, conversationId, actor.id, 'MEMBER');
    await repository.addMember(client, conversationId, userId, 'MEMBER');
    return conversationId;
  });
  await repository.activity({ actorId: actor.id, action: 'Conversation created', conversationId: id });
  return conversation(actor, id, {});
}

async function createGroup(actor, body) {
  const name = clean(body.name, 160);
  if (name.length < 2) throw new ApiError(400, 'Group name is required.');
  const groupType = ['TEAM', 'PROJECT', 'DEPARTMENT', 'CUSTOM'].includes(body.groupType) ? body.groupType : 'CUSTOM';
  const memberIds = [...new Set((body.memberIds || []).filter((id) => UUID.test(id) && id !== actor.id))];
  if (!memberIds.length) throw new ApiError(400, 'Add at least one member.');
  if (groupType === 'TEAM' && !isAdmin(actor)) {
    const leadTeams = await leaveRepository.leadTeamIds(actor.id);
    if (!UUID.test(body.teamId || '') || !leadTeams.includes(body.teamId)) throw new ApiError(403, 'You can create a team group for a team you lead.');
  }
  if ((groupType === 'PROJECT' || groupType === 'DEPARTMENT') && !isAdmin(actor)) {
    throw new ApiError(403, 'A project or department group needs a manager.');
  }
  const id = await withTransaction(async (client) => {
    const conversationId = await repository.insertConversation(client, {
      type: 'GROUP',
      name,
      description: clean(body.description, 2000),
      groupType,
      projectId: UUID.test(body.projectId || '') ? body.projectId : null,
      teamId: UUID.test(body.teamId || '') ? body.teamId : null,
      createdBy: actor.id,
    });
    await repository.addMember(client, conversationId, actor.id, 'ADMIN');
    for (const memberId of memberIds) await repository.addMember(client, conversationId, memberId, 'MEMBER');
    return conversationId;
  });
  await repository.activity({ actorId: actor.id, action: 'Conversation created', conversationId: id, comment: name });
  hub.sendMany(memberIds, { type: 'conversation', conversationId: id });
  return conversation(actor, id, {});
}

async function conversation(actor, id, query) {
  const item = await requireConversation(actor, id);
  const before = query.before || '';
  const limit = Math.min(Math.max(Number(query.limit) || 40, 1), 50);
  const [people, rows, pinned] = await Promise.all([
    repository.members(id),
    repository.messages(id, before, limit),
    repository.pins(id),
  ]);
  const other = item.type === 'DIRECT' ? people.find((person) => person.id !== actor.id) : null;
  const messages = await decorate(rows, actor.id, other?.lastReadAt);
  if (other && hub.isOnline(other.id)) {
    const pending = messages.filter((message) => message.senderId === other.id && !message.deliveredAt);
    await Promise.all(pending.map((message) => repository.markDelivered(message.id)));
  }
  const presence = await repository.presenceRows();
  const presenceMap = new Map(presence.map((person) => [person.id, person]));
  return {
    conversation: item,
    members: people.map((person) => ({ ...person, presence: presenceMap.get(person.id)?.status || 'OFFLINE', lastSeenAt: presenceMap.get(person.id)?.lastSeenAt || null })),
    messages,
    pins: pinned,
    hasMore: rows.length === limit,
  };
}

function mentions(body, people) {
  const found = [];
  people.forEach((person) => {
    if (person.name && body.toLowerCase().includes(`@${person.name.toLowerCase()}`)) found.push(person.id);
  });
  return found;
}

async function send(actor, conversationId, body, files) {
  const item = await requireConversation(actor, conversationId);
  const text = clean(body.body, 4000);
  const uploads = files || [];
  if (!text && !uploads.length) throw new ApiError(400, 'Write a message or attach a file.');
  uploads.forEach((file) => assertFile(file));
  if (body.replyToId && !UUID.test(body.replyToId)) throw new ApiError(400, 'Reply target is not valid.');
  let copied = text;
  if (UUID.test(body.forwardMessageId || '')) {
    const source = await repository.findMessage(body.forwardMessageId);
    if (!source || source.deleted) throw new ApiError(404, 'That message is no longer available.');
    await requireConversation(actor, source.conversationId);
    copied = text || source.body;
  }
  const members = await repository.members(conversationId);
  const others = members.filter((person) => person.id !== actor.id);
  const delivered = item.type === 'DIRECT' && others.some((person) => hub.isOnline(person.id));
  const saved = await withTransaction(async (client) => {
    const message = await repository.insertMessage(client, {
      conversationId,
      senderId: actor.id,
      body: copied,
      replyToId: UUID.test(body.replyToId || '') ? body.replyToId : null,
      projectId: UUID.test(body.projectId || '') ? body.projectId : null,
      taskId: UUID.test(body.taskId || '') ? body.taskId : null,
      deliveredAt: delivered ? new Date() : null,
    });
    for (const file of uploads) {
      await repository.insertAttachment(client, {
        messageId: message.id,
        name: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
    }
    return message;
  });
  await repository.touchConversation(conversationId);
  await repository.activity({ actorId: actor.id, action: 'Message sent', conversationId, messageId: saved.id });
  const payload = await conversation(actor, conversationId, {});
  const message = payload.messages.find((row) => row.id === saved.id) || payload.messages.at(-1);
  hub.sendMany(members.map((person) => person.id), { type: 'message', conversationId, message });
  const mentioned = mentions(copied, members);
  const notifyIds = others
    .map((person) => person.id)
    .filter((id) => mentioned.includes(id) || !hub.isViewing(id, conversationId));
  const title = mentioned.length ? 'You were mentioned' : (item.type === 'GROUP' ? item.name : actor.fullName);
  await leaveRepository.notify(notifyIds, title || 'New message', copied.slice(0, 180) || 'Sent an attachment', `/messages?conversation=${conversationId}`);
  return { message };
}

function assertFile(file) {
  const extension = String(file.originalname || '').split('.').pop().toLowerCase();
  if (!EXTENSIONS.has(extension)) throw new ApiError(400, 'That file type is not allowed.');
  if (file.size > 12 * 1024 * 1024) throw new ApiError(400, 'Files must be 12 MB or smaller.');
}

async function edit(actor, messageId, body) {
  const message = await loadOwn(actor, messageId, true);
  const text = clean(body.body, 4000);
  if (text.length < 1) throw new ApiError(400, 'Message text is required.');
  await repository.updateMessage(messageId, text);
  await repository.activity({ actorId: actor.id, action: 'Message edited', conversationId: message.conversationId, messageId });
  const ids = await repository.memberIds(message.conversationId);
  hub.sendMany(ids, { type: 'message:updated', conversationId: message.conversationId, messageId });
  return repository.findMessage(messageId);
}

async function remove(actor, messageId) {
  const message = await repository.findMessage(messageId);
  if (!message) throw new ApiError(404, 'Message not found.');
  await requireConversation(actor, message.conversationId);
  const own = message.senderId === actor.id;
  if (!own && !(isAdmin(actor) && message.type === 'GROUP')) throw new ApiError(403, 'You can delete your own messages.');
  await repository.softDeleteMessage(messageId);
  await repository.activity({ actorId: actor.id, action: 'Message deleted', conversationId: message.conversationId, messageId });
  const ids = await repository.memberIds(message.conversationId);
  hub.sendMany(ids, { type: 'message:deleted', conversationId: message.conversationId, messageId });
  return { deleted: true };
}

async function loadOwn(actor, messageId, mustOwn) {
  const message = await repository.findMessage(messageId);
  if (!message || message.deleted) throw new ApiError(404, 'Message not found.');
  await requireConversation(actor, message.conversationId);
  if (mustOwn && message.senderId !== actor.id) throw new ApiError(403, 'You can edit your own messages.');
  return message;
}

async function react(actor, messageId, body) {
  const emoji = body.emoji;
  if (!EMOJIS.has(emoji)) throw new ApiError(400, 'Choose one of the available reactions.');
  const message = await repository.findMessage(messageId);
  if (!message || message.deleted) throw new ApiError(404, 'Message not found.');
  await requireConversation(actor, message.conversationId);
  await repository.toggleReaction(messageId, actor.id, emoji);
  const ids = await repository.memberIds(message.conversationId);
  hub.sendMany(ids, { type: 'reaction', conversationId: message.conversationId, messageId });
  return { ok: true };
}

async function read(actor, conversationId, body) {
  await requireConversation(actor, conversationId);
  const messageId = UUID.test(body.messageId || '') ? body.messageId : null;
  await repository.markRead(conversationId, actor.id, messageId);
  const ids = await repository.memberIds(conversationId);
  hub.sendMany(ids, { type: 'read', conversationId, userId: actor.id, at: new Date().toISOString() });
  return { ok: true };
}

async function unread(actor, conversationId) {
  await requireConversation(actor, conversationId);
  await repository.markUnread(conversationId, actor.id);
  return { ok: true };
}

async function pinMessage(actor, messageId, on) {
  const message = await repository.findMessage(messageId);
  if (!message || message.deleted) throw new ApiError(404, 'Message not found.');
  const conversation = await requireConversation(actor, message.conversationId);
  if (conversation.type === 'GROUP' && conversation.role !== 'ADMIN' && !isAdmin(actor)) {
    throw new ApiError(403, 'A group admin can pin messages.');
  }
  if (on) await repository.pin(message.conversationId, messageId, actor.id);
  else await repository.unpin(message.conversationId, messageId);
  return repository.pins(message.conversationId);
}

async function history(actor, messageId) {
  const message = await repository.findMessage(messageId);
  if (!message) throw new ApiError(404, 'Message not found.');
  await requireConversation(actor, message.conversationId);
  if (message.senderId !== actor.id && !isAdmin(actor)) throw new ApiError(403, 'Edit history is available to the author.');
  return repository.edits(messageId);
}

async function addGroupMember(actor, conversationId, userId) {
  const conversation = await requireConversation(actor, conversationId);
  if (conversation.type !== 'GROUP') throw new ApiError(400, 'Only groups have additional members.');
  if (conversation.role !== 'ADMIN' && !isAdmin(actor)) throw new ApiError(403, 'A group admin can add members.');
  const person = await repository.userActive(userId);
  if (!person || !person.active) throw new ApiError(404, 'Employee not found.');
  await withTransaction(async (client) => repository.addMember(client, conversationId, userId, 'MEMBER'));
  await repository.activity({ actorId: actor.id, action: 'Member added', conversationId, comment: person.name });
  hub.send(userId, { type: 'conversation', conversationId });
  return repository.members(conversationId);
}

async function removeGroupMember(actor, conversationId, userId) {
  const conversation = await requireConversation(actor, conversationId);
  if (conversation.type !== 'GROUP') throw new ApiError(400, 'This is not a group.');
  const self = userId === actor.id;
  if (!self && conversation.role !== 'ADMIN' && !isAdmin(actor)) throw new ApiError(403, 'A group admin can remove members.');
  await repository.removeMember(conversationId, userId);
  const remaining = await repository.members(conversationId);
  if (remaining.length && !remaining.some((person) => person.role === 'ADMIN')) {
    await repository.setMemberRole(conversationId, remaining[0].id, 'ADMIN');
  }
  await repository.activity({ actorId: actor.id, action: 'Member removed', conversationId, comment: userId });
  return repository.members(conversationId);
}

async function setRole(actor, conversationId, userId, role) {
  const conversation = await requireConversation(actor, conversationId);
  if (conversation.role !== 'ADMIN' && !isAdmin(actor)) throw new ApiError(403, 'A group admin can change roles.');
  if (!['ADMIN', 'MEMBER'].includes(role)) throw new ApiError(400, 'Choose a member role.');
  await repository.setMemberRole(conversationId, userId, role);
  return repository.members(conversationId);
}

async function lookup(actor) {
  const [people, teamRows, projectRows, taskRows, tagRows, presence] = await Promise.all([
    repository.directory(actor.id, ''),
    repository.teams(),
    repository.projects(),
    repository.tasks(),
    repository.tags(),
    repository.presenceRows(),
  ]);
  return {
    people,
    teams: teamRows,
    projects: projectRows,
    tasks: taskRows,
    tags: tagRows,
    active: presence.filter((person) => person.status !== 'OFFLINE'),
    unread: await repository.unreadCount(actor.id),
  };
}

async function presence() {
  const rows = await repository.presenceRows();
  return { people: rows, active: rows.filter((person) => person.status !== 'OFFLINE').length };
}

async function search(actor, query) {
  const text = clean(query.q, 80);
  if (text.length < 2) return { messages: [], threads: [], replies: [] };
  return repository.search(actor.id, text);
}

async function unreadTotal(actor) {
  return { count: await repository.unreadCount(actor.id) };
}

function defaultStatus(category) {
  if (category === 'IDEA') return 'PROPOSED';
  return 'OPEN';
}

async function threads(actor, query) {
  const category = ['DISCUSSION', 'QUESTION', 'IDEA'].includes(query.category) ? query.category : '';
  const rows = await repository.listThreads({
    category,
    teamId: UUID.test(query.teamId || '') ? query.teamId : '',
    tag: clean(query.tag, 40),
    text: clean(query.q, 80),
    before: query.before || '',
    limit: 20,
  });
  const tags = await repository.threadTags(rows.map((row) => row.id));
  return {
    threads: rows.map((row) => ({ ...row, tags: tags.filter((tag) => tag.threadId === row.id).map((tag) => tag.name) })),
    hasMore: rows.length === 20,
  };
}

async function createThread(actor, body, files = []) {
  const title = clean(body.title, 200);
  const content = clean(body.body, 20000);
  const category = ['DISCUSSION', 'QUESTION', 'IDEA'].includes(body.category) ? body.category : '';
  if (title.length < 3) throw new ApiError(400, 'A thread title is required.');
  if (!category) throw new ApiError(400, 'Choose a category.');
  if (content.length < 2) throw new ApiError(400, 'Describe the thread.');
  const names = [...new Set(String(body.tags || '').split(',').map((tag) => clean(tag, 40)).filter((tag) => tag.length >= 2))].slice(0, 8);
  files.forEach((file) => assertFile(file));
  const id = await withTransaction(async (client) => {
    const threadId = await repository.insertThread(client, {
      title,
      body: content,
      category,
      status: defaultStatus(category),
      authorId: actor.id,
      projectId: UUID.test(body.projectId || '') ? body.projectId : null,
      teamId: UUID.test(body.teamId || '') ? body.teamId : null,
    });
    const tagIds = await repository.upsertTags(client, names);
    await repository.linkTags(client, threadId, tagIds);
    for (const file of files) {
      await repository.insertForumAttachment(client, {
        threadId,
        name: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
    }
    return threadId;
  });
  await repository.follow(id, actor.id, true);
  await repository.activity({ actorId: actor.id, action: 'Thread created', threadId: id, comment: title });
  return thread(actor, id);
}

async function thread(actor, id) {
  if (!UUID.test(id || '')) throw new ApiError(400, 'Thread is not valid.');
  const item = await repository.findThread(id);
  if (!item) throw new ApiError(404, 'Thread not found.');
  await repository.recordView(id, actor.id);
  await repository.follow(id, actor.id, await repository.isFollowing(id, actor.id));
  const [replyRows, tagRows] = await Promise.all([
    repository.replies(id),
    repository.threadTags([id]),
  ]);
  const reactions = await repository.replyReactions(replyRows.map((reply) => reply.id));
  const reactionMap = groupReactions(reactions, 'replyId');
  return {
    thread: { ...item, tags: tagRows.map((tag) => tag.name), following: await repository.isFollowing(id, actor.id), canModerate: await canModerate(actor, item), attachments: await repository.forumFiles(id) },
    replies: replyRows.map((reply) => ({ ...reply, reactions: reactionMap.get(reply.id) || [] })),
  };
}

async function reply(actor, threadId, body) {
  const item = await repository.findThread(threadId);
  if (!item) throw new ApiError(404, 'Thread not found.');
  if (['CLOSED', 'REJECTED'].includes(item.status)) throw new ApiError(400, 'This thread is closed.');
  const text = clean(body.body, 8000);
  if (text.length < 1) throw new ApiError(400, 'Write a reply.');
  let parent = UUID.test(body.parentReplyId || '') ? body.parentReplyId : null;
  if (parent) {
    const existing = await repository.findReply(parent);
    if (!existing || existing.threadId !== threadId) throw new ApiError(400, 'That reply is not in this thread.');
    if (existing.parentReplyId) parent = existing.parentReplyId;
  }
  const id = await withTransaction(async (client) => repository.insertReply(client, {
    threadId,
    authorId: actor.id,
    parentReplyId: parent,
    body: text,
  }));
  await repository.activity({ actorId: actor.id, action: 'Thread reply', threadId, comment: text.slice(0, 160) });
  const followers = await repository.followerIds(threadId);
  const recipients = [...new Set([item.authorId, ...followers].filter((userId) => userId && userId !== actor.id))];
  await leaveRepository.notify(recipients, `Reply in ${item.title}`, text.slice(0, 180), `/messages/forum/${threadId}`);
  hub.sendMany(hub.onlineIds(), { type: 'forum', threadId });
  return thread(actor, threadId);
}

async function editReply(actor, replyId, body) {
  const item = await repository.findReply(replyId);
  if (!item || item.deleted) throw new ApiError(404, 'Reply not found.');
  if (item.authorId !== actor.id) throw new ApiError(403, 'You can edit your own reply.');
  const text = clean(body.body, 8000);
  if (text.length < 1) throw new ApiError(400, 'Write a reply.');
  await repository.updateReply(replyId, text);
  return thread(actor, item.threadId);
}

async function removeReply(actor, replyId) {
  const item = await repository.findReply(replyId);
  if (!item || item.deleted) throw new ApiError(404, 'Reply not found.');
  if (item.authorId !== actor.id && !isAdmin(actor)) throw new ApiError(403, 'You can delete your own reply.');
  await repository.deleteReply(replyId);
  return thread(actor, item.threadId);
}

async function reactReply(actor, replyId, body) {
  if (!EMOJIS.has(body.emoji)) throw new ApiError(400, 'Choose one of the available reactions.');
  const item = await repository.findReply(replyId);
  if (!item || item.deleted) throw new ApiError(404, 'Reply not found.');
  await repository.toggleReplyReaction(replyId, actor.id, body.emoji);
  return { ok: true };
}

async function canModerate(actor, item) {
  if (isAdmin(actor) || item.authorId === actor.id) return true;
  if (!item.teamId) return false;
  const teams = await leaveRepository.leadTeamIds(actor.id);
  return teams.includes(item.teamId);
}

async function status(actor, threadId, body) {
  const item = await repository.findThread(threadId);
  if (!item) throw new ApiError(404, 'Thread not found.');
  if (!await canModerate(actor, item)) throw new ApiError(403, 'You cannot change this thread.');
  const next = String(body.status || '');
  if (!STATUSES[item.category].includes(next)) throw new ApiError(400, 'That status does not apply to this thread.');
  await repository.setThreadStatus(threadId, next);
  await repository.activity({
    actorId: actor.id,
    action: next === 'ANSWERED' ? 'Thread marked answered' : 'Thread status changed',
    threadId,
    comment: next,
  });
  return thread(actor, threadId);
}

async function followThread(actor, threadId, on) {
  const item = await repository.findThread(threadId);
  if (!item) throw new ApiError(404, 'Thread not found.');
  await repository.follow(threadId, actor.id, on !== false);
  if (on !== false) await repository.activity({ actorId: actor.id, action: 'Thread followed', threadId });
  return { following: on !== false };
}

module.exports = {
  direct,
  groups,
  openDirect,
  createGroup,
  conversation,
  send,
  edit,
  remove,
  react,
  read,
  unread,
  pinMessage,
  history,
  addGroupMember,
  removeGroupMember,
  setRole,
  lookup,
  presence,
  search,
  unreadTotal,
  threads,
  createThread,
  thread,
  reply,
  editReply,
  removeReply,
  reactReply,
  status,
  followThread,
  EXTENSIONS,
};
