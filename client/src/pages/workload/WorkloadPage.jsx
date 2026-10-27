import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { exportWorkload, getRebalanceOptions, getWorkload, rebalanceWork } from '../../services/workload.service';
import { formatDate } from '../../utils/format';
import { ChartNoAxesColumn } from 'lucide-react';
import { STATUS_LABEL, STATUS_TONE, formatHours, formatPercent, periodLabel, shiftIso, todayIso } from './workloadModel';
import '../../styles/workload.css';

const TABS = [
  ['mine', 'My Load'],
  ['leads', 'Leads'],
  ['members', 'Members'],
];

export default function WorkloadPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [search, setSearch] = useState(params.get('q') || '');
  const [rebalance, setRebalance] = useState(null);
  const view = ['cards', 'list', 'tiles'].includes(params.get('view')) ? params.get('view') : 'cards';
  const tab = ['mine', 'leads', 'members'].includes(params.get('tab')) ? params.get('tab') : 'mine';
  const mode = ['week', 'month', 'custom'].includes(params.get('mode')) ? params.get('mode') : 'week';

  function update(patch) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(patch).forEach(([key, value]) => {
        if (value) next.set(key, value);
        else next.delete(key);
      });
      return next;
    }, { replace: true });
  }

  const filters = {
    mode,
    anchor: params.get('anchor') || todayIso(),
    start: params.get('start') || '',
    end: params.get('end') || '',
    scope: params.get('scope') || '',
    teamId: params.get('teamId') || '',
    employeeId: params.get('employeeId') || '',
    projectId: params.get('projectId') || '',
    status: params.get('status') || '',
    role: params.get('role') || '',
    q: params.get('q') || '',
    sort: params.get('sort') || '',
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if ((params.get('q') || '') !== search) update({ q: search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getWorkload(filters)
      .then((result) => {
        if (!active) return;
        setData(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
    return () => { active = false; };
  }, [params]);

  function shiftPeriod(direction) {
    const anchor = filters.anchor;
    if (mode === 'month') {
      const [year, month] = anchor.split('-').map(Number);
      const date = new Date(year, month - 1 + direction, 1);
      update({ anchor: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01` });
      return;
    }
    update({ anchor: shiftIso(anchor, direction * 7) });
  }

  const people = tab === 'mine' ? [data?.me].filter(Boolean) : tab === 'leads' ? (data?.leads || []) : (data?.employees || []);
  const canRebalance = Boolean(data?.access?.canRebalance);

  return (
    <PageContainer>
      <header className="load-head">
        <div>
          <h1>Workload</h1>
          <p>Capacity, workload and utilization across your teams.</p>
          <small>{data?.summary?.headline || 'Capacity for the selected period'}</small>
        </div>
        <div className="load-toolbar">
          <div className="load-switch" role="tablist" aria-label="Layout">
            {['cards', 'list', 'tiles'].map((item) => (
              <button key={item} type="button" role="tab" aria-selected={view === item} className={view === item ? 'is-active' : ''} onClick={() => update({ view: item })}>{item[0].toUpperCase() + item.slice(1)}</button>
            ))}
          </div>
          <ScopeFilter data={data} value={filters.scope} onChange={(scope) => update({ scope, teamId: '', employeeId: '' })} />
          <button type="button" className="icon-button" aria-label="Previous period" onClick={() => shiftPeriod(-1)}><ChevronLeft size={18} /></button>
          <label className="load-date">
            <span>{data?.period ? periodLabel(data.period) : 'Week'}</span>
            <input type="date" value={filters.anchor} onChange={(event) => update({ anchor: event.target.value || todayIso() })} />
          </label>
          <button type="button" className="icon-button" aria-label="Next period" onClick={() => shiftPeriod(1)}><ChevronRight size={18} /></button>
          <select className="select" aria-label="Period" value={mode} onChange={(event) => update({ mode: event.target.value })}>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="custom">Custom range</option>
          </select>
          <Button variant="secondary" onClick={() => exportWorkload(filters, 'excel').catch((error) => push({ tone: 'danger', message: error.message }))}><FileSpreadsheet size={16} /> Excel</Button>
          <Button variant="secondary" onClick={() => exportWorkload(filters, 'pdf').catch((error) => push({ tone: 'danger', message: error.message }))}><FileText size={16} /> PDF</Button>
        </div>
      </header>

      {mode === 'custom' ? (
        <div className="load-filters">
          <input className="input" type="date" aria-label="Start date" value={filters.start || data?.period?.start || ''} onChange={(event) => update({ start: event.target.value })} />
          <span>to</span>
          <input className="input" type="date" aria-label="End date" value={filters.end || data?.period?.end || ''} onChange={(event) => update({ end: event.target.value })} />
        </div>
      ) : null}

      {status === 'error' ? <ErrorState title="Unable to load workload." action={<Button onClick={() => update({ refresh: String(Date.now()) })}>Retry</Button>} /> : null}
      {status === 'loading' && !data ? <div className="load-skeleton" /> : null}

      {data?.summary ? (
        <section className="load-summary">
          <article><span>People</span><strong>{data.summary.people}</strong></article>
          <article><span>Assigned</span><strong>{formatHours(data.summary.assigned)}</strong></article>
          <article><span>Logged</span><strong>{formatHours(data.summary.logged)}</strong></article>
          <article><span>Available</span><strong>{formatHours(data.summary.available)}</strong></article>
          <article><span>Overloaded</span><strong>{data.summary.overloaded}</strong></article>
          <article><span>Under capacity</span><strong>{data.summary.underutilized}</strong></article>
        </section>
      ) : null}

      <div className="load-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => update({ tab: id })}>
            {label}{id === 'mine' && data?.me ? ' (1)' : ''}
          </button>
        ))}
      </div>

      {tab === 'members' ? (
        <div className="load-filters">
          <input className="input" placeholder="Search employee, team, project" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="select" aria-label="Team" value={filters.teamId} onChange={(event) => update({ teamId: event.target.value })}>
            <option value="">Team</option>
            {(data?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select className="select" aria-label="Employee" value={filters.employeeId} onChange={(event) => update({ employeeId: event.target.value })}>
            <option value="">Employee</option>
            {(data?.directory || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
          <select className="select" aria-label="Project" value={filters.projectId} onChange={(event) => update({ projectId: event.target.value })}>
            <option value="">Project</option>
            {(data?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
          <select className="select" aria-label="Workload status" value={filters.status} onChange={(event) => update({ status: event.target.value })}>
            <option value="">Workload status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      ) : null}

      {status === 'ready' && !people.length ? (
        <EmptyState
          icon={ChartNoAxesColumn}
          title={tab === 'leads' ? 'No team leads in this scope.' : 'No workload data for this period.'}
          description={data?.summary?.overloaded === 0 ? 'No employees are currently over capacity.' : 'Adjust the period or scope to see another group.'}
        />
      ) : null}

      {tab === 'leads' ? <LeadView view={view} leads={people} onOpen={(id) => navigate(`/workload/employee/${id}`)} /> : null}
      {tab !== 'leads' && view === 'cards' ? <CardView people={people} canRebalance={canRebalance && tab === 'members'} onOpen={(id) => navigate(`/workload/employee/${id}`)} onRebalance={setRebalance} /> : null}
      {tab !== 'leads' && view === 'tiles' ? <TileView people={people} onOpen={(id) => navigate(`/workload/employee/${id}`)} /> : null}
      {tab !== 'leads' && view === 'list' ? (
        <ListView
          people={people}
          sort={filters.sort}
          canRebalance={canRebalance && tab === 'members'}
          onSort={(sort) => update({ sort })}
          onOpen={(id) => navigate(`/workload/employee/${id}`)}
          onRebalance={setRebalance}
        />
      ) : null}

      <RebalanceDialog
        employeeId={rebalance}
        filters={filters}
        onClose={() => setRebalance(null)}
        onDone={() => {
          setRebalance(null);
          update({ refresh: String(Date.now()) });
          push({ tone: 'success', message: 'Work reassigned.' });
        }}
      />
    </PageContainer>
  );
}

function ScopeFilter({ data, value, onChange }) {
  const access = data?.access;
  if (!access?.canViewOthers) return <span className="load-scope">My Load</span>;
  return (
    <select className="select" aria-label="Scope" value={value || access.scope || access.defaultScope} onChange={(event) => onChange(event.target.value)}>
      <option value="mine">My Load</option>
      <option value="team">My Team</option>
      {access.department ? <option value="department">My Department</option> : null}
      {access.admin ? <option value="all">All</option> : null}
    </select>
  );
}

function CardView({ people, canRebalance, onOpen, onRebalance }) {
  if (!people.length) return null;
  return (
    <section className="load-cards">
      {people.map((person) => (
        <article key={person.id} className="load-card">
          <header>
            <Avatar name={person.name} />
            <div>
              <button type="button" onClick={() => onOpen(person.id)}>{person.name}</button>
              <span>{person.designation || person.roleName || 'Team member'}</span>
              {person.teamName ? <span>{person.teamName}</span> : null}
            </div>
            <Badge tone={STATUS_TONE[person.status]}>{STATUS_LABEL[person.status]}</Badge>
          </header>
          <p>{formatHours(person.assigned)} assigned · {formatHours(person.logged)} logged</p>
          <Meter value={person.capacityPercent} status={person.status} />
          <dl>
            <div><dt>Capacity</dt><dd>{formatPercent(person.capacityPercent)}</dd></div>
            <div><dt>Open tasks</dt><dd>{person.openTasks || 'No open tasks'}</dd></div>
            <div><dt>Overdue</dt><dd>{person.overdue}</dd></div>
            <div><dt>Remaining</dt><dd>{formatHours(person.remaining)}</dd></div>
          </dl>
          {person.assigned > person.capacity ? <p className="load-note">+{formatHours(person.assigned - person.capacity)} overload</p> : null}
          <footer>
            <Button variant="secondary" onClick={() => onOpen(person.id)}>View</Button>
            {canRebalance && person.assigned > person.capacity ? <Button onClick={() => onRebalance(person.id)}>Rebalance</Button> : null}
          </footer>
        </article>
      ))}
    </section>
  );
}

function TileView({ people, onOpen }) {
  if (!people.length) return null;
  return (
    <section className="load-tiles">
      {people.map((person) => (
        <button key={person.id} type="button" className="load-tile" onClick={() => onOpen(person.id)}>
          <strong>{person.name}</strong>
          <span>{person.teamName || 'No team'}</span>
          <span>{formatHours(person.assigned)} / {formatHours(person.capacity)}</span>
          <span>Logged {formatHours(person.logged)} · {person.openTasks} open</span>
          <Meter value={person.capacityPercent} status={person.status} />
          <Badge tone={STATUS_TONE[person.status]}>{STATUS_LABEL[person.status]}</Badge>
        </button>
      ))}
    </section>
  );
}

function ListView({ people, sort, canRebalance, onSort, onOpen, onRebalance }) {
  if (!people.length) return null;
  const columns = [
    ['name', 'Employee'],
    ['team', 'Team'],
    ['designation', 'Designation'],
    ['capacity', 'Capacity'],
    ['assigned', 'Assigned'],
    ['logged', 'Logged'],
    ['remaining', 'Remaining'],
    ['utilization', 'Utilization'],
    ['open', 'Open Tasks'],
    ['overdue', 'Overdue'],
    ['status', 'Status'],
  ];
  return (
    <div className="load-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(([key, label]) => (
              <th key={key}><button type="button" onClick={() => onSort(key === 'capacity' ? 'capacity' : key)}>{label}{sort === key ? ' ·' : ''}</button></th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <td>{person.name}</td>
              <td>{person.teamName || '—'}</td>
              <td>{person.designation || '—'}</td>
              <td>{formatHours(person.capacity)}</td>
              <td>{formatHours(person.assigned)}</td>
              <td>{formatHours(person.logged)}</td>
              <td>{formatHours(person.remaining)}</td>
              <td>{formatPercent(person.utilization)}</td>
              <td>{person.openTasks}</td>
              <td>{person.overdue}</td>
              <td><Badge tone={STATUS_TONE[person.status]}>{STATUS_LABEL[person.status]}</Badge></td>
              <td className="load-actions">
                <button type="button" onClick={() => onOpen(person.id)}>View</button>
                {canRebalance ? <button type="button" onClick={() => onRebalance(person.id)}>Rebalance</button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadView({ view, leads, onOpen }) {
  if (!leads.length) return null;
  if (view === 'list') {
    return (
      <div className="load-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lead</th><th>Team</th><th>Projects</th><th>Assigned</th><th>Logged</th><th>Members</th><th>Overloaded</th><th>Open</th><th>Overdue</th><th>Capacity</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td><button type="button" className="load-link" onClick={() => onOpen(lead.id)}>{lead.name}</button></td>
                <td>{lead.teamName || '—'}</td>
                <td>{lead.projects}</td>
                <td>{formatHours(lead.assigned)}</td>
                <td>{formatHours(lead.logged)}</td>
                <td>{lead.members}</td>
                <td>{lead.overloaded}</td>
                <td>{lead.openTasks}</td>
                <td>{lead.overdue}</td>
                <td>{formatPercent(lead.capacityPercent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <section className={view === 'tiles' ? 'load-tiles' : 'load-cards'}>
      {leads.map((lead) => (
        <article key={lead.id} className={view === 'tiles' ? 'load-tile' : 'load-card'}>
          <header>
            <Avatar name={lead.name} />
            <div>
              <button type="button" onClick={() => onOpen(lead.id)}>{lead.name}</button>
              <span>{lead.teamName || 'No team'}</span>
            </div>
            <Badge tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
          </header>
          <dl>
            <div><dt>Projects</dt><dd>{lead.projects}</dd></div>
            <div><dt>Assigned</dt><dd>{formatHours(lead.assigned)}</dd></div>
            <div><dt>Logged</dt><dd>{formatHours(lead.logged)}</dd></div>
            <div><dt>Members</dt><dd>{lead.members}</dd></div>
            <div><dt>Overloaded</dt><dd>{lead.overloaded}</dd></div>
            <div><dt>Open tasks</dt><dd>{lead.openTasks}</dd></div>
          </dl>
        </article>
      ))}
    </section>
  );
}

function Meter({ value, status }) {
  const width = value == null ? 100 : Math.max(0, Math.min(value, 100));
  return (
    <div className={`load-meter is-${status || 'HEALTHY'}`} aria-hidden="true">
      <span style={{ width: `${width}%` }} />
    </div>
  );
}

function RebalanceDialog({ employeeId, filters, onClose, onDone }) {
  const { push } = useToast();
  const [options, setOptions] = useState(null);
  const [selected, setSelected] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [allowLeave, setAllowLeave] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!employeeId) return undefined;
    let active = true;
    setSelected([]);
    setAssigneeId('');
    setAllowLeave(false);
    getRebalanceOptions(employeeId, filters)
      .then((result) => { if (active) setOptions(result.data); })
      .catch((error) => push({ tone: 'danger', message: error.message }));
    return () => { active = false; };
  }, [employeeId]);

  function toggle(id) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function submit() {
    setBusy(true);
    try {
      await rebalanceWork({ taskIds: selected, assigneeId, allowDuringLeave: allowLeave });
      onDone();
    } catch (error) {
      if (error.status === 409) setAllowLeave(true);
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const tasks = options?.tasks || [];
  const candidates = options?.candidates || [];
  return (
    <Modal open={Boolean(employeeId)} title="Reassign work" onClose={onClose} className="load-dialog">
      <div className="load-form">
        {!tasks.length ? <p>No open tasks.</p> : tasks.map((task) => (
          <label key={task.id} className="load-check">
            <input type="checkbox" checked={selected.includes(task.id)} onChange={() => toggle(task.id)} />
            <span>
              <strong>{task.title}</strong>
              <small>{task.projectTitle || 'No project'} · {formatHours(task.estimatedHours || 0)} · due {formatDate(task.endDate)} · {task.priority}</small>
            </span>
          </label>
        ))}
        <label className="field">
          <span className="field__label">New assignee</span>
          <select className="select" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
            <option value="">Select</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>{person.name} · {formatHours(person.remaining)} available</option>
            ))}
          </select>
        </label>
        {!candidates.length ? <p>No employees currently have available capacity.</p> : null}
        {allowLeave ? (
          <label className="load-check">
            <input type="checkbox" checked={allowLeave} onChange={(event) => setAllowLeave(event.target.checked)} />
            <span>Assign even though this person has approved leave during the task.</span>
          </label>
        ) : null}
        <div className="load-form__actions">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={submit} loading={busy} disabled={!selected.length || !assigneeId}>Reassign Tasks</Button>
        </div>
      </div>
    </Modal>
  );
}
