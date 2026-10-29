const STATUSES = [
  'DRAFT', 'IN_PROGRESS', 'INTERNAL_REVIEW', 'CHANGES_REQUESTED',
  'SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED',
];

const EDITABLE = new Set(['DRAFT', 'IN_PROGRESS', 'CHANGES_REQUESTED']);

const TRANSITIONS = {
  DRAFT: new Set(['IN_PROGRESS', 'INTERNAL_REVIEW']),
  IN_PROGRESS: new Set(['INTERNAL_REVIEW']),
  INTERNAL_REVIEW: new Set(['CHANGES_REQUESTED', 'SUBMITTED_FOR_APPROVAL']),
  CHANGES_REQUESTED: new Set(['IN_PROGRESS', 'INTERNAL_REVIEW']),
  SUBMITTED_FOR_APPROVAL: new Set(['APPROVED', 'REJECTED', 'CHANGES_REQUESTED']),
  APPROVED: new Set([]),
  REJECTED: new Set([]),
  SUPERSEDED: new Set([]),
};

const CURRENCIES = new Set(['INR', 'USD', 'EUR']);
const OVERHEAD_BASES = new Set(['DIRECT', 'SUBTOTAL']);
const PURCHASE = new Set(['NOT_REQUESTED', 'RFQ_SENT', 'QUOTE_RECEIVED', 'UNDER_REVIEW', 'ORDERED', 'RECEIVED']);

const COMPONENT_CATEGORIES = [
  'Mechanical', 'Robotics', 'Vision', 'Electrical', 'Controls / PLC', 'Software', 'AI / ML', 'Safety',
  'Conveyors / Material Handling', 'Integration', 'Installation', 'Commissioning', 'Other',
];

const BOM_CATEGORIES = [
  'Robotics', 'Vision', 'PLC', 'HMI', 'Sensors', 'Pneumatics', 'Mechanical', 'Electrical', 'Safety', 'Software', 'Miscellaneous',
];

const DOCUMENT_TYPES = new Set([
  'Vendor Quote', 'BOM', 'Technical Drawing', 'Solution Architecture', 'Supplier Offer',
  'Customer RFQ', 'Previous Quotation', 'Calculation Sheet', 'Other',
]);

const COST_LINES = [
  ['mechanical', 'mech-design', 'Mechanical design', 'HOURS'],
  ['electrical', 'elec-engineering', 'Electrical engineering', 'HOURS'],
  ['electrical', 'elec-panel', 'Panel fabrication', 'AMOUNT'],
  ['electrical', 'elec-wiring', 'Wiring', 'AMOUNT'],
  ['electrical', 'elec-components', 'Electrical components', 'AMOUNT'],
  ['software', 'soft-plc', 'PLC programming', 'HOURS'],
  ['software', 'soft-hmi', 'HMI', 'HOURS'],
  ['software', 'soft-scada', 'SCADA', 'HOURS'],
  ['software', 'soft-database', 'Database', 'HOURS'],
  ['software', 'soft-application', 'Application software', 'HOURS'],
  ['software', 'soft-integration', 'Software integration', 'HOURS'],
  ['robotics', 'robot-programming', 'Robot programming', 'HOURS'],
  ['robotics', 'robot-integration', 'Robot integration', 'HOURS'],
  ['robotics', 'robot-effector', 'End effector', 'AMOUNT'],
  ['robotics', 'robot-safety', 'Robot safety', 'AMOUNT'],
  ['vision', 'vision-camera', 'Camera', 'AMOUNT'],
  ['vision', 'vision-lens', 'Lens', 'AMOUNT'],
  ['vision', 'vision-lighting', 'Lighting', 'AMOUNT'],
  ['vision', 'vision-controller', 'Vision controller', 'AMOUNT'],
  ['vision', 'vision-model', 'AI model', 'AMOUNT'],
  ['vision', 'vision-training', 'Training', 'HOURS'],
  ['vision', 'vision-integration', 'Vision integration', 'HOURS'],
  ['vision', 'vision-validation', 'Validation', 'HOURS'],
  ['fabrication', 'fab-machine', 'Machine fabrication', 'AMOUNT'],
  ['fabrication', 'fab-fixtures', 'Fixtures', 'AMOUNT'],
  ['fabrication', 'fab-frames', 'Frames', 'AMOUNT'],
  ['fabrication', 'fab-guards', 'Guards', 'AMOUNT'],
  ['fabrication', 'fab-special', 'Special components', 'AMOUNT'],
  ['installation', 'inst-site', 'Site installation', 'AMOUNT'],
  ['installation', 'inst-manpower', 'Manpower', 'AMOUNT'],
  ['installation', 'inst-travel', 'Travel', 'AMOUNT'],
  ['installation', 'inst-stay', 'Accommodation', 'AMOUNT'],
  ['installation', 'inst-commissioning', 'Commissioning', 'AMOUNT'],
  ['testing', 'test-sample', 'Sample testing', 'AMOUNT'],
  ['testing', 'test-poc', 'POC', 'AMOUNT'],
  ['testing', 'test-validation', 'Validation', 'AMOUNT'],
  ['testing', 'test-trial', 'Trial runs', 'AMOUNT'],
  ['other', 'other-misc', 'Miscellaneous', 'AMOUNT'],
];

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return money(Math.min(number, 100));
}

