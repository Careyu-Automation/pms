function textOf(user) {
  return `${user?.designation || ''} ${user?.role?.name || ''} ${user?.fullName || ''}`.toLowerCase();
}

function normalizePerson(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^(mr\.?|mrs\.?|ms\.?)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const ORG_VIEWER_NAMES = ['arivan', 'sabarigiri', 'bernard'];
const COSTING_EDITOR_NAMES = ['shradha', 'shradha patil'];

function matchesKnownName(user, names) {
  const full = normalizePerson(user?.fullName);
  const email = String(user?.email || '').toLowerCase();
  return names.some((name) => {
    const target = normalizePerson(name);
    return full === target
      || full.includes(target)
      || target.includes(full)
      || email.includes(target.replace(/\s+/g, ''));
  });
}

function actorKind(user) {
  const code = user?.role?.code || '';
  const text = textOf(user);
  if (/\bceo\b|chief executive/.test(text) || code === 'ceo') return 'CEO';
  if (/business head/.test(text) || matchesKnownName(user, COSTING_EDITOR_NAMES)) return 'BH';
  if (/engineering director/.test(text)) return 'ED';
  if (code === 'project_manager' || /project (lead|manager)/.test(text)) return 'PM';
  if (code === 'team_lead') return 'TEAM_LEAD';
  if (code === 'admin' || code === 'super_admin') return 'ADMIN';
  if (code === 'management') return 'MGMT';
  if (matchesKnownName(user, ORG_VIEWER_NAMES)) return 'MGMT';
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

function isCeo(user) {
  return actorKind(user) === 'CEO';
}

function seesOrganization(user) {
  const kind = actorKind(user);
  if (['CEO', 'BH', 'ED', 'PM', 'ADMIN', 'MGMT'].includes(kind)) return true;
  const code = String(user?.role?.code || '').toLowerCase();
  if (['admin', 'super_admin', 'project_manager', 'management'].includes(code)) return true;
  const designation = String(user?.designation || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return ['ceo', 'chief executive officer', 'business head', 'engineering director'].includes(designation);
}

function canCreateLead(user) {
  const kind = actorKind(user);
  return kind === 'BH' || kind === 'ED' || kind === 'ADMIN' || kind === 'CEO';
}

function leadSource(user) {
  return actorKind(user) === 'ED' ? 'ENGINEERING' : 'BUSINESS';
}

function isTeamLead(user) {
  return actorKind(user) === 'TEAM_LEAD';
}

function canEditCostingCommercial(user) {
  return isPm(user) || isBusinessHead(user) || actorKind(user) === 'ADMIN' || actorKind(user) === 'CEO';
}

function leadAccess(user, lead) {
  const kind = actorKind(user);
  const creator = lead?.createdById === user?.id;
  const editable = lead && ['DRAFT', 'CHANGES_REQUESTED'].includes(lead.status);
  const reviewable = lead && ['SUBMITTED_TO_PM', 'PM_REVIEW', 'ON_HOLD'].includes(lead.status);
  const assignable = lead && ['READY_FOR_TEAM_ASSIGNMENT', 'PM_APPROVED', 'FEASIBILITY'].includes(lead.status);
  const quotable = lead && ['COSTING_APPROVED', 'QUOTATION', 'QUOTATION_SENT', 'NEGOTIATION'].includes(lead.status);
  return {
    kind,
    canCreate: canCreateLead(user),
    canEdit: Boolean(editable && (creator || kind === 'ADMIN')),
    canSubmit: Boolean(editable && (creator || kind === 'ADMIN')),
    canReview: Boolean(reviewable && isPm(user)),
    canAssign: Boolean(assignable && isPm(user)),
    canQuote: Boolean(quotable && (isBusinessHead(user) || kind === 'ADMIN' || kind === 'CEO')),
    canNegotiate: Boolean(lead && ['QUOTATION', 'QUOTATION_SENT', 'NEGOTIATION', 'SENT'].includes(lead.status) && (isBusinessHead(user) || kind === 'ADMIN' || kind === 'CEO')),
  };
}

module.exports = {
  actorKind,
  isPm,
  isBusinessHead,
  isEngineeringDirector,
  isCeo,
  isTeamLead,
  canCreateLead,
  leadSource,
  leadAccess,
  seesOrganization,
  canEditCostingCommercial,
  matchesKnownName,
  ORG_VIEWER_NAMES,
  COSTING_EDITOR_NAMES,
};
