const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const feasibilityRepository = require('../db/feasibility.repository');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const repository = require('../db/costing.repository');
const planningRepository = require('../db/planning.repository');
const { buildAccess } = require('./feasibility.rules');
const {
  DOCUMENT_TYPES,
  calculateQuote,
  normalizeVersion,
  canTransition,
  roleAccess,
  money,
} = require('./costing.rules');

function uploadDir(id) {
  return path.join(__dirname, '..', 'uploads', 'costing', id);
}

function present(costing, user) {
  const status = costing.version?.status || 'DRAFT';
  return {
    ...costing,
    access: roleAccess(user, status),
  };
}

async function getOrThrow(id) {
  const costing = await repository.findById(id);
  if (!costing) throw new ApiError(404, 'Solution costing record not found.');
  return costing;
}

function seedFromStudy(study) {
  const lead = study.lead || {};
  const pending = (study.customerInputs || [])
    .filter((item) => item.status === 'PENDING')
    .map((item) => item.informationRequired)
    .filter(Boolean);
  const poc = [study.validation?.testMethod, study.validation?.testResult, study.validation?.validationRemarks]
    .filter((part) => String(part || '').trim())
    .join('\n');
  const bom = String(study.requiredEquipment || '').trim()
    ? [{
      category: 'Miscellaneous',
      component: 'Required equipment',
      description: study.requiredEquipment,
      quantity: 1,
      unit: 'Lot',
      unitCost: 0,
      remarks: 'Carried from the feasibility study. Replace with priced BOM lines.',
      purchaseStatus: 'NOT_REQUESTED',
    }]
    : [];
  return normalizeVersion({
    solutionName: lead.title || '',
    solutionDescription: study.proposedSolution || lead.requiredSolution || '',
    automationConcept: study.proposedSolution || '',
    processFlow: study.proposedSolution || '',
    keyAssumptions: study.technicalAssumptions || '',
    technicalAssumptions: study.technicalAssumptions || '',
    commercialAssumptions: study.commercialNotes || lead.commercialRequirements || '',
    customerDependencies: [study.conditions, ...pending].filter(Boolean).join('\n'),
    careyuScope: study.requiredEquipment || '',
    scopeOfSupply: study.proposedSolution || '',
    exclusions: '',
    architectureInput: 'Part loading',
    architectureProcess: study.proposedSolution || 'Process',
    architectureInspection: lead.useCase || 'Inspection / automation',
    architectureDecision: 'Pass / fail decision',
    architectureOutput: 'Sorting / unloading',
    componentLeadTime: study.estimatedTimeline || '',
    estimatedDuration: study.estimatedTimeline || '',
    currency: 'INR',
    taxPercent: 18,
    bom,
    risks: (study.risks || []).map((risk) => ({
      risk: risk.risk,
      impact: risk.impact,
      probability: risk.probability,
      mitigation: risk.mitigation,
      costImpact: 0,
      ownerId: risk.ownerId,
    })),
    teams: (study.teams || []).map((team) => ({
      teamCode: team.teamCode,
      contribution: [
        team.assessment?.technicalAssessment,
        team.assessment?.proposedApproach,
        team.assessment?.requiredComponents,
      ].filter((part) => String(part || '').trim()).join('\n'),
      estimatedCost: 0,
      members: (team.members || []).map((person) => person.name).join(', '),
      status: team.status || 'NOT_STARTED',
    })),
    systemArchitecture: poc ? `POC / validation\n${poc}` : '',
  });
}

async function create(feasibilityId, user) {
  const study = await feasibilityRepository.findById(feasibilityId);
  if (!study) throw new ApiError(404, 'Feasibility study not found.');
  const gate = buildAccess(user, study);
  if (!study.solutionCostingId) {
    const procurement = require('./procurement.service');
    const ready = await procurement.leadReadyForCosting(study.leadId);
    if (!ready) {
      throw new ApiError(409, 'Complete procurement and wait for PM approval before opening solution costing.');
    }
  }
  if (!gate.canProceed && !study.solutionCostingId) {
    throw new ApiError(409, gate.procurementPending
      ? 'Complete procurement and wait for PM approval before opening solution costing.'
      : 'Solution and costing opens after the feasibility is feasible or feasible with conditions.');
  }
  if (study.decision === 'FEASIBLE_WITH_CONDITIONS' && !String(study.conditions || '').trim()) {
    throw new ApiError(422, 'Record the conditions before creating solution and costing.');
  }
  const costingId = await repository.createFromStudy(study, seedFromStudy(study), user.id);
  if (!study.solutionCostingId) {
    await feasibilityRepository.addActivity(study.id, user.id, 'Proceeded to Solution & Costing');
  }
  return present(await getOrThrow(costingId), user);
}

async function list() {
  const [costings, summary] = await Promise.all([repository.list(), repository.summary()]);
  return { costings, summary };
}

async function sources() {
  return repository.sources();
}

async function get(id, user) {
  return present(await getOrThrow(id), user);
}

