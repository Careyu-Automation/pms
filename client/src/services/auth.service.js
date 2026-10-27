import { api } from './api';

const SESSION_HINT = 'careyu_signed_in';

export function hasSessionHint() {
  return localStorage.getItem(SESSION_HINT) === '1';
}

export function rememberSession() {
  localStorage.setItem(SESSION_HINT, '1');
}

export function clearSessionHint() {
  localStorage.removeItem(SESSION_HINT);
}

export function signup(payload) {
  return api('/auth/signup', { method: 'POST', body: payload });
}

export function login(payload) {
  return api('/auth/login', { method: 'POST', body: payload });
}

export function logout() {
  return api('/auth/logout', { method: 'POST', body: {} });
}

export function changePassword(payload) {
  return api('/auth/change-password', { method: 'POST', body: payload });
}

export function forgotPassword(email) {
  return api('/auth/forgot-password', { method: 'POST', body: { email } });
}

export function resetPassword(payload) {
  return api('/auth/reset-password', { method: 'POST', body: payload });
}

export function me() {
  return api('/auth/me');
}
