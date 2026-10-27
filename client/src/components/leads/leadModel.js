export const LEAD_STATUSES = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED_TO_PM: { label: 'Submitted to PM', tone: 'info' },
  PM_REVIEW: { label: 'PM Review', tone: 'info' },
  CHANGES_REQUESTED: { label: 'Changes Requested', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'hold' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  READY_FOR_TEAM_ASSIGNMENT: { label: 'Ready for team assignment', tone: 'info' },
  PM_APPROVED: { label: 'PM Approved', tone: 'completed' },
  FEASIBILITY: { label: 'Feasibility', tone: 'info' },
  FEASIBILITY_SUBMITTED: { label: 'Feasibility with PM', tone: 'info' },
  FEASIBILITY_CHANGES_REQUESTED: { label: 'Feasibility changes', tone: 'warning' },
  FEASIBILITY_APPROVED: { label: 'Feasibility approved', tone: 'completed' },
  COSTING: { label: 'Procurement & costing', tone: 'info' },
  COSTING_SUBMITTED: { label: 'Costing with PM', tone: 'info' },
  COSTING_CHANGES_REQUESTED: { label: 'Costing changes', tone: 'warning' },
  COSTING_APPROVED: { label: 'Costing approved', tone: 'completed' },
  QUOTATION: { label: 'Quotation', tone: 'info' },
  NEGOTIATION: { label: 'Negotiation', tone: 'warning' },
  WON: { label: 'Won', tone: 'completed' },
  LOST: { label: 'Lost', tone: 'danger' },
  CONVERTED: { label: 'Converted', tone: 'completed' },
};

export const WORKFLOW_STEPS = [
  'Project input',
  'PM review',
  'Team assignment',
  'Feasibility',
  'Costing',
  'Quotation',
  'Negotiation',
  'Order',
];

export const PRIORITIES = ['Low', 'Medium', 'High'];
export const VISIT_OPTIONS = ['No Visit Required', 'Visit Required', 'Visit Scheduled'];
export const CUSTOMER_TYPES = ['OEM', 'End customer', 'System integrator', 'Other'];
export const BUSINESS_VERTICALS = [
  'Automotive',
  'Electronics',
  'Pharmaceutical',
  'FMCG',
  'General manufacturing',
  'Other',
];

export const TECHNICAL_FIELDS = [
  ['industry', 'Industry / Process'],
  ['currentProcess', 'Current Process'],
  ['expectedAutomation', 'Expected Automation'],
  ['customerObjective', 'Customer Objective'],
  ['timeline', 'Expected Project Timeline'],
  ['targetDate', 'Customer Target Date'],
  ['productionRate', 'Production Rate'],
  ['cycleTime', 'Cycle Time'],
  ['shiftPattern', 'Shift Pattern'],
  ['operatingHours', 'Operating Hours'],
  ['existingEquipment', 'Existing Equipment'],
  ['existingAutomation', 'Existing Automation'],
  ['integrationRequirements', 'Integration Requirements'],
  ['machineDimensions', 'Machine Dimensions'],
  ['payload', 'Payload'],
  ['accuracy', 'Accuracy Requirement'],
  ['environment', 'Environment Conditions'],
  ['budget', 'Customer Budget'],
  ['expectedPoDate', 'Expected PO Date'],
  ['technicalSpecifications', 'Technical Specifications'],
  ['technicalAssumptions', 'Technical Assumptions'],
  ['customerDependencies', 'Customer Dependencies'],
  ['requiredDocumentsNotes', 'Required Documents / Notes'],
];

const EMPTY_DETAILS = Object.fromEntries(TECHNICAL_FIELDS.map(([key]) => [key, '']));

export const EMPTY_LEAD = {
  title: '',
  customerName: '',
  customerType: '',
  businessVertical: '',
  priority: 'Medium',
  expectedDecisionDate: '',
  contactPerson: '',
  designation: '',
  email: '',
  phone: '',
  officeLocation: '',
  siteLocation: '',
  description: '',
  customerRequirement: '',
  useCase: '',
  productionQuantity: '',
  estimatedValue: '',
  requiredSolution: '',
  technicalRequirements: '',
  commercialRequirements: '',
  competitorInfo: '',
  customerChallenge: '',
  remarks: '',
  details: { ...EMPTY_DETAILS },
  customFields: [],
  visitRequirement: 'No Visit Required',
};

