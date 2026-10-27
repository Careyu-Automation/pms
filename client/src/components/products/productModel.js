export const PRODUCT_STATUS = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
};

export const PRODUCT_PRIORITY = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

export function todayIso() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function blankProduct() {
  return {
    name: '',
    productCode: '',
    teamCode: '',
    department: '',
    leadId: '',
    status: 'PLANNING',
    priority: 'MEDIUM',
    startDate: todayIso(),
    endDate: '',
    description: '',
  };
}

export function productToForm(product) {
  return {
    name: product.name || '',
    productCode: product.productCode || '',
    teamCode: product.teamCode || '',
    department: product.department || '',
    leadId: product.leadId || '',
    status: product.status || 'PLANNING',
    priority: product.priority || 'MEDIUM',
    startDate: product.startDate || '',
    endDate: product.endDate || '',
    description: product.description || '',
  };
}

export function validateProduct(form) {
  const errors = {};
  const name = form.name.trim();
  if (!name) errors.name = 'Product name is required.';
  else if (name.length < 2) errors.name = 'Product name must be at least 2 characters.';
  if (!form.teamCode) errors.teamCode = 'Team is required.';
  if (!form.startDate) errors.startDate = 'Start date is required.';
  if (form.endDate && form.startDate && form.endDate < form.startDate) {
    errors.endDate = 'End date cannot be before start date.';
  }
  return errors;
}

export function withCurrentLead(leads, product) {
  if (!product || product === 'create' || !product.leadId || leads.some((lead) => lead.id === product.leadId)) {
    return leads;
  }
  return [{
    id: product.leadId,
    leadCode: product.leadCode,
    title: product.leadTitle,
    customerName: product.customerName,
  }, ...leads];
}
