import { api } from './api';

export function loadAdminSettings() {
  return api('/settings/admin');
}

export function saveAdminSettings(body) {
  return api('/settings/admin', { method: 'PUT', body });
}

export function loadMySettings() {
  return api('/settings/me');
}

export function saveMySettings(body) {
  return api('/settings/me', { method: 'PUT', body });
}

export function changePassword(body) {
  return api('/settings/password', { method: 'POST', body });
}

export function applyWorkspacePreferences(preferences) {
  if (!preferences) return;
  const view = preferences.work?.taskView === 'board' ? 'board' : 'list';
  const due = ['overdue', 'today', 'week', 'none'].includes(preferences.work?.dueFilter) ? preferences.work.dueFilter : '';
  const landing = preferences.appearance?.landingPage || preferences.work?.landingPage || '/dashboard';
  localStorage.setItem('careyu.pref.taskView', view);
  localStorage.setItem('careyu.pref.dueFilter', due);
  localStorage.setItem('careyu.pref.landing', landing);
  document.documentElement.dataset.density = preferences.appearance?.density === 'compact' ? 'compact' : 'comfortable';
  document.documentElement.dataset.tableDensity = preferences.work?.tableDensity === 'compact' ? 'compact' : 'comfortable';
}