function lineCost(entry) {
  if (entry.mode === 'HOURS') return money(Number(entry.hours) * Number(entry.rate));
  return money(entry.amount);
}

function bomLineTotal(row) {
  return money(Number(row.quantity) * Number(row.unitCost));
}

function calculateQuote(version, bom, entries) {
  const sections = {
    mechanical: 0, electrical: 0, software: 0, robotics: 0, vision: 0,
    fabrication: 0, installation: 0, testing: 0, other: 0,
  };
  for (const entry of entries || []) {
    if (!Object.prototype.hasOwnProperty.call(sections, entry.section)) continue;
    sections[entry.section] = money(sections[entry.section] + lineCost(entry));
  }
  const material = money((bom || []).reduce((sum, row) => sum + bomLineTotal(row), 0));
  const engineeringOther = money(Object.values(sections).reduce((sum, value) => sum + value, 0));
  const direct = material;
  const subtotal = money(direct + engineeringOther);
  const contingencyPercent = percent(version.contingencyPercent);
  const overheadPercent = percent(version.overheadPercent);
  const marginPercent = percent(version.marginPercent);
  const taxPercent = percent(version.taxPercent);
  const contingency = money(subtotal * contingencyPercent / 100);
  const overheadBaseAmount = version.overheadBase === 'DIRECT' ? direct : subtotal;
  const overhead = money(overheadBaseAmount * overheadPercent / 100);
  const totalInternal = money(subtotal + contingency + overhead);
  const margin = money(totalInternal * marginPercent / 100);
  const selling = money(totalInternal + margin);
  const tax = money(selling * taxPercent / 100);
  const finalQuote = money(selling + tax);
  const riskExposure = money((version.risks || []).reduce((sum, risk) => sum + money(risk.costImpact), 0));
  return {
    material,
    sections,
    engineering: money(sections.mechanical + sections.electrical),
    engineeringOther,
    direct,
    subtotal,
    contingencyPercent,
    contingency,
    overheadPercent,
    overheadBase: version.overheadBase === 'DIRECT' ? 'DIRECT' : 'SUBTOTAL',
    overheadBaseAmount,
    overhead,
    totalInternal,
    marginPercent,
    margin,
    selling,
    taxPercent,
    tax,
    finalQuote,
    riskExposure,
  };
}

function defaultEntries() {
  return COST_LINES.map(([section, lineKey, label, mode], index) => ({
    section,
    lineKey,
    label,
    mode,
    hours: 0,
    rate: 0,
    amount: 0,
    sortOrder: index,
  }));
}