function scopedFields(current, incoming, access) {
  const version = current.version;
  const base = {
    ...version,
    components: version.components,
    bom: version.bom,
    entries: version.entries,
    risks: version.risks,
    teams: version.teams,
  };
  const next = { ...base };
  if (access.canEditSolution) {
    Object.assign(next, {
      solutionName: incoming.solutionName,
      solutionDescription: incoming.solutionDescription,
      automationConcept: incoming.automationConcept,
      processFlow: incoming.processFlow,
      systemArchitecture: incoming.systemArchitecture,
      keyAssumptions: incoming.keyAssumptions,
      scopeOfSupply: incoming.scopeOfSupply,
      customerScope: incoming.customerScope,
      careyuScope: incoming.careyuScope,
      thirdPartyScope: incoming.thirdPartyScope,
      exclusions: incoming.exclusions,
      commercialAssumptions: incoming.commercialAssumptions,
      technicalAssumptions: incoming.technicalAssumptions,
      customerDependencies: incoming.customerDependencies,
      architectureInput: incoming.architectureInput,
      architectureProcess: incoming.architectureProcess,
      architectureInspection: incoming.architectureInspection,
      architectureDecision: incoming.architectureDecision,
      architectureOutput: incoming.architectureOutput,
      componentLeadTime: incoming.componentLeadTime,
      engineeringDuration: incoming.engineeringDuration,
      fabricationDuration: incoming.fabricationDuration,
      assemblyDuration: incoming.assemblyDuration,
      testingDuration: incoming.testingDuration,
      installationDuration: incoming.installationDuration,
      commissioningDuration: incoming.commissioningDuration,
      estimatedDuration: incoming.estimatedDuration,
      components: incoming.components,
      entries: incoming.entries,
      risks: incoming.risks,
      teams: incoming.teams,
    });
  }
  if (access.canEditBom) next.bom = incoming.bom;
  if (access.canEditProcurement && !access.canEditBom) {
    const incomingByNo = new Map((incoming.bom || []).map((row) => [row.itemNo, row]));
    next.bom = (version.bom || []).map((row) => {
      const source = incomingByNo.get(row.itemNo);
      if (!source) return row;
      return {
        ...row,
        supplier: source.supplier,
        manufacturer: source.manufacturer,
        partNumber: source.partNumber,
        unitCost: source.unitCost,
        leadTime: source.leadTime,
        quotationReference: source.quotationReference,
        quotedPrice: source.quotedPrice,
        quoteDate: source.quoteDate,
        quoteValidity: source.quoteValidity,
        purchaseStatus: source.purchaseStatus,
      };
    });
  }
  if (access.canEditCommercial) {
    Object.assign(next, {
      contingencyPercent: incoming.contingencyPercent,
      overheadPercent: incoming.overheadPercent,
      overheadBase: incoming.overheadBase,
      marginPercent: incoming.marginPercent,
      taxPercent: incoming.taxPercent,
      currency: incoming.currency,
      paymentTerms: incoming.paymentTerms,
      deliveryTerms: incoming.deliveryTerms,
      warranty: incoming.warranty,
      validity: incoming.validity,
      installationTerms: incoming.installationTerms,
    });
  }
  return normalizeVersion(next);
}

async function auditChanges(costing, before, after, userId) {
  const pairs = [
    ['Margin %', before.marginPercent, after.marginPercent],
    ['Contingency %', before.contingencyPercent, after.contingencyPercent],
    ['Overhead %', before.overheadPercent, after.overheadPercent],
    ['Overhead base', before.overheadBase, after.overheadBase],
    ['Tax %', before.taxPercent, after.taxPercent],
    ['Currency', before.currency, after.currency],
    ['CareYu scope', before.careyuScope, after.careyuScope],
    ['Exclusions', before.exclusions, after.exclusions],
    ['Selling price', before.quote?.selling, after.quote?.selling],
  ];
  for (const [field, previous, value] of pairs) {
    await repository.addAudit(costing.id, costing.version.id, userId, field, previous, value);
  }
  const beforeBom = JSON.stringify((before.bom || []).map((row) => [row.component, row.quantity, row.unitCost, row.supplier]));
  const afterBom = JSON.stringify((after.bom || []).map((row) => [row.component, row.quantity, row.unitCost, row.supplier]));
  if (beforeBom !== afterBom) {
    await repository.addAudit(costing.id, costing.version.id, userId, 'BOM', 'previous lines', `${(after.bom || []).length} lines`);
    const priceChanged = (before.bom || []).some((row, index) => money(row.unitCost) !== money(after.bom?.[index]?.unitCost));
    await repository.addActivity(costing.id, costing.version.id, userId, priceChanged ? 'Vendor Price Updated' : 'BOM Updated');
  }
  if (before.solutionName !== after.solutionName || before.solutionDescription !== after.solutionDescription) {
    await repository.addActivity(costing.id, costing.version.id, userId, 'Solution Updated');
  }
}

