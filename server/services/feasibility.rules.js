const TEAM_CODES = ['software', 'robotics', 'procurement', 'execution', 'vision'];

const TEAM_LABELS = {
  software: 'Software Team',
  robotics: 'Robotics & Automation Solution Team',
  procurement: 'Procurement / Costing Team',
  execution: 'Execution Team',
  vision: 'Vision Team',
};

const SHARED_SPECIALTY = ['teamRole', 'instructions', 'estimatedTimeline'];

const SPECIALTY_KEYS = {
  vision: [...SHARED_SPECIALTY, 'cameraRequirement', 'lensRequirement', 'lightingRequirement', 'resolution', 'expectedAccuracy', 'inspectionCycleTime', 'sampleAvailability', 'datasetAvailability', 'modelRequirement', 'pocRequired', 'pocResult', 'cameraFeasibility', 'lightingFeasibility', 'accuracy', 'inspectionTime', 'sampleValidation', 'modelFeasibility'],
  robotics: [...SHARED_SPECIALTY, 'robotType', 'robotModel', 'payload', 'reach', 'cycleTime', 'endEffector', 'robotQuantity', 'safetyRequirement', 'plcIntegration', 'technicalConstraints', 'robotSelection', 'robotSafety', 'motionFeasibility'],
  software: [...SHARED_SPECIALTY, 'plcController', 'communicationProtocol', 'mesScada', 'apiRequirement', 'databaseRequirements', 'uiRequirement', 'networkRequirement', 'developmentEffort', 'integrationConstraints', 'plcIntegration', 'softwareArchitecture', 'cycleTime', 'interfaceRequirements'],
  procurement: [...SHARED_SPECIALTY, 'requiredComponents', 'preferredSuppliers', 'availability', 'leadTime', 'alternativeComponents', 'preliminaryCost', 'vendorDependency', 'procurementRisk', 'componentAvailability', 'supplierAvailability', 'estimatedComponentCost'],
  execution: [...SHARED_SPECIALTY, 'installationRequirement', 'floorSpace', 'utilities', 'electricalRequirement', 'networkRequirement', 'manpower', 'installationDuration', 'commissioningDuration', 'siteConstraints', 'installationRequirements'],
};

const STUDY_STATUSES = new Set([
  'NOT_STARTED', 'IN_PROGRESS', 'PENDING_TEAM_INPUT', 'UNDER_REVIEW',
  'FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'MORE_INFORMATION_REQUIRED', 'REJECTED',
]);

