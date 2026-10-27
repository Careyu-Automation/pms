import { api, apiDownload, apiForm } from './api';

function queryOf(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listDailyWork(filters) {
  return api(`/daily-work-updates${queryOf(filters)}`);
}

export function getWorkHistory(workItemId) {
  return api(`/daily-work-updates/${workItemId}/history`);
}

export function createDailyWork(body) {
  return api('/daily-work-updates', { method: 'POST', body });
}

export function updateDailyWork(id, body) {
  return api(`/daily-work-updates/${id}`, { method: 'PUT', body });
}

export function deleteDailyWork(id) {
  return api(`/daily-work-updates/${id}`, { method: 'DELETE' });
}

export function uploadWorkFiles(id, files) {
  const form = new FormData();
  [...files].forEach((file) => form.append('files', file));
  return apiForm(`/daily-work-updates/${id}/attachments`, form);
}

export function deleteWorkFile(id, fileId) {
  return api(`/daily-work-updates/${id}/attachments/${fileId}`, { method: 'DELETE' });
}

export function exportDailyExcel(filters) {
  return apiDownload(`/daily-work-updates/export/excel${queryOf(filters)}`, 'daily-work-updates.xls');
}

export function exportDailyPdf(filters) {
  return apiDownload(`/daily-work-updates/export/pdf${queryOf(filters)}`, 'daily-work-updates.pdf');
}
