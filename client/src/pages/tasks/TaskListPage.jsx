import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { TASK_STATUS, TEAMS } from '../../components/planning/planningModel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { listTasks, updateListedTask } from '../../services/planning.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/planning.css';

export default function TaskListPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { pathname } = useLocation();
  const [params, setParams] = useSearchParams();
  const { push } = useToast();
  const scope = pathname.includes('team-tasks') ? 'team' : pathname.includes('my-assigned-work') ? 'mine' : '';
  const [projectId, setProjectId] = useState(params.get('projectId') || '');
  const [assigneeId, setAssigneeId] = useState(params.get('assigneeId') || '');
  const [team, setTeam] = useState(params.get('team') || '');
  const [statusFilter, setStatusFilter] = useState(params.get('status') || '');
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [status, setStatus] = useState('loading');
  const focus = params.get('focus') || '';

  useEffect(() => {
    setStatus('loading');
    const next = new URLSearchParams();
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
  }, [assigneeId, focus, projectId, push, scope, setParams, statusFilter, team]);

  const title = useMemo(() => {
    if (scope === 'mine') return 'Work assigned to you from project plans.';
    if (scope === 'team') return 'Tasks that belong to a delivery team.';
    return 'Tasks created on project plans. Filter by team, employee, project, or status.';
  }, [scope]);

  const visible = useMemo(() => {
    if (!statusFilter) return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [statusFilter, tasks]);

  async function saveProgress(task, progress) {
    try {
      const payload = await updateListedTask(task.id, { progress: Number(progress) });
      setTasks((current) => current.map((item) => (item.id === task.id ? payload.data.task : item)));
      push({ tone: 'success', message: 'Task progress updated.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  return (
    <PageContainer>
      <header className="plan-head">
        <div>
          <h1>{meta.title}</h1>
          <p>{title}</p>
        </div>
      </header>
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
      {status === 'ready' && !visible.length ? (
        <EmptyState title="No tasks yet" description="Tasks appear here after they are added on a project plan." />
      ) : null}
      {status === 'ready' && visible.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th><th>Project</th><th>Assignee</th><th>Team</th><th>Status</th><th>Dates</th><th>Progress</th><th />
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => (
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
    </PageContainer>
  );
}
