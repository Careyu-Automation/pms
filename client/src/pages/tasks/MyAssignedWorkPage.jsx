import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LayoutGrid, List, Plus } from 'lucide-react';
import { TaskForm } from '../../components/projects/detail/forms';
import { BOARD, PRIORITY, blankTask, canManage, taskPayload, taskToForm } from '../../components/projects/detail/model';
import { diffDays, todayIso } from '../../components/planning/planningModel';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { listProjects } from '../../services/costing.service';
import { TEAMS as PLAN_TEAMS } from '../../components/planning/planningModel';
import { createNamedTask, createProductTask, createTask, listMyTasks, updateListedTask } from '../../services/planning.service';
import { listProducts } from '../../services/products.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/my-work.css';

const WORK_STATUS = [
  ['NOT_STARTED', 'To Do'],
  ['IN_PROGRESS', 'In Progress'],
  ['ON_HOLD', 'On Hold'],
  ['COMPLETED', 'Completed'],
];

const STATUS_LABEL = {
  NOT_STARTED: 'To Do',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  AT_RISK: 'At Risk',
  CANCELLED: 'Cancelled',
};

const EMPTY_DATA = {
  tasks: [],
  summary: { total: 0, inProgress: 0, dueToday: 0, overdue: 0, completed: 0 },
  highlights: { today: [], upcoming: [], overdue: [] },
  projects: [],
  products: [],
  people: [],
};

function hoursText(value) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? `${number}h` : '—';
}

function lateLabel(task) {
  const days = diffDays(task.endDate, todayIso());
  if (days <= 1) return days <= 0 ? 'Due today' : '1 day overdue';
  return `${days} days overdue`;
}

function sourceName(task) {
  return task.source === 'product' ? (task.productName || 'Product') : (task.projectTitle || 'Project');
}

function Progress({ value }) {
  const progress = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <span className="mywork-progress">
      <span className="mywork-progress__track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></span>
      {progress}%
    </span>
  );
}

function StatusSelect({ task, busy, onChange }) {
  const options = WORK_STATUS.some(([value]) => value === task.status)
    ? WORK_STATUS
    : [...WORK_STATUS, [task.status, STATUS_LABEL[task.status] || task.status]];
  return (
    <select
      className="select mywork-status"
      aria-label={`${task.title} status`}
      value={task.status}
      disabled={busy}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => onChange(task, event.target.value)}
    >
      {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  );
}

