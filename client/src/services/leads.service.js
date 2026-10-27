import { api, apiDownload, apiForm } from './api';

export function listLeads() {
  return api('/leads');
}

export function getLead(id) {
  return api(`/leads/${id}`);
}

export function createLead(body) {
  return api('/leads', { method: 'POST', body });
}

export function updateLead(id, body) {
  return api(`/leads/${id}`, { method: 'PUT', body });
}

export function deleteLead(id) {
  return api(`/leads/${id}`, { method: 'DELETE' });
}

export function submitLead(id) {
  return api(`/leads/${id}/submit-to-pm`, { method: 'POST', body: {} });
}

export function reviewLead(id, body) {
  return api(`/leads/${id}/review`, { method: 'POST', body });
}

export function assignLeadTeam(id, body) {
  return api(`/workflow/leads/${id}/assign`, { method: 'POST', body });
}

export function listMyAssignments() {
  return api('/workflow/assignments');
}

export function respondToAssignment(id, body) {
  return api(`/workflow/assignments/${id}/respond`, { method: 'POST', body });
}

export function createQuotation(id, body) {
  return api(`/workflow/leads/${id}/quotations`, { method: 'POST', body });
}

export function sendQuotation(id) {
  return api(`/workflow/quotations/${id}/send`, { method: 'POST', body: {} });
}

export function recordNegotiation(id, body) {
  return api(`/workflow/quotations/${id}/negotiate`, { method: 'POST', body });
}

export function uploadLeadDocuments(id, files) {
  const formData = new FormData();
  for (const file of files) formData.append('documents', file);
  return apiForm(`/leads/${id}/documents`, formData);
}

export function downloadLeadDocument(leadId, document, filename) {
  return apiDownload(`/leads/${leadId}/documents/${document.id}`, filename || document.name);
}
