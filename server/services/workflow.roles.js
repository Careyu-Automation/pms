function textOf(user) {
  return `${user?.designation || ''} ${user?.role?.name || ''}`.toLowerCase();
}

function actorKind(user) {
  const code = user?.role?.code || '';
  const text = textOf(user);
  if (/\bceo\b|chief executive/.test(text)) return 'CEO';
  if (/business head/.test(text)) return 'BH';
  if (/engineering director/.test(text)) return 'ED';
  if (code === 'project_manager' || /project (lead|manager)/.test(text)) return 'PM';
  if (code === 'team_lead') return 'TEAM_LEAD';
  if (code === 'admin' || code === 'super_admin') return 'ADMIN';
  return 'MEMBER';
}

function isPm(user) {
  const kind = actorKind(user);
  return kind === 'PM' || kind === 'ADMIN';
}

function isBusinessHead(user) {
  return actorKind(user) === 'BH';
}

function isEngineeringDirector(user) {
  return actorKind(user) === 'ED';
}

function canCreateLead(user) {
  const kind = actorKind(user);
  return kind === 'BH' || kind === 'ED';
}

function leadSource(user) {
  return actorKind(user) === 'ED' ? 'ENGINEERING' : 'BUSINESS';
}

function isTeamLead(user) {
  return actorKind(user) === 'TEAM_LEAD';
}

function leadAccess(user, lead) {
  const kind = actorKind(user);
  const creator = lead?.createdById === user?.id;
  const editable = lead && ['DRAFT', 'CHANGES_REQUESTED'].includes(lead.status);
  const reviewable = lead && ['SUBMITTED_TO_PM', 'PM_REVIEW', 'ON_HOLD'].includes(lead.status);
  const assignable = lead && ['READY_FOR_TEAM_ASSIGNMENT', 'PM_APPROVED', 'FEASIBILITY'].includes(lead.status);
  const quotable = lead && ['COSTING_APPROVED', 'QUOTATION', 'NEGOTIATION'].includes(lead.status);
  return {
    kind,
    canCreate: canCreateLead(user),
    canEdit: Boolean(editable && creator),
    canSubmit: Boolean(editable && creator),
    canReview: Boolean(reviewable && isPm(user)),
    canAssign: Boolean(assignable && isPm(user)),
    canQuote: Boolean(quotable && (isBusinessHead(user) || kind === 'ADMIN')),
    canNegotiate: Boolean(lead && ['QUOTATION', 'NEGOTIATION', 'SENT'].includes(lead.status) && (isBusinessHead(user) || kind === 'ADMIN')),
  };
}

module.exports = {
  actorKind,
  isPm,
  isBusinessHead,
  isEngineeringDirector,
  isTeamLead,
  canCreateLead,
  leadSource,
  leadAccess,
};