export default function MyAssignedWorkPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const manage = canManage(user);
  const [pageStatus, setPageStatus] = useState('loading');
  const [data, setData] = useState(EMPTY_DATA);
  const [view, setView] = useState(() => (localStorage.getItem('careyu.pref.taskView') === 'board' ? 'board' : 'list'));
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [productId, setProductId] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [dueFilter, setDueFilter] = useState(() => {
    const stored = localStorage.getItem('careyu.pref.dueFilter') || '';
    return ['overdue', 'today', 'week', 'none'].includes(stored) ? stored : '';
  });
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [ownerType, setOwnerType] = useState('project');
  const [ownerId, setOwnerId] = useState('');
  const [projectTitle, setProjectTitle] = useState('');
  const [catalog, setCatalog] = useState({ projects: [], products: [] });
  const [busy, setBusy] = useState(false);

  const filters = useMemo(() => ({
    q: query,
    projectId,
    productId,
    team: teamFilter,
    status: statusFilter,
    priority: priorityFilter,
    due: dueFilter,
  }), [dueFilter, priorityFilter, productId, projectId, query, statusFilter, teamFilter]);

  const hasData = useRef(false);

  const load = useCallback((first) => {
    if (first) setPageStatus('loading');
    return listMyTasks(filters)
      .then((payload) => {
        hasData.current = true;
        setData({ ...EMPTY_DATA, ...payload.data, summary: payload.data.summary || EMPTY_DATA.summary, highlights: payload.data.highlights || EMPTY_DATA.highlights });
        setPageStatus('ready');
      })
      .catch((error) => {
        console.error('Unable to load your assigned work.', error);
        if (first || !hasData.current) setPageStatus('error');
        else push({ tone: 'danger', message: 'Unable to load your assigned work.' });
      });
  }, [filters, push]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { load(!hasData.current); }, [load]);

  function openCreate() {
    setOwnerType('project');
    setOwnerId('');
    setProjectTitle('');
    setForm({ ...blankTask(), assigneeId: user?.id || '' });
    setCreating(true);
    Promise.all([listProjects().catch(() => ({ data: { projects: [] } })), listProducts().catch(() => ({ data: { products: [] } }))])
      .then(([projects, products]) => {
        const next = {
          projects: projects.data.projects || [],
          products: products.data.products || [],
        };
        setCatalog(next);
        if (!next.projects.length && next.products.length) setOwnerType('product');
      });
  }

  async function submitCreate(event) {
    event.preventDefault();
    if (busy) return;
    if (ownerType === 'product' && !ownerId) {
      push({ tone: 'danger', message: 'Select a product.' });
      return;
    }
    if (ownerType === 'project' && !ownerId && projectTitle.trim().length < 2) {
      push({ tone: 'danger', message: 'Select a project or enter a project name.' });
      return;
    }
    const assigneeId = form.assigneeId || user?.id || '';
    if (!assigneeId) return;
    setBusy(true);
    try {
      const body = taskPayload({ ...form, assigneeId });
      if (ownerType === 'product') await createProductTask(ownerId, body);
      else if (ownerId) await createTask(ownerId, body);
      else await createNamedTask({ ...body, projectTitle: projectTitle.trim() });
      setCreating(false);
      push({ tone: 'success', message: 'Task created.' });
      await load(false);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!editing || busy) return;
    setBusy(true);
    try {
      await updateListedTask(editing.id, taskPayload(form));
      setEditing(null);
      push({ tone: 'success', message: 'Task updated.' });
      await load(false);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(task, status) {
    if (busy || status === task.status) return;
    setBusy(true);
    try {
      await updateListedTask(task.id, { status, progress: status === 'COMPLETED' ? 100 : task.progress });
      await load(false);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  function drop(event, status) {
    event.preventDefault();
    const id = event.dataTransfer.getData('text/plain');
    const task = data.tasks.find((item) => item.id === id);
    if (task) changeStatus(task, status);
  }

  const summary = data.summary;
  const owners = ownerType === 'product' ? catalog.products : catalog.projects;
  const kpis = [
    ['My Tasks', summary.total, 'Total'],
    ['In Progress', summary.inProgress, ''],
    ['Due Today', summary.dueToday, ''],
    ['Overdue', summary.overdue, ''],
    ['Completed', summary.completed, ''],
  ];

  return (
    <PageContainer>
      <header className="mywork-head">
        <div>
          <h1>{meta.title}</h1>
          <p>Tasks and work items assigned to you across projects and products.</p>
        </div>
        {manage ? <Button onClick={openCreate}><Plus size={16} /> New Task</Button> : null}
      </header>

      {pageStatus === 'loading' ? <div className="mywork-skeleton" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} />)}</div> : null}
      {pageStatus === 'error' ? (
        <ErrorState title="Unable to load your assigned work." action={<Button onClick={() => load(true)}>Retry</Button>} />
      ) : null}
      {pageStatus === 'ready' && summary.total === 0 ? (
        <div className="mywork-empty">
          <EmptyState
            title="No assigned work yet"
            description="Tasks assigned to you from projects and products will appear here."
          />
          <div className="mywork-empty-actions">
            <Link className="btn btn--secondary" to="/projects">View Projects</Link>
            <Link className="btn btn--secondary" to="/tasks">View Tasks</Link>
          </div>
        </div>
      ) : null}

      {pageStatus === 'ready' && summary.total > 0 ? (
        <div className="mywork">
          <section className="mywork-kpis" aria-label="Assigned work summary">
            {kpis.map(([label, value, note]) => (
              <article key={label} className={label === 'Overdue' && value > 0 ? 'mywork-kpi is-attention' : 'mywork-kpi'}>
                <span>{label}</span>
                <strong>{value}</strong>
                {note ? <small>{note}</small> : null}
              </article>
            ))}
          </section>

          <div className="mywork-toolbar">
            <input className="input" placeholder="Search tasks..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="select" aria-label="Team" value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)}>
              <option value="">Team</option>
              {PLAN_TEAMS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Project</option>
              {data.projects.map((project) => <option key={project.id} value={project.id}>{project.title || project.code}</option>)}
            </select>
            <select className="select" aria-label="Product" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Product</option>
              {data.products.map((product) => <option key={product.id} value={product.id}>{product.title || product.code}</option>)}
            </select>
            <select className="select" aria-label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Status</option>
              {WORK_STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="select" aria-label="Priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
              <option value="">Priority</option>
              {Object.entries(PRIORITY).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
            </select>
            <select className="select" aria-label="Due date" value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
              <option value="">Due Date</option>
              <option value="overdue">Overdue</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due Today</option>
              <option value="week">Due This Week</option>
              <option value="none">No Due Date</option>
            </select>
            <div className="mywork-views" role="tablist" aria-label="Assigned work view">
              <button type="button" className={view === 'board' ? 'is-active' : ''} onClick={() => setView('board')}><LayoutGrid size={16} /> Board</button>
              <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={16} /> List</button>
            </div>
          </div>

          <section className="mywork-section">
            <h2>Today&apos;s Work</h2>
            {data.highlights.today.length ? (
              <div className="mywork-scroll">
                <table className="data-table">
                  <tbody>
                    {data.highlights.today.map((task) => (
                      <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                        <td><strong>{task.title}</strong><div className="mywork-source"><span>{sourceName(task)}</span><em>{task.source === 'product' ? 'Product' : 'Project'}</em></div></td>
                        <td>{task.overdue ? 'Overdue' : task.endDate === todayIso() ? 'Due Today' : STATUS_LABEL[task.status]}</td>
                        <td>{task.overdue ? lateLabel(task) : formatDate(task.endDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mywork-quiet">Nothing is due or in progress today.</p>}
          </section>

          <section className="mywork-section">
            <h2>Upcoming</h2>
            {data.highlights.upcoming.length ? (
              <div className="mywork-scroll">
                <table className="data-table">
                  <tbody>
                    {data.highlights.upcoming.map((task) => (
                      <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                        <td>{formatDate(task.endDate)}</td>
                        <td><strong>{task.title}</strong></td>
                        <td>{sourceName(task)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mywork-quiet">No tasks due in the next 7 days.</p>}
          </section>

          <section className="mywork-section">
            <h2>Overdue</h2>
            {data.highlights.overdue.length ? (
              <>
                <p className="mywork-quiet">{data.highlights.overdue.length} {data.highlights.overdue.length === 1 ? 'task needs' : 'tasks need'} attention</p>
                <div className="mywork-scroll">
                  <table className="data-table">
                    <tbody>
                      {data.highlights.overdue.map((task) => (
                        <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                          <td><strong>{task.title}</strong><div className="mywork-source"><span>{sourceName(task)}</span></div></td>
                          <td>{lateLabel(task)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className="mywork-quiet">All assigned work is on schedule.</p>}
          </section>

          {view === 'list' ? (
            <section className="mywork-section">
              <h2>Assigned tasks</h2>
              {data.tasks.length ? (
                <div className="mywork-scroll">
                  <table className="data-table mywork-table">
                    <thead>
                      <tr>
                        <th>Task</th><th>Project / Product</th><th>Status</th><th>Priority</th><th>Due Date</th><th>Progress</th><th>Hours</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.map((task) => {
                        const priority = PRIORITY[task.priority] || { label: task.priority, tone: 'neutral' };
                        return (
                          <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                            <td><strong>{task.title}</strong></td>
                            <td>
                              <div className="mywork-source">
                                <span>{sourceName(task)}</span>
                                <em>{task.source === 'product' ? 'Product' : 'Project'}</em>
                              </div>
                            </td>
                            <td onClick={(event) => event.stopPropagation()}><StatusSelect task={task} busy={busy} onChange={changeStatus} /></td>
                            <td><Badge tone={priority.tone}>{priority.label}</Badge></td>
                            <td>{task.overdue ? lateLabel(task) : formatDate(task.endDate)}</td>
                            <td><Progress value={task.progress} /></td>
                            <td><div>Estimated: {hoursText(task.estimatedHours)}</div><div>Actual: {hoursText(task.actualHours)}</div></td>
                            <td onClick={(event) => event.stopPropagation()}>
                              <div className="mywork-actions">
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/tasks/${task.id}`)}>Open</Button>
                                {manage ? <Button size="sm" variant="secondary" onClick={() => { setForm(taskToForm(task)); setEditing(task); }}>Edit</Button> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mywork-quiet">No tasks match these filters.</p>}
            </section>
          ) : (
            <div className="mywork-board-scroll">
              <div className="mywork-board">
                {BOARD.map((column) => {
                  const cards = data.tasks.filter((task) => column.match.includes(task.status));
                  return (
                    <section key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, column.status)}>
                      <header><h2>{column.label}</h2><span>{cards.length}</span></header>
                      {cards.map((task) => {
                        const priority = PRIORITY[task.priority] || { label: task.priority, tone: 'neutral' };
                        return (
                          <article
                            key={task.id}
                            draggable={manage}
                            onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                            onClick={() => navigate(`/tasks/${task.id}`)}
                          >
                            <strong>{task.title}</strong>
                            <span>{sourceName(task)}</span>
                            <em>{task.source === 'product' ? 'Product' : 'Project'}</em>
                            <Badge tone={priority.tone}>{priority.label}</Badge>
                            <span>Due: {formatDate(task.endDate)}</span>
                            <Progress value={task.progress} />
                            <span>Estimated: {hoursText(task.estimatedHours)}</span>
                            <StatusSelect task={task} busy={busy} onChange={changeStatus} />
                          </article>
                        );
                      })}
                    </section>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <Modal open={creating} className="mywork-dialog" title="New Task" onClose={() => { if (!busy) setCreating(false); }}>
        <div className="mywork-owner">
          <label className="field">
            <span className="field__label">Belongs to</span>
            <select className="select" value={ownerType} onChange={(event) => { setOwnerType(event.target.value); setOwnerId(''); }}>
              <option value="project">Project</option>
              <option value="product">Product</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">{ownerType === 'product' ? 'Product' : 'Project'}</span>
            <select className="select" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value="">Select</option>
              {owners.map((item) => <option key={item.id} value={item.id}>{item.title || item.name || item.projectCode || item.productCode}</option>)}
            </select>
          </label>
          {ownerType === 'project' ? (
            <label className="field">
              <span className="field__label">Or new project name</span>
              <input className="input" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} placeholder="Project name" />
            </label>
          ) : null}
        </div>
        {form ? (
          <TaskForm
            form={form}
            setForm={setForm}
            users={data.people}
            phases={[]}
            busy={busy}
            submitLabel="Create task"
            onCancel={() => setCreating(false)}
            onSubmit={submitCreate}
          />
        ) : null}
      </Modal>
      <Modal open={Boolean(editing)} title="Edit task" onClose={() => { if (!busy) setEditing(null); }}>
        {editing && form ? (
          <TaskForm
            form={form}
            setForm={setForm}
            users={data.people}
            phases={[]}
            busy={busy}
            submitLabel="Save task"
            onCancel={() => setEditing(null)}
            onSubmit={submitEdit}
          />
        ) : null}
      </Modal>
    </PageContainer>
  );
}
