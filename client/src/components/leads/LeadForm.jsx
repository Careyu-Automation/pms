import { useState } from 'react';
import { ChevronDown, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { cx } from '../../utils/cx';
import {
  BUSINESS_VERTICALS,
  CUSTOMER_TYPES,
  DOCUMENT_ACCEPT,
  PRIORITIES,
  TECHNICAL_FIELDS,
  VISIT_OPTIONS,
  toFormValues,
} from './leadModel';

function TextArea({ id, label, required, error, rows = 4, ...props }) {
  return (
    <div className={cx('field', error && 'field--error', 'lead-field--wide')}>
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span className="field__required" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      <textarea id={id} className="textarea" rows={rows} aria-invalid={error ? true : undefined} {...props} />
      {error ? <p className="field__error">{error}</p> : null}
    </div>
  );
}

export function LeadForm({
  mode,
  lead,
  actorName,
  busy,
  errors = {},
  onSaveDraft,
  onSubmit,
}) {
  const [values, setValues] = useState(() => toFormValues(lead));
  const [files, setFiles] = useState([]);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const editing = mode === 'edit';

  function setField(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function setDetail(key, value) {
    setValues((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  }

  function addCustomField() {
    setValues((current) => ({
      ...current,
      customFields: [...current.customFields, { id: crypto.randomUUID(), name: '', value: '' }],
    }));
  }

  function updateCustomField(index, key, value) {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.map((field, itemIndex) => (
        itemIndex === index ? { ...field, [key]: value } : field
      )),
    }));
  }

  function removeCustomField(index) {
    setValues((current) => ({
      ...current,
      customFields: current.customFields.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addFiles(list) {
    const next = [...list].filter((file) => file.size <= 8 * 1024 * 1024);
    setFiles((current) => [...current, ...next].slice(0, 8));
  }

  return (
    <form
      className="lead-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values, files, () => setFiles([]));
      }}
    >
      <section className="lead-section">
        <header className="lead-section__header">
          <h2>Basic lead information</h2>
        </header>
        <div className="lead-grid">
          <Input
            id="lead-code"
            label="Lead ID"
            value={lead?.leadCode || 'Assigned when the draft is saved'}
            readOnly
            disabled
          />
          <Input
            id="lead-title"
            label="Lead title"
            required
            value={values.title}
            error={errors.title}
            onChange={(event) => setField('title', event.target.value)}
          />
          <Input
            id="customer-name"
            label="Customer name"
            required
            value={values.customerName}
            error={errors.customerName}
            onChange={(event) => setField('customerName', event.target.value)}
          />
          <Select
            id="customer-type"
            label="Customer type"
            value={values.customerType}
            onChange={(event) => setField('customerType', event.target.value)}
          >
            <option value="">Select customer type</option>
            {CUSTOMER_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Select
            id="business-vertical"
            label="Business vertical"
            required
            value={values.businessVertical}
            error={errors.businessVertical}
            onChange={(event) => setField('businessVertical', event.target.value)}
          >
            <option value="">Select business vertical</option>
            {BUSINESS_VERTICALS.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Input id="created-by" label="Created by" value={lead?.createdBy || actorName} readOnly disabled />
          <Select
            id="priority"
            label="Priority level"
            value={values.priority}
            onChange={(event) => setField('priority', event.target.value)}
          >
            {PRIORITIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Input
            id="decision-date"
            label="Expected decision date"
            type="date"
            required
            value={values.expectedDecisionDate}
            error={errors.expectedDecisionDate}
            onChange={(event) => setField('expectedDecisionDate', event.target.value)}
          />
        </div>
      </section>

      <section className="lead-section">
        <header className="lead-section__header">
          <h2>Customer contact information</h2>
        </header>
        <div className="lead-grid">
          <Input id="contact-person" label="Contact person" required value={values.contactPerson} error={errors.contactPerson} onChange={(event) => setField('contactPerson', event.target.value)} />
          <Input id="designation" label="Designation" required value={values.designation} error={errors.designation} onChange={(event) => setField('designation', event.target.value)} />
          <Input id="email" label="Email address" type="email" required value={values.email} error={errors.email} onChange={(event) => setField('email', event.target.value)} />
          <Input id="phone" label="Phone number" required value={values.phone} error={errors.phone} onChange={(event) => setField('phone', event.target.value)} />
          <Input id="office-location" label="Customer office location" value={values.officeLocation} onChange={(event) => setField('officeLocation', event.target.value)} />
          <Input id="site-location" label="Plant / site location" value={values.siteLocation} onChange={(event) => setField('siteLocation', event.target.value)} />
        </div>
      </section>

      <section className="lead-section">
        <header className="lead-section__header">
          <h2>Additional project information</h2>
        </header>
        <div className="lead-grid">
          <TextArea id="description" label="Detailed requirement / project description" required rows={5} value={values.description} error={errors.description} onChange={(event) => setField('description', event.target.value)} />
          <TextArea id="customer-requirement" label="Customer requirement" required value={values.customerRequirement} error={errors.customerRequirement} onChange={(event) => setField('customerRequirement', event.target.value)} />
          <Input id="use-case" label="Application / use case" required value={values.useCase} error={errors.useCase} onChange={(event) => setField('useCase', event.target.value)} />
          <Input id="production-quantity" label="Production quantity" required value={values.productionQuantity} error={errors.productionQuantity} onChange={(event) => setField('productionQuantity', event.target.value)} />
          <Input id="estimated-value" label="Estimated project value" value={values.estimatedValue} onChange={(event) => setField('estimatedValue', event.target.value)} />
          <Input id="required-solution" label="Required solution" value={values.requiredSolution} onChange={(event) => setField('requiredSolution', event.target.value)} />
          <TextArea id="technical-requirements" label="Technical requirements" value={values.technicalRequirements} onChange={(event) => setField('technicalRequirements', event.target.value)} />
          <TextArea id="commercial-requirements" label="Commercial requirements" value={values.commercialRequirements} onChange={(event) => setField('commercialRequirements', event.target.value)} />
          <TextArea id="competitor-info" label="Competitor information" value={values.competitorInfo} onChange={(event) => setField('competitorInfo', event.target.value)} />
          <TextArea id="customer-challenge" label="Customer challenge" value={values.customerChallenge} onChange={(event) => setField('customerChallenge', event.target.value)} />
          <TextArea id="remarks" label="Remarks" value={values.remarks} onChange={(event) => setField('remarks', event.target.value)} />
        </div>

        <div className="lead-custom">
          <div className="lead-custom__header">
            <h3>Custom additional fields</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addCustomField}>
              <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
              Add additional field
            </Button>
          </div>
          {values.customFields.map((field, index) => (
            <div className="lead-custom__row" key={field.id}>
              <Input
                id={`custom-name-${index}`}
                label="Field name"
                value={field.name}
                onChange={(event) => updateCustomField(index, 'name', event.target.value)}
              />
              <Input
                id={`custom-value-${index}`}
                label="Field value"
                value={field.value}
                onChange={(event) => updateCustomField(index, 'value', event.target.value)}
              />
              <button type="button" className="icon-button" aria-label="Remove additional field" onClick={() => removeCustomField(index)}>
                <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="lead-section">
        <header className="lead-section__header">
          <h2>Documents</h2>
          <p>PDF, Office, image, text, DWG, or ZIP. Up to 8 MB each. Files are stored with this lead.</p>
        </header>
        <label className="lead-upload">
          <Upload size={18} strokeWidth={1.75} aria-hidden="true" />
          <span>Upload documents</span>
          <input
            type="file"
            multiple
            accept={DOCUMENT_ACCEPT}
            onChange={(event) => {
              addFiles(event.target.files || []);
              event.target.value = '';
            }}
          />
        </label>
        {lead?.documents?.length ? (
          <ul className="lead-files">
            {lead.documents.map((document) => (
              <li key={document.id}>
                <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{document.name}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {files.length ? (
          <ul className="lead-files">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <FileText size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>{file.name}</span>
                <button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="lead-section">
        <button
          type="button"
          className="lead-disclosure"
          aria-expanded={technicalOpen}
          onClick={() => setTechnicalOpen((open) => !open)}
        >
          <span>Further technical and commercial details</span>
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {technicalOpen ? (
          <div className="lead-grid">
            {TECHNICAL_FIELDS.map(([key, label]) => (
              <Input
                key={key}
                id={`detail-${key}`}
                label={label}
                value={values.details[key] || ''}
                onChange={(event) => setDetail(key, event.target.value)}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="lead-section">
        <header className="lead-section__header">
          <h2>Customer requested visit</h2>
        </header>
        <Select
          id="visit-requirement"
          label="Visit requirement"
          value={values.visitRequirement}
          onChange={(event) => setField('visitRequirement', event.target.value)}
        >
          {VISIT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </section>

      <div className="lead-actions">
        <Button
          type="button"
          variant="secondary"
          loading={busy === 'save'}
          disabled={Boolean(busy)}
          onClick={() => onSaveDraft(values, files, () => setFiles([]))}
        >
          {editing ? 'Save changes' : 'Save draft'}
        </Button>
        <Button type="submit" loading={busy === 'submit'} disabled={Boolean(busy)}>
          Submit to PM
        </Button>
      </div>
    </form>
  );
}
