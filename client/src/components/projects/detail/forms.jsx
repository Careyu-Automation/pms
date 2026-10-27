import { MILESTONE_STATUS, PRIORITY, PROJECT_STATUS, TASK_STATUS, TEAMS } from './model';

export function TaskForm({ form, setForm, users, phases, onCancel, onSubmit, busy, submitLabel }) {
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form className="feas-stack" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Task name</span>
        <input className="input" required value={form.title} onChange={(event) => set('title', event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Description</span>
        <textarea className="textarea" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </label>
      <div className="pd-form-grid">
        <label className="field">
          <span className="field__label">Assignee</span>
          <select className="select" value={form.assigneeId} onChange={(event) => set('assigneeId', event.target.value)}>
            <option value="">Unassigned</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Team</span>
          <select className="select" value={form.teamCode} onChange={(event) => set('teamCode', event.target.value)}>
            <option value="">No team</option>
            {TEAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Start date</span>
          <input className="input" type="date" required value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Due date</span>
          <input className="input" type="date" required value={form.endDate} onChange={(event) => set('endDate', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Priority</span>
          <select className="select" value={form.priority} onChange={(event) => set('priority', event.target.value)}>
            {Object.entries(PRIORITY).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Status</span>
          <select className="select" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {Object.entries(TASK_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Estimated hours</span>
          <input className="input" type="number" min="0" step="0.5" value={form.estimatedHours} onChange={(event) => set('estimatedHours', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Progress</span>
          <input className="input" type="number" min="0" max="100" value={form.progress} onChange={(event) => set('progress', event.target.value)} />
        </label>
      </div>
      {phases.length ? (
        <label className="field">
          <span className="field__label">Phase</span>
          <select className="select" value={form.phaseId} onChange={(event) => set('phaseId', event.target.value)}>
            <option value="">Unassigned</option>
            {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
          </select>
        </label>
      ) : null}
      <label className="field">
        <span className="field__label">Tags</span>
        <input className="input" value={form.tags} placeholder="vision, camera" onChange={(event) => set('tags', event.target.value)} />
      </label>
      <div className="lead-actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

export function ProjectForm({ form, setForm, managers, onCancel, onSubmit, busy }) {
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  const needsNote = ['ON_HOLD', 'AT_RISK', 'COMPLETED', 'CANCELLED'].includes(form.status);

  return (
    <form className="feas-stack" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Project name</span>
        <input className="input" required value={form.title} onChange={(event) => set('title', event.target.value)} />
      </label>
      <div className="pd-form-grid">
        <label className="field">
          <span className="field__label">Project code</span>
          <input className="input" required value={form.projectCode} onChange={(event) => set('projectCode', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Customer</span>
          <input className="input" value={form.customerName} onChange={(event) => set('customerName', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Project manager</span>
          <select className="select" required value={form.projectManagerId} onChange={(event) => set('projectManagerId', event.target.value)}>
            <option value="">Select</option>
            {managers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Team</span>
          <select className="select" value={form.teamCode} onChange={(event) => set('teamCode', event.target.value)}>
            <option value="">From costing</option>
            {TEAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Department</span>
          <input className="input" value={form.department} onChange={(event) => set('department', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Priority</span>
          <select className="select" value={form.priority} onChange={(event) => set('priority', event.target.value)}>
            {Object.entries(PRIORITY).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Status</span>
          <select className="select" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {Object.entries(PROJECT_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Start date</span>
          <input className="input" type="date" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">End date</span>
          <input className="input" type="date" value={form.targetDate} onChange={(event) => set('targetDate', event.target.value)} />
        </label>
      </div>
      {needsNote ? (
        <label className="field">
          <span className="field__label">{form.status === 'ON_HOLD' ? 'Hold reason' : form.status === 'AT_RISK' ? 'Risk reason' : 'Remarks'}</span>
          <textarea className="textarea" rows={2} value={form.statusNote} onChange={(event) => set('statusNote', event.target.value)} />
        </label>
      ) : null}
      <label className="field">
        <span className="field__label">Description</span>
        <textarea className="textarea" rows={4} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </label>
      <div className="lead-actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}

export function MilestoneForm({ form, setForm, users, onCancel, onSubmit, busy, submitLabel }) {
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form className="feas-stack" onSubmit={onSubmit}>
      <label className="field">
        <span className="field__label">Milestone name</span>
        <input className="input" required value={form.name} onChange={(event) => set('name', event.target.value)} />
      </label>
      <div className="pd-form-grid">
        <label className="field">
          <span className="field__label">Date</span>
          <input className="input" type="date" required value={form.date} onChange={(event) => set('date', event.target.value)} />
        </label>
        <label className="field">
          <span className="field__label">Owner</span>
          <select className="select" value={form.ownerId} onChange={(event) => set('ownerId', event.target.value)}>
            <option value="">Unassigned</option>
            {users.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Status</span>
          <select className="select" value={form.status} onChange={(event) => set('status', event.target.value)}>
            {Object.entries(MILESTONE_STATUS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
          </select>
        </label>
      </div>
      <label className="field">
        <span className="field__label">Description</span>
        <textarea className="textarea" rows={3} value={form.description} onChange={(event) => set('description', event.target.value)} />
      </label>
      <div className="lead-actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}