async function save(id, body, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!current.version) throw new ApiError(409, 'This costing has no working version.');
  const invalidLine = (Array.isArray(body.bom) ? body.bom : []).find((row) => Number(row.quantity) < 0 || Number(row.unitCost) < 0);
  if (invalidLine) throw new ApiError(422, 'BOM quantity and unit cost cannot be negative.');
  if (!access.canSave) throw new ApiError(403, 'You cannot edit this costing.');
  const beforeQuote = calculateQuote(current.version, current.version.bom, current.version.entries);
  const before = { ...current.version, quote: beforeQuote };
  const fields = scopedFields(current, normalizeVersion(body), access);
  await repository.saveVersion(current.version.id, fields);
  const saved = await getOrThrow(id);
  const afterQuote = calculateQuote(saved.version, saved.version.bom, saved.version.entries);
  await auditChanges(current, before, { ...saved.version, quote: afterQuote }, user.id);
  return present(await getOrThrow(id), user);
}

async function duplicate(id, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canDuplicate) throw new ApiError(403, 'You cannot create a costing version.');
  if (!current.version) throw new ApiError(409, 'This costing has no working version.');
  await repository.copyVersion(id, current.version.id, user.id);
  return present(await getOrThrow(id), user);
}

async function moveStatus(id, user, target, activity, decision, comments) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canReview) throw new ApiError(403, 'You cannot move this costing through approval.');
  if (!current.version) throw new ApiError(409, 'This costing has no working version.');
  if (!canTransition(current.version.status, target)) {
    throw new ApiError(409, `A ${current.version.status.replaceAll('_', ' ').toLowerCase()} costing cannot move to ${target.replaceAll('_', ' ').toLowerCase()}.`);
  }
  const patch = {};
  if (target === 'INTERNAL_REVIEW' || target === 'SUBMITTED_FOR_APPROVAL') {
    patch.submitted_by = user.id;
    patch.submitted_at = new Date();
  }
  if (['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(target)) {
    patch.reviewed_by = user.id;
    patch.reviewed_at = new Date();
  }
  if (target === 'REJECTED') patch.rejection_reason = comments || '';
  if (target === 'CHANGES_REQUESTED') patch.rejection_reason = '';
  await repository.setStatus(current.version.id, target, patch);
  await repository.addApproval(current.version.id, user.id, decision, comments);
  await repository.addActivity(id, current.version.id, user.id, activity);
  await repository.addAudit(id, current.version.id, user.id, 'Status', current.version.status, target);
  const workflow = require('./workflow.service');
  if (target === 'SUBMITTED_FOR_APPROVAL') {
    await workflow.markLead(current.lead?.id, 'COSTING_SUBMITTED', 'Costing Review', user.id, 'Costing submitted');
    await workflow.notify(await workflow.usersByKind(['PM']), `Costing submitted: ${current.lead?.title || current.costingCode}`, 'Costing is waiting for PM approval.', `/solution-costing/${id}`);
  }
  if (target === 'APPROVED') await workflow.markLead(current.lead?.id, 'COSTING_APPROVED', 'Quotation', user.id, 'Costing approved');
  if (target === 'CHANGES_REQUESTED') await workflow.markLead(current.lead?.id, 'COSTING_CHANGES_REQUESTED', 'Procurement & Costing', user.id, 'Costing changes requested');
  return present(await getOrThrow(id), user);
}

async function submitReview(id, user) {
  return moveStatus(id, user, 'INTERNAL_REVIEW', 'Submitted for Review', 'INTERNAL_REVIEW', '');
}

async function submitApproval(id, user, comments) {
  return moveStatus(id, user, 'SUBMITTED_FOR_APPROVAL', 'Submitted for Approval', 'SUBMITTED_FOR_APPROVAL', comments || '');
}

async function decide(id, body, user) {
  const action = body?.action;
  const note = String(body?.note || '').trim();
  if (action === 'approve') return moveStatus(id, user, 'APPROVED', 'Approved', 'APPROVED', note);
  if (action === 'changes') {
    if (!note) throw new ApiError(422, 'Add a comment when requesting changes.');
    return moveStatus(id, user, 'CHANGES_REQUESTED', 'Changes Requested', 'CHANGES_REQUESTED', note);
  }
  if (action === 'reject') {
    if (!note) throw new ApiError(422, 'A rejection reason is required.');
    return moveStatus(id, user, 'REJECTED', 'Rejected', 'REJECTED', note);
  }
  throw new ApiError(400, 'Choose approve, changes, or reject.');
}

async function remove(id, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canDelete) throw new ApiError(403, 'Only a draft or in-progress costing can be deleted.');
  if ((current.versions || []).some((item) => ['APPROVED', 'SUBMITTED_FOR_APPROVAL'].includes(item.status))) {
    throw new ApiError(409, 'Approved costing versions are kept.');
  }
  await repository.removeCosting(id);
}

