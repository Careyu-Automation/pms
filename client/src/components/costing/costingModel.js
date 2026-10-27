export const COSTING_STATUSES = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  INTERNAL_REVIEW: { label: 'Internal Review', tone: 'review' },
  CHANGES_REQUESTED: { label: 'Changes Requested', tone: 'warning' },
  SUBMITTED_FOR_APPROVAL: { label: 'Submitted for Approval', tone: 'pending' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  SUPERSEDED: { label: 'Superseded', tone: 'hold' },
};

export const COMPONENT_CATEGORIES = [
  'Mechanical', 'Robotics', 'Vision', 'Electrical', 'Controls / PLC', 'Software', 'AI / ML', 'Safety',
  'Conveyors / Material Handling', 'Integration', 'Installation', 'Commissioning', 'Other',
];

export const BOM_CATEGORIES = [
  'Robotics', 'Vision', 'PLC', 'HMI', 'Sensors', 'Pneumatics', 'Mechanical', 'Electrical', 'Safety', 'Software', 'Miscellaneous',
];

export const PURCHASE_STATUSES = [
  ['NOT_REQUESTED', 'Not requested'],
  ['RFQ_SENT', 'RFQ sent'],
  ['QUOTE_RECEIVED', 'Quote received'],
  ['UNDER_REVIEW', 'Under review'],
  ['ORDERED', 'Ordered'],
  ['RECEIVED', 'Received'],
];

export const DOCUMENT_TYPES = [
  'Vendor Quote', 'BOM', 'Technical Drawing', 'Solution Architecture', 'Supplier Offer',
  'Customer RFQ', 'Previous Quotation', 'Calculation Sheet', 'Other',
];

export const TEAM_LABELS = {
  software: 'Software',
  robotics: 'Robotics',
  vision: 'Vision',
  procurement: 'Procurement',
  execution: 'Execution',
};

export const TABS = [
  ['overview', 'Overview'],
  ['design', 'Solution Design'],
  ['bom', 'BOM'],
  ['vendors', 'Vendors'],
  ['costs', 'Cost Breakdown'],
  ['commercial', 'Commercial'],
  ['scope', 'Scope & Assumptions'],
  ['risks', 'Risks'],
  ['documents', 'Documents'],
  ['quotation', 'Quotation'],
  ['approval', 'Approval'],
  ['activity', 'Activity'],
];

export function costingStage(status) {
  const stages = ['Draft', 'Review', 'Approval', 'Quotation'];
  const index = status === 'APPROVED' || status === 'SUPERSEDED'
    ? 3
    : status === 'SUBMITTED_FOR_APPROVAL' || status === 'REJECTED'
      ? 2
      : status === 'INTERNAL_REVIEW' || status === 'CHANGES_REQUESTED'
        ? 1
        : 0;
  return stages.map((label, stageIndex) => ({
    label,
    state: stageIndex < index ? 'done' : stageIndex === index ? 'current' : 'upcoming',
  }));
}

const SYMBOLS = { INR: '₹', USD: '$', EUR: '€' };

export function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * 100) / 100;
}

export function formatMoney(amount, currency = 'INR') {
  const formatted = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(money(amount));
  return `${SYMBOLS[currency] || ''}${formatted}`;
}

export function statusMeta(status) {
  return COSTING_STATUSES[status] || { label: status || 'Draft', tone: 'neutral' };
}

export function lineCost(entry) {
  if (entry.mode === 'HOURS') return money(Number(entry.hours) * Number(entry.rate));
  return money(entry.amount);
}

export function bomLineTotal(row) {
  return money(Number(row.quantity) * Number(row.unitCost));
}

export function calculateQuote(version) {
  const sections = {
    mechanical: 0, electrical: 0, software: 0, robotics: 0, vision: 0,
    fabrication: 0, installation: 0, testing: 0, other: 0,
  };
  for (const entry of version?.entries || []) {
    if (!Object.prototype.hasOwnProperty.call(sections, entry.section)) continue;
    sections[entry.section] = money(sections[entry.section] + lineCost(entry));
  }
  const material = money((version?.bom || []).reduce((sum, row) => sum + bomLineTotal(row), 0));
  const engineeringOther = money(Object.values(sections).reduce((sum, value) => sum + value, 0));
  const direct = material;
  const subtotal = money(direct + engineeringOther);
  const contingencyPercent = money(version?.contingencyPercent);
  const overheadPercent = money(version?.overheadPercent);
  const marginPercent = money(version?.marginPercent);
  const taxPercent = money(version?.taxPercent);
  const contingency = money(subtotal * contingencyPercent / 100);
  const overheadBase = version?.overheadBase === 'DIRECT' ? 'DIRECT' : 'SUBTOTAL';
  const overheadBaseAmount = overheadBase === 'DIRECT' ? direct : subtotal;
  const overhead = money(overheadBaseAmount * overheadPercent / 100);
  const totalInternal = money(subtotal + contingency + overhead);
  const margin = money(totalInternal * marginPercent / 100);
  const selling = money(totalInternal + margin);
  const tax = money(selling * taxPercent / 100);
  return {
    material,
    sections,
    engineering: money(sections.mechanical + sections.electrical),
    direct,
    engineeringOther,
    subtotal,
    contingencyPercent,
    contingency,
    overheadPercent,
    overheadBase,
    overheadBaseAmount,
    overhead,
    totalInternal,
    marginPercent,
    margin,
    selling,
    taxPercent,
    tax,
    finalQuote: money(selling + tax),
    riskExposure: money((version?.risks || []).reduce((sum, risk) => sum + money(risk.costImpact), 0)),
  };
}

export function emptyBomRow(itemNo) {
  return {
    itemNo,
    category: 'Miscellaneous',
    component: '',
    description: '',
    specification: '',
    manufacturer: '',
    partNumber: '',
    supplier: '',
    quantity: 1,
    unit: 'Nos',
    unitCost: 0,
    leadTime: '',
    remarks: '',
    quotationReference: '',
    quotedPrice: '',
    quoteDate: '',
    quoteValidity: '',
    purchaseStatus: 'NOT_REQUESTED',
  };
}

export const SECTION_LABELS = {
  mechanical: 'Mechanical engineering',
  electrical: 'Electrical',
  software: 'Software',
  robotics: 'Robotics',
  vision: 'Vision / AI',
  fabrication: 'Fabrication',
  installation: 'Installation',
  testing: 'Testing / POC',
  other: 'Other',
};
