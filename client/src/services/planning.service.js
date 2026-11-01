import { api } from './api';

export function getPlan(projectId) {
  return api(`/projects/${projectId}/plan`);
}

export function createPhase(projectId, body) {
  return api(`/projects/${projectId}/phases`, { method: 'POST', body });
}

export function createNamedTask(body) {
  return api('/tasks', { method: 'POST', body });
}

export function createTask(projectId, body) {
  return api(`/projects/${projectId}/tasks`, { method: 'POST', body });
}

export function updateTask(projectId, taskId, body) {
  return api(`/projects/${projectId}/tasks/${taskId}`, { method: 'PATCH', body });
}

export function deleteTask(projectId, taskId) {
  return api(`/projects/${projectId}/tasks/${taskId}`, { method: 'DELETE' });
}

export function createDependency(projectId, body) {
  return api(`/projects/${projectId}/dependencies`, { method: 'POST', body });
}

export function deleteDependency(projectId, dependencyId) {
  return api(`/projects/${projectId}/dependencies/${dependencyId}`, { method: 'DELETE' });
}

export function createMilestone(projectId, body) {
  return api(`/projects/${projectId}/milestones`, { method: 'POST', body });
}

export function updateMilestone(projectId, milestoneId, body) {
  return api(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'PATCH', body });
}

export function deleteMilestone(projectId, milestoneId) {
  return api(`/projects/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' });
}

export function logTime(projectId, body) {
  return api(`/projects/${projectId}/time`, { method: 'POST', body });
}

export function deleteTime(projectId, entryId) {
  return api(`/projects/${projectId}/time/${entryId}`, { method: 'DELETE' });
}

export function getTask(taskId) {
  return api(`/tasks/${taskId}`);
}

export function setBaseline(projectId) {
  return api(`/projects/${projectId}/baseline`, { method: 'POST', body: {} });
}

export function listTasks(scopeOrFilters = '') {
  const filters = typeof scopeOrFilters === 'string' ? { scope: scopeOrFilters } : scopeOrFilters;
  const params = new URLSearchParams();
  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return api(query ? `/tasks?${query}` : '/tasks');
}

export function listMyTasks(filters = {}) {
  const params = new URLSearchParams({ scope: 'mine' });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return api(`/tasks?${params.toString()}`);
}

export function createProductTask(productId, body) {
  return api(`/products/${productId}/tasks`, { method: 'POST', body });
}

export function deleteOwnedTask(taskId) {
  return api(`/tasks/${taskId}`, { method: 'DELETE' });
}

export function updateListedTask(taskId, body) {
  return api(`/tasks/${taskId}`, { method: 'PATCH', body });
}

export function acceptTask(taskId) {
  return api(`/tasks/${taskId}/accept`, { method: 'POST', body: {} });
}

export function rejectTask(taskId, reason) {
  return api(`/tasks/${taskId}/reject`, { method: 'POST', body: { reason } });
}