async function addDocuments(id, files, body, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canSave || !current.version) throw new ApiError(403, 'You cannot attach documents to this costing.');
  const documentType = DOCUMENT_TYPES.has(body.documentType) ? body.documentType : 'Other';
  for (const file of files) {
    await repository.addDocument(current.version.id, {
      originalName: file.originalname,
      storedName: file.filename,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      documentType,
      uploadedBy: user.id,
    });
  }
  if (files.length) await repository.addActivity(id, current.version.id, user.id, 'Document Uploaded');
  return present(await getOrThrow(id), user);
}

async function openDocument(id, documentId) {
  const row = await repository.findDocument(id, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  const folder = row.source_feasibility_id
    ? path.join(__dirname, '..', 'uploads', 'feasibility', row.source_feasibility_id)
    : uploadDir(id);
  const filePath = path.join(folder, row.stored_name);
  if (!row.stored_name || !fs.existsSync(filePath)) throw new ApiError(404, 'Document file is missing.');
  return { filePath, name: row.original_name, mimeType: row.mime_type || 'application/octet-stream' };
}

async function removeDocument(id, documentId, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  const row = await repository.findDocument(id, documentId);
  if (!row) throw new ApiError(404, 'Document not found.');
  if (!access.canSave && row.uploaded_by !== user.id) throw new ApiError(403, 'You cannot delete this document.');
  const shared = row.stored_name ? await repository.storedNameCount(row.stored_name) : 0;
  const removed = await repository.removeDocument(id, documentId);
  if (removed && !removed.source_document_id && removed.stored_name && shared <= 1) {
    fs.rmSync(path.join(uploadDir(id), removed.stored_name), { force: true });
  }
  await repository.addActivity(id, current.version.id, user.id, 'Document Deleted');
  return present(await getOrThrow(id), user);
}

async function importBom(id, rows, user) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canEditBom || !current.version) throw new ApiError(403, 'You cannot import a BOM into this costing.');
  if (!Array.isArray(rows) || !rows.length) throw new ApiError(422, 'The BOM file has no data rows.');
  const errors = [];
  rows.forEach((row, index) => {
    const line = index + 2;
    if (!String(row?.component || '').trim()) errors.push(`Row ${line}: Component is required.`);
    if (!Number.isFinite(Number(row?.quantity))) errors.push(`Row ${line}: Quantity must be a number.`);
    if (!Number.isFinite(Number(row?.unitCost))) errors.push(`Row ${line}: Unit Cost must be a number.`);
  });
  if (errors.length) throw new ApiError(422, 'BOM import was rejected. Fix the file and try again.', { fields: errors.slice(0, 12) });
  const fields = scopedFields(current, normalizeVersion({ ...current.version, bom: rows }), access);
  await repository.saveVersion(current.version.id, fields);
  await repository.addActivity(id, current.version.id, user.id, 'BOM Updated');
  await repository.addAudit(id, current.version.id, user.id, 'BOM import', `${(current.version.bom || []).length} lines`, `${rows.length} lines`);
  return present(await getOrThrow(id), user);
}

