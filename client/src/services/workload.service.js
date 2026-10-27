import { api, apiDownload } from './api';

function queryOf(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getWorkload(filters) {
  return api(`/workload${queryOf(filters)}`);
}

export function getEmployeeWorkload(id, filters) {
  return api(`/workload/employees/${id}${queryOf(filters)}`);
}

export function getEmployeeInsights(id, filters) {
  return api(`/workload/employees/${id}/insights${queryOf(filters)}`);
}

export function getEmployeeTasks(id, filters) {
  return api(`/workload/employees/${id}/tasks${queryOf(filters)}`);
}

export function getEmployeeHours(id, filters) {
  return api(`/workload/employees/${id}/hours${queryOf(filters)}`);
}

export function getEmployeeAttendance(id, filters) {
  return api(`/workload/employees/${id}/attendance${queryOf(filters)}`);
}

export function getRebalanceOptions(id, filters) {
  return api(`/workload/employees/${id}/rebalance${queryOf(filters)}`);
}

export function rebalanceWork(body) {
  return api('/workload/rebalance', { method: 'POST', body });
}

export function exportWorkload(filters, format) {
  const path = format === 'pdf' ? '/workload/export/pdf' : '/workload/export/excel';
  return apiDownload(`${path}${queryOf(filters)}`, format === 'pdf' ? 'workload.pdf' : 'workload.xls');
}
