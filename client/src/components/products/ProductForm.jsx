import { useMemo, useState } from 'react';
import { Button } from '../ui/Button';
import { PRODUCT_PRIORITY, PRODUCT_STATUS, validateProduct } from './productModel';

function Field({ label, required, error, wide, children }) {
  return (
    <label className={`${error ? 'field field--error' : 'field'}${wide ? ' is-wide' : ''}`}>
      <span className="field__label">
        {label}
        {required ? <span className="field__required">*</span> : null}
      </span>
      {children}
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  );
}

export function ProductForm({
  mode,
  form,
  setForm,
  teams,
  departments,
  leads,
  serverErrors,
  busy,
  onCancel,
  onSubmit,
}) {
  const [touched, setTouched] = useState({});
  const [leadQuery, setLeadQuery] = useState('');
  const errors = { ...validateProduct(form), ...serverErrors };
  const visible = (key) => (touched[key] ? errors[key] : serverErrors[key]);
  const ready = Object.keys(validateProduct(form)).length === 0 && !Object.keys(serverErrors).length;

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const leadOptions = useMemo(() => {
    const query = leadQuery.trim().toLowerCase();
    const matched = leads.filter((lead) => {
      if (!query) return true;
      return `${lead.leadCode} ${lead.title} ${lead.customerName}`.toLowerCase().includes(query);
    });
    if (form.leadId && !matched.some((lead) => lead.id === form.leadId)) {
      const selected = leads.find((lead) => lead.id === form.leadId);
      if (selected) return [selected, ...matched];
    }
    return matched;
  }, [form.leadId, leadQuery, leads]);

  return (
    <form className="products-form" onSubmit={onSubmit}>
      <div className="products-form__fields">
        <p className="products-form__note is-wide">Internal work with no client — same milestones, plan, and task tracking as a project.</p>
        <Field label="Name" required error={visible('name')}>
          <input className="input" placeholder="Enter product name" value={form.name} onBlur={() => setTouched((current) => ({ ...current, name: true }))} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label="Code" error={visible('productCode') || serverErrors.productCode}>
          <input className="input" placeholder="e.g. FT-01" value={form.productCode} onChange={(event) => set('productCode', event.target.value)} />
        </Field>
        <Field label="Team" required error={visible('teamCode')}>
          <select className="select" value={form.teamCode} onBlur={() => setTouched((current) => ({ ...current, teamCode: true }))} onChange={(event) => set('teamCode', event.target.value)}>
            <option value="">Select team</option>
            {teams.map((team) => <option key={team.code} value={team.code}>{team.name}</option>)}
          </select>
        </Field>
        <Field label="Status" error={visible('status')}>
          <select className="select" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {Object.entries(PRODUCT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Department" error={visible('department')}>
          <select className="select" value={form.department} onChange={(event) => set('department', event.target.value)}>
            <option value="">Optional / None</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="select" value={form.priority} onChange={(event) => set('priority', event.target.value)}>
            {Object.entries(PRODUCT_PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Lead" wide error={visible('leadId')}>
          <input className="input" placeholder="Search lead id, title, or customer" value={leadQuery} onChange={(event) => setLeadQuery(event.target.value)} />
          <select className="select" value={form.leadId} onChange={(event) => set('leadId', event.target.value)}>
            <option value="">No Lead / Internal Product</option>
            {leadOptions.map((lead) => (
              <option key={lead.id} value={lead.id}>{lead.leadCode} — {lead.title || 'Untitled'} — {lead.customerName || 'No customer'}</option>
            ))}
          </select>
        </Field>
        <Field label="Start Date" required error={visible('startDate')}>
          <input className="input" type="date" value={form.startDate} onBlur={() => setTouched((current) => ({ ...current, startDate: true }))} onChange={(event) => set('startDate', event.target.value)} />
        </Field>
        <Field label="End Date" error={visible('endDate') || (form.endDate ? errors.endDate : undefined)}>
          <input className="input" type="date" value={form.endDate} onBlur={() => setTouched((current) => ({ ...current, endDate: true }))} onChange={(event) => set('endDate', event.target.value)} />
        </Field>
        <Field label="Description" wide>
          <textarea className="textarea" rows={4} placeholder="Describe the product..." value={form.description} onChange={(event) => set('description', event.target.value)} />
        </Field>
      </div>
      <div className="products-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={!ready} loading={busy}>
          {busy ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Create Product')}
        </Button>
      </div>
    </form>
  );
}