function bomCsv(costing) {
  const headers = ['Item No.', 'Category', 'Component', 'Description', 'Specification', 'Manufacturer', 'Part Number', 'Supplier', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', 'Lead Time', 'Remarks', 'Quotation Reference', 'Quoted Price', 'Currency', 'Quote Date', 'Quote Validity', 'Purchase Status'];
  const lines = [headers];
  for (const row of costing.version?.bom || []) {
    const total = money(Number(row.quantity) * Number(row.unitCost));
    lines.push([
      row.itemNo, row.category, row.component, row.description, row.specification, row.manufacturer, row.partNumber,
      row.supplier, row.quantity, row.unit, row.unitCost, total, row.leadTime, row.remarks, row.quotationReference,
      row.quotedPrice, costing.version.currency, row.quoteDate, row.quoteValidity, row.purchaseStatus,
    ]);
  }
  return lines.map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
}

const PROJECT_TYPES = new Set(['Delivery', 'Automation', 'Robotics', 'Vision', 'Software', 'R&D', 'Internal', 'Implementation', 'Service']);
const PROJECT_STATUSES = new Set(['NOT_STARTED', 'PLANNING', 'IN_PROGRESS', 'AT_RISK', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'READY_FOR_EXECUTION', 'ASSIGNED', 'TEAM_REVIEW', 'TASK_BREAKDOWN', 'COMPLETION_SUBMITTED', 'HANDOVER']);
const PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
const TEAMS = new Set(['vision', 'robotics', 'software', 'procurement', 'execution']);
const PAYMENT_STATUSES = new Set([
  'AWAITING_PAYMENT', 'PARTIALLY_PAID', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE', 'CREDIT_APPROVED', 'WAIVED',
]);
const STATUS_LABEL = {
  NOT_STARTED: 'Not Started',
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  AT_RISK: 'At Risk',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  READY_FOR_EXECUTION: 'Ready for Execution',
};

function isActiveProject(project) {
  return Boolean(project.isActivated) && project.status !== 'CANCELLED';
}

function projectSummary(projects) {
  const today = new Date().toISOString().slice(0, 10);
  const open = projects.filter((project) => project.status !== 'CANCELLED');
  const nearing = open.filter((project) => {
    if (!project.targetDate || project.status === 'COMPLETED') return false;
    const days = (new Date(`${project.targetDate}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000;
    return days >= 0 && days <= 14;
  });
  return {
    total: open.length,
    planning: open.filter((project) => project.status === 'PLANNING' || project.status === 'READY_FOR_EXECUTION').length,
    notStarted: open.filter((project) => project.status === 'NOT_STARTED').length,
    inProgress: open.filter((project) => ['IN_PROGRESS', 'ASSIGNED', 'TEAM_REVIEW', 'TASK_BREAKDOWN', 'AT_RISK'].includes(project.status)).length,
    onHold: open.filter((project) => project.status === 'ON_HOLD').length,
    completed: open.filter((project) => project.status === 'COMPLETED').length,
    overdue: open.filter((project) => project.overdue).length,
    nearingDeadline: nearing.length,
    awaitingPayment: open.filter((project) => !project.isActivated && ['AWAITING_PAYMENT', 'PAYMENT_OVERDUE', ''].includes(project.paymentStatus || '')).length,
    activated: open.filter((project) => project.isActivated).length,
  };
}

function projectAccess(user) {
  const code = user?.role?.code || '';
  const manage = ['admin', 'super_admin', 'project_manager', 'management', 'employee'].includes(code);
  const create = manage || roleAccess(user, 'APPROVED').canConvert;
  return { canEdit: manage, canDelete: manage, canComplete: manage, canPlan: manage, canCreate: create };
}

function cleanDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

async function convert(id, user, body = {}) {
  const current = await getOrThrow(id);
  const access = roleAccess(user, current.version?.status || 'DRAFT');
  if (!access.canConvert) throw new ApiError(409, 'Convert to a project after this costing version is approved.');
  const workflow = require('./workflow.service');
  if (!(await workflow.acceptedQuotation(current.lead?.id))) {
    throw new ApiError(409, 'Convert a lead only after the customer accepts the quotation.');
  }
  const title = String(body.title || current.version?.solutionName || current.lead?.title || '').trim();
  const startDate = cleanDate(body.startDate);
  const projectManagerId = String(body.projectManagerId || '').trim();
  if (!title || !startDate || !/^[0-9a-f-]{36}$/i.test(projectManagerId)) {
    throw new ApiError(400, 'Project name, project manager, and start date are required.');
  }
  const quote = calculateQuote(current.version, current.version?.bom, current.version?.entries);
  const created = await repository.convertProject(current, user.id, {
    title: title.slice(0, 200),
    priority: PRIORITIES.has(body.priority) ? body.priority : 'MEDIUM',
    projectManagerId,
    startDate,
    targetDate: cleanDate(body.targetDate),
    description: String(body.description || '').trim().slice(0, 4000),
    siteLocation: String(body.siteLocation || current.lead?.siteLocation || '').trim().slice(0, 300),
    customerContact: String(body.customerContact || current.lead?.contactPerson || '').trim().slice(0, 200),
    approvedValue: quote.finalQuote,
    projectType: PROJECT_TYPES.has(body.projectType) ? body.projectType : '',
  });
  if (created.alreadyExisted && created.hadOrder) {
    throw new ApiError(409, `This lead has already been converted to Project ${created.projectCode}.`, { projectId: created.id, projectCode: created.projectCode });
  }
  await repository.addActivity(id, current.version.id, user.id, 'Converted to Project');
  await workflow.markLead(current.lead?.id, 'CONVERTED', 'Active Project', user.id, `Converted to ${created.projectCode}`);
  await workflow.record('project', created.id, 'LEAD_CONVERTED', user.id, created.projectCode);
  // Ensure Active Projects listing even if the order row already existed without activation.
  if (!created.activated) {
    await repository.activateProject(created.id, user.id).catch(() => null);
  }
  return {
    projectId: created.id,
    projectCode: created.projectCode,
    orderCode: created.orderCode || null,
    promoted: Boolean(created.promoted),
    activated: true,
    costing: present(await getOrThrow(id), user),
  };
}

const HUB_TEAMS = [
  { code: 'software', label: 'Software Team', pattern: /software/i },
  { code: 'robotics', label: 'Robotics Team', pattern: /robot/i },
  { code: 'procurement', label: 'Procurement Team', pattern: /procur|costing/i },
  { code: 'execution', label: 'Execution Team', pattern: /execut/i },
  { code: 'vision', label: 'Vision Team', pattern: /vision/i },
];

function hubTeamFor(row) {
  const text = `${row.code || ''} ${row.name || ''}`;
  return HUB_TEAMS.find((team) => team.code === String(row.code || '').toLowerCase() || team.pattern.test(text)) || null;
}

async function projectHub() {
  const [projects, directory] = await Promise.all([
    repository.listProjects(),
    repository.projectDirectory(),
  ]);
  const active = projects.filter((project) => isActiveProject(project));
  const chosen = new Map();
  directory.teams.forEach((team) => {
    const family = hubTeamFor(team);
    if (!family || chosen.has(family.code)) return;
    if (String(team.code).toLowerCase() === family.code || !chosen.has(family.code)) chosen.set(family.code, team);
  });
  HUB_TEAMS.forEach((family) => {
    const exact = directory.teams.find((team) => String(team.code).toLowerCase() === family.code);
    if (exact) chosen.set(family.code, exact);
  });
  const today = new Date().toISOString().slice(0, 10);
  return {
    teams: HUB_TEAMS.map((family) => {
      const team = chosen.get(family.code);
      const teamId = team?.id || '';
      const code = String(team?.code || family.code).toLowerCase();
      const owned = active.filter((project) => {
        const codes = String(project.teams || '').toLowerCase().split(',').map((item) => item.trim());
        return String(project.teamCode || '').toLowerCase() === code || codes.includes(code) || codes.some((item) => family.pattern.test(item));
      });
      const projectIds = new Set(owned.map((project) => project.id));
      const tasks = directory.tasks.filter((task) => projectIds.has(task.project_id) && (task.team_code === code || family.pattern.test(task.team_code || '')));
      const open = tasks.filter((task) => task.status !== 'COMPLETED');
      const overdue = open.filter((task) => {
        const end = task.end_date instanceof Date ? task.end_date.toISOString().slice(0, 10) : String(task.end_date || '').slice(0, 10);
        return end && end < today;
      });
      const progressValues = owned.map((project) => project.progress).filter((value) => value != null);
      const members = directory.members.filter((member) => member.team_id === teamId).map((member) => ({
        id: member.user_id,
        name: member.full_name,
        role: member.role,
      }));
      return {
        id: teamId || family.code,
        code: family.code,
        name: team?.name || family.label,
        leadId: team?.lead_id || '',
        leadName: team?.lead_name || 'Not assigned',
        activeProjects: owned.length,
        openTasks: open.length,
        overdueTasks: overdue.length,
        progress: progressValues.length ? Math.round(progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) : 0,
        members,
        projects: owned.map((project) => ({
          id: project.id,
          projectCode: project.projectCode,
          title: project.title,
          customerName: project.customerName,
          projectManager: project.projectManager,
          teams: project.teams || team?.name || family.label,
          status: project.status,
          priority: project.priority,
          progress: project.progress || 0,
          deadline: project.targetDate,
        })),
      };
    }),
  };
}

async function listProjects(view, user) {
  const projects = await repository.listProjects();
  const managers = (await userRepository.listActive()).map(toPublicUser).map((person) => ({
    id: person.id,
    fullName: person.fullName,
    roleName: person.role?.name || '',
  }));
  const activity = await repository.listRecentActivity(8);
  // Active Projects: confirmed-order activation only. Projects: all pre-sales + planning (incl. manual).
  const scoped = view === 'active'
    ? projects.filter((project) => isActiveProject(project))
    : projects.filter((project) => project.status !== 'CANCELLED' || Boolean(project.orderCode));
  let dependencyOptions = [];
  try {
    dependencyOptions = await repository.listDependencyOptions();
  } catch {
    dependencyOptions = [];
  }
  return {
    projects: scoped,
    managers,
    activity,
    summary: projectSummary(scoped),
    view: view === 'active' ? 'active' : 'all',
    access: projectAccess(user),
    lifecycleStages: Object.entries(repository.STAGE_LABELS || {}).map(([value, label]) => ({ value, label })),
    dependencyOptions,
  };
}

async function createProject(user, body = {}) {
  const access = projectAccess(user);
  if (!access.canCreate && !roleAccess(user, 'APPROVED').canConvert) {
    throw new ApiError(403, 'You cannot create projects.');
  }
  const title = String(body.title || body.projectName || '').trim();
  const startDate = cleanDate(body.startDate || body.plannedStartDate);
  const targetDate = cleanDate(body.targetDate || body.endDate || body.expectedCompletionDate);
  if (!title) throw new ApiError(400, 'Project name is required.');
  if (!startDate) throw new ApiError(400, 'Start date is required.');
  if (!targetDate) throw new ApiError(400, 'End date is required.');
  if (targetDate < startDate) throw new ApiError(400, 'End date must be on or after the start date.');

  const rawDeps = Array.isArray(body.dependencyIds)
    ? body.dependencyIds
    : Array.isArray(body.dependencies)
      ? body.dependencies
      : [];
  const dependencyIds = [...new Set(rawDeps.map((value) => String(value || '').trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (dependencyIds.length) {
    const { query } = require('../db');
    const found = await query('SELECT id FROM users WHERE id = ANY($1::uuid[])', [dependencyIds]);
    if (found.rows.length !== dependencyIds.length) {
      throw new ApiError(400, 'One or more selected dependencies are not valid employees.');
    }
  }

  const created = await repository.createManualProject(user.id, {
    title: title.slice(0, 200),
    customerName: String(body.customerName || '').trim().slice(0, 200) || 'Internal',
    description: String(body.description || '').trim().slice(0, 4000) || '',
    ownerId: user.id,
    projectManagerId: dependencyIds[0] || user.id,
    projectType: PROJECT_TYPES.has(body.projectType) ? body.projectType : 'Internal',
    lifecycleStage: 'PROJECT_CREATED',
    priority: 'MEDIUM',
    startDate,
    targetDate,
    dependencyIds,
  });
  if (created.alreadyExisted) {
    throw new ApiError(409, `A project already exists for this lead (${created.projectCode}).`, {
      projectId: created.id,
      projectCode: created.projectCode,
    });
  }
  return getProject(created.id, user);
}

async function queryLead(leadId) {
  const { query } = require('../db');
  const result = await query('SELECT id FROM leads WHERE id = $1', [leadId]);
  return result.rows[0] || null;
}

async function confirmPayment(id, user, body = {}) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const access = roleAccess(user, 'APPROVED');
  if (!access.canConvert) throw new ApiError(403, 'You cannot confirm payment for this project.');
  if (!project.orderCode && !project.leadId) {
    throw new ApiError(409, 'Convert the lead to an order before recording payment.');
  }
  const paymentStatus = PAYMENT_STATUSES.has(body.paymentStatus) ? body.paymentStatus : 'PAYMENT_CONFIRMED';
  await repository.confirmPayment(id, user.id, {
    paymentStatus,
    paymentReference: body.paymentReference,
    paymentNotes: body.paymentNotes,
    orderCode: project.orderCode,
  });
  if (body.activate !== false && repository.ACTIVATION_PAYMENT.has(paymentStatus)) {
    const activation = await repository.activateProject(id, user.id);
    if (!activation.ok && !activation.alreadyActivated) {
      // Payment saved; activation blocked only if status still ineligible.
    }
  }
  return getProject(id, user);
}

async function activateProject(id, user) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const access = roleAccess(user, 'APPROVED');
  if (!access.canConvert) throw new ApiError(403, 'You cannot activate this project.');
  if (project.isActivated) return getProject(id, user);
  const result = await repository.activateProject(id, user.id);
  if (!result.ok) throw new ApiError(409, result.reason || 'This project cannot be activated yet.');
  return getProject(id, user);
}

async function getProject(id, user) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const costing = project.costingId ? present(await getOrThrow(project.costingId), user) : null;
  const [activity, documents] = await Promise.all([
    repository.listProjectActivity(id),
    planningRepository.listDocuments(id),
  ]);
  return { ...project, costing, activity, documents, access: projectAccess(user) };
}

async function eligibleOpportunities(user) {
  const access = roleAccess(user, 'APPROVED');
  if (!access.canConvert) return [];
  return repository.eligibleOpportunities();
}

async function updateProject(id, user, body = {}) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const access = projectAccess(user);
  if (!access.canEdit && !roleAccess(user, 'APPROVED').canConvert) {
    throw new ApiError(403, 'You cannot edit this project.');
  }
  const title = String(body.title || '').trim();
  const projectManagerId = String(body.projectManagerId || project.projectManagerId || '').trim();
  if (!title) throw new ApiError(400, 'Project name is required.');
  if (!/^[0-9a-f-]{36}$/i.test(projectManagerId)) {
    throw new ApiError(400, 'Project name and project manager are required.');
  }
  const teamCode = String(body.teamCode ?? project.teamCode ?? '').trim();
  if (teamCode) await require('../services/team.service').assertTeamCode(teamCode);
  const projectCode = String(body.projectCode || project.projectCode || '').trim().slice(0, 20);
  if (!projectCode) throw new ApiError(400, 'Project code is required.');
  const lifecycleStage = body.lifecycleStage != null
    ? String(body.lifecycleStage).trim()
    : project.lifecycleStage;
  if (lifecycleStage && !repository.LIFECYCLE_STAGES.has(lifecycleStage)) {
    throw new ApiError(400, 'Lifecycle stage is not valid.');
  }
  let leadId = body.leadId !== undefined ? String(body.leadId || '').trim() || null : undefined;
  if (leadId) {
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) throw new ApiError(400, 'Lead ID is not valid.');
    const lead = await queryLead(leadId);
    if (!lead) throw new ApiError(404, 'Linked lead was not found.');
  }
  const ownerId = body.ownerId != null
    ? String(body.ownerId || '').trim()
    : project.ownerId;
  if (ownerId && !/^[0-9a-f-]{36}$/i.test(ownerId)) {
    throw new ApiError(400, 'Project owner is not valid.');
  }
  let updated;
  try {
    updated = await repository.updateProject(id, {
      title: title.slice(0, 200),
      description: String(body.description ?? project.description ?? '').trim().slice(0, 4000),
      projectManagerId,
      priority: PRIORITIES.has(body.priority) ? body.priority : project.priority,
      startDate: cleanDate(body.startDate ?? project.startDate),
      targetDate: cleanDate(body.targetDate ?? project.targetDate),
      projectType: PROJECT_TYPES.has(body.projectType) ? body.projectType : (project.projectType || ''),
      customerName: String(body.customerName ?? project.customerName ?? '').trim().slice(0, 200),
      department: String(body.department ?? project.department ?? '').trim().slice(0, 100),
      teamCode,
      projectCode,
      customerContact: String(body.customerContact ?? project.customerContact ?? '').trim().slice(0, 200),
      leadId,
      lifecycleStage,
      ownerId: ownerId || null,
      enquiryReference: body.enquiryReference !== undefined
        ? String(body.enquiryReference || '').trim().slice(0, 200)
        : project.enquiryReference,
      customerRequirements: body.customerRequirements !== undefined
        ? String(body.customerRequirements || '').trim().slice(0, 4000)
        : project.customerRequirements,
      estimatedBudget: body.estimatedBudget !== undefined
        ? (body.estimatedBudget === '' || body.estimatedBudget == null ? null : Number(body.estimatedBudget))
        : project.estimatedBudget,
      expectedOrderValue: body.expectedOrderValue !== undefined
        ? (body.expectedOrderValue === '' || body.expectedOrderValue == null ? null : Number(body.expectedOrderValue))
        : project.expectedOrderValue,
      notes: body.notes !== undefined
        ? String(body.notes || '').trim().slice(0, 4000)
        : project.notes,
    }, user.id);
  } catch (error) {
    if (error.code === '23505') throw new ApiError(409, 'That project code is already in use.');
    throw error;
  }
  return getProject(updated.id, user);
}

async function deleteProject(id, user) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const access = projectAccess(user);
  if (!access.canDelete && !roleAccess(user, 'APPROVED').canConvert) {
    throw new ApiError(403, 'You cannot delete this project.');
  }
  if (project.isActivated || project.orderCode) {
    throw new ApiError(409, 'Activated or order-linked projects cannot be deleted. Cancel them instead.');
  }
  if (project.costingId) {
    throw new ApiError(409, 'Projects linked to solution costing cannot be deleted.');
  }
  const removed = await repository.deleteProject(id);
  if (!removed) throw new ApiError(409, 'This project could not be deleted.');
  return { id };
}

async function updateProjectStatus(id, user, body = {}) {
  const project = await repository.findProject(id);
  if (!project) throw new ApiError(404, 'Project not found.');
  const access = roleAccess(user, 'APPROVED');
  if (!access.canConvert) throw new ApiError(403, 'You cannot update this project status.');
  const status = String(body.status || '');
  if (!PROJECT_STATUSES.has(status) || status === project.status) {
    throw new ApiError(400, 'Choose a different project status.');
  }
  const holdReason = String(body.holdReason || '').trim();
  const riskReason = String(body.riskReason || '').trim();
  const completionRemarks = String(body.completionRemarks || '').trim();
  const completionDate = cleanDate(body.completionDate);
  const nextStart = cleanDate(body.startDate ?? project.startDate);
  const nextDeadline = cleanDate(body.targetDate ?? project.targetDate);
  if (nextStart && nextDeadline && nextDeadline < nextStart) {
    throw new ApiError(400, 'Project start date must be on or before the project deadline.');
  }
  if (status === 'ON_HOLD' && !holdReason) throw new ApiError(400, 'A hold reason is required.');
  if (status === 'AT_RISK' && !riskReason) throw new ApiError(400, 'A risk reason is required.');
  if (status === 'COMPLETED' && !completionDate) throw new ApiError(400, 'A completion date is required.');
  if (status === 'COMPLETED') {
    const open = await require('../db').query(
      `SELECT COUNT(*)::int AS total FROM project_tasks WHERE project_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
      [id],
    );
    if (open.rows[0].total) throw new ApiError(409, 'Complete the remaining tasks before closing this project.');
    if (project.status !== 'HANDOVER' && project.status !== 'COMPLETION_SUBMITTED') {
      throw new ApiError(409, 'Complete team validation, PM review, and handover before closing this project.');
    }
  }
  const updated = await repository.updateProjectStatus(id, {
    status,
    holdReason: status === 'ON_HOLD' ? holdReason : project.holdReason,
    riskReason: status === 'AT_RISK' ? riskReason : project.riskReason,
    completionDate: status === 'COMPLETED' ? completionDate : project.completionDate || null,
    completionRemarks: status === 'COMPLETED' ? completionRemarks : project.completionRemarks,
    comment: holdReason || riskReason || completionRemarks,
    action: `Project status changed to ${STATUS_LABEL[status] || status}`,
  }, user.id);
  return getProject(updated.id, user);
}

module.exports = {
  create,
  list,
  sources,
  get,
  save,
  duplicate,
  submitReview,
  submitApproval,
  decide,
  remove,
  addDocuments,
  openDocument,
  removeDocument,
  importBom,
  bomCsv,
  convert,
  listProjects,
  createProject,
  projectHub,
  getProject,
  updateProjectStatus,
  eligibleOpportunities,
  updateProject,
  deleteProject,
  confirmPayment,
  activateProject,
  uploadDir,
};
