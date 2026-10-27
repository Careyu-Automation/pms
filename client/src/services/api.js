function configuredBase() {
  const value = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '/api';
  const trimmed = String(value).replace(/\/$/, '');
  if (trimmed.startsWith('/')) return trimmed;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export const API_BASE_URL = configuredBase();

export function socketUrl() {
  if (API_BASE_URL.startsWith('/')) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws`;
  }
  return `${API_BASE_URL.replace(/^http/, 'ws').replace(/\/api\/?$/, '')}/ws`;
}

function networkMessage() {
  return 'Unable to connect to CareYu services. Please try again.';
}

function httpMessage(response, payload) {
  if (payload?.message && response.status < 500) return payload.message;
  if (response.status === 400 || response.status === 422) return payload?.message || 'Please check the information you entered.';
  if (response.status === 401) return 'Invalid email or password.';
  if (response.status === 403) return payload?.message || 'You do not have access to this action.';
  if (response.status === 404) return 'The requested CareYu service was not found.';
  if (response.status === 409) return payload?.message || 'This action conflicts with an existing record.';
  if (response.status >= 500) return 'Something went wrong. Please try again.';
  return payload?.message || 'Request failed.';
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details || {};
  }
}

function isOffline(response, payload) {
  return response.status >= 500 && (!payload || payload?.error?.reason === 'network' || response.status === 502 || response.status === 503 || response.status === 504);
}

async function readPayload(response) {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok || !payload?.success) {
    if (isOffline(response, payload)) throw new ApiError(networkMessage(), 0, { reason: 'network' });
    throw new ApiError(httpMessage(response, payload), response.status, payload?.error);
  }
  return payload;
}

export async function api(path, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(networkMessage(), 0, { reason: 'network' });
  }

  return readPayload(response);
}

export async function apiForm(path, formData) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      body: formData,
    });
  } catch {
    throw new ApiError(networkMessage(), 0, { reason: 'network' });
  }

  return readPayload(response);
}

export async function apiBlob(path) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError(networkMessage(), 0, { reason: 'network' });
  }
  if (!response.ok) {
    throw new ApiError('The document could not be opened.', response.status, {});
  }
  return response.blob();
}

export async function apiPostDownload(path, body, filename) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: '*/*', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(networkMessage(), 0, { reason: 'network' });
  }
  if (!response.ok) throw new ApiError('The document could not be downloaded.', response.status, {});
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function apiDownload(path, filename) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
    });
  } catch {
    throw new ApiError(networkMessage(), 0, { reason: 'network' });
  }

  if (!response.ok) {
    throw new ApiError('The document could not be downloaded.', response.status, {});
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
