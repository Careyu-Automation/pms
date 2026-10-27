import { useState } from 'react';
import { IMPACTS, PRIORITIES, TYPES, FILE_TYPES, peopleForTeam } from './model';

function Field({ id, label, required, error, children }) {
  return (
    <label className={`esc-field${error ? ' is-invalid' : ''}`} htmlFor={id}>
      <span>{label}{required ? ' *' : ''}</span>
      {children}
      {error ? <small id={`${id}-error`}>{error}</small> : null}
    </label>
  );
}

function Section({ id, title, children }) {
  return (
    <section className="esc-section" id={id}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function EscalationForm({ form, setForm, options, errors, files, setFiles, formError, onEdit }) {
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [fileNote, setFileNote] = useState('');
  const people = peopleForTeam(options, form.teamId);

  function set(key, value) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === 'projectId') {
        const project = (options.projects || []).find((item) => item.id === value);
        if (project?.customerName) next.customerName = project.customerName;
      }
      if (key === 'teamId' && value !== current.teamId) {
        const allowed = peopleForTeam(options, value).some((person) => person.id === current.assignedTo);
        if (!allowed) next.assignedTo = '';
      }
      return next;
    });
    onEdit?.(key);
  }

  function addFiles(list) {
    const next = [];
    const rejected = [];
    [...list].forEach((file) => {
      const ext = String(file.name || '').split('.').pop().toLowerCase();
      if (FILE_TYPES.includes(ext)) next.push(file);
      else rejected.push(file.name);
    });
    if (next.length) {
      setFiles((current) => [...current, ...next]);
      setFilesOpen(true);
    }
    setFileNote(rejected.length ? 'Use PDF, Excel, Word, images, CSV, or TXT.' : '');
    return rejected;
  }

  function jump(id) {
    document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  return (
    <div className="esc-form">
      <nav className="esc-progress" aria-label="Form sections">
        <button type="button" onClick={() => jump('esc-basic')}>Basic Information</button>
        <button type="button" onClick={() => jump('esc-context')}>Context</button>
        <button type="button" onClick={() => jump('esc-impact')}>Impact</button>
        <button type="button" onClick={() => jump('esc-details')}>Issue Details</button>
      </nav>
      {formError ? <p className="esc-form-error" role="alert">{formError}</p> : null}

      <Section id="esc-basic" title="Basic Information">
        <Field id="esc-title" label="Escalation Title" required error={errors.title}>
          <input id="esc-title" className="input" value={form.title} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? 'esc-title-error' : undefined} onChange={(event) => set('title', event.target.value)} placeholder="Vision camera delivery delayed" />
        </Field>
        <div className="esc-form-grid">
          <Field id="esc-type" label="Escalation Type" required error={errors.type}>
            <select id="esc-type" className="select" value={form.type} aria-invalid={Boolean(errors.type)} onChange={(event) => set('type', event.target.value)}>
              <option value="">Select type</option>
              {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field id="esc-priority" label="Priority" required error={errors.priority}>
            <select id="esc-priority" className="select" value={form.priority} aria-invalid={Boolean(errors.priority)} onChange={(event) => set('priority', event.target.value)}>
              <option value="">Select priority</option>
              {PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section id="esc-context" title="Context">
        <div className="esc-form-grid">
          <Field id="esc-project" label="Project">
            <select id="esc-project" className="select" value={form.projectId} onChange={(event) => set('projectId', event.target.value)}>
              <option value="">Select project</option>
              {(options.projects || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field id="esc-customer" label="Customer">
            <input id="esc-customer" className="input" value={form.customerName} onChange={(event) => set('customerName', event.target.value)} placeholder="Filled from the project when one is selected" />
          </Field>
          <Field id="esc-team" label="Team">
            <select id="esc-team" className="select" value={form.teamId} onChange={(event) => set('teamId', event.target.value)}>
              <option value="">Select team</option>
              {(options.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field id="esc-assignee" label="Assigned To">
            <select id="esc-assignee" className="select" value={form.assignedTo} onChange={(event) => set('assignedTo', event.target.value)}>
              <option value="">Select person</option>
              {people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
        </div>
        {form.projectId ? <p className="esc-note">Linked to {(options.projects || []).find((item) => item.id === form.projectId)?.name}. This uses the existing project.</p> : null}
      </Section>

      <Section id="esc-impact" title="Timeline & Impact">
        <div className="esc-form-grid">
          <Field id="esc-due" label="Due Date">
            <input id="esc-due" className="input" type="date" value={form.dueDate} onChange={(event) => set('dueDate', event.target.value)} />
          </Field>
          <Field id="esc-impact-area" label="Impact Area">
            <select id="esc-impact-area" className="select" value={form.impactArea} onChange={(event) => set('impactArea', event.target.value)}>
              <option value="">Select impact area</option>
              {IMPACTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field id="esc-impact-severity" label="Impact Severity">
            <select id="esc-impact-severity" className="select" value={form.impactSeverity} onChange={(event) => set('impactSeverity', event.target.value)}>
              <option value="">Select severity</option>
              {PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section id="esc-details" title="Issue Details">
        <Field id="esc-description" label="Description" required error={errors.description}>
          <textarea id="esc-description" className="input" rows={5} value={form.description} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? 'esc-description-error' : undefined} onChange={(event) => set('description', event.target.value)} placeholder="Describe the issue, current situation, impact and what needs attention." />
        </Field>
        <Field id="esc-action" label="Recommended Action">
          <textarea id="esc-action" className="input" rows={3} value={form.recommendedAction} onChange={(event) => set('recommendedAction', event.target.value)} placeholder="Recommended action / expected resolution" />
        </Field>
      </Section>

      <section className="esc-collapse">
        <button type="button" className="esc-collapse__toggle" aria-expanded={relatedOpen} onClick={() => setRelatedOpen((open) => !open)}>
          <span>
            <strong>Related Records</strong>
            <small>Optional links to existing Project Hub records</small>
          </span>
          <em>{relatedOpen ? 'Collapse' : 'Expand'}</em>
        </button>
        {relatedOpen ? (
          <div className="esc-form-grid">
            <Field id="esc-task" label="Related Task">
              <select id="esc-task" className="select" value={form.taskId} onChange={(event) => set('taskId', event.target.value)}>
                <option value="">None</option>
                {(options.tasks || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field id="esc-request" label="Related Work Request">
              <select id="esc-request" className="select" value={form.workRequestId} onChange={(event) => set('workRequestId', event.target.value)}>
                <option value="">None</option>
                {(options.requests || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field id="esc-lead" label="Related Lead">
              <select id="esc-lead" className="select" value={form.leadId} onChange={(event) => set('leadId', event.target.value)}>
                <option value="">None</option>
                {(options.leads || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field id="esc-study" label="Related Feasibility Study">
              <select id="esc-study" className="select" value={form.feasibilityId} onChange={(event) => set('feasibilityId', event.target.value)}>
                <option value="">None</option>
                {(options.studies || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <Field id="esc-costing" label="Related Costing">
              <select id="esc-costing" className="select" value={form.costingId} onChange={(event) => set('costingId', event.target.value)}>
                <option value="">None</option>
                {(options.costings || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
          </div>
        ) : null}
      </section>

      <section className="esc-collapse">
        <button type="button" className="esc-collapse__toggle" aria-expanded={filesOpen} onClick={() => setFilesOpen((open) => !open)}>
          <span>
            <strong>Attachments</strong>
            <small>{files.length ? `${files.length} selected` : 'PDF, Excel, Word, images, CSV, or TXT'}</small>
          </span>
          <em>{filesOpen ? 'Collapse' : 'Expand'}</em>
        </button>
        {filesOpen ? (
          <div
            className="esc-drop"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              addFiles(event.dataTransfer.files);
            }}
          >
            <p>Drag & drop files here</p>
            <label className="btn btn--secondary btn--sm">
              Browse files
              <input type="file" multiple accept={FILE_TYPES.map((ext) => `.${ext}`).join(',')} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
            </label>
            {files.length ? (
              <ul>
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <span>{file.name}</span>
                    <button type="button" onClick={() => setFiles((current) => current.filter((_, item) => item !== index))}>Remove</button>
                  </li>
                ))}
              </ul>
            ) : null}
            {fileNote ? <p className="esc-form-error">{fileNote}</p> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
