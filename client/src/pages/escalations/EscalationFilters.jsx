import { PRIORITIES, STATUSES, TYPES } from './model';

export function EscalationFilters({ filters, options, onChange, onClear }) {
  function set(key, value) {
    onChange({ ...filters, [key]: value, quick: key === 'quick' ? value : '' });
  }
  return (
    <div className="esc-filters">
      <div className="esc-quick">
        {[
          ['', 'All'],
          ['open', 'Open'],
          ['critical', 'Critical'],
          ['overdue', 'Overdue'],
          ['mine', 'My Escalations'],
          ['assigned', 'Assigned to Me'],
          ['resolved', 'Resolved'],
        ].map(([id, label]) => {
          const active = id === 'critical'
            ? filters.quick === 'critical' || filters.priority === 'CRITICAL'
            : id === 'overdue'
              ? filters.quick === 'overdue' || filters.overdue === 'true'
              : id === ''
                ? !filters.quick && !filters.priority && filters.overdue !== 'true' && !filters.status
                : filters.quick === id;
          return <button key={label} type="button" className={active ? 'is-active' : ''} onClick={() => onChange({ ...filters, quick: id, priority: '', overdue: '', status: '' })}>{label}</button>;
        })}
      </div>
      <div className="esc-filter-grid">
        <select className="select" value={filters.status} onChange={(event) => set('status', event.target.value)} aria-label="Status">
          <option value="">Status</option>
          {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="select" value={filters.priority} onChange={(event) => onChange({ ...filters, priority: event.target.value, quick: '' })} aria-label="Priority">
          <option value="">Priority</option>
          {PRIORITIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="select" value={filters.type} onChange={(event) => set('type', event.target.value)} aria-label="Type">
          <option value="">Type</option>
          {TYPES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <select className="select" value={filters.projectId} onChange={(event) => set('projectId', event.target.value)} aria-label="Project">
          <option value="">Project</option>
          {(options.projects || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" value={filters.teamId} onChange={(event) => set('teamId', event.target.value)} aria-label="Team">
          <option value="">Team</option>
          {(options.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" value={filters.assignedTo} onChange={(event) => set('assignedTo', event.target.value)} aria-label="Assigned to">
          <option value="">Assigned To</option>
          {(options.people || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" value={filters.raisedBy} onChange={(event) => set('raisedBy', event.target.value)} aria-label="Raised by">
          <option value="">Raised By</option>
          {(options.people || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input className="input" type="date" value={filters.from} onChange={(event) => set('from', event.target.value)} aria-label="From date" />
        <input className="input" type="date" value={filters.to} onChange={(event) => set('to', event.target.value)} aria-label="To date" />
        <label className="esc-check"><input type="checkbox" checked={filters.archived === 'true'} onChange={(event) => set('archived', event.target.checked ? 'true' : '')} /> Include Archived</label>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onClear}>Clear Filters</button>
      </div>
    </div>
  );
}