function normalizeEntries(rows) {
  const incoming = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.lineKey, row]));
  return defaultEntries().map((line) => {
    const source = incoming.get(line.lineKey) || {};
    return {
      ...line,
      hours: money(source.hours),
      rate: money(source.rate),
      amount: money(source.amount),
    };
  });
}

function normalizeBom(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 400).map((row, index) => {
    const category = BOM_CATEGORIES.includes(row?.category) ? row.category : 'Miscellaneous';
    const purchaseStatus = PURCHASE.has(row?.purchaseStatus) ? row.purchaseStatus : 'NOT_REQUESTED';
    return {
      itemNo: index + 1,
      category,
      component: cleanText(row?.component, 200),
      description: cleanText(row?.description, 500),
      specification: cleanText(row?.specification, 300),
      manufacturer: cleanText(row?.manufacturer, 150),
      partNumber: cleanText(row?.partNumber, 80),
      supplier: cleanText(row?.supplier, 150),
      quantity: money(row?.quantity ?? 1),
      unit: cleanText(row?.unit, 40) || 'Nos',
      unitCost: money(row?.unitCost),
      leadTime: cleanText(row?.leadTime, 80),
      remarks: cleanText(row?.remarks, 500),
      quotationReference: cleanText(row?.quotationReference, 80),
      quotedPrice: row?.quotedPrice === '' || row?.quotedPrice === null || row?.quotedPrice === undefined ? null : money(row.quotedPrice),
      quoteDate: cleanDate(row?.quoteDate),
      quoteValidity: cleanDate(row?.quoteValidity),
      purchaseStatus,
      sortOrder: index,
    };
  }).filter((row) => row.component || row.description);
}

function normalizeVersion(body = {}) {
  return {
    solutionName: cleanText(body.solutionName, 200),
    solutionDescription: cleanText(body.solutionDescription),
    automationConcept: cleanText(body.automationConcept),
    processFlow: cleanText(body.processFlow),
    systemArchitecture: cleanText(body.systemArchitecture),
    keyAssumptions: cleanText(body.keyAssumptions),
    scopeOfSupply: cleanText(body.scopeOfSupply),
    customerScope: cleanText(body.customerScope),
    careyuScope: cleanText(body.careyuScope),
    thirdPartyScope: cleanText(body.thirdPartyScope),
    exclusions: cleanText(body.exclusions),
    commercialAssumptions: cleanText(body.commercialAssumptions),
    technicalAssumptions: cleanText(body.technicalAssumptions),
    customerDependencies: cleanText(body.customerDependencies),
    architectureInput: cleanText(body.architectureInput, 500),
    architectureProcess: cleanText(body.architectureProcess, 500),
    architectureInspection: cleanText(body.architectureInspection, 500),
    architectureDecision: cleanText(body.architectureDecision, 500),
    architectureOutput: cleanText(body.architectureOutput, 500),
    contingencyPercent: percent(body.contingencyPercent),
    overheadPercent: percent(body.overheadPercent),
    overheadBase: OVERHEAD_BASES.has(body.overheadBase) ? body.overheadBase : 'SUBTOTAL',
    marginPercent: percent(body.marginPercent),
    taxPercent: percent(body.taxPercent),
    currency: CURRENCIES.has(body.currency) ? body.currency : 'INR',
    componentLeadTime: cleanText(body.componentLeadTime, 120),
    engineeringDuration: cleanText(body.engineeringDuration, 120),
    fabricationDuration: cleanText(body.fabricationDuration, 120),
    assemblyDuration: cleanText(body.assemblyDuration, 120),
    testingDuration: cleanText(body.testingDuration, 120),
    installationDuration: cleanText(body.installationDuration, 120),
    commissioningDuration: cleanText(body.commissioningDuration, 120),
    estimatedDuration: cleanText(body.estimatedDuration, 120),
    paymentTerms: cleanText(body.paymentTerms, 500),
    deliveryTerms: cleanText(body.deliveryTerms, 500),
    warranty: cleanText(body.warranty, 300),
    validity: cleanText(body.validity, 120),
    installationTerms: cleanText(body.installationTerms, 500),
    components: (Array.isArray(body.components) ? body.components : []).slice(0, 80).map((row, index) => ({
      category: COMPONENT_CATEGORIES.includes(row?.category) ? row.category : 'Other',
      name: cleanText(row?.name, 160),
      description: cleanText(row?.description, 500),
      sortOrder: index,
    })).filter((row) => row.name),
    bom: normalizeBom(body.bom),
    entries: normalizeEntries(body.entries),
    risks: (Array.isArray(body.risks) ? body.risks : []).slice(0, 40).map((row, index) => ({
      risk: cleanText(row?.risk, 500),
      impact: cleanText(row?.impact, 20) || 'MEDIUM',
      probability: cleanText(row?.probability, 20) || 'MEDIUM',
      mitigation: cleanText(row?.mitigation, 1000),
      costImpact: money(row?.costImpact),
      ownerId: /^[0-9a-f-]{36}$/i.test(row?.ownerId || '') ? row.ownerId : null,
      sortOrder: index,
    })).filter((row) => row.risk),
    teams: (Array.isArray(body.teams) ? body.teams : []).slice(0, 8).map((row) => ({
      teamCode: cleanText(row?.teamCode, 40),
      contribution: cleanText(row?.contribution, 1000),
      estimatedCost: money(row?.estimatedCost),
      members: cleanText(row?.members, 300),
      status: cleanText(row?.status, 40) || 'NOT_STARTED',
    })).filter((row) => row.teamCode),
  };
}

