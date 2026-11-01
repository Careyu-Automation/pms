import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { STATUS_TONE, WORK_STATUS, isoToday, shiftIso } from '../daily-work/dailyWorkModel';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { listDailyWork } from '../../services/dailyWork.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/planning.css';
import '../../styles/daily-work.css';
import '../../styles/task-work.css';

const ASSIGNMENT_LABEL = {
  PENDING_ACCEPTANCE: 'Pending Acceptance',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
};

function statusLabel(row) {
  if (row.assignmentStatus === 'PENDING_ACCEPTANCE') return ASSIGNMENT_LABEL.PENDING_ACCEPTANCE;
  if (row.assignmentStatus === 'REJECTED') return ASSIGNMENT_LABEL.REJECTED;
  return WORK_STATUS[row.status] || row.status || '—';
}

function statusTone(row) {
  if (row.assignmentStatus === 'PENDING_ACCEPTANCE') return 'warning';
  if (row.assignmentStatus === 'REJECTED') return 'danger';
  return STATUS_TONE[row.status] || 'neutral';
}

export default function TaskListPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const [fromDate, setFromDate] = useState(params.get('from') || shiftIso(isoToday(), -29));
  const [toDate, setToDate] = useState(params.get('to') || isoToday());
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [employeeId, setEmployeeId] = useState(params.get('employeeId') || params.get('assigneeId') || user?.id || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const [updates, setUpdates] = useState([]);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [canAssignEmployee, setCanAssignEmployee] = useState(false);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!employeeId && user?.id) setEmployeeId(user.id);
  }, [employeeId, user?.id]);

  useEffect(() => {
    if (!employeeId) return undefined;
    setStatus('loading');
    const next = new URLSearchParams();
    if (fromDate) next.set('from', fromDate);
    if (toDate) next.set('to', toDate);
    if (employeeId) next.set('employeeId', employeeId);
    if (projectId) next.set('projectId', projectId);
    if (statusFilter) next.set('status', statusFilter);
    setParams(next, { replace: true });
    let active = true;
    listDailyWork({
      range: 'custom',
      from: fromDate,
      to: toDate,
      date: toDate,
      employeeId: employeeId || undefined,
      projectId: projectId || undefined,
      status: statusFilter || undefined,
      savedOnly: '1',
    })
      .then((payload) => {
        if (!active) return;
        setUpdates(payload.data.updates || []);
        setPeople(payload.data.lookups?.people || []);
        setProjects(payload.data.lookups?.projects || []);
        setCanAssignEmployee(Boolean(payload.data.access?.canAssignEmployee));
        setStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
    return () => { active = false; };
  }, [employeeId, fromDate, projectId, push, setParams, statusFilter, toDate]);

  const rows = useMemo(() => (updates || []).filter((row) => row.id || row.workTitle || row.description), [updates]);

  function presetRange(days) {
    const end = isoToday();
    setToDate(end);
    setFromDate(shiftIso(end, -(days - 1)));
  }

  return (
    <PageContainer>
      <header className="plan-head">
        <div>
          <h1>{meta.title}</h1>
          <p>Employee-wise daily work monitor across projects and tasks.</p>
        </div>
        <Link className="btn btn--secondary" to="/daily-work-updates">Open entry sheet</Link>
      </header>

      <div className="mywork-toolbar task-work-toolbar">
        <label>
          <span>From</span>
          <input className="input" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value || shiftIso(isoToday(), -29))} />
        </label>
        <label>
          <span>To</span>
          <input className="input" type="date" value={toDate} onChange={(event) => setToDate(event.target.value || isoToday())} />
        </label>
        <Button variant="secondary" onClick={() => presetRange(7)}>Last 7 days</Button>
        <Button variant="secondary" onClick={() => presetRange(30)}>Last 30 days</Button>
        <select
          className="select"
          aria-label="Employee"
          value={employeeId}
          onChange={(event) => setEmployeeId(event.target.value || user?.id || '')}
          disabled={!canAssignEmployee && people.length <= 1}
        >
          {canAssignEmployee ? <option value="">All employees</option> : null}
          {(people.length ? people : (user ? [{ id: user.id, fullName: user.fullName || 'Me' }] : [])).map((person) => (
            <option key={person.id} value={person.id}>{person.fullName || person.name}</option>
          ))}
        </select>
        <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name || project.title || project.code}</option>
          ))}
        </select>
        <select className="select" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(WORK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          <option value="PENDING_ACCEPTANCE">Pending Acceptance</option>
        </select>
      </div>

      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Daily work could not be loaded." action={<Button onClick={() => window.location.reload()}>Retry</Button>} /> : null}
      {status === 'ready' && !rows.length ? (
        <EmptyState
          title="No daily work in this period"
          description="Adjust the employee, project, status, or date range. Open the entry sheet to log work."
        />
      ) : null}
      {status === 'ready' && rows.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Project</th>
                <th>Task</th>
                <th>Work Description</th>
                <th>Start</th>
                <th>End / Due</th>
                <th>Actual Completion</th>
                <th>Status</th>
                <th>Reason for Delay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.employeeId}-${row.currentDate}-${row.workTitle}`}>
                  <td><strong>{row.employeeName || '—'}</strong></td>
                  <td>{row.projectName || row.projectTitle || 'Internal / no project'}</td>
                  <td>
                    {row.taskId ? <Link to={`/tasks/${row.taskId}`}>{row.workTitle || 'Untitled task'}</Link> : <strong>{row.workTitle || 'Untitled task'}</strong>}
                  </td>
                  <td>{row.description || '—'}</td>
                  <td>{formatDate(row.startDate) || '—'}</td>
                  <td>{formatDate(row.deadline) || '—'}</td>
                  <td>{formatDate(row.completionDate) || (row.status === 'COMPLETED' ? formatDate(row.currentDate) : '—')}</td>
                  <td><Badge tone={statusTone(row)}>{statusLabel(row)}</Badge></td>
                  <td>{row.reasonForDelay || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageContainer>
  );
}
