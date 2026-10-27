import { api, apiDownload, apiPostDownload } from './api';

export function loadEmailReports(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return api(query ? `/email-reports?${query}` : '/email-reports');
}

export function getEmailReport(id) {
  return api(`/email-reports/${id}`);
}

export function saveEmailReport(body, id) {
  return api(id ? `/email-reports/${id}` : '/email-reports', { method: id ? 'PUT' : 'POST', body });
}

export function duplicateEmailReport(id) {
  return api(`/email-reports/${id}/duplicate`, { method: 'POST', body: {} });
}

export function setEmailReportStatus(id, status) {
  return api(`/email-reports/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteEmailReport(id) {
  return api(`/email-reports/${id}`, { method: 'DELETE' });
}

export function previewEmailReport(body) {
  return api('/email-reports/preview', { method: 'POST', body });
}

export function downloadPreview(body, format) {
  const name = format === 'excel' ? 'report.xls' : 'report.pdf';
  return apiPostDownload(`/email-reports/preview/file?format=${format}`, body, name);
}

export function sendEmailReport(id) {
  return api(`/email-reports/${id}/send`, { method: 'POST', body: {} });
}

export function testEmailReport(id) {
  return api(`/email-reports/${id}/test`, { method: 'POST', body: {} });
}

export function emailRun(id) {
  return api(`/email-reports/runs/${id}`);
}

export function retryEmailRun(id) {
  return api(`/email-reports/runs/${id}/retry`, { method: 'POST', body: {} });
}

export function downloadEmailRun(id, filename) {
  return apiDownload(`/email-reports/runs/${id}/file`, filename);
}

export function saveEmailTemplate(body, id) {
  return api(id ? `/email-reports/templates/${id}` : '/email-reports/templates', { method: id ? 'PUT' : 'POST', body });
}
