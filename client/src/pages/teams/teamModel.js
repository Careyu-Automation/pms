export const TEAM_ROLE = {
  TEAM_LEAD: 'Team Lead',
  SENIOR_MEMBER: 'Senior Member',
  MEMBER: 'Member',
};

export const PROJECT_ROLE = {
  PRIMARY: 'Primary',
  MAJOR: 'Major',
  SUPPORTING: 'Supporting',
  MINOR: 'Minor',
};

export const TASK_STATUS = {
  NOT_STARTED: 'To Do',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Done',
  AT_RISK: 'At Risk',
  BLOCKED: 'Blocked',
  CANCELLED: 'Cancelled',
};

export const PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const ASSIGNMENT = {
  TEAM_LEAD_ONLY: 'Team lead assigns',
  ANY_TEAM_MEMBER: 'Any member can assign',
  PM_ONLY: 'Project manager only',
  ADMIN_ONLY: 'Admin only',
  LEAD_AND_PM: 'Team lead + Project Manager',
};

export const ASSIGNMENT_HELP = {
  TEAM_LEAD_ONLY: 'Only team leads can assign tasks to team members.',
  ANY_TEAM_MEMBER: 'Any member of this team can create and assign work.',
  PM_ONLY: 'Only a project manager can assign tasks for this team.',
  ADMIN_ONLY: 'Only an administrator can assign tasks for this team.',
  LEAD_AND_PM: 'Team leads and project managers can assign tasks.',
};

export const REQUEST_TAGS = ['Development', 'Integration', 'Testing', 'Documentation', 'Customer', 'Internal', 'Urgent'];

export const REQUEST_STATUS = {
  REQUESTED: 'Requested',
  UNDER_REVIEW: 'Under review',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const MEETING_PLATFORM = {
  TEAMS: 'Microsoft Teams',
  MEET: 'Google Meet',
  ZOOM: 'Zoom',
  OTHER: 'Other',
};

export const LOAD_LABEL = {
  UNDERUTILIZED: 'Available',
  HEALTHY: 'Normal',
  NEAR_CAPACITY: 'High load',
  OVER_CAPACITY: 'Overloaded',
  OVERLOADED: 'Overloaded',
};

export function blankTeam() {
  return {
    name: '', description: '', department: '', category: '', leadId: '', memberIds: [], assignmentRule: 'TEAM_LEAD_ONLY', status: 'ACTIVE',
    meetingName: 'Team meeting', meetingPlatform: 'TEAMS', meetingUrl: '',
  };
}

export function teamToForm(team) {
  return {
    name: team.name || '',
    code: team.code || '',
    department: team.department || '',
    leadId: team.leadId || '',
    assignmentRule: team.assignmentRule || 'TEAM_LEAD_ONLY',
    status: team.status || 'ACTIVE',
    description: team.description || '',
  };
}

export function validateTeam(form, options = {}) {
  const errors = {};
  if (form.name.trim().length < 2) errors.name = 'Team name is required.';
  if (options.code && String(form.code || '').trim().length < 2) errors.code = 'Team code is required.';
  return errors;
}
