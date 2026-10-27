import { api, apiDownload, apiForm } from './api';

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function loadEscalations(params) {
  return api(`/escalations${queryString(params)}`);
}

export function getEscalation(id) {
  return api(`/escalations/${id}`);
}

export function createEscalation(body) {
  return api('/escalations', { method: 'POST', body });
}

export function updateEscalation(id, body) {
  return api(`/escalations/${id}`, { method: 'PATCH', body });
}

export function deleteEscalation(id) {
  return api(`/escalations/${id}`, { method: 'DELETE' });
}

export function assignEscalation(id, body) {
  return api(`/escalations/${id}/assign`, { method: 'POST', body });
}

export function setEscalationStatus(id, status) {
  return api(`/escalations/${id}/status`, { method: 'POST', body: { status } });
}

export function escalateFurther(id, body) {
  return api(`/escalations/${id}/escalate`, { method: 'POST', body });
}

export function resolveEscalation(id, body) {
  return api(`/escalations/${id}/resolve`, { method: 'POST', body });
}

export function reopenEscalation(id) {
  return api(`/escalations/${id}/reopen`, { method: 'POST', body: {} });
}

export function archiveEscalation(id) {
  return api(`/escalations/${id}/archive`, { method: 'POST', body: {} });
}

export function duplicateEscalation(id) {
  return api(`/escalations/${id}/duplicate`, { method: 'POST', body: {} });
}

export function addEscalationComment(id, message) {
  return api(`/escalations/${id}/comments`, { method: 'POST', body: { message } });
}

export function editEscalationComment(id, commentId, message) {
  return api(`/escalations/${id}/comments/${commentId}`, { method: 'PATCH', body: { message } });
}

export function deleteEscalationComment(id, commentId) {
  return api(`/escalations/${id}/comments/${commentId}`, { method: 'DELETE' });
}

export function uploadEscalationFile(id, file) {
  const form = new FormData();
  form.append('file', file);
  return apiForm(`/escalations/${id}/attachments`, form);
}

export function downloadEscalationFile(id, fileId, name) {
  return apiDownload(`/escalations/${id}/attachments/${fileId}`, name);
}

export function deleteEscalationFile(id, fileId) {
  return api(`/escalations/${id}/attachments/${fileId}`, { method: 'DELETE' });
}

export function exportEscalations(params) {
  const format = params.format || 'excel';
  const name = format === 'pdf' ? 'escalations.pdf' : format === 'csv' ? 'escalations.csv' : 'escalations.xls';
  return apiDownload(`/escalations/export${queryString(params)}`, name);
}
