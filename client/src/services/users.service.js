import { api } from './api';

function queryString(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function listUsers(params = {}) {
  return api(`/users${queryString(params)}`);
}

export function getUser(id) {
  return api(`/users/${id}`);
}

export function createUser(payload) {
  return api('/users', { method: 'POST', body: payload });
}

export function updateUser(id, payload) {
  return api(`/users/${id}`, { method: 'PUT', body: payload });
}

export function setUserStatus(id, status) {
  return api(`/users/${id}/status`, { method: 'PATCH', body: { status } });
}

export function resetUserPassword(id) {
  return api(`/users/${id}/reset-password`, { method: 'POST' });
}

export function resetInitialPassword(id) {
  return api(`/users/${id}/reset-initial-password`, { method: 'POST' });
}

export function deleteUser(id) {
  return api(`/users/${id}`, { method: 'DELETE' });
}
