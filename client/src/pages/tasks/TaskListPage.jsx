import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { TASK_STATUS, TEAMS } from '../../components/planning/planningModel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { STATUS_TONE, WORK_STATUS, isoToday, shiftIso } from '../daily-work/dailyWorkModel';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { listDailyWork } from '../../services/dailyWork.service';
import { listTasks, updateListedTask } from '../../services/planning.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/planning.css';
import '../../styles/daily-work.css';
import '../../styles/task-work.css';

function hoursOf(row) {
  const hours = Number(row.hours || 0);
  const minutes = Number(row.minutes || 0);
  if (!hours && !minutes) return '0h';
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function periodLabel(value) {
  if (String(value).toUpperCase() === 'EVENING') return 'Evening';
  if (String(value).toUpperCase() === 'MORNING') return 'Morning';
  return value || '—';
}

export default function TaskListPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const scope = pathname.includes('team-tasks') ? 'team' : pathname.includes('my-assigned-work') ? 'mine' : '';
  const [board, setBoard] = useState(params.get('board') || 'daily');
  const [layout, setLayout] = useState(params.get('layout') || 'cards');
  const [fromDate, setFromDate] = useState(params.get('from') || shiftIso(isoToday(), -29));
  const [toDate, setToDate] = useState(params.get('to') || isoToday());
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [assigneeId, setAssigneeId] = useState(params.get('assigneeId') || '');
  const [team, setTeam] = useState(params.get('team') || '');
  const [teamId, setTeamId] = useState(params.get('teamId') || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const [tasks, setTasks] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading');
  const focus = params.get('focus') || '';

  useEffect(() => {
    setStatus('loading');
    const next = new URLSearchParams();
    next.set('board', board);
    if (board === 'daily') {
      next.set('layout', layout);
      if (fromDate) next.set('from', fromDate);
      if (toDate) next.set('to', toDate);
      if (teamId) next.set('teamId', teamId);
      if (assigneeId) next.set('assigneeId', assigneeId);
      if (projectId) next.set('projectId', projectId);
      if (statusFilter) next.set('status', statusFilter);
      setParams(next, { replace: true });
      listDailyWork({
        range: 'custom',
        from: fromDate,
        to: toDate,
        date: toDate,
        teamId: teamId || undefined,
        employeeId: assigneeId || undefined,
        projectId: projectId || undefined,
        status: statusFilter || undefined,
        savedOnly: '1',
      })
        .then((payload) => {
          setUpdates(payload.data.updates || []);
          setPeople(payload.data.lookups?.people || []);
          setProjects(payload.data.lookups?.projects || []);
          setTeams(payload.data.lookups?.teams || []);
          setSummary(payload.data.summary || null);
          setStatus('ready');
        })
        .catch((error) => {
          setStatus('error');
          push({ tone: 'danger', message: error.message });
        });
      return;
    }

    if (projectId) next.set('projectId', projectId);
    if (assigneeId) next.set('assigneeId', assigneeId);
    if (team) next.set('team', team);
    if (statusFilter) next.set('status', statusFilter);
    if (focus) next.set('focus', focus);
    setParams(next, { replace: true });
    listTasks({ scope, projectId, assigneeId, team, status: statusFilter })
      .then((payload) => {
        const rows = payload.data.tasks || payload.data || [];
        setTasks(Array.isArray(rows) ? rows : []);
        setPeople(payload.data.people || []);
        setProjects(payload.data.projects || []);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [assigneeId, board, focus, fromDate, layout, projectId, push, scope, setParams, statusFilter, team, teamId, toDate]);

  const title = useMemo(() => {
    if (board === 'daily') {
      return 'Daily work logged by the team — browse cards, tiles, or a list to see who worked on what over time.';
    }
    if (scope === 'mine') return 'Work assigned to you from project plans.';
    if (scope === 'team') return 'Tasks that belong to a delivery team.';
    return 'Tasks created on project plans. Filter by team, employee, project, or status.';
  }, [board, scope]);

  const visibleTasks = useMemo(() => {
    if (!statusFilter) return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [statusFilter, tasks]);

  const visibleUpdates = useMemo(() => {
    // Prefer saved updates for history audit (skip empty assigned placeholders).
    return (updates || []).filter((row) => row.id || row.entryKind === 'SAVED' || row.workTitle);
  }, [updates]);

  async function saveProgress(task, progress) {
    try {
      const payload = await updateListedTask(task.id, { progress: Number(progress) });
      setTasks((current) => current.map((item) => (item.id === task.id ? payload.data.task : item)));
      push({ tone: 'success', message: 'Task progress updated.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

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
          <p>{title}</p>
        </div>
        <div className="task-board-tabs" role="tablist" aria-label="Task boards">
          <button type="button" role="tab" className={board === 'daily' ? 'is-active' : ''} aria-selected={board === 'daily'} onClick={() => setBoard('daily')}>
            Daily work history
          </button>
          <button type="button" role="tab" className={board === 'plan' ? 'is-active' : ''} aria-selected={board === 'plan'} onClick={() => setBoard('plan')}>
            Plan tasks
          </button>
        </div>
      </header>

      {board === 'daily' ? (
        <>
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
            <select className="select" aria-label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">All teams</option>
              {teams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            {scope !== 'mine' ? (
              <select className="select" aria-label="Employee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">All employees</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.fullName || person.name}</option>)}
              </select>
            ) : null}
            <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name || project.title || project.code}</option>)}
            </select>
            <select className="select" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(WORK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <div className="task-layout-toggle" role="group" aria-label="Layout">
              {[['cards', 'Cards'], ['tiles', 'Tiles'], ['list', 'List']].map(([value, label]) => (
                <button key={value} type="button" className={layout === value ? 'is-active' : ''} onClick={() => setLayout(value)}>{label}</button>
              ))}
            </div>
            <Link className="btn btn--secondary" to="/daily-work-updates">Open entry sheet</Link>
          </div>

          {summary && status === 'ready' ? (
            <div className="task-work-kpis" aria-label="Daily work summary">
              <article><span>Updates</span><strong>{summary.activities || 0}</strong></article>
              <article><span>People</span><strong>{summary.employees || 0}</strong></article>
              <article><span>Hours</span><strong>{summary.hoursLabel || '0h'}</strong></article>
              <article><span>Completed</span><strong>{summary.completed || 0}</strong></article>
              <article><span>In progress</span><strong>{summary.inProgress || 0}</strong></article>
              <article><span>Blocked</span><strong>{summary.blocked || 0}</strong></article>
            </div>
          ) : null}

          {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
          {status === 'error' ? <ErrorState title="Daily work history could not be loaded." action={<Button onClick={() => window.location.reload()}>Retry</Button>} /> : null}
          {status === 'ready' && !visibleUpdates.length ? (
            <EmptyState
              title="No daily work updates in this period"
              description="Change the date range, or open Daily Work Updates to log work. History appears here as cards for later review."
            />
          ) : null}
          {status === 'ready' && visibleUpdates.length && layout !== 'list' ? (
            <div className={layout === 'tiles' ? 'task-work-grid is-tiles' : 'task-work-grid is-cards'}>
              {visibleUpdates.map((row) => (
                <article key={row.id || `${row.employeeId}-${row.currentDate}-${row.workTitle}-${row.period}`} className="task-work-card">
                  <header>
                    <div>
                      <span className="task-work-card__eyebrow">Person</span>
                      <strong className="task-work-card__person">{row.employeeName || 'Unassigned'}</strong>
                      <p>{formatDate(row.currentDate)} · {periodLabel(row.period)}{row.teamName ? ` · ${row.teamName}` : ''}</p>
                    </div>
                    <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{WORK_STATUS[row.status] || row.status || '—'}</Badge>
                  </header>
                  <div className="task-work-card__block">
                    <span className="task-work-card__eyebrow">Project</span>
                    <strong>{row.projectName || row.projectTitle || 'Internal / no project'}</strong>
                  </div>
                  <div className="task-work-card__block">
                    <span className="task-work-card__eyebrow">Task</span>
                    <strong>{row.workTitle || 'Untitled task'}</strong>
                    <p className="task-work-card__note">{row.description || 'No work description logged.'}</p>
                  </div>
                  <dl>
                    <div><dt>Time</dt><dd>{hoursOf(row)}</dd></div>
                    <div><dt>Progress</dt><dd>{Number(row.progress || 0)}%</dd></div>
                  </dl>
                  <footer>
                    {row.id ? <Link to={`/daily-work-updates/${row.id}`}>Open update</Link> : <span>Pending entry</span>}
                    {row.taskId ? <Link to={`/tasks/${row.taskId}?board=plan`}>Plan task</Link> : null}
                  </footer>
                </article>
              ))}
            </div>
          ) : null}
          {status === 'ready' && visibleUpdates.length && layout === 'list' ? (
            <div className="lead-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Person</th><th>Project</th><th>Task</th><th>Work description</th><th>Date</th><th>Period</th><th>Status</th><th>Time</th><th />
                  </tr>
                </thead>
                <tbody>
                  {visibleUpdates.map((row) => (
                    <tr key={row.id || `${row.employeeId}-${row.currentDate}-${row.workTitle}-${row.period}`}>
                      <td><strong>{row.employeeName || '—'}</strong></td>
                      <td>{row.projectName || row.projectTitle || 'Internal / no project'}</td>
                      <td><strong>{row.workTitle || 'Untitled task'}</strong></td>
                      <td>{row.description || '—'}</td>
                      <td>{formatDate(row.currentDate)}</td>
                      <td>{periodLabel(row.period)}</td>
                      <td><Badge tone={STATUS_TONE[row.status] || 'neutral'}>{WORK_STATUS[row.status] || row.status || '—'}</Badge></td>
                      <td>{hoursOf(row)}</td>
                      <td>{row.id ? <Link to={`/daily-work-updates/${row.id}`}>Open</Link> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="mywork-toolbar" style={{ marginBottom: '1rem' }}>
            <select className="select" aria-label="Team" value={team} onChange={(event) => setTeam(event.target.value)}>
              <option value="">All teams</option>
              {TEAMS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {scope !== 'mine' ? (
              <select className="select" aria-label="Employee" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">All employees</option>
                {people.map((person) => <option key={person.id} value={person.id}>{person.fullName || person.name}</option>)}
              </select>
            ) : null}
            <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">All projects</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title || project.code || project.name}</option>)}
              {!projects.length && projectId ? <option value={projectId}>Selected project</option> : null}
            </select>
            <select className="select" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(TASK_STATUS || {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {projectId || assigneeId || team || statusFilter ? (
              <Button variant="secondary" onClick={() => { setProjectId(''); setAssigneeId(''); setTeam(''); setStatusFilter(''); }}>Clear</Button>
            ) : null}
          </div>
          {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
          {status === 'error' ? <ErrorState title="Tasks could not be loaded." action={<Button onClick={() => window.location.reload()}>Retry</Button>} /> : null}
          {status === 'ready' && !visibleTasks.length ? (
            <EmptyState title="No plan tasks yet" description="Plan tasks appear here after they are added on a project plan. Use Daily work history to review logged work." />
          ) : null}
          {status === 'ready' && visibleTasks.length ? (
            <div className="lead-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th><th>Project</th><th>Assignee</th><th>Team</th><th>Status</th><th>Dates</th><th>Progress</th><th />
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => (
                    <tr key={task.id} className={focus === task.id ? 'is-selected' : undefined}>
                      <td><strong><Link to={`/tasks/${task.id}`}>{task.title}</Link></strong><div>{task.taskCode}</div></td>
                      <td>{task.projectTitle || task.productName || task.projectCode || '—'}</td>
                      <td>{task.assignee || 'Unassigned'}</td>
                      <td>{task.teamCode || '—'}</td>
                      <td><Badge tone={task.overdue ? 'danger' : task.status === 'COMPLETED' ? 'completed' : 'neutral'}>{task.overdue ? 'Overdue' : TASK_STATUS[task.status]}</Badge></td>
                      <td>{formatDate(task.startDate)} – {formatDate(task.endDate)}</td>
                      <td>
                        <input className="input" type="number" min="0" max="100" defaultValue={task.progress} aria-label={`${task.title} progress`} onBlur={(event) => {
                          if (Number(event.target.value) !== task.progress) saveProgress(task, event.target.value);
                        }} />
                      </td>
                      <td>{task.projectId ? <Link to={`/projects/planning?project=${task.projectId}`}>Open plan</Link> : <Link to={`/tasks/${task.id}`}>Open</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </PageContainer>
  );
}
