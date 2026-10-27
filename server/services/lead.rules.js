const DETAIL_KEYS = [
  'industry',
  'currentProcess',
  'expectedAutomation',
  'customerObjective',
  'timeline',
  'targetDate',
  'productionRate',
  'cycleTime',
  'shiftPattern',
  'operatingHours',
  'existingEquipment',
  'existingAutomation',
  'integrationRequirements',
  'machineDimensions',
  'payload',
  'accuracy',
  'environment',
  'budget',
  'expectedPoDate',
  'technicalSpecifications',
  'technicalAssumptions',
  'customerDependencies',
  'requiredDocumentsNotes',
];

const PRIORITIES = new Set(['Low', 'Medium', 'High']);
const VISITS = new Set(['No Visit Required', 'Visit Required', 'Visit Scheduled']);
const EDITABLE = new Set(['DRAFT', 'CHANGES_REQUESTED']);
const REVIEWABLE = new Set(['SUBMITTED_TO_PM', 'ON_HOLD']);

const SUBMIT_FIELDS = [
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
];

function cleanText(value, max = 4000) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const text = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function normalizeLeadInput(body = {}) {
  const priority = PRIORITIES.has(body.priority) ? body.priority : 'Medium';
  const visit = VISITS.has(body.visitRequirement) ? body.visitRequirement : 'No Visit Required';
  const details = {};
  const source = body.details && typeof body.details === 'object' ? body.details : {};
  for (const key of DETAIL_KEYS) details[key] = cleanText(source[key], 4000);

  const customFields = Array.isArray(body.customFields) ? body.customFields.slice(0, 40).map((field) => ({
    name: cleanText(field?.name, 80),
    value: cleanText(field?.value, 500),
  })).filter((field) => field.name || field.value) : [];

  const expectedDecisionDate = cleanDate(body.expectedDecisionDate);

  return {
    title: cleanText(body.title, 200),
    customerName: cleanText(body.customerName, 200),
    customerType: cleanText(body.customerType, 80),
    businessVertical: cleanText(body.businessVertical, 120),
    priority,
    expectedDecisionDate,
    contactPerson: cleanText(body.contactPerson, 150),
    designation: cleanText(body.designation, 150),
    email: cleanText(body.email, 255).toLowerCase(),
    phone: cleanText(body.phone, 40),
    officeLocation: cleanText(body.officeLocation, 300),
    siteLocation: cleanText(body.siteLocation, 300),
    description: cleanText(body.description, 4000),
    customerRequirement: cleanText(body.customerRequirement, 4000),
    useCase: cleanText(body.useCase, 2000),
    productionQuantity: cleanText(body.productionQuantity, 200),
    estimatedValue: cleanText(body.estimatedValue, 120),
    requiredSolution: cleanText(body.requiredSolution, 2000),
    technicalRequirements: cleanText(body.technicalRequirements, 4000),
    commercialRequirements: cleanText(body.commercialRequirements, 4000),
    competitorInfo: cleanText(body.competitorInfo, 2000),
    customerChallenge: cleanText(body.customerChallenge, 2000),
    remarks: cleanText(body.remarks, 2000),
    details,
    customFields,
    visitRequirement: visit,
  };
}

function submitErrors(input) {
  const fields = {};
  for (const [key, message] of SUBMIT_FIELDS) {
    if (!input[key]) fields[key] = message;
  }
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
    fields.email = 'Enter a valid email address.';
  }
  if (!input.expectedDecisionDate) {
    fields.expectedDecisionDate = 'Expected decision date is required.';
  }
  return fields;
}

module.exports = {
  DETAIL_KEYS,
  EDITABLE,
  REVIEWABLE,
  normalizeLeadInput,
  submitErrors,
};
