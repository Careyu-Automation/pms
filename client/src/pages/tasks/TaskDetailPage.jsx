import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { TaskForm } from '../../components/projects/detail/forms';
import { PRIORITY, TASK_STATUS, canManage, taskPayload, taskToForm } from '../../components/projects/detail/model';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { deleteOwnedTask, deleteTask, getPlan, getTask, listMyTasks, updateListedTask, updateTask } from '../../services/planning.service';
import { loadEscalations } from '../../services/escalations.service';
import { listTimeEntries } from '../../services/time.service';
import { formatMinutes } from '../time/timeModel';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/project-detail.css';

export default function TaskDetailPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const manage = canManage(user);
  useDocumentTitle('Task');
  const [task, setTask] = useState(null);
  const [blockers, setBlockers] = useState([]);
  const [users, setUsers] = useState([]);
  const [phases, setPhases] = useState([]);
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [myMinutes, setMyMinutes] = useState(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setTask(null);
    getTask(taskId)
      .then(async (payload) => {
        if (!active) return;
        const current = payload.data.task;
        setTask(current);
        if (!current.projectId) {
          const mine = await listMyTasks().catch(() => null);
          if (!active) return;
          const people = mine?.data?.people || [];
          const known = current.assigneeId && !people.some((person) => person.id === current.assigneeId)
            ? [{ id: current.assigneeId, fullName: current.assignee || 'Assignee' }, ...people]
            : people;
          setUsers(known);
          setPhases([]);
          return;
        }
        const plan = await getPlan(current.projectId);
        if (!active) return;
        setUsers(plan.data.users || []);
        setPhases(plan.data.phases || []);
      })
      .catch((error) => {
        if (!active) return;
        setFailed(true);
        push({ tone: 'danger', message: error.message });
      });
    return () => {
      active = false;
    };
  }, [push, taskId]);

  useEffect(() => {
    let active = true;
    loadEscalations({ taskId, quick: 'open' })
      .then((payload) => { if (active) setBlockers(payload.data.rows || []); })
      .catch(() => { if (active) setBlockers([]); });
    return () => { active = false; };
  }, [taskId]);

  useEffect(() => {
    let active = true;
    listTimeEntries({ taskId })
      .then((result) => {
        if (!active) return;
        const minutes = (result.data.entries || []).reduce((sum, entry) => sum + (Number(entry.durationMinutes) || 0), 0);
        setMyMinutes(minutes);
      })
      .catch(() => { if (active) setMyMinutes(null); });
    return () => { active = false; };
  }, [taskId]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (task.projectId) await updateTask(task.projectId, task.id, taskPayload(form));
      else await updateListedTask(task.id, taskPayload(form));
      const payload = await getTask(task.id);
      setTask(payload.data.task);
      setForm(null);
      push({ tone: 'success', message: 'Task updated.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      if (task.projectId) {
        await deleteTask(task.projectId, task.id);
        navigate(`/projects/${task.projectId}?tab=tasks`);
      } else {
        await deleteOwnedTask(task.id);
        navigate(task.productId ? `/products/${task.productId}` : '/my-assigned-work');
      }
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      setBusy(false);
    }
  }

  if (failed) {
    return (
      <PageContainer>
        <ErrorState title="Task not found" description="This task does not exist or you don't have access." action={<Button onClick={() => navigate('/tasks')}>Back to tasks</Button>} />
      </PageContainer>
    );
  }

  if (!task) return <PageContainer><div className="pd-skeleton" aria-hidden="true"><span /><span /></div></PageContainer>;

  const status = TASK_STATUS[task.status] || { label: task.status, tone: 'neutral' };
  const priority = PRIORITY[task.priority] || { label: task.priority, tone: 'neutral' };
  const back = task.projectId ? `/projects/${task.projectId}?tab=tasks` : (task.productId ? `/products/${task.productId}` : '/my-assigned-work');
  const sourcePath = task.projectId ? `/projects/${task.projectId}` : (task.productId ? `/products/${task.productId}` : '/my-assigned-work');
  const sourceLabel = task.projectCode || task.productCode || (task.productId ? 'Product' : 'Work');

  return (
    <PageContainer>
      <div className="pd-page">
        <header className="pd-header">
          <div>
            <button type="button" className="pd-back" onClick={() => navigate(back)}>← Back</button>
            <p className="pd-crumb">
              <Link to={sourcePath}>{sourceLabel}</Link> / {task.taskCode}
            </p>
            <h1>{task.title}</h1>
            <div className="pd-pills">
              <Badge tone={task.overdue ? 'danger' : status.tone}>{task.overdue ? 'Overdue' : status.label}</Badge>
              <Badge tone={priority.tone}>{priority.label}</Badge>
            </div>
          </div>
          <div className="pd-actions">
            {manage ? <Button variant="secondary" onClick={() => setForm(taskToForm(task))}>Edit</Button> : null}
            {manage ? <Button variant="danger" onClick={() => setConfirm(true)}>Delete</Button> : null}
          </div>
        </header>
        <section className="pd-section">
          <p className="pd-description">{task.description || 'No description.'}</p>
          <dl className="pd-health">
            <div><dt>Assignee</dt><dd>{task.assignee || 'Unassigned'}</dd></div>
            <div><dt>Team</dt><dd>{task.teamCode || 'Not set'}</dd></div>
            <div><dt>Start</dt><dd>{formatDate(task.startDate)}</dd></div>
            <div><dt>Due</dt><dd>{formatDate(task.endDate)}</dd></div>
            <div><dt>Progress</dt><dd>{task.progress}%</dd></div>
            <div><dt>Estimated</dt><dd>{task.estimatedHours == null ? 'Not set' : formatMinutes(Math.round(task.estimatedHours * 60))}</dd></div>
            <div><dt>Actual</dt><dd>{formatMinutes(Math.round((task.actualHours || 0) * 60))}</dd></div>
            <div><dt>My Time</dt><dd>{myMinutes == null ? '—' : formatMinutes(myMinutes)}</dd></div>
            <div><dt>Tags</dt><dd>{task.tags || 'None'}</dd></div>
            <div>
              <dt>Blocked by</dt>
              <dd>
                {blockers.length ? blockers.map((item) => <Link key={item.id} to={`/escalations/${item.id}`}>{item.number}</Link>) : 'Not blocked'}
                {' · '}
                <Link to={`/escalations?create=1&taskId=${task.id}${task.projectId ? `&project=${task.projectId}` : ''}`}>Mark task as blocked by escalation</Link>
              </dd>
            </div>
          </dl>
        </section>
      </div>
      <Modal open={Boolean(form)} title="Edit task" onClose={() => setForm(null)}>
        {form ? <TaskForm form={form} setForm={setForm} users={users} phases={phases} busy={busy} submitLabel="Save task" onCancel={() => setForm(null)} onSubmit={save} /> : null}
      </Modal>
      <Modal open={confirm} title="Delete task?" onClose={() => setConfirm(false)}>
        <div className="feas-stack">
          <p>This removes {task.title} from the project plan.</p>
          <div className="lead-actions">
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove} loading={busy}>Delete task</Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
