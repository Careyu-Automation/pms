export const TEAMS = [
  { code: 'vision', name: 'Vision Team' },
  { code: 'robotics', name: 'Robotics & Automation Solution Team' },
  { code: 'software', name: 'Software Team' },
  { code: 'procurement', name: 'Procurement / Costing Team' },
  { code: 'execution', name: 'Execution Team' },
];

export const SPECIALTY = {
  vision: [
    ['cameraRequirement', 'Camera requirement'],
    ['lensRequirement', 'Lens requirement'],
    ['lightingRequirement', 'Lighting requirement'],
    ['resolution', 'Resolution'],
    ['expectedAccuracy', 'Expected accuracy'],
    ['inspectionCycleTime', 'Inspection cycle time'],
    ['sampleAvailability', 'Sample availability'],
    ['datasetAvailability', 'Dataset availability'],
    ['modelRequirement', 'AI/ML model requirement'],
    ['pocRequired', 'POC required'],
    ['pocResult', 'POC result'],
  ],
  robotics: [
    ['robotType', 'Robot type'],
    ['robotModel', 'Robot make / model'],
    ['payload', 'Payload'],
    ['reach', 'Reach'],
    ['cycleTime', 'Cycle time'],
    ['endEffector', 'End effector'],
    ['robotQuantity', 'Robot quantity'],
    ['safetyRequirement', 'Safety requirement'],
    ['plcIntegration', 'PLC / robot integration'],
    ['technicalConstraints', 'Technical constraints'],
  ],
  software: [
    ['plcController', 'PLC / controller'],
    ['communicationProtocol', 'Communication protocol'],
    ['mesScada', 'MES / SCADA integration'],
    ['apiRequirement', 'API requirement'],
    ['databaseRequirements', 'Database requirement'],
    ['uiRequirement', 'UI requirement'],
    ['networkRequirement', 'Network requirement'],
    ['developmentEffort', 'Software development effort'],
    ['integrationConstraints', 'Integration constraints'],
  ],
  procurement: [
    ['requiredComponents', 'Required components'],
    ['preferredSuppliers', 'Preferred suppliers'],
    ['availability', 'Availability'],
    ['leadTime', 'Lead time'],
    ['alternativeComponents', 'Alternative components'],
    ['preliminaryCost', 'Preliminary cost'],
    ['vendorDependency', 'Vendor dependency'],
    ['procurementRisk', 'Procurement risk'],
  ],
  execution: [
    ['installationRequirement', 'Installation requirement'],
    ['floorSpace', 'Floor space'],
    ['utilities', 'Utilities'],
    ['electricalRequirement', 'Electrical requirement'],
    ['networkRequirement', 'Network requirement'],
    ['manpower', 'Manpower'],
    ['installationDuration', 'Installation duration'],
    ['commissioningDuration', 'Commissioning duration'],
    ['siteConstraints', 'Site constraints'],
  ],
};

