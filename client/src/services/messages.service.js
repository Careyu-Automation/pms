import { API_BASE_URL, api, apiForm } from './api';

function queryOf(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function getMessageLookup() {
  return api('/messages/lookup');
}

export function getUnreadCount() {
  return api('/messages/unread');
}

export function getPresence() {
  return api('/messages/presence');
}

export function searchMessages(q) {
  return api(`/messages/search${queryOf({ q })}`);
}

export function listDirect(q) {
  return api(`/messages/direct${queryOf({ q })}`);
}

export function listGroups(q) {
  return api(`/messages/groups${queryOf({ q })}`);
}

export function openDirect(userId) {
  return api('/messages/conversations/direct', { method: 'POST', body: { userId } });
}

export function createGroup(body) {
  return api('/messages/groups', { method: 'POST', body });
}

export function getConversation(id, before) {
  return api(`/messages/conversations/${id}${queryOf({ before })}`);
}

export function sendMessage(id, formData) {
  return apiForm(`/messages/conversations/${id}/messages`, formData);
}

export function editMessage(id, body) {
  return api(`/messages/messages/${id}`, { method: 'PATCH', body: { body } });
}

export function deleteMessage(id) {
  return api(`/messages/messages/${id}`, { method: 'DELETE' });
}

export function reactMessage(id, emoji) {
  return api(`/messages/messages/${id}/reactions`, { method: 'POST', body: { emoji } });
}

export function markRead(id, messageId) {
  return api(`/messages/conversations/${id}/read`, { method: 'POST', body: { messageId } });
}

export function markUnread(id) {
  return api(`/messages/conversations/${id}/unread`, { method: 'POST', body: {} });
}

export function pinMessage(id) {
  return api(`/messages/messages/${id}/pin`, { method: 'POST', body: {} });
}

export function messageHistory(id) {
  return api(`/messages/messages/${id}/history`);
}

export function addGroupMember(id, userId) {
  return api(`/messages/groups/${id}/members`, { method: 'POST', body: { userId } });
}

export function removeGroupMember(id, userId) {
  return api(`/messages/groups/${id}/members/${userId}`, { method: 'DELETE' });
}

export function setGroupRole(id, userId, role) {
  return api(`/messages/groups/${id}/members/${userId}`, { method: 'PATCH', body: { role } });
}

export function listThreads(filters) {
  return api(`/forum/threads${queryOf(filters)}`);
}

export function createThread(formData) {
  return apiForm('/forum/threads', formData);
}

export function getThread(id) {
  return api(`/forum/threads/${id}`);
}

export function replyToThread(id, body) {
  return api(`/forum/threads/${id}/replies`, { method: 'POST', body });
}

export function editReply(id, body) {
  return api(`/forum/replies/${id}`, { method: 'PATCH', body: { body } });
}

export function deleteReply(id) {
  return api(`/forum/replies/${id}`, { method: 'DELETE' });
}

export function reactReply(id, emoji) {
  return api(`/forum/replies/${id}/reactions`, { method: 'POST', body: { emoji } });
}

export function setThreadStatus(id, status) {
  return api(`/forum/threads/${id}/status`, { method: 'PATCH', body: { status } });
}

export function followThread(id, follow) {
  return api(`/forum/threads/${id}/follow`, { method: 'POST', body: { follow } });
}

export function attachmentUrl(id, forum) {
  const base = API_BASE_URL;
  return forum ? `${base}/forum/attachments/${id}` : `${base}/messages/attachments/${id}`;
}
