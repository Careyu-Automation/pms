import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { GanttChart } from '../../components/planning/GanttChart';
import { PRIORITY, TASK_STATUS, TEAMS, durationDays, shortDate } from '../../components/planning/planningModel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listProjects } from '../../services/costing.service';
import {
  createDependency,
  createMilestone,
  createPhase,
  createTask,
  deleteDependency,
  deleteMilestone,
  deleteTask,
  getPlan,
  setBaseline,
  updateTask,
} from '../../services/planning.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/planning.css';

const PROJECT_STATUS = {
  NOT_STARTED: 'Not started',
  PLANNING: 'Planning',
  IN_PROGRESS: 'In progress',
  AT_RISK: 'At risk',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const blankTask = {
  title: '',
  phaseId: '',
  assigneeId: '',
  teamCode: '',
  priority: 'MEDIUM',
  status: 'NOT_STARTED',
  startDate: '',
  endDate: '',
  estimatedHours: '',
  progress: 0,
  description: '',
};

export default function PlanningPage() {
  useDocumentTitle('Project Planning & Gantt');
  const navigate = useNavigate();
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const projectId = params.get('project') || '';
  const [projects, setProjects] = useState([]);
  const [projectStatus, setProjectStatus] = useState('loading');
  const [projectQuery, setProjectQuery] = useState('');
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState('loading');
  const [mode, setMode] = useState('week');
  const [dayWidth, setDayWidth] = useState(18);
  const [command, setCommand] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [team, setTeam] = useState('');
  const [assignee, setAssignee] = useState('');
  const [phase, setPhase] = useState('');
  const [priority, setPriority] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [selected, setSelected] = useState(null);
  const [milestone, setMilestone] = useState(null);
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(blankTask);
  const [phaseForm, setPhaseForm] = useState({ name: '', startDate: '', endDate: '', description: '' });
  const [milestoneForm, setMilestoneForm] = useState({ name: '', date: '', ownerId: '', description: '', status: 'PENDING' });
  const [predecessorId, setPredecessorId] = useState('');
  const [busy, setBusy] = useState(false);

  const loadProjects = useCallback(() => {
    setProjectStatus('loading');
    return listProjects()
      .then((payload) => {
        setProjects(Array.isArray(payload.data?.projects) ? payload.data.projects : []);
        setProjectStatus('ready');
      })
      .catch((error) => {
        console.error(error);
        setProjectStatus('error');
        push({ tone: 'danger', message: error.message || 'Internal Projects could not be loaded.' });
      });
  }, [push]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const load = useCallback((id) => {
    if (!id) {
      setPlan(null);
      setStatus('ready');
      return Promise.resolve();
    }
    setStatus('loading');
    return getPlan(id)
      .then((payload) => {
        const next = payload.data || {};
        setPlan({
          project: next.project || null,
          phases: next.phases || [],
          tasks: next.tasks || [],
          dependencies: next.dependencies || [],
          milestones: next.milestones || [],
          baseline: next.baseline || null,
          users: next.users || [],
          timeEntries: next.timeEntries || [],
          summary: next.summary || null,
        });
        setStatus(next.project ? 'ready' : 'missing');
        if (!next.project) loadProjects();
      })
      .catch((error) => {
        console.error(error);
        setPlan(null);
        setStatus(error.status === 404 ? 'missing' : 'error');
        if (error.status === 404) loadProjects();
        push({ tone: 'danger', message: error.status === 404 ? 'This project is no longer available.' : (error.message || 'The project plan could not be loaded.') });
      });
  }, [loadProjects, push]);

  useEffect(() => { load(projectId); }, [load, projectId]);

  useEffect(() => {
    setDayWidth(mode === 'day' ? 32 : mode === 'month' ? 8 : 18);
  }, [mode]);

  const filtering = Boolean(query || taskStatus || team || assignee || phase || priority || overdueOnly);
  const visibleTasks = useMemo(() => {
    const tasks = plan?.tasks || [];
    return tasks.filter((task) => {
      const text = `${task.title} ${task.taskCode} ${task.assignee} ${task.teamCode}`.toLowerCase();
      if (query && !text.includes(query.trim().toLowerCase())) return false;
      if (taskStatus && task.status !== taskStatus) return false;
      if (team && task.teamCode !== team) return false;
      if (assignee && task.assigneeId !== assignee) return false;
      if (phase && task.phaseId !== phase) return false;
      if (priority && task.priority !== priority) return false;
      if (overdueOnly && !task.overdue) return false;
      return true;
    });
  }, [assignee, overdueOnly, phase, plan, priority, query, taskStatus, team]);

  function chooseProject(id) {
    const next = new URLSearchParams(params);
    if (id) next.set('project', id);
    else next.delete('project');
    setParams(next);
    setSelected(null);
  }

  function applyPlan(payload) {
    setPlan(payload.data);
  }

  async function run(action, success) {
    setBusy(true);
    try {
      const payload = await action();
      applyPlan(payload);
      if (success) push({ tone: 'success', message: success });
      return payload;
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveSchedule(task, startDate, endDate) {
    const payload = await run(() => updateTask(projectId, task.id, { startDate, endDate }), 'Task schedule updated.');
    if (payload && selected?.id === task.id) {
      setSelected(payload.data.tasks.find((item) => item.id === task.id) || null);
    }
  }

  async function submitTask(event) {
    event.preventDefault();
    const body = { ...form, progress: Number(form.progress) || 0, estimatedHours: form.estimatedHours === '' ? null : Number(form.estimatedHours) };
    const payload = await run(
      () => (editor === 'edit' && selected ? updateTask(projectId, selected.id, body) : createTask(projectId, body)),
      editor === 'edit' ? 'Task updated.' : 'Task created.',
    );
    if (payload) {
      setEditor(null);
      if (selected) setSelected(payload.data.tasks.find((item) => item.id === selected.id) || null);
    }
  }

  const project = plan?.project;
  const summary = plan?.summary;

  return (
    <PageContainer>
      <header className="plan-head">
        <div className="plan-head__copy">
          <p className="plan-crumb">Internal Projects / Project Planning & Gantt</p>
          <h1>Project Planning & Gantt</h1>
          <p>Plan, schedule and track project execution.</p>
        </div>
        <div className="plan-select">
          <label>
            <span>Select project</span>
            <input className="input" value={projectQuery} placeholder="Search by project or ID" onChange={(event) => setProjectQuery(event.target.value)} />
          </label>
          <label>
            <span className="sr-only">Project</span>
            <select className="select" value={projectId} onChange={(event) => chooseProject(event.target.value)} disabled={projectStatus === 'loading'}>
              <option value="">{projectStatus === 'loading' ? 'Loading projects…' : 'Select project'}</option>
              {projects.filter((item) => {
                const text = `${item.projectCode || ''} ${item.title || ''} ${item.id || ''}`.toLowerCase();
                return !projectQuery.trim() || text.includes(projectQuery.trim().toLowerCase()) || item.id === projectId;
              }).map((item) => <option key={item.id} value={item.id}>{item.projectCode} · {item.title}</option>)}
            </select>
          </label>
          {projectStatus === 'error' ? <Button size="sm" variant="secondary" onClick={loadProjects}>Retry</Button> : null}
        </div>
      </header>

      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="The project plan could not be loaded." action={<Button onClick={() => load(projectId)}>Retry</Button>} /> : null}
      {status === 'missing' ? <ErrorState title="This project is no longer available." description="The project list has been refreshed." action={<Button onClick={() => chooseProject('')}>Choose another project</Button>} /> : null}

      {status === 'ready' && !projectId ? (
        <section className="lead-section plan-empty">
          <EmptyState title="Project planning" description="Select a project to view its execution timeline." />
          <Button onClick={() => document.querySelector('.plan-select select')?.focus()}>Select project</Button>
        </section>
      ) : null}

      {status === 'ready' && project ? (
        <>
          <section className="plan-project">
            <div className="plan-project__title">
              <h2>{project.title}</h2>
              <p>{project.projectCode}</p>
              <Badge tone={summary?.health === 'DELAYED' ? 'danger' : summary?.health === 'AT RISK' ? 'warning' : summary?.health === 'ON TRACK' ? 'progress' : 'neutral'}>{summary?.health || 'Not assessed'}</Badge>
            </div>
            <dl className="plan-project__meta">
              <div><dt>Project manager</dt><dd>{project.projectManager || 'Not assigned'}</dd></div>
              <div><dt>Customer</dt><dd>{project.customerName || 'Not specified'}</dd></div>
              <div><dt>Start date</dt><dd>{formatDate(project.startDate)}</dd></div>
              <div><dt>End date</dt><dd>{formatDate(project.targetDate)}</dd></div>
              <div><dt>Status</dt><dd>{PROJECT_STATUS[project.status] || project.status}</dd></div>
            </dl>
          </section>

          <section className="plan-summary" aria-label="Schedule summary">
            <div><span>Overall progress</span><strong>{summary?.progress == null ? 'Not assessed' : `${summary.progress}%`}</strong></div>
            <div><span>Tasks completed</span><strong>{summary?.taskCompleted || 0} / {summary?.taskTotal || 0}</strong></div>
            <div><span>Milestones</span><strong>{summary?.milestoneCompleted || 0} / {summary?.milestoneTotal || 0}</strong></div>
            <div><span>Overdue</span><strong>{summary?.overdue || 0}</strong></div>
            {plan.baseline ? (
              <div>
                <span>Baseline</span>
                <strong>
                  {shortDate(plan.baseline.plannedStart)} → {shortDate(plan.baseline.plannedEnd)}
                  {summary?.varianceDays != null ? ` · ${summary.varianceDays > 0 ? '+' : ''}${summary.varianceDays}d` : ''}
                </strong>
              </div>
            ) : null}
          </section>

          <div className="plan-toolbar">
            <div>
              <p>Timeline</p>
              <strong>{mode === 'week' ? 'Week based' : mode === 'day' ? 'Day based' : 'Month based'}</strong>
            </div>
            <div className="plan-tools">
              <Button size="sm" variant="secondary" onClick={() => setCommand({ type: 'today', id: Date.now() })}>Today</Button>
              <Button size="sm" variant="secondary" onClick={() => setCommand({ type: 'fit', id: Date.now() })}>Fit to screen</Button>
              <button type="button" className="plan-zoom" aria-label="Zoom out" onClick={() => setDayWidth((value) => Math.max(6, value * 0.8))}><Minus size={14} /></button>
              <button type="button" className="plan-zoom" aria-label="Zoom in" onClick={() => setDayWidth((value) => Math.min(48, value * 1.25))}><Plus size={14} /></button>
              <div className="plan-modes">
                {['day', 'week', 'month'].map((item) => (
                  <button key={item} type="button" className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)}>{item}</button>
                ))}
              </div>
              <Button size="sm" variant="secondary" onClick={() => run(() => setBaseline(projectId), 'Baseline saved.')}>Set baseline</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditor('phase')}>Add phase</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditor('milestone')}>Add milestone</Button>
              <Button size="sm" onClick={() => { setForm({ ...blankTask, startDate: project.startDate || '', endDate: project.targetDate || project.startDate || '' }); setEditor('task'); }}><Plus size={14} /> Add task</Button>
            </div>
          </div>

          <div className="plan-filters">
            <input className="input" placeholder="Search tasks..." value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className="select" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
              <option value="">All statuses</option>
              {Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="select" value={team} onChange={(event) => setTeam(event.target.value)}>
              <option value="">All teams</option>
              {TEAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="select" value={assignee} onChange={(event) => setAssignee(event.target.value)}>
              <option value="">All assignees</option>
              {(plan.users || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
            <select className="select" value={phase} onChange={(event) => setPhase(event.target.value)}>
              <option value="">All phases</option>
              {(plan.phases || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select className="select" value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="">All priorities</option>
              {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="plan-overdue"><input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} /> Show overdue only</label>
          </div>

          {!plan.tasks.length && !plan.phases.length ? (
            <section className="lead-section plan-empty">
              <EmptyState title="No tasks have been scheduled for this project yet" description="Add a task with a start date and due date to place it on the timeline." />
              <div className="plan-tools">
                <Button onClick={() => setEditor('phase')}>Add phase</Button>
                <Button variant="secondary" onClick={() => { setForm({ ...blankTask, startDate: project.startDate || '', endDate: project.targetDate || '' }); setEditor('task'); }}>Add task</Button>
              </div>
            </section>
          ) : filtering && !visibleTasks.length ? (
            <section className="lead-section"><EmptyState title="No matching tasks" description="Try adjusting the task search or filters." /></section>
          ) : (
            <GanttChart
              project={project}
              phases={plan.phases}
              tasks={visibleTasks}
              milestones={filtering ? [] : plan.milestones}
              dependencies={plan.dependencies}
              mode={mode}
              dayWidth={dayWidth}
              collapsed={collapsed}
              hideEmpty={filtering}
              command={command}
              onDayWidth={setDayWidth}
              onTogglePhase={(id) => setCollapsed((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })}
              onOpenTask={setSelected}
              onSchedule={saveSchedule}
              onOpenMilestone={setMilestone}
            />
          )}

          {(plan.milestones || []).length ? (
            <ul className="plan-milestones">
              {plan.milestones.map((item) => (
                <li key={item.id}><button type="button" onClick={() => setMilestone(item)}>◆ {item.name}</button></li>
              ))}
            </ul>
          ) : null}

          <ul className="plan-legend">
            <li><i className="is-done" /> Completed</li>
            <li><i className="is-active" /> Active task period</li>
            <li><i className="is-upcoming" /> Upcoming</li>
            <li><i className="is-delayed" /> Delayed</li>
          </ul>
        </>
      ) : null}

      {selected ? (
        <aside className="plan-drawer">
          <header>
            <div>
              <p>{selected.taskCode}</p>
              <h2>{selected.title}</h2>
            </div>
            <button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button>
          </header>
          <dl>
            <div><dt>Phase</dt><dd>{plan.phases.find((item) => item.id === selected.phaseId)?.name || 'Unassigned'}</dd></div>
            <div><dt>Assignee</dt><dd>{selected.assignee || 'Unassigned'}</dd></div>
            <div><dt>Team</dt><dd>{TEAMS.find(([value]) => value === selected.teamCode)?.[1] || 'Not assigned'}</dd></div>
            <div><dt>Status</dt><dd>{selected.overdue ? 'Overdue' : TASK_STATUS[selected.status]}</dd></div>
            <div><dt>Priority</dt><dd>{PRIORITY[selected.priority]}</dd></div>
            <div><dt>Start</dt><dd>{formatDate(selected.startDate)}</dd></div>
            <div><dt>End</dt><dd>{formatDate(selected.endDate)}</dd></div>
            <div><dt>Duration</dt><dd>{selected.startDate && selected.endDate ? `${durationDays(selected.startDate, selected.endDate)} days` : 'Not scheduled'}</dd></div>
            <div><dt>Progress</dt><dd>{selected.progress}%</dd></div>
            <div><dt>Description</dt><dd>{selected.description || 'No description.'}</dd></div>
          </dl>
          <label className="field">
            <span className="field__label">Depends on</span>
            <select className="select" value={predecessorId} onChange={(event) => setPredecessorId(event.target.value)}>
              <option value="">Select predecessor</option>
              {plan.tasks.filter((task) => task.id !== selected.id).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
          </label>
          <Button size="sm" variant="secondary" disabled={!predecessorId} onClick={() => run(() => createDependency(projectId, { predecessorId, successorId: selected.id }), 'Dependency added.')}>Add dependency</Button>
          <ul className="plan-deps">
            {plan.dependencies.filter((item) => item.successorId === selected.id || item.predecessorId === selected.id).map((item) => {
              const otherId = item.successorId === selected.id ? item.predecessorId : item.successorId;
              const other = plan.tasks.find((task) => task.id === otherId);
              return (
                <li key={item.id}>
                  <span>{item.successorId === selected.id ? 'After' : 'Before'} {other?.title || 'task'}</span>
                  <button type="button" onClick={() => run(() => deleteDependency(projectId, item.id))}>Remove</button>
                </li>
              );
            })}
          </ul>
          <div className="lead-actions">
            <Button onClick={() => { setForm({ ...selected, phaseId: selected.phaseId || '', assigneeId: selected.assigneeId || '', estimatedHours: selected.estimatedHours ?? '' }); setEditor('edit'); }}>Edit task</Button>
            <Button variant="secondary" onClick={() => navigate(`/tasks?focus=${selected.id}`)}>Open task</Button>
            <Button variant="secondary" onClick={async () => {
              if (!window.confirm(`Delete ${selected.title}?`)) return;
              const payload = await run(() => deleteTask(projectId, selected.id), 'Task deleted.');
              if (payload) setSelected(null);
            }}>Delete</Button>
          </div>
        </aside>
      ) : null}

      <Modal open={editor === 'task' || editor === 'edit'} title={editor === 'edit' ? 'Edit task' : 'Add task'} onClose={() => setEditor(null)}>
        <form className="feas-stack" onSubmit={submitTask}>
          <label className="field"><span className="field__label">Task name</span><input className="input" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
          <label className="field"><span className="field__label">Phase</span>
            <select className="select" value={form.phaseId} onChange={(event) => setForm({ ...form, phaseId: event.target.value })}>
              <option value="">Unassigned</option>
              {(plan?.phases || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Assignee</span>
            <select className="select" value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">Unassigned</option>
              {(plan?.users || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Team</span>
            <select className="select" value={form.teamCode} onChange={(event) => setForm({ ...form, teamCode: event.target.value })}>
              <option value="">Not assigned</option>
              {TEAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Priority</span>
            <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Status</span>
            <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Start date</span><input className="input" type="date" required value={form.startDate || ''} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
          <label className="field"><span className="field__label">End date</span><input className="input" type="date" required value={form.endDate || ''} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
          <label className="field"><span className="field__label">Estimated hours</span><input className="input" type="number" min="0" value={form.estimatedHours} onChange={(event) => setForm({ ...form, estimatedHours: event.target.value })} /></label>
          <label className="field"><span className="field__label">Progress</span><input className="input" type="number" min="0" max="100" value={form.progress} onChange={(event) => setForm({ ...form, progress: event.target.value })} /></label>
          <label className="field"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={form.description || ''} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="lead-actions">
            <Button type="button" variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>{editor === 'edit' ? 'Save task' : 'Create task'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editor === 'phase'} title="Add phase" onClose={() => setEditor(null)}>
        <form className="feas-stack" onSubmit={(event) => {
          event.preventDefault();
          run(() => createPhase(projectId, phaseForm), 'Phase created.').then((payload) => { if (payload) setEditor(null); });
        }}>
          <label className="field"><span className="field__label">Phase name</span><input className="input" required value={phaseForm.name} onChange={(event) => setPhaseForm({ ...phaseForm, name: event.target.value })} /></label>
          <label className="field"><span className="field__label">Start date</span><input className="input" type="date" value={phaseForm.startDate} onChange={(event) => setPhaseForm({ ...phaseForm, startDate: event.target.value })} /></label>
          <label className="field"><span className="field__label">End date</span><input className="input" type="date" value={phaseForm.endDate} onChange={(event) => setPhaseForm({ ...phaseForm, endDate: event.target.value })} /></label>
          <label className="field"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={phaseForm.description} onChange={(event) => setPhaseForm({ ...phaseForm, description: event.target.value })} /></label>
          <div className="lead-actions">
            <Button type="button" variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create phase</Button>
          </div>
        </form>
      </Modal>

      <Modal open={editor === 'milestone'} title="Add milestone" onClose={() => setEditor(null)}>
        <form className="feas-stack" onSubmit={(event) => {
          event.preventDefault();
          run(() => createMilestone(projectId, milestoneForm), 'Milestone created.').then((payload) => { if (payload) setEditor(null); });
        }}>
          <label className="field"><span className="field__label">Milestone name</span><input className="input" required value={milestoneForm.name} onChange={(event) => setMilestoneForm({ ...milestoneForm, name: event.target.value })} /></label>
          <label className="field"><span className="field__label">Date</span><input className="input" type="date" required value={milestoneForm.date} onChange={(event) => setMilestoneForm({ ...milestoneForm, date: event.target.value })} /></label>
          <label className="field"><span className="field__label">Owner</span>
            <select className="select" value={milestoneForm.ownerId} onChange={(event) => setMilestoneForm({ ...milestoneForm, ownerId: event.target.value })}>
              <option value="">Unassigned</option>
              {(plan?.users || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Status</span>
            <select className="select" value={milestoneForm.status} onChange={(event) => setMilestoneForm({ ...milestoneForm, status: event.target.value })}>
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="COMPLETED">Completed</option>
              <option value="MISSED">Missed</option>
            </select>
          </label>
          <label className="field"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={milestoneForm.description} onChange={(event) => setMilestoneForm({ ...milestoneForm, description: event.target.value })} /></label>
          <div className="lead-actions">
            <Button type="button" variant="secondary" onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" loading={busy}>Create milestone</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(milestone)} title={milestone?.name || 'Milestone'} onClose={() => setMilestone(null)}>
        {milestone ? (
          <div className="feas-stack">
            <p>Date: {formatDate(milestone.date)}</p>
            <p>Status: {milestone.status}</p>
            <p>Owner: {milestone.owner || 'Not assigned'}</p>
            <p>{milestone.description || 'No description.'}</p>
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setMilestone(null)}>Close</Button>
              <Button variant="secondary" onClick={async () => {
                const payload = await run(() => deleteMilestone(projectId, milestone.id), 'Milestone removed.');
                if (payload) setMilestone(null);
              }}>Delete</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
