import { api, apiForm } from './api';

function queryOf(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getLeaveOverview() {
  return api('/leave/overview');
}

export function listLeaveRequests(filters) {
  return api(`/leave/requests${queryOf(filters)}`);
}

export function getPendingApprovals() {
  return api('/leave/pending-approvals');
}

export function createLeaveRequest(formData) {
  return apiForm('/leave/requests', formData);
}

export function getLeaveRequest(id) {
  return api(`/leave/requests/${id}`);
}

export function withdrawLeaveRequest(id) {
  return api(`/leave/requests/${id}/withdraw`, { method: 'POST', body: {} });
}

export function approveLeaveRequest(id, comment) {
  return api(`/leave/requests/${id}/approve`, { method: 'POST', body: { comment } });
}

export function rejectLeaveRequest(id, reason) {
  return api(`/leave/requests/${id}/reject`, { method: 'POST', body: { reason } });
}

export function createPermissionRequest(body) {
  return api('/leave/permissions', { method: 'POST', body });
}

export function getPermissionRequest(id) {
  return api(`/leave/permissions/${id}`);
}

export function withdrawPermissionRequest(id) {
  return api(`/leave/permissions/${id}/withdraw`, { method: 'POST', body: {} });
}

export function approvePermissionRequest(id, comment) {
  return api(`/leave/permissions/${id}/approve`, { method: 'POST', body: { comment } });
}

export function rejectPermissionRequest(id, reason) {
  return api(`/leave/permissions/${id}/reject`, { method: 'POST', body: { reason } });
}

export function listNotifications() {
  return api('/notifications');
}

export function markNotificationRead(id) {
  return api(`/notifications/${id}/read`, { method: 'POST', body: {} });
}
