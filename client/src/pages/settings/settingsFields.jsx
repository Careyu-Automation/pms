import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';

export function setPath(object, path, value) {
  const [head, ...rest] = path.split('.');
  if (!rest.length) return { ...object, [head]: value };
  return { ...object, [head]: setPath(object[head] || {}, rest.join('.'), value) };
}

export function Field({ label, hint, error, wide, children }) {
  return (
    <label className={`settings-field ${wide ? 'settings-field--wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <strong className="settings-error">{error}</strong> : null}
    </label>
  );
}

export function TextInput({ value, onChange, type = 'text', ...props }) {
  return <input className="input" type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} {...props} />;
}

export function SelectInput({ value, onChange, options }) {
  return (
    <select className="select" value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

export function CheckInput({ checked, onChange, label, disabled }) {
  return (
    <label className="checkbox">
      <input className="checkbox__input" type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="checkbox__label">{label}</span>
    </label>
  );
}

export function SettingsFrame({
  title,
  subtitle,
  updatedAt,
  dirty,
  saving,
  query,
  onQuery,
  onSave,
  onReset,
  tabs,
  tab,
  onTab,
  children,
}) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const onLeave = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  const stamp = updatedAt ? new Date(updatedAt).toLocaleString() : 'Not saved yet';
  return (
    <div>
      <div className="settings-saved">
        <span>Last saved: <strong>{stamp}</strong></span>
        <span className={dirty ? 'settings-dirty' : ''}>{dirty ? 'Unsaved changes' : 'No unsaved changes'}</span>
      </div>
      <div className="settings-toolbar">
        <input className="input" value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search settings" aria-label="Search settings" />
        <Button variant="secondary" onClick={() => dirty && setConfirm(true)} disabled={!dirty || saving}>Reset Changes</Button>
        <Button onClick={onSave} loading={saving} disabled={!dirty}>Save Changes</Button>
      </div>
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={title}>
          {tabs.map((item) => (
            <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} aria-current={tab === item.id ? 'page' : undefined} onClick={() => onTab(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>
        <section className="settings-panel">
          <h2>{title}</h2>
          <p>{subtitle}</p>
          {children}
        </section>
      </div>
      <Modal
        open={confirm}
        title="Discard unsaved changes?"
        subtitle="Reset restores the last saved values."
        onClose={() => setConfirm(false)}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Keep editing</Button>
            <Button onClick={() => { setConfirm(false); onReset(); }}>Discard changes</Button>
          </>
        )}
      >
        <p>Changes on every tab will return to the last saved settings.</p>
      </Modal>
    </div>
  );
}

export function visible(query, ...parts) {
  const text = query.trim().toLowerCase();
  if (!text) return true;
  return parts.join(' ').toLowerCase().includes(text);
}

export const DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'],
  ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

export const LANDING = [
  ['/dashboard', 'Dashboard'],
  ['/my-assigned-work', 'My Assigned Work'],
  ['/daily-work-updates', 'Daily Work Updates'],
  ['/lead-pipeline', 'Lead Pipeline'],
  ['/projects', 'Projects'],
];