const LOCKED_STATUSES = new Set(['UNDER_REVIEW', 'FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'REJECTED']);
const TEAM_STATUSES = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']);
const REQUIREMENT_STATUSES = new Set(['FEASIBLE', 'CONDITIONAL', 'NOT_FEASIBLE', 'PENDING_VALIDATION']);
const TEST_STATUSES = new Set(['NOT_REQUIRED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED']);
const SAMPLE_STATUSES = new Set(['NOT_RECEIVED', 'REQUESTED', 'RECEIVED', 'INSPECTED', 'RETURNED']);
const RISK_BANDS = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const RISK_STATUSES = new Set(['OPEN', 'MITIGATING', 'MITIGATED', 'ACCEPTED']);
const INPUT_STATUSES = new Set(['PENDING', 'RECEIVED', 'NOT_REQUIRED']);
const COMMUNICATION_TYPES = new Set(['Email', 'Call', 'Meeting', 'Site Visit', 'Teams Meeting', 'Other']);
const DOCUMENT_TYPES = new Set([
  'Customer Requirements', 'Customer Requirement', 'Technical Drawing', 'Technical Specification', 'Specification',
  'BOM', 'Proposed Solution', 'Cost Estimation', 'POC / Validation Report', 'POC Report', 'Vendor Document',
  'Quotation', 'Other',
  'Customer Documents', 'Technical Documents', 'Drawings', 'POC Reports', 'Vendor Documents', 'Feasibility Reports',
  'Drawing', 'Report', 'POC Evidence', 'Photo', 'Presentation',
  'Feasibility Report', 'Solution Document', 'Supporting File',
]);
const DECISIONS = new Set(['FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'MORE_INFORMATION_REQUIRED']);
const SAMPLE_AVAILABLE = new Set(['No', 'Yes', 'Partial']);

const NEXT_STEPS = {
  FEASIBLE: ['Proceed to Solution & Costing', 'Conduct POC', 'Site Visit Required', 'Additional Technical Study', 'Put On Hold'],
  FEASIBLE_WITH_CONDITIONS: ['Proceed to Solution & Costing', 'Conduct POC', 'Customer Clarification Required', 'Site Visit Required', 'Additional Technical Study', 'Put On Hold'],
  NOT_FEASIBLE: ['Close Feasibility', 'Put On Hold', 'Additional Technical Study'],
  MORE_INFORMATION_REQUIRED: ['Customer Clarification Required', 'Site Visit Required', 'Put On Hold'],
};

const POC_PROGRESS = {
  NOT_REQUIRED: 100,
  PLANNED: 25,
  IN_PROGRESS: 60,
  COMPLETED: 100,
  FAILED: 100,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function cleanUuid(value) {
  const text = String(value ?? '').trim();
  return UUID.test(text) ? text : null;
}

function oneOf(value, allowed, fallback) {
  return allowed.has(value) ? value : fallback;
}

function clampPercent(value, status) {
  if (status === 'COMPLETED') return 100;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeSpecialty(teamCode, source) {
  const keys = SPECIALTY_KEYS[teamCode] || [];
  const input = source && typeof source === 'object' ? source : {};
  return Object.fromEntries(keys.map((key) => [key, cleanText(input[key], 2000)]));
}

function normalizeAssessment(teamCode, source = {}) {
  return {
    technicalAssessment: cleanText(source.technicalAssessment, 4000),
    requiredResources: cleanText(source.requiredResources, 4000),
    proposedApproach: cleanText(source.proposedApproach, 4000),
    constraints: cleanText(source.constraints, 4000),
    requiredComponents: cleanText(source.requiredComponents, 4000),
    technicalAssumptions: cleanText(source.technicalAssumptions, 4000),
    risks: cleanText(source.risks, 4000),
    remarks: cleanText(source.remarks, 4000),
    specialty: normalizeSpecialty(teamCode, source.specialty),
  };
}

function normalizeTeam(team, index) {
  const teamCode = TEAM_CODES.includes(String(team?.teamCode || '').toLowerCase()) ? String(team.teamCode).toLowerCase() : '';
  if (!teamCode) return null;
  const status = oneOf(team.status, TEAM_STATUSES, 'NOT_STARTED');
  const memberIds = [...new Set((Array.isArray(team.memberIds) ? team.memberIds : []).map(cleanUuid).filter(Boolean))];
  return {
    teamCode,
    teamLeadId: cleanUuid(team.teamLeadId),
    memberIds: memberIds.slice(0, 30),
    assignmentDate: cleanDate(team.assignmentDate),
    dueDate: cleanDate(team.dueDate),
    status,
    completionPercent: clampPercent(team.completionPercent, status),
    assessment: normalizeAssessment(teamCode, team.assessment),
    assessmentDirty: Boolean(team.assessmentDirty),
    sortOrder: index,
  };
}

function normalizeValidation(source = {}) {
  return {
    sampleAvailable: oneOf(source.sampleAvailable, SAMPLE_AVAILABLE, 'No'),
    sampleReceivedDate: cleanDate(source.sampleReceivedDate),
    sampleQuantity: cleanText(source.sampleQuantity, 120),
    testRequired: cleanText(source.testRequired, 2000),
    testStatus: oneOf(source.testStatus, TEST_STATUSES, 'NOT_REQUIRED'),
    testMethod: cleanText(source.testMethod, 2000),
    testResult: cleanText(source.testResult, 4000),
    requiredAccuracy: cleanText(source.requiredAccuracy, 120),
    achievedAccuracy: cleanText(source.achievedAccuracy, 120),
    requiredCycleTime: cleanText(source.requiredCycleTime, 120),
    achievedCycleTime: cleanText(source.achievedCycleTime, 120),
    validationRemarks: cleanText(source.validationRemarks, 4000),
    sampleStatus: oneOf(source.sampleStatus, SAMPLE_STATUSES, 'NOT_RECEIVED'),
    sampleType: cleanText(source.sampleType, 200),
    sampleCondition: cleanText(source.sampleCondition, 500),
    sampleLocation: cleanText(source.sampleLocation, 200),
    sampleOwner: cleanText(source.sampleOwner, 150),
    sampleRemarks: cleanText(source.sampleRemarks, 2000),
    tests: (Array.isArray(source.tests) ? source.tests : []).slice(0, 40).map((test, index) => ({
      name: cleanText(test?.name, 160),
      testDate: cleanDate(test?.testDate),
      environment: cleanText(test?.environment, 200),
      procedure: cleanText(test?.procedure, 2000),
      expectedResult: cleanText(test?.expectedResult, 500),
      actualResult: cleanText(test?.actualResult, 500),
      accuracy: cleanText(test?.accuracy, 80),
      cycleTime: cleanText(test?.cycleTime, 80),
      status: oneOf(test?.status, TEST_STATUSES, 'PLANNED'),
      observations: cleanText(test?.observations, 2000),
      sortOrder: index,
    })).filter((test) => test.name || test.procedure || test.actualResult),
  };
}

function normalizeDraft(body = {}) {
  const decision = DECISIONS.has(body.decision) ? body.decision : '';
  const nextSteps = NEXT_STEPS[decision] || [];
  const recommended = nextSteps.includes(body.recommendedNextStep) ? body.recommendedNextStep : cleanText(body.recommendedNextStep, 80);
  const teams = [];
  const seen = new Set();
  for (const team of Array.isArray(body.teams) ? body.teams : []) {
    const normalized = normalizeTeam(team, teams.length);
    if (!normalized || seen.has(normalized.teamCode)) continue;
    seen.add(normalized.teamCode);
    teams.push(normalized);
  }

  return {
    ownerId: cleanUuid(body.ownerId),
    targetCompletionDate: cleanDate(body.targetCompletionDate),
    technicalFeasibility: cleanText(body.technicalFeasibility),
    requiredResources: cleanText(body.requiredResources),
    proposedSolution: cleanText(body.proposedSolution),
    majorConstraints: cleanText(body.majorConstraints),
    estimatedTimeline: cleanText(body.estimatedTimeline),
    requiredEquipment: cleanText(body.requiredEquipment),
    technicalAssumptions: cleanText(body.technicalAssumptions),
    teamRemarks: cleanText(body.teamRemarks),
    commercialNotes: cleanText(body.commercialNotes),
    commercialEstimate: cleanText(body.commercialEstimate, 200),
    decision,
    overallConclusion: cleanText(body.overallConclusion),
    conditions: cleanText(body.conditions),
    majorRisks: cleanText(body.majorRisks),
    recommendedNextStep: nextSteps.includes(recommended) ? recommended : '',
    pmRemarks: cleanText(body.pmRemarks),
    completionDate: cleanDate(body.completionDate),
    validation: normalizeValidation(body.validation),
    teams,
    requirements: (Array.isArray(body.requirements) ? body.requirements : []).slice(0, 40).map((row, index) => ({
      parameter: cleanText(row?.parameter, 160),
      customerRequirement: cleanText(row?.customerRequirement, 500),
      proposed: cleanText(row?.proposed, 500),
      unit: cleanText(row?.unit, 40),
      status: oneOf(row?.status, REQUIREMENT_STATUSES, 'PENDING_VALIDATION'),
      remarks: cleanText(row?.remarks, 500),
      sortOrder: index,
    })).filter((row) => row.parameter || row.customerRequirement || row.proposed),
    risks: (Array.isArray(body.risks) ? body.risks : []).slice(0, 40).map((row, index) => ({
      risk: cleanText(row?.risk, 500),
      category: cleanText(row?.category, 80),
      impact: oneOf(row?.impact, RISK_BANDS, 'MEDIUM'),
      probability: oneOf(row?.probability, RISK_BANDS, 'MEDIUM'),
      riskLevel: oneOf(row?.riskLevel, RISK_BANDS, 'MEDIUM'),
      mitigation: cleanText(row?.mitigation, 2000),
      ownerId: cleanUuid(row?.ownerId),
      targetDate: cleanDate(row?.targetDate),
      status: oneOf(row?.status, RISK_STATUSES, 'OPEN'),
      sortOrder: index,
    })).filter((row) => row.risk || row.mitigation),
    customerInputs: (Array.isArray(body.customerInputs) ? body.customerInputs : []).slice(0, 40).map((row, index) => ({
      id: cleanUuid(row?.id),
      informationRequired: cleanText(row?.informationRequired, 300),
      requestedFrom: cleanText(row?.requestedFrom, 150),
      requestedDate: cleanDate(row?.requestedDate),
      expectedDate: cleanDate(row?.expectedDate),
      status: oneOf(row?.status, INPUT_STATUSES, 'PENDING'),
      remarks: cleanText(row?.remarks, 500),
      critical: row?.critical !== false,
      sortOrder: index,
    })).filter((row) => row.informationRequired),
    communications: (Array.isArray(body.communications) ? body.communications : []).slice(0, 80).map((row) => ({
      id: cleanUuid(row?.id),
      occurredOn: cleanDate(row?.occurredOn),
      communicationType: oneOf(row?.communicationType, COMMUNICATION_TYPES, 'Other'),
      person: cleanText(row?.person, 150),
      subject: cleanText(row?.subject, 200),
      summary: cleanText(row?.summary, 4000),
      actionRequired: cleanText(row?.actionRequired, 500),
      nextFollowUp: cleanDate(row?.nextFollowUp),
      remarks: cleanText(row?.remarks, 1000),
    })).filter((row) => row.subject || row.summary || row.person),
  };
}

function percentFilled(values) {
  if (!values.length) return 0;
  const filled = values.filter((value) => String(value ?? '').trim()).length;
  return Math.round((filled / values.length) * 100);
}

function calculateProgress(study) {
  const teams = study.teams || [];
  const teamInputs = teams.length
    ? Math.round(teams.reduce((sum, team) => sum + Number(team.completionPercent || 0), 0) / teams.length)
    : 0;
  const technical = percentFilled([
    study.technicalFeasibility,
    study.requiredResources,
    study.proposedSolution,
    study.majorConstraints,
    study.estimatedTimeline,
    study.requiredEquipment,
    study.technicalAssumptions,
    study.teamRemarks,
  ]);
  const poc = POC_PROGRESS[study.validation?.testStatus] ?? 0;
  const lead = study.lead || {};
  const details = lead.details || {};
  const commercial = percentFilled([
    study.commercialNotes,
    study.commercialEstimate,
    lead.estimatedValue,
    lead.commercialRequirements,
    details.budget,
  ]);
  const documentation = (study.documents || []).length ? 100 : 0;
  const overall = Math.round((teamInputs + technical + poc + commercial + documentation) / 5);
  return { overall, teamInputs, technical, poc, commercial, documentation };
}

function workingStatus(study) {
  if (!study.startedAt) return 'NOT_STARTED';
  const criticalPending = (study.customerInputs || []).some((item) => item.critical && item.status === 'PENDING');
  if (criticalPending) return 'MORE_INFORMATION_REQUIRED';
  const teams = study.teams || [];
  if (teams.length && teams.some((team) => team.status !== 'COMPLETED')) return 'PENDING_TEAM_INPUT';
  return 'IN_PROGRESS';
}

function submitErrors(study) {
  const fields = {};
  const teams = study.teams || [];
  const validation = study.validation || {};
  const feasibleDecision = study.decision === 'FEASIBLE' || study.decision === 'FEASIBLE_WITH_CONDITIONS';

  if (!study.startedAt) fields.started = 'Start the feasibility study before submitting it.';
  if (!study.ownerId) fields.owner = 'Assign a feasibility owner before submitting.';
  if (!teams.length) fields.teams = 'Assign at least one assessment team before submitting.';
  if (!study.decision) fields.decision = 'Record a feasibility decision before submitting.';
  if (!String(study.overallConclusion || '').trim()) {
    fields.overallConclusion = 'Overall technical conclusion is required.';
  }
  if (!String(study.technicalFeasibility || '').trim()) {
    fields.technicalFeasibility = 'Record the technical feasibility assessment before submitting.';
  }
  if (!(study.risks || []).length && !String(study.majorRisks || '').trim() && !String(study.majorConstraints || '').trim()) {
    fields.risks = 'Record risks, dependencies, or major constraints before submitting.';
  }
  if (!(study.documents || []).length) {
    fields.documents = 'Upload or retain at least one supporting document before submitting.';
  }
  if (study.decision === 'FEASIBLE_WITH_CONDITIONS' && !String(study.conditions || '').trim()) {
    fields.conditions = 'Record the conditions before submitting a conditional feasibility.';
  }
  if (study.decision === 'NOT_FEASIBLE' && !String(study.conditions || '').trim()) {
    fields.conditions = 'A reason is required when the decision is Not Feasible.';
  }
  if (study.decision === 'MORE_INFORMATION_REQUIRED') {
    const pending = (study.customerInputs || []).some((item) => item.status === 'PENDING' && String(item.informationRequired || '').trim());
    if (!pending) fields.customerInputs = 'List the pending customer information before submitting.';
  }
  const criticalPending = (study.customerInputs || []).some((item) => item.critical && item.status === 'PENDING');
  if (feasibleDecision && criticalPending) {
    fields.customerInputs = 'Resolve or mark critical customer inputs before submitting a feasible decision.';
  }
  const allowed = NEXT_STEPS[study.decision] || [];
  if (!study.recommendedNextStep || !allowed.includes(study.recommendedNextStep)) {
    fields.recommendedNextStep = 'Choose a recommended next step that matches the decision.';
  }
  if (feasibleDecision) {
    const open = teams.filter((team) => team.status !== 'COMPLETED');
    if (open.length) {
      fields.teams = 'Complete every assigned team assessment before submitting a feasible decision.';
    }
    if (!String(study.estimatedTimeline || '').trim()) {
      fields.estimatedTimeline = 'Provide an estimated solution timeline before submitting.';
    }
    if (!String(study.commercialEstimate || '').trim()) {
      fields.commercialEstimate = 'Provide an estimated cost range before submitting.';
    }
  } else if (teams.length && teams.some((team) => team.status !== 'COMPLETED' && team.status !== 'BLOCKED')) {
    fields.teams = 'Finish or block every assigned team assessment before submitting.';
  }
  const pocStatus = validation.testStatus || 'NOT_REQUIRED';
  if (pocStatus !== 'NOT_REQUIRED' && pocStatus !== 'COMPLETED' && pocStatus !== 'FAILED') {
    fields.validation = 'Complete POC / technical validation, or mark it as Not Required.';
  }
  return fields;
}

function roleCode(user) {
  return user?.role?.code || '';
}

function isLocked(study) {
  if (LOCKED_STATUSES.has(study.status)) return true;
  return study.status === 'MORE_INFORMATION_REQUIRED' && Boolean(study.approvedAt);
}

function buildAccess(user, study) {
  const code = roleCode(user);
  const {
    isPm, isTeamLead, isCeo, isBusinessHead, isEngineeringDirector, seesOrganization,
  } = require('./workflow.roles');
  const pm = isPm(user);
  const orgViewer = seesOrganization(user) || isCeo(user) || isBusinessHead(user) || isEngineeringDirector(user);
  const teamLeadRole = isTeamLead(user) || code === 'team_lead';
  const sales = code === 'sales';
  const locked = isLocked(study);
  const hardLocked = study.status === 'REJECTED';
  const started = Boolean(study.startedAt);
  const owner = Boolean(study.ownerId) && study.ownerId === user.id;
  const teams = study.teams || [];
  const memberTeamIds = teams
    .filter((team) => team.teamLeadId === user.id || (team.memberIds || []).includes(user.id))
    .map((team) => team.id);
  const leadTeamIds = teams
    .filter((team) => team.teamLeadId === user.id || (teamLeadRole && memberTeamIds.includes(team.id)))
    .map((team) => team.id);
  // Study team leads may run the full assessment; plain members only their team rows.
  const studyTeamLead = teams.some((team) => team.teamLeadId === user.id);
  const assignedAssessor = owner || studyTeamLead;
  const staff = pm || orgViewer || owner || studyTeamLead || memberTeamIds.length > 0 || teamLeadRole || sales;
  // Technical Validation + Solution stay editable for all assigned/org staff except Rejected.
  const core = !hardLocked && (pm || orgViewer || assignedAssessor || teamLeadRole || sales || memberTeamIds.length > 0);
  const feasible = ['FEASIBLE', 'FEASIBLE_WITH_CONDITIONS'].includes(study.status);
  const leadStatus = study.lead?.status || '';
  const procurementDone = Boolean(study.solutionCostingId)
    || leadStatus === 'PROCUREMENT_APPROVED'
    || ['COSTING', 'COSTING_SUBMITTED', 'COSTING_CHANGES_REQUESTED', 'COSTING_APPROVED', 'QUOTATION', 'QUOTATION_SENT', 'NEGOTIATION', 'WON', 'CONVERTED'].includes(leadStatus);
  const procurementPending = feasible && !procurementDone && ['FEASIBILITY_APPROVED', 'PROCUREMENT_SUBMITTED', ''].includes(leadStatus);
  const isReviewer = pm || orgViewer;
  const canAdvanceToReview = started && !locked && (pm || orgViewer || owner || studyTeamLead);

  return {
    canStart: !started && (pm || orgViewer || teamLeadRole || owner || studyTeamLead),
    canSave: !hardLocked && staff,
    canEditCore: core,
    canEditStudy: core,
    canEditTeams: !hardLocked && (pm || orgViewer || assignedAssessor || teamLeadRole),
    canEditAssessment: !hardLocked && (core || memberTeamIds.length > 0),
    editableTeamIds: !hardLocked ? (core ? teams.map((team) => team.id) : memberTeamIds) : [],
    canReviewTeamIds: (pm || orgViewer || leadTeamIds.length) ? ((pm || orgViewer) ? teams.map((team) => team.id) : leadTeamIds) : [],
    canEditCommunications: !hardLocked && staff,
    canManageCustomerInputs: !hardLocked && (pm || orgViewer || owner || studyTeamLead || teamLeadRole),
    canUpdateCustomerInputs: !hardLocked && staff,
    // Non-reviewers submit to PM; reviewers mark ready for review (no submit-to-self).
    canSubmit: canAdvanceToReview && !isReviewer,
    canPrepareReview: canAdvanceToReview && isReviewer,
    canApprove: study.status === 'UNDER_REVIEW' && isReviewer,
    canRequestChanges: study.status === 'UNDER_REVIEW' && isReviewer,
    canReject: study.status === 'UNDER_REVIEW' && isReviewer,
    canProceed: (pm || orgViewer) && feasible && procurementDone,
    procurementPending: Boolean(procurementPending),
    procurementHref: '/procurement-requests',
    canUpload: study.status !== 'REJECTED' && staff,
    canDeleteDocuments: pm || orgViewer || owner || studyTeamLead,
    isOwner: owner,
    isStudyTeamLead: studyTeamLead,
    isAssignedMember: memberTeamIds.length > 0,
  };
}

module.exports = {
  TEAM_CODES,
  TEAM_LABELS,
  SPECIALTY_KEYS,
  STUDY_STATUSES,
  LOCKED_STATUSES,
  isLocked,
  DOCUMENT_TYPES,
  NEXT_STEPS,
  UUID,
  normalizeDraft,
  calculateProgress,
  workingStatus,
  submitErrors,
  buildAccess,
  cleanText,
  oneOf,
};
