import { api } from './api';

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function loadProcurementRequests(params) {
  return api(`/procurement-requests${queryString(params)}`);
}

export function saveProcurementRequest(body, id) {
  return api(id ? `/procurement-requests/${id}` : '/procurement-requests', { method: id ? 'PATCH' : 'POST', body });
}

export function setProcurementStatus(id, status) {
  return api(`/procurement-requests/${id}/status`, { method: 'POST', body: { status } });
}

export function deleteProcurementRequest(id) {
  return api(`/procurement-requests/${id}`, { method: 'DELETE' });
}