function canTransition(from, to) {
  return TRANSITIONS[from]?.has(to) || false;
}

function roleAccess(user, versionStatus) {
  const code = user?.role?.code || '';
  const {
    isPm, isTeamLead, isEngineeringDirector, isBusinessHead, canEditCostingCommercial, seesOrganization,
  } = require('./workflow.roles');
  const pm = isPm(user);
  const businessHead = isBusinessHead(user);
  const engineering = pm || isTeamLead(user) || isEngineeringDirector(user) || code === 'engineering' || code === 'design' || businessHead;
  const procurement = pm || code === 'procurement' || isEngineeringDirector(user) || businessHead;
  const commercial = canEditCostingCommercial(user);
  const sales = code === 'sales';
  const editable = EDITABLE.has(versionStatus);
  return {
    canView: true,
    canEditSolution: editable && engineering,
    canEditBom: editable && engineering,
    canEditProcurement: editable && procurement,
    canEditCommercial: editable && commercial,
    canSave: editable && (engineering || procurement || commercial),
    canReview: pm,
    canApprove: pm && versionStatus === 'SUBMITTED_FOR_APPROVAL',
    canSubmitReview: (pm || businessHead) && ['DRAFT', 'IN_PROGRESS', 'CHANGES_REQUESTED'].includes(versionStatus),
    canSubmitApproval: pm && versionStatus === 'INTERNAL_REVIEW',
    canDuplicate: engineering,
    canDelete: pm && ['DRAFT', 'IN_PROGRESS'].includes(versionStatus),
    canConvert: (pm || seesOrganization(user)) && versionStatus === 'APPROVED',
    salesOnly: sales && !pm && !engineering && !procurement && !commercial,
  };
}

module.exports = {
  STATUSES,
  EDITABLE,
  COMPONENT_CATEGORIES,
  BOM_CATEGORIES,
  DOCUMENT_TYPES,
  COST_LINES,
  money,
  cleanText,
  bomLineTotal,
  lineCost,
  calculateQuote,
  defaultEntries,
  normalizeVersion,
  canTransition,
  roleAccess,
};
