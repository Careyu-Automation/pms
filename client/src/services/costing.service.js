import { api, apiBlob, apiDownload, apiForm } from './api';

export function listCostings() {
  return api('/solution-costing');
}

export function listCostingSources() {
  return api('/solution-costing/sources');
}

export function createCosting(feasibilityId) {
  return api('/solution-costing', { method: 'POST', body: { feasibilityId } });
}

export function getCosting(id) {
  return api(`/solution-costing/${id}`);
}

export function saveCosting(id, body) {
  return api(`/solution-costing/${id}`, { method: 'PUT', body });
}

export function duplicateCosting(id) {
  return api(`/solution-costing/${id}/versions`, { method: 'POST', body: {} });
}

export function submitCostingReview(id) {
  return api(`/solution-costing/${id}/submit-review`, { method: 'POST', body: {} });
}

export function submitCostingApproval(id, note) {
  return api(`/solution-costing/${id}/submit-approval`, { method: 'POST', body: { note } });
}

export function decideCosting(id, body) {
  return api(`/solution-costing/${id}/decision`, { method: 'POST', body });
}

export function deleteCosting(id) {
  return api(`/solution-costing/${id}`, { method: 'DELETE' });
}

export function importCostingBom(id, rows) {
  return api(`/solution-costing/${id}/bom-import`, { method: 'POST', body: { rows } });
}

export function uploadCostingDocuments(id, formData) {
  return apiForm(`/solution-costing/${id}/documents`, formData);
}

export function downloadCostingDocument(id, document) {
  return apiDownload(`/solution-costing/${id}/documents/${document.id}`, document.name);
}

export function deleteCostingDocument(id, documentId) {
  return api(`/solution-costing/${id}/documents/${documentId}`, { method: 'DELETE' });
}

export function convertCosting(id, body) {
  return api(`/solution-costing/${id}/convert`, { method: 'POST', body });
}

export function listProjects(view) {
  return api(view ? `/projects?view=${encodeURIComponent(view)}` : '/projects');
}

export function createProject(body) {
  return api('/projects', { method: 'POST', body });
}

export function loadProjectHub() {
  return api('/projects/hub');
}

export function confirmProjectPayment(id, body) {
  return api(`/projects/${id}/confirm-payment`, { method: 'POST', body });
}

export function activateProject(id) {
  return api(`/projects/${id}/activate`, { method: 'POST', body: {} });
}

export function updateProjectStatus(id, body) {
  return api(`/projects/${id}/status`, { method: 'POST', body });
}

export function listEligibleProjects() {
  return api('/projects/eligible');
}

export function updateProject(id, body) {
  return api(`/projects/${id}`, { method: 'PATCH', body });
}

export function deleteProject(id) {
  return api(`/projects/${id}`, { method: 'DELETE' });
}

export function getProject(id) {
  return api(`/projects/${id}`);
}

export function uploadProjectDocuments(id, formData) {
  return apiForm(`/projects/${id}/documents`, formData);
}

export function downloadProjectDocument(id, document) {
  return apiDownload(`/projects/${id}/documents/${document.id}`, document.name);
}

export function openProjectDocument(id, documentId) {
  return apiBlob(`/projects/${id}/documents/${documentId}?inline=1`);
}

export function deleteProjectDocument(id, documentId) {
  return api(`/projects/${id}/documents/${documentId}`, { method: 'DELETE' });
}

export function downloadCostingBom(id, filename) {
  return apiBlob(`/solution-costing/${id}/bom-export`).then((blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  });
}
