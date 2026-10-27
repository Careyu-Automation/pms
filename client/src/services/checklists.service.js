import { api } from './api';

export function listChecklists(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return api(query ? `/checklists?${query}` : '/checklists');
}

export function listChecklistUsers() {
  return api('/checklists/users');
}

export function createChecklist(body) {
  return api('/checklists', { method: 'POST', body });
}

export function updateChecklist(id, body) {
  return api(`/checklists/${id}`, { method: 'PUT', body });
}

export function deleteChecklist(id) {
  return api(`/checklists/${id}`, { method: 'DELETE' });
}

export function toggleChecklistItem(id, itemId) {
  return api(`/checklists/${id}/items/${itemId}/toggle`, { method: 'PATCH' });
}
