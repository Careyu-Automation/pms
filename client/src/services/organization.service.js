import { api } from './api';

export function loadOrganization() {
  return api('/organization');
}

export function createEmployee(body) {
  return api('/organization/employees', { method: 'POST', body });
}

export function updateEmployee(id, body) {
  return api(`/organization/employees/${id}`, { method: 'PUT', body });
}

export function updateEmployeeStatus(id, status) {
  return api(`/organization/employees/${id}/status`, { method: 'PATCH', body: { status } });
}

export function loadEmployeeAccess(id) {
  return api(`/organization/employees/${id}/access`);
}

export function saveEmployeeAccess(id, modules) {
  return api(`/organization/employees/${id}/access`, { method: 'PUT', body: { modules } });
}

export function addTeamMember(teamId, body) {
  return api(`/organization/teams/${teamId}/members`, { method: 'POST', body });
}

export function removeTeamMember(teamId, userId) {
  return api(`/organization/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
}

export function setTeamLead(teamId, userId, lead) {
  return api(`/organization/teams/${teamId}/leads/${userId}`, { method: 'PATCH', body: { lead } });
}
