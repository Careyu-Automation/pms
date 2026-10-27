import { api, apiDownload } from './api';

function queryOf(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getTimesheet(date, filters) {
  return api(`/time/attendance/${date}${queryOf(filters)}`);
}

export function checkIn(body) {
  return api('/time/attendance/check-in', { method: 'POST', body });
}

export function checkOut(body) {
  return api('/time/attendance/check-out', { method: 'POST', body });
}

export function startBreak(body) {
  return api('/time/breaks/start', { method: 'POST', body });
}

export function endBreak(id) {
  return api(`/time/breaks/${id}/end`, { method: 'POST', body: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
}

export function listTimeEntries(filters) {
  return api(`/time/entries${queryOf(filters)}`);
}

export function createTimeEntry(body) {
  return api('/time/entries', { method: 'POST', body });
}

export function deleteTimeEntry(id) {
  return api(`/time/entries/${id}`, { method: 'DELETE' });
}

export function getDailyReport(date, filters) {
  return api(`/time/daily-report/${date}${queryOf(filters)}`);
}

export function saveDailyReport(body) {
  return api('/time/daily-report', { method: 'POST', body });
}

export function submitDailyReport(id, body) {
  return api(`/time/daily-report/${id}/submit`, { method: 'POST', body });
}

export function reopenDailyReport(id) {
  return api(`/time/daily-report/${id}/reopen`, { method: 'POST', body: {} });
}

export function listDailyReports(filters) {
  return api(`/time/daily-reports${queryOf(filters)}`);
}

export function getTeamReports(filters) {
  return api(`/time/team-reports${queryOf(filters)}`);
}

export function getTimeCatalog() {
  return api('/time/catalog');
}

export function exportTimesheet(filters, format) {
  const name = format === 'pdf' ? 'timesheet.pdf' : 'timesheet.xls';
  return apiDownload(`/time/export/timesheet${queryOf({ ...filters, format: format === 'pdf' ? 'pdf' : '' })}`, name);
}

export function exportDailyReports(filters, format) {
  const name = format === 'pdf' ? 'daily-reports.pdf' : 'daily-reports.xls';
  return apiDownload(`/time/export/daily-report${queryOf({ ...filters, format: format === 'pdf' ? 'pdf' : '' })}`, name);
}
