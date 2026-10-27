import { api, apiDownload } from './api';

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

export function loadInsights(params) {
  return api(`/insights${queryString(params)}`);
}

export function exportInsights(params, format) {
  const name = format === 'pdf' ? 'insights.pdf' : format === 'csv' ? 'insights.csv' : 'insights.xls';
  return apiDownload(`/insights/export${queryString({ ...params, format })}`, name);
}
