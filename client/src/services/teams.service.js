import { api } from './api';

export function listTeams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return api(query ? `/teams?${query}` : '/teams');
}

export function listMeetings() {
  return api('/teams/meetings');
}

export function getTeam(id) {
  return api(`/teams/${id}`);
}

export function createTeam(body) {
  return api('/teams', { method: 'POST', body });
}

export function updateTeam(id, body) {
  return api(`/teams/${id}`, { method: 'PUT', body });
}

export function setTeamStatus(id, status) {
  return api(`/teams/${id}/status`, { method: 'PATCH', body: { status } });
}

export function deleteTeam(id) {
  return api(`/teams/${id}`, { method: 'DELETE' });
}

export function addTeamMember(id, body) {
  return api(`/teams/${id}/members`, { method: 'POST', body });
}

export function updateTeamMember(id, memberId, body) {
  return api(`/teams/${id}/members/${memberId}`, { method: 'PUT', body });
}

export function removeTeamMember(id, memberId, allowLeaderless) {
  const query = allowLeaderless ? '?allowLeaderless=1' : '';
  return api(`/teams/${id}/members/${memberId}${query}`, { method: 'DELETE' });
}

export function saveTeamMeeting(id, body, meetingId) {
  return api(meetingId ? `/teams/${id}/meetings/${meetingId}` : `/teams/${id}/meetings`, {
    method: meetingId ? 'PATCH' : 'POST',
    body,
  });
}

export function deleteTeamMeeting(id, meetingId) {
  return api(`/teams/${id}/meetings/${meetingId}`, { method: 'DELETE' });
}

export function createWorkRequest(id, body) {
  return api(`/teams/${id}/work-requests`, { method: 'POST', body });
}

export function updateWorkRequest(id, requestId, body) {
  return api(`/teams/${id}/work-requests/${requestId}`, { method: 'PATCH', body });
}

export function listProjectTeams(projectId) {
  return api(`/projects/${projectId}/teams`);
}

export function assignProjectTeam(projectId, body) {
  return api(`/projects/${projectId}/teams`, { method: 'POST', body });
}

export function updateProjectTeam(projectId, teamId, body) {
  return api(`/projects/${projectId}/teams/${teamId}`, { method: 'PUT', body });
}

export function removeProjectTeam(projectId, teamId) {
  return api(`/projects/${projectId}/teams/${teamId}`, { method: 'DELETE' });
}
