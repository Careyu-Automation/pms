import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  getEmployeeAttendance,
  getEmployeeHours,
  getEmployeeInsights,
  getEmployeeTasks,
  getEmployeeWorkload,
} from '../../services/workload.service';
import { formatDate, formatDateTime } from '../../utils/format';
import { ChartNoAxesColumn } from 'lucide-react';
import { STATUS_LABEL, STATUS_TONE, formatHours, formatPercent, periodLabel, shiftIso, shiftMonth, todayIso, weekdayLabel } from './workloadModel';
import '../../styles/workload.css';

const TABS = ['insights', 'tasks', 'attendance', 'timesheet', 'info'];

export default function WorkloadDetailPage() {
  const { employeeId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'insights';
  const mode = params.get('mode') === 'month' ? 'month' : 'week';
  const filters = {
    mode: params.get('mode') || 'week',
    anchor: params.get('anchor') || todayIso(),
    start: params.get('start') || '',
    end: params.get('end') || '',
  };

  useDocumentTitle(profile?.profile?.fullName || 'Workload');

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

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getEmployeeWorkload(employeeId, filters)
      .then((result) => {
        if (!active) return;
        setProfile(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
    return () => { active = false; };
  }, [employeeId, params]);

  const person = profile?.profile;
  const metrics = profile?.metrics;

  return (
    <PageContainer>
      <header className="load-head">
        <div className="load-person">
          <Avatar name={person?.fullName || 'Employee'} size="lg" />
          <div>
            <h1>{person?.fullName || 'Employee workload'}</h1>
            <p>{[person?.designation, person?.teamName].filter(Boolean).join(' · ') || 'Workload detail'}</p>
            {metrics ? <Badge tone={STATUS_TONE[metrics.status]}>{STATUS_LABEL[metrics.status]}</Badge> : null}
          </div>
        </div>
        <div className="load-toolbar">
          <Button variant="secondary" onClick={() => navigate(`/my-time?tab=timesheet&userId=${employeeId}`)}>Open Timesheet</Button>
          <Button variant="secondary" onClick={() => update({ tab: 'tasks' })}>View Tasks</Button>
          <Button variant="secondary" onClick={() => navigate('/workload')}>Back</Button>
        </div>
      </header>

      {status === 'error' ? <ErrorState title="Unable to load this employee." action={<Button onClick={() => update({ refresh: String(Date.now()) })}>Retry</Button>} /> : null}
      {status === 'loading' && !profile ? <div className="load-skeleton" /> : null}

      {metrics ? (
        <section className="load-summary">
          <article><span>Pending</span><strong>{metrics.openTasks}</strong></article>
          <article><span>Overdue</span><strong>{metrics.overdue}</strong></article>
          <article><span>Assigned</span><strong>{formatHours(metrics.assigned)}</strong></article>
          <article><span>Logged</span><strong>{formatHours(metrics.logged)}</strong></article>
          <article><span>Capacity</span><strong>{formatHours(metrics.capacity)}</strong></article>
          <article><span>Utilization</span><strong>{formatPercent(metrics.utilization)}</strong></article>
        </section>
      ) : null}

      <div className="load-tabs" role="tablist">
        {TABS.map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => update({ tab: item })}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      <div className="load-filters">
        <button type="button" className="icon-button" aria-label="Previous period" onClick={() => update({ anchor: mode === 'month' ? shiftMonth(filters.anchor, -1) : shiftIso(filters.anchor, -7) })}>‹</button>
        <span>{profile?.period ? periodLabel(profile.period) : ''}</span>
        <button type="button" className="icon-button" aria-label="Next period" onClick={() => update({ anchor: mode === 'month' ? shiftMonth(filters.anchor, 1) : shiftIso(filters.anchor, 7) })}>›</button>
        <select className="select" aria-label="Period" value={mode} onChange={(event) => update({ mode: event.target.value })}>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      {tab === 'insights' ? <Insights employeeId={employeeId} filters={filters} /> : null}
      {tab === 'tasks' ? <Tasks employeeId={employeeId} filters={filters} /> : null}
      {tab === 'attendance' ? <Attendance employeeId={employeeId} filters={filters} /> : null}
      {tab === 'timesheet' ? <Timesheet employeeId={employeeId} filters={filters} /> : null}
      {tab === 'info' && person ? <Info person={person} weekly={metrics?.weeklyCapacity} /> : null}
    </PageContainer>
  );
}

function Insights({ employeeId, filters }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    getEmployeeInsights(employeeId, filters)
      .then((result) => { if (active) setData(result.data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [employeeId, filters.mode, filters.anchor, filters.start, filters.end]);
  if (failed) return <ErrorState title="Unable to load insights." />;
  if (!data) return <div className="load-skeleton" />;
  const insight = data.insight;
  const max = Math.max(1, ...data.hours.map((item) => item.hours));
  const logged = data.hours.some((item) => item.hours > 0);
  const week = data.period.mode !== 'month';
  return (
    <section className="load-panel">
      <div className="load-summary">
        <article><span>Logged hours</span><strong>{formatHours(data.metrics.logged)}</strong><small>Target {formatHours(data.metrics.capacity)}</small></article>
        <article><span>Utilization</span><strong>{formatPercent(data.metrics.utilization)}</strong></article>
        <article><span>Tasks completed</span><strong>{insight.completed}</strong><small>{insight.completionRate == null ? 'No due work' : `${insight.completionRate}% completion rate`}</small></article>
        <article><span>On-time delivery</span><strong>{insight.onTime == null ? '—' : `${insight.onTime}%`}</strong><small>{insight.completed ? `${insight.onTimeCount} of ${insight.completed} on time` : 'No completed tasks'}</small></article>
      </div>
      {insight.previousCompleted || insight.completed ? (
        <p className="load-note">{insight.completed} completed this period, {insight.previousCompleted} in the previous period.</p>
      ) : null}
      <h2>Hours logged</h2>
      {logged ? (
        <div className={`load-chart ${week ? '' : 'is-month'}`}>
          {data.hours.filter((item) => week || item.hours > 0 || data.hours.length <= 31).map((item) => (
            <div key={item.date}>
              <span style={{ height: `${Math.round((item.hours / max) * 100)}%` }} />
              <small>{week ? weekdayLabel(item.date) : item.date.slice(8)}</small>
            </div>
          ))}
        </div>
      ) : <EmptyState icon={ChartNoAxesColumn} title="No hours logged for this period." description="Timesheet entries for this employee will appear here." />}
      <h2>Estimate accuracy</h2>
      {insight.accuracy == null ? <p className="load-note">No estimated work was completed in this period.</p> : (
        <dl className="load-facts">
          <div><dt>Estimated</dt><dd>{formatHours(insight.estimated)}</dd></div>
          <div><dt>Actual</dt><dd>{formatHours(insight.actual)}</dd></div>
          <div><dt>Variance</dt><dd>{insight.variance > 0 ? `+${formatHours(insight.variance)}` : formatHours(insight.variance)}</dd></div>
          <div><dt>Accuracy</dt><dd>{insight.accuracy}%</dd></div>
        </dl>
      )}
      <h2>Where to improve</h2>
      {data.recommendations.length ? (
        <ul className="load-notes">
          {data.recommendations.map((item) => (
            <li key={item.title}><strong>{item.title}</strong><span>{item.reason}</span></li>
          ))}
        </ul>
      ) : <p className="load-note">No improvement signals for this period.</p>}
    </section>
  );
}

function Tasks({ employeeId, filters }) {
  const [rows, setRows] = useState(null);
  const [taskStatus, setTaskStatus] = useState('');
  const [priority, setPriority] = useState('');
  useEffect(() => {
    let active = true;
    getEmployeeTasks(employeeId, { ...filters, taskStatus, priority })
      .then((result) => { if (active) setRows(result.data.tasks); })
      .catch(() => { if (active) setRows([]); });
    return () => { active = false; };
  }, [employeeId, filters.mode, filters.anchor, taskStatus, priority]);
  if (!rows) return <div className="load-skeleton" />;
  return (
    <section className="load-panel">
      <div className="load-filters">
        <select className="select" aria-label="Status" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
          <option value="">Status</option>
          {['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'AT_RISK', 'ON_HOLD'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}
        </select>
        <select className="select" aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="">Priority</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {!rows.length ? <EmptyState icon={ChartNoAxesColumn} title="No open tasks." description="Tasks that overlap this period will show here." /> : (
        <div className="load-table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Task</th><th>Project</th><th>Status</th><th>Priority</th><th>Start</th><th>Due</th><th>Estimated</th><th>Logged</th><th>Progress</th></tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id}>
                  <td><Link to={`/tasks/${task.id}`}>{task.title}</Link></td>
                  <td>{task.projectTitle || '—'}</td>
                  <td>{task.status.replaceAll('_', ' ')}{task.overdue ? ' · Overdue' : ''}</td>
                  <td>{task.priority}</td>
                  <td>{formatDate(task.startDate)}</td>
                  <td>{formatDate(task.endDate)}</td>
                  <td>{task.estimatedHours == null ? '—' : formatHours(task.estimatedHours)}</td>
                  <td>{formatHours(task.logged)}</td>
                  <td>{task.progress}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Attendance({ employeeId, filters }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    getEmployeeAttendance(employeeId, filters)
      .then((result) => { if (active) setData(result.data); })
      .catch(() => { if (active) setData({ days: [], summary: {} }); });
    return () => { active = false; };
  }, [employeeId, filters.mode, filters.anchor]);
  if (!data) return <div className="load-skeleton" />;
  const summary = data.summary || {};
  return (
    <section className="load-panel">
      <div className="load-summary">
        <article><span>Working days</span><strong>{summary.workingDays || 0}</strong></article>
        <article><span>Present</span><strong>{summary.present || 0}</strong></article>
        <article><span>Absent</span><strong>{summary.absent || 0}</strong></article>
        <article><span>Leave</span><strong>{summary.leave || 0}</strong></article>
        <article><span>Late</span><strong>Not tracked</strong></article>
        <article><span>Total hours</span><strong>{formatHours(summary.totalHours || 0)}</strong></article>
      </div>
      {!data.days?.length ? <p className="load-note">No working days in this period.</p> : (
        <div className="load-table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Break</th><th>Worked</th><th>Status</th></tr></thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day.date}>
                  <td>{formatDate(day.date)}</td>
                  <td>{day.checkIn ? formatDateTime(day.checkIn) : '—'}</td>
                  <td>{day.checkOut ? formatDateTime(day.checkOut) : '—'}</td>
                  <td>{day.breakMinutes ? `${day.breakMinutes}m` : '—'}</td>
                  <td>{day.workedMinutes == null ? '—' : formatHours(day.workedMinutes / 60)}</td>
                  <td>{day.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Timesheet({ employeeId, filters }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let active = true;
    getEmployeeHours(employeeId, filters)
      .then((result) => { if (active) setData(result.data); })
      .catch(() => { if (active) setData({ entries: [], total: 0 }); });
    return () => { active = false; };
  }, [employeeId, filters.mode, filters.anchor]);
  if (!data) return <div className="load-skeleton" />;
  return (
    <section className="load-panel">
      <p className="load-note">Total logged {formatHours(data.total)} · <Link to={`/my-time?tab=timesheet&userId=${employeeId}`}>Open full timesheet</Link></p>
      {!data.entries.length ? <EmptyState icon={ChartNoAxesColumn} title="No hours logged for this period." description="Time entries from My Time will appear here." /> : (
        <div className="load-table-wrap">
          <table className="data-table">
            <thead><tr><th>Date</th><th>Project</th><th>Task</th><th>Start</th><th>End</th><th>Duration</th><th>Description</th></tr></thead>
            <tbody>
              {data.entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.date)}</td>
                  <td>{entry.projectTitle || '—'}</td>
                  <td>{entry.taskId ? <Link to={`/tasks/${entry.taskId}`}>{entry.taskTitle || 'Task'}</Link> : (entry.taskTitle || '—')}</td>
                  <td>{entry.startAt ? formatDateTime(entry.startAt) : '—'}</td>
                  <td>{entry.endAt ? formatDateTime(entry.endAt) : '—'}</td>
                  <td>{formatHours(entry.hours)}</td>
                  <td>{entry.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Info({ person, weekly }) {
  const rows = [
    ['Name', person.fullName],
    ['Employee ID', person.employeeCode || 'Not set'],
    ['Designation', person.designation || 'Not set'],
    ['Department', person.department || 'Not set'],
    ['Team', person.teamName || 'Not set'],
    ['Reporting manager', person.managerName || 'Not set'],
    ['Joining date', person.joinedAt ? formatDate(person.joinedAt) : 'Not set'],
    ['Work location', person.workLocation || 'Not set'],
    ['Weekly capacity', formatHours(weekly || person.weeklyCapacity)],
    ['Employment status', person.isActive ? 'Active' : 'Inactive'],
  ];
  return (
    <section className="load-panel">
      <dl className="load-facts">
        {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
    </section>
  );
}
