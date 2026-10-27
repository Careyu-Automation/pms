import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { WorkLog } from '../../components/daily-work/WorkLog';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { createDailyWork, deleteDailyWork, exportDailyExcel, exportDailyPdf, listDailyWork, updateDailyWork } from '../../services/dailyWork.service';
import { WORK_STATUS, isoToday } from './dailyWorkModel';
import '../../styles/daily-work.css';

const RANGES = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'This Week'],
  ['last_week', 'Last Week'],
  ['month', 'This Month'],
  ['custom', 'Custom'],
];

const EMPTY = { employeeId: '', teamId: '', workType: '', productId: '', projectId: '', status: '', priority: '', q: '' };

export default function DailyWorkPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { user } = useAuth();
  const { push } = useToast();
  const [range, setRange] = useState('today');
  const [date, setDate] = useState(isoToday());
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [filters, setFilters] = useState(EMPTY);
  const [search, setSearch] = useState('');
  const [groupBy, setGroupBy] = useState('date');
  const [status, setStatus] = useState('loading');
  const [payload, setPayload] = useState(null);
  const sheetRef = useRef(null);

  const load = useCallback((quiet) => {
    if (!quiet) setStatus('loading');
    return listDailyWork({ range, date, from, to, ...filters })
      .then((result) => {
        setPayload(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!quiet) setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [date, filters, from, push, range, to]);

  useEffect(() => { load(Boolean(payload)); }, [load]);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const lookups = payload?.lookups || { people: [], teams: [], projects: [], products: [], workTypes: [], memberships: [] };
  const updates = payload?.updates || [];
  const summary = payload?.summary;
  const query = { range, date, from, to, ...filters };

  async function saveUpdate(body) {
    if (body.id) await updateDailyWork(body.id, body);
    else await createDailyWork(body);
    push({ tone: 'success', message: 'Daily work update saved.' });
    await load(true);
  }

  async function removeUpdate(id) {
    await deleteDailyWork(id);
    push({ tone: 'success', message: 'Daily work update deleted.' });
    await load(true);
  }

  function exportFile(kind) {
    const run = kind === 'pdf' ? exportDailyPdf : exportDailyExcel;
    run(query).catch((error) => push({ tone: 'danger', message: error.message }));
  }

  const cards = summary || { activities: '—', completed: '—', inProgress: '—', blocked: '—', hoursLabel: '—' };

  return (
    <PageContainer>
      <div className="daily-page">
      <header className="daily-head">
        <div>
          <h1>Daily Work Updates</h1>
          <p>Track employee activities, progress, blockers, and daily work.</p>
        </div>
        <div className="daily-head__actions">
          <Button onClick={() => sheetRef.current?.addRow()} disabled={status !== 'ready'}><Plus size={16} /> Add Row</Button>
          <Button variant="secondary" onClick={() => exportFile('excel')}>Export Excel</Button>
          <Button variant="secondary" onClick={() => exportFile('pdf')}>Export PDF</Button>
        </div>
      </header>

      <section className="daily-kpis daily-kpis--compact" aria-label="Work summary">
        <article><span>{range === 'today' ? "Today's Activities" : 'Activities'}</span><strong>{cards.activities}</strong></article>
        <article><span>Completed</span><strong>{cards.completed}</strong></article>
        <article><span>In Progress</span><strong>{cards.inProgress}</strong></article>
        <article><span>Blocked</span><strong>{cards.blocked}</strong></article>
        <article><span>Hours Logged</span><strong>{cards.hoursLabel}</strong></article>
      </section>

      <div className="daily-ranges" role="group" aria-label="Date range">
        {RANGES.map(([value, label]) => (
          <button key={value} type="button" className={range === value ? 'is-active' : ''} onClick={() => setRange(value)}>{label}</button>
        ))}
        {range === 'custom' ? (
          <span className="daily-custom-dates">
            <input className="input" type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} />
            <input className="input" type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} />
          </span>
        ) : null}
      </div>

      <div className="daily-filters">
        <input className="input" placeholder="Search Work" aria-label="Search Work" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" aria-label="Employee" value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
          <option value="">Employee</option>
          {lookups.people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
        <select className="select" aria-label="Team" value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}>
          <option value="">Team</option>
          {lookups.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <select className="select" aria-label="Work Type" value={filters.workType} onChange={(event) => setFilters({ ...filters, workType: event.target.value })}>
          <option value="">Work Type</option>
          {(lookups.workTypes || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Product" value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })}>
          <option value="">Product</option>
          {(lookups.products || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select className="select" aria-label="Project" value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value })}>
          <option value="">Project</option>
          <option value="none">No project</option>
          {lookups.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <select className="select" aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Status</option>
          {['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED'].map((value) => <option key={value} value={value}>{WORK_STATUS[value]}</option>)}
        </select>
        <select className="select" aria-label="Priority" value={filters.priority} onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
          <option value="">Priority</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}
        </select>
        <input className="input" type="date" aria-label="Date" value={date} onChange={(event) => { setDate(event.target.value); setRange('today'); }} />
        <Button variant="secondary" onClick={() => { setSearch(''); setFilters(EMPTY); setRange('today'); setDate(payload?.today || isoToday()); setFrom(payload?.today || isoToday()); setTo(payload?.today || isoToday()); }}>Clear Filters</Button>
      </div>

      <div className="daily-toolbar">
        <label className="daily-group-by">
          Group by
          <select className="select" aria-label="Group by" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="date">Date</option>
            <option value="employee">Employee</option>
            <option value="team">Team</option>
            <option value="workType">Work type</option>
            <option value="product">Product</option>
            <option value="project">Project</option>
            <option value="status">Status</option>
          </select>
        </label>
      </div>

      {status === 'error' ? <ErrorState title="Unable to load daily work updates." action={<Button onClick={() => load(false)}>Retry</Button>} /> : (
        <WorkLog
          ref={sheetRef}
          rows={status === 'ready' ? updates : []}
          lookups={lookups}
          groupBy={groupBy}
          user={user}
          canAssign={Boolean(payload?.access?.canAssignEmployee)}
          today={payload?.today || isoToday()}
          onSave={saveUpdate}
          onDelete={removeUpdate}
          emptyLabel={status === 'ready' ? 'No daily work updates for the selected filters.' : 'Loading daily work updates...'}
        />
      )}
      </div>
    </PageContainer>
  );
}
