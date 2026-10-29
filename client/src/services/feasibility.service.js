import { api, apiBlob, apiDownload, apiForm } from './api';

export function listStudies() {
  return api('/feasibility');
}

export function getStudy(id) {
  return api(`/feasibility/${id}`);
}

export function ensureStudy(leadId) {
  return api('/feasibility/ensure', { method: 'POST', body: { leadId } });
}

export function saveStudy(id, body) {
  return api(`/feasibility/${id}`, { method: 'PUT', body });
}

export function startStudy(id, body) {
  return api(`/feasibility/${id}/start`, { method: 'POST', body });
}

export function submitStudy(id, body) {
  return api(`/feasibility/${id}/submit`, { method: 'POST', body });
}

export function reviewStudy(id, body) {
  return api(`/feasibility/${id}/review`, { method: 'POST', body });
}

export function proceedStudy(id) {
  return api(`/feasibility/${id}/proceed`, { method: 'POST', body: {} });
}

export function uploadStudyDocuments(id, formData) {
  return apiForm(`/feasibility/${id}/documents`, formData);
}

function documentPath(id, documentId) {
  return `/feasibility/${id}/documents/${encodeURIComponent(documentId)}`;
}

export function downloadStudyDocument(id, document) {
  return apiDownload(documentPath(id, document.id), document.name);
}

export function viewStudyDocument(id, document) {
  return apiBlob(`${documentPath(id, document.id)}?inline=1`);
}

export function deleteStudyDocument(id, documentId) {
  return api(documentPath(id, documentId), { method: 'DELETE' });
}

export function listCostings() {
  return api('/solution-costing');
}

export function getCosting(id) {
  return api(`/solution-costing/${id}`);
}
