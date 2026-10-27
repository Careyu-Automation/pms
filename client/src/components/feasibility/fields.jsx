import { Badge } from '../ui/Badge';
import { Select } from '../ui/Select';

export function Section({ title, description, children, actions }) {
  return (
    <section className="lead-section">
      <header className="lead-section__header feas-section__header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function TextArea({ id, label, value, onChange, disabled, rows = 4, helper }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field__label">{label}</span>
      <textarea
        id={id}
        className="textarea"
        rows={rows}
        value={value || ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper ? <span className="field__helper">{helper}</span> : null}
    </label>
  );
}

export function Choice({ id, label, value, onChange, disabled, options, placeholder }) {
  return (
    <Select id={id} label={label} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => {
        const optionValue = Array.isArray(option) ? option[0] : option;
        const optionLabel = Array.isArray(option) ? option[1] : option;
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
      })}
    </Select>
  );
}

export function PeopleSelect({ id, label, value, users, onChange, disabled, placeholder = 'Select a person', ...props }) {
  return (
    <Select id={id} label={label} value={value || ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {users.map((person) => (
        <option key={person.id} value={person.id}>
          {person.fullName}{person.roleName ? ` · ${person.roleName}` : ''}
        </option>
      ))}
    </Select>
  );
}

export function StatusBadge({ map, value }) {
  const meta = map[value] || { label: value || 'Not set', tone: 'neutral' };
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

export function ProgressMeter({ label, value }) {
  const safe = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return (
    <div className="feas-meter">
      <div className="feas-meter__label">
        <span>{label}</span>
        <strong>{safe}%</strong>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="progress__bar" style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}
