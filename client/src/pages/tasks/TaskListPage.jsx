import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { TASK_STATUS } from '../../components/planning/planningModel';
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
  const [params] = useSearchParams();
  const { push } = useToast();
  const scope = pathname.includes('team-tasks') ? 'team' : pathname.includes('my-assigned-work') ? 'mine' : '';
  const projectId = params.get('projectId') || '';
  const assigneeId = params.get('assigneeId') || '';
  const [tasks, setTasks] = useState([]);
  const [status, setStatus] = useState('loading');
  const focus = params.get('focus') || '';

  useEffect(() => {
    setStatus('loading');
    listTasks({ scope, projectId, assigneeId })
      .then((payload) => {
        setTasks(payload.data.tasks || []);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [assigneeId, projectId, push, scope]);

  const title = useMemo(() => {
    if (scope === 'mine') return 'Work assigned to you from project plans.';
    if (scope === 'team') return 'Tasks that belong to a delivery team.';
    return 'Tasks created on project plans.';
  }, [scope]);

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
          {assigneeId || projectId ? (
            <p>
              Filtered by saved user and project ids.
              {' '}
              <Link to={pathname}>Clear filter</Link>
            </p>
          ) : null}
        </div>
      </header>
      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Tasks could not be loaded." action={<Button onClick={() => window.location.reload()}>Retry</Button>} /> : null}
      {status === 'ready' && !tasks.length ? (
        <EmptyState title="No tasks yet" description="Tasks appear here after they are added on a project plan." />
      ) : null}
      {status === 'ready' && tasks.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Task</th><th>Project</th><th>Assignee</th><th>Team</th><th>Status</th><th>Dates</th><th>Progress</th><th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
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