const SUBMIT_RULES = [
  ['title', 'Lead title is required.'],
  ['customerName', 'Customer name is required.'],
  ['businessVertical', 'Business vertical is required.'],
  ['contactPerson', 'Contact person is required.'],
  ['designation', 'Designation is required.'],
  ['email', 'Email address is required.'],
  ['phone', 'Phone number is required.'],
  ['description', 'Project description is required.'],
  ['customerRequirement', 'Customer requirement is required.'],
  ['useCase', 'Application / use case is required.'],
  ['productionQuantity', 'Production quantity is required.'],
  ['expectedDecisionDate', 'Expected decision date is required.'],
];

export function canEditLead(status) {
  return status === 'DRAFT' || status === 'CHANGES_REQUESTED';
}

export function canSubmitLead(status) {
  return canEditLead(status);
}

export function canReviewLead(status) {
  return status === 'SUBMITTED_TO_PM' || status === 'PM_REVIEW' || status === 'ON_HOLD';
}

export function workflowStep(status) {
  if (['DRAFT', 'CHANGES_REQUESTED'].includes(status)) return 0;
  if (['SUBMITTED_TO_PM', 'PM_REVIEW', 'ON_HOLD', 'REJECTED'].includes(status)) return 1;
  if (['READY_FOR_TEAM_ASSIGNMENT', 'PM_APPROVED'].includes(status)) return 2;
  if (String(status || '').startsWith('FEASIBILITY')) return 3;
  if (String(status || '').startsWith('COSTING')) return 4;
  if (status === 'QUOTATION') return 5;
  if (['NEGOTIATION', 'WON', 'LOST'].includes(status)) return 6;
  if (status === 'CONVERTED') return 7;
  return 0;
}

export function leadStatusMeta(status) {
  return LEAD_STATUSES[status] || { label: status || 'Draft', tone: 'neutral' };
}

export function toFormValues(lead) {
  if (!lead) return structuredClone(EMPTY_LEAD);
  return {
    ...EMPTY_LEAD,
    ...lead,
    details: { ...EMPTY_DETAILS, ...(lead.details || {}) },
    customFields: Array.isArray(lead.customFields)
      ? lead.customFields.map((field) => ({
        id: field.id || crypto.randomUUID(),
        name: field.name || '',
        value: field.value || '',
      }))
      : [],
    expectedDecisionDate: lead.expectedDecisionDate || '',
  };
}

export function toLeadPayload(values) {
  return {
    title: values.title,
    customerName: values.customerName,
    customerType: values.customerType,
    businessVertical: values.businessVertical,
    priority: values.priority,
    expectedDecisionDate: values.expectedDecisionDate,
    contactPerson: values.contactPerson,
    designation: values.designation,
    email: values.email,
    phone: values.phone,
    officeLocation: values.officeLocation,
    siteLocation: values.siteLocation,
    description: values.description,
    customerRequirement: values.customerRequirement,
    useCase: values.useCase,
    productionQuantity: values.productionQuantity,
    estimatedValue: values.estimatedValue,
    requiredSolution: values.requiredSolution,
    technicalRequirements: values.technicalRequirements,
    commercialRequirements: values.commercialRequirements,
    competitorInfo: values.competitorInfo,
    customerChallenge: values.customerChallenge,
    remarks: values.remarks,
    details: values.details,
    customFields: values.customFields,
    visitRequirement: values.visitRequirement,
  };
}

export function submitFieldErrors(values) {
  const fields = {};
  for (const [key, message] of SUBMIT_RULES) {
    if (!String(values[key] || '').trim()) fields[key] = message;
  }
  if (values.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
    fields.email = 'Enter a valid email address.';
  }
  return fields;
}

export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.dwg,.zip';