export const FEASIBILITY_STATUSES = {
  NOT_STARTED: { label: 'Not Started', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  PENDING_TEAM_INPUT: { label: 'Pending Assessment', tone: 'pending' },
  UNDER_REVIEW: { label: 'Pending PM Review', tone: 'review' },
  FEASIBLE: { label: 'Approved · Feasible', tone: 'completed' },
  FEASIBLE_WITH_CONDITIONS: { label: 'Approved · Feasible with Conditions', tone: 'warning' },
  NOT_FEASIBLE: { label: 'Approved · Not Feasible', tone: 'danger' },
  MORE_INFORMATION_REQUIRED: { label: 'Requires Further Investigation', tone: 'hold' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export const TEAM_STATUSES = {
  NOT_STARTED: { label: 'Pending', tone: 'pending' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  BLOCKED: { label: 'Blocked', tone: 'danger' },
};

export const REQUIREMENT_STATUSES = {
  FEASIBLE: { label: 'Feasible', tone: 'completed' },
  CONDITIONAL: { label: 'Conditional', tone: 'warning' },
  NOT_FEASIBLE: { label: 'Not Feasible', tone: 'danger' },
  PENDING_VALIDATION: { label: 'Pending Validation', tone: 'review' },
};

export const TEST_STATUSES = {
  NOT_REQUIRED: { label: 'Not Required', tone: 'neutral' },
  PLANNED: { label: 'Planned', tone: 'info' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  FAILED: { label: 'Failed', tone: 'danger' },
};

export const SAMPLE_STATUSES = {
  NOT_RECEIVED: { label: 'Not Received', tone: 'neutral' },
  REQUESTED: { label: 'Requested', tone: 'pending' },
  RECEIVED: { label: 'Received', tone: 'info' },
  INSPECTED: { label: 'Inspected', tone: 'completed' },
  RETURNED: { label: 'Returned', tone: 'review' },
};

export const INPUT_STATUSES = {
  PENDING: { label: 'Pending', tone: 'pending' },
  RECEIVED: { label: 'Received', tone: 'completed' },
  NOT_REQUIRED: { label: 'Not Required', tone: 'neutral' },
};

export const RISK_LEVELS = {
  LOW: { label: 'Low', tone: 'completed' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  HIGH: { label: 'High', tone: 'hold' },
  CRITICAL: { label: 'Critical', tone: 'danger' },
};

export const RISK_STATUSES = {
  OPEN: { label: 'Open', tone: 'danger' },
  MITIGATING: { label: 'Mitigating', tone: 'pending' },
  MITIGATED: { label: 'Mitigated', tone: 'completed' },
  ACCEPTED: { label: 'Accepted', tone: 'review' },
};

export const COMMUNICATION_TYPES = ['Email', 'Call', 'Meeting', 'Site Visit', 'Teams Meeting', 'Other'];
export const DOCUMENT_TYPES = [
  'Customer Requirement', 'Technical Drawing', 'Specification', 'BOM', 'Quotation', 'POC Report', 'Other',
  'Customer Documents', 'Technical Documents', 'Drawings', 'POC Reports', 'Vendor Documents', 'Feasibility Reports',
  'Drawing', 'Report', 'POC Evidence', 'Photo', 'Presentation',
];

export const RISK_CATEGORIES = ['Technical', 'Commercial', 'Procurement', 'Execution', 'Customer', 'Integration', 'Timeline'];

export const DECISIONS = [
  ['FEASIBLE', 'Feasible'],
  ['FEASIBLE_WITH_CONDITIONS', 'Feasible with Conditions'],
  ['NOT_FEASIBLE', 'Not Feasible'],
  ['MORE_INFORMATION_REQUIRED', 'Requires Further Investigation'],
];

export const NEXT_STEPS = {
  FEASIBLE: ['Proceed to Solution & Costing', 'Conduct POC', 'Site Visit Required', 'Additional Technical Study', 'Put On Hold'],
  FEASIBLE_WITH_CONDITIONS: ['Proceed to Solution & Costing', 'Conduct POC', 'Customer Clarification Required', 'Site Visit Required', 'Additional Technical Study', 'Put On Hold'],
  NOT_FEASIBLE: ['Close Feasibility', 'Put On Hold', 'Additional Technical Study'],
  MORE_INFORMATION_REQUIRED: ['Customer Clarification Required', 'Site Visit Required', 'Put On Hold'],
};

export const TABS = [
  ['overview', 'Overview'],
  ['requirements', 'Requirements'],
  ['teams', 'Team Assessments'],
  ['validation', 'Technical Validation'],
  ['risks', 'Risks & Inputs'],
  ['documents', 'Documents'],
  ['communication', 'Communication'],
  ['activity', 'Activity'],
  ['review', 'PM Review'],
];

const POC_PROGRESS = {
  NOT_REQUIRED: 100,
  PLANNED: 25,
  IN_PROGRESS: 60,
  COMPLETED: 100,
  FAILED: 100,
};

export function statusMeta(map, value) {
  return map[value] || { label: value || 'Not set', tone: 'neutral' };
}

export function emptyAssessment(teamCode) {
  return {
    technicalAssessment: '',
    requiredResources: '',
    proposedApproach: '',
    constraints: '',
    requiredComponents: '',
    technicalAssumptions: '',
    risks: '',
    remarks: '',
    specialty: Object.fromEntries([
      ['teamRole', 'SUPPORTING'],
      ['instructions', ''],
      ...(SPECIALTY[teamCode] || []).map(([key]) => [key, '']),
    ]),
    reviewedByName: '',
    reviewedAt: null,
  };
}

export function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function percentFilled(values) {
  if (!values.length) return 0;
  const filled = values.filter((value) => String(value ?? '').trim()).length;
  return Math.round((filled / values.length) * 100);
}

export function calculateProgress(study) {
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

export function summarize(study) {
  const openRisks = (study.risks || []).filter((risk) => risk.status === 'OPEN' || risk.status === 'MITIGATING');
  const pendingInputs = (study.customerInputs || []).filter((item) => item.status === 'PENDING');
  return {
    openRisks: openRisks.length,
    openCriticalRisks: openRisks.filter((risk) => risk.riskLevel === 'CRITICAL').length,
    pendingInputs: pendingInputs.length,
    pendingCriticalInputs: pendingInputs.filter((item) => item.critical).length,
    documentCount: (study.documents || []).length,
    pocStatus: study.validation?.testStatus || 'NOT_REQUIRED',
    teamCount: (study.teams || []).length,
    teamsComplete: (study.teams || []).filter((team) => team.status === 'COMPLETED').length,
    requirementCount: (study.requirements || []).length,
    requirementsValidated: (study.requirements || []).filter((row) => row.status && row.status !== 'PENDING_VALIDATION').length,
    highRisks: openRisks.filter((risk) => risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL').length,
  };
}

export function submitIssues(study) {
  const fields = {};
  const teams = study.teams || [];
  const validation = study.validation || {};
  const feasibleDecision = study.decision === 'FEASIBLE' || study.decision === 'FEASIBLE_WITH_CONDITIONS';

  if (!study.startedAt) fields.started = 'Start the feasibility study before submitting it.';
  if (!study.ownerId) fields.owner = 'Assign a feasibility owner before submitting.';
  if (!teams.length) fields.teams = 'Assign at least one assessment team before submitting.';
  if (!study.decision) fields.decision = 'Record a feasibility decision before submitting.';
  if (!String(study.overallConclusion || '').trim()) fields.overallConclusion = 'Overall technical conclusion is required.';
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
  if (feasibleDecision && (study.customerInputs || []).some((item) => item.critical && item.status === 'PENDING')) {
    fields.customerInputs = 'Resolve or mark critical customer inputs before submitting a feasible decision.';
  }
  const allowed = NEXT_STEPS[study.decision] || [];
  if (!study.recommendedNextStep || !allowed.includes(study.recommendedNextStep)) {
    fields.recommendedNextStep = 'Choose a recommended next step that matches the decision.';
  }
  if (feasibleDecision) {
    if (teams.some((team) => team.status !== 'COMPLETED')) {
      fields.teams = 'Complete every assigned team assessment before submitting a feasible decision.';
    }
    if (!String(study.estimatedTimeline || '').trim()) {
      fields.estimatedTimeline = 'Provide an estimated solution timeline before submitting.';
    }
    if (!String(study.commercialEstimate || '').trim()) {
      fields.commercialEstimate = 'Provide an estimated cost range before submitting.';
    }
  } else if (teams.some((team) => team.status !== 'COMPLETED' && team.status !== 'BLOCKED')) {
    fields.teams = 'Finish or block every assigned team assessment before submitting.';
  }
  const pocStatus = validation.testStatus || 'NOT_REQUIRED';
  if (pocStatus !== 'NOT_REQUIRED' && pocStatus !== 'COMPLETED' && pocStatus !== 'FAILED') {
    fields.validation = 'Complete POC / technical validation, or mark it as Not Required.';
  }
  return fields;
}

export function workflowSteps(study) {
  const teams = study.teams || [];
  const validation = study.validation || {};
  const openRisks = (study.risks || []).filter((risk) => risk.status === 'OPEN' || risk.status === 'MITIGATING');
  const pocDone = validation.testStatus === 'COMPLETED' || validation.testStatus === 'FAILED' || validation.testStatus === 'NOT_REQUIRED';
  const riskDone = Boolean(study.startedAt) && (Boolean(String(study.majorConstraints || '').trim()) || Boolean(String(study.majorRisks || '').trim()) || (study.risks || []).length > 0);
  const submitted = Boolean(study.submittedAt) || study.status === 'UNDER_REVIEW' || ['FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE', 'REJECTED'].includes(study.status);
  const reviewed = Boolean(study.approvedAt) || study.status === 'REJECTED' || ['FEASIBLE', 'FEASIBLE_WITH_CONDITIONS', 'NOT_FEASIBLE'].includes(study.status);
  const steps = [
    { label: 'Lead Accepted', done: study.lead?.status === 'PM_APPROVED' || Boolean(study.lead?.id) },
    { label: 'Team Assigned', done: teams.length > 0 },
    { label: 'Assessment In Progress', done: teams.length > 0 && teams.some((team) => team.status !== 'NOT_STARTED') },
    { label: 'Assessment Completed', done: teams.length > 0 && teams.every((team) => team.status === 'COMPLETED') },
    { label: 'Validation', done: pocDone },
    { label: 'Risk Review', done: riskDone && openRisks.filter((risk) => risk.riskLevel === 'CRITICAL').length === 0 },
    { label: 'Pending PM Review', done: submitted },
    { label: 'PM Decision', done: reviewed },
    { label: 'Solution & Costing', done: Boolean(study.solutionCostingId) },
  ];
  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({
    ...step,
    state: step.done ? 'done' : index === current ? 'current' : 'upcoming',
  }));
}

export function blankRequirement() {
  return { key: crypto.randomUUID(), parameter: '', customerRequirement: '', proposed: '', unit: '', status: 'PENDING_VALIDATION', remarks: '' };
}

export function blankRisk() {
  return {
    key: crypto.randomUUID(), risk: '', category: '', impact: 'MEDIUM', probability: 'MEDIUM', riskLevel: 'MEDIUM',
    mitigation: '', ownerId: '', targetDate: '', status: 'OPEN',
  };
}

export function blankInput() {
  return {
    key: crypto.randomUUID(), informationRequired: '', requestedFrom: '', requestedDate: todayIso(), expectedDate: '',
    status: 'PENDING', remarks: '', critical: true,
  };
}

export function blankTest() {
  return {
    key: crypto.randomUUID(), name: '', testDate: todayIso(), environment: '', procedure: '',
    expectedResult: '', actualResult: '', accuracy: '', cycleTime: '', status: 'PLANNED', observations: '',
  };
}

export function blankCommunication() {
  return {
    key: crypto.randomUUID(), occurredOn: todayIso(), communicationType: 'Email', person: '', subject: '',
    summary: '', actionRequired: '', nextFollowUp: '', remarks: '',
  };
}
