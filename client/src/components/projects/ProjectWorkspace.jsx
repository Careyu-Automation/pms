import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid2x2, LayoutGrid, List, MoreHorizontal, Plus } from 'lucide-react';
import { canManage } from './detail/model';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';
import { formatMoney as quoteMoney } from '../costing/costingModel';
import { useAuth } from '../../context/AuthContext';
import { convertCosting, deleteProject, listEligibleProjects, updateProject } from '../../services/costing.service';
import { formatDate } from '../../utils/format';

const STATUS = {
  NOT_STARTED: { label: 'Not Started', tone: 'neutral' },
  PLANNING: { label: 'Planning', tone: 'review' },
  READY_FOR_EXECUTION: { label: 'Ready for Execution', tone: 'info' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'hold' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  ASSIGNED: { label: 'Assigned', tone: 'progress' },
  TEAM_REVIEW: { label: 'Team Review', tone: 'review' },
  TASK_BREAKDOWN: { label: 'Task Breakdown', tone: 'progress' },
  COMPLETION_SUBMITTED: { label: 'Completion Submitted', tone: 'review' },
  HANDOVER: { label: 'Handover', tone: 'info' },
};

const PAYMENT = {
  AWAITING_PAYMENT: { label: 'Awaiting Payment', tone: 'pending' },
  PARTIALLY_PAID: { label: 'Partially Paid', tone: 'warning' },
  PAYMENT_CONFIRMED: { label: 'Payment Confirmed', tone: 'completed' },
  PAYMENT_OVERDUE: { label: 'Payment Overdue', tone: 'danger' },
  CREDIT_APPROVED: { label: 'Credit Approved', tone: 'info' },
  WAIVED: { label: 'Waived / N/A', tone: 'neutral' },
};

const PRIORITY = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
const TYPES = ['Delivery', 'Automation', 'Robotics', 'Vision', 'Software', 'R&D', 'Internal', 'Implementation', 'Service'];
const PAGE_SIZE = 12;

function displayType(project) {
  if (project.projectType) return project.projectType;
  const teams = String(project.teams || '').toLowerCase();
  if (teams.includes('vision')) return 'Vision';
  if (teams.includes('robot')) return 'Robotics';
  if (teams.includes('software')) return 'Software';
  if (teams.includes('execution')) return 'Implementation';
  return teams ? 'Delivery' : 'Not set';
}

function teamLabel(project) {
  return String(project.teams || '').split(',')[0]?.trim() || 'Not assigned';
}

function progressText(project) {
  if (!project.taskTotal) return 'Not assessed';
  return `${project.progress ?? 0}%`;
}

export function ProjectWorkspace({ projects, managers, summary, mode = 'all', allowCreate, onChanged, onError }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const manage = canManage(user);
  const activeMode = mode === 'active';
  const [view, setView] = useState(() => localStorage.getItem('projectViewMode') || 'list');
  const [query, setQuery] = useState('');
  const [projectStatus, setProjectStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [managerId, setManagerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState('');
  const [editProject, setEditProject] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    localStorage.setItem('projectViewMode', view);
  }, [view]);

  useEffect(() => {
    setPage(1);
  }, [query, projectStatus, paymentStatus, managerId, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    return projects.filter((row) => {
      const text = `${row.projectCode} ${row.orderCode} ${row.title} ${row.customerName} ${row.projectManager} ${row.teams} ${row.leadCode}`.toLowerCase();
      if (query && !text.includes(query.trim().toLowerCase())) return false;
      if (projectStatus && row.status !== projectStatus) return false;
      if (paymentStatus && row.paymentStatus !== paymentStatus) return false;
      if (managerId && row.projectManagerId !== managerId) return false;
      const start = row.startDate || row.targetDate || '';
      const end = row.targetDate || row.startDate || '';
      if ((dateFrom || dateTo) && !start && !end) return false;
      if (dateFrom && end && end < dateFrom) return false;
      if (dateTo && start && start > dateTo) return false;
      return true;
    }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }, [projects, query, projectStatus, paymentStatus, managerId, dateFrom, dateTo]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const cards = activeMode
    ? [
      ['Total Active', summary?.total ?? projects.length],
      ['In Progress', summary?.inProgress ?? 0],
      ['Not Started', summary?.notStarted ?? 0],
      ['On Hold', summary?.onHold ?? 0],
      ['Nearing Deadline', summary?.nearingDeadline ?? 0],
      ['Overdue', summary?.overdue ?? 0],
      ['Completed', summary?.completed ?? 0],
    ]
    : [
      ['Total Projects', summary?.total ?? projects.length],
      ['Planning', summary?.planning ?? 0],
      ['Not Started', summary?.notStarted ?? 0],
      ['In Progress', summary?.inProgress ?? 0],
      ['On Hold', summary?.onHold ?? 0],
      ['Completed', summary?.completed ?? 0],
      ['Overdue', summary?.overdue ?? 0],
    ];

  function clearFilters() {
    setQuery('');
    setProjectStatus('');
    setPaymentStatus('');
    setManagerId('');
    setDateFrom('');
    setDateTo('');
  }

  async function openCreate() {
    setCreateOpen(true);
    setSelectedId('');
    setForm(null);
    try {
      const payload = await listEligibleProjects();
      setOpportunities(payload.data.opportunities || []);
    } catch (error) {
      onError(error.message);
    }
  }

  function continueCreate() {
    const opportunity = opportunities.find((item) => item.id === selectedId);
    if (!opportunity) return;
    setForm({
      title: opportunity.solutionName || opportunity.title || '',
      projectManagerId: '',
      projectType: 'Delivery',
      priority: 'MEDIUM',
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: '',
      description: '',
    });
  }

  async function createProject() {
    setBusy(true);
    try {
      const payload = await convertCosting(selectedId, form);
      setCreateOpen(false);
      navigate(`/projects/${payload.data.projectId}`);
    } catch (error) {
      if (error.details?.projectId) {
        setCreateOpen(false);
        onError(error.message);
        navigate(`/projects/${error.details.projectId}`);
        return;
      }
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await updateProject(editProject.id, editProject);
      setEditProject(null);
      onChanged();
    } catch (error) {
      onError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(project) {
    try {
      await deleteProject(project.id);
      setMenuId('');
      setPendingDelete(null);
      onChanged();
    } catch (error) {
      onError(error.message);
    }
  }

  return (
    <div className="project-board">
      <header className="project-board__head">
        <div>
          <p className="project-board__crumb">Projects</p>
          <h1>{activeMode ? 'Active Projects' : 'Projects'}</h1>
          <p>
            {activeMode
              ? 'Confirmed orders that have completed payment confirmation and project activation.'
              : 'Central workspace for planning, tracking, and executing converted projects.'}
          </p>
        </div>
        <div className="project-board__tools">
          <div className="project-views" role="tablist" aria-label="Project view">
            <button type="button" className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')}><LayoutGrid size={16} /> Cards</button>
            <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={16} /> List</button>
            <button type="button" className={view === 'tiles' ? 'is-active' : ''} onClick={() => setView('tiles')}><Grid2x2 size={16} /> Tiles</button>
          </div>
          {allowCreate ? <Button onClick={openCreate}><Plus size={16} /> New Project</Button> : null}
        </div>
      </header>
      <section className="project-summary" aria-label="Project summary">
        {cards.map(([label, value]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>
      <p className="project-board__count">{filtered.length === projects.length ? `${projects.length} Projects` : `Showing ${filtered.length} of ${projects.length} projects`}</p>
      <div className="project-filters">
        <input className="input" placeholder="Search project, order, customer, lead..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="select" value={projectStatus} onChange={(event) => setProjectStatus(event.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS).filter(([value]) => !activeMode || value !== 'CANCELLED').map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <select className="select" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)}>
          <option value="">All payment statuses</option>
          {Object.entries(PAYMENT).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
        </select>
        <select className="select" value={managerId} onChange={(event) => setManagerId(event.target.value)}>
          <option value="">All managers</option>
          {(managers || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
        <div className="project-range">
          <input className="input" type="date" aria-label="From date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          <span>to</span>
          <input className="input" type="date" aria-label="To date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        </div>
      </div>
      {!projects.length ? (
        <div className="lead-section">
          <EmptyState
            title={activeMode ? 'No active projects' : 'No projects yet'}
            description={activeMode
              ? 'A project becomes active only after order conversion and the required payment confirmation.'
              : 'Convert an approved costing with an accepted quotation to create a project record.'}
          />
          <Button onClick={() => navigate(activeMode ? '/projects' : '/lead-pipeline')}>{activeMode ? 'Open Projects' : 'Open lead pipeline'}</Button>
        </div>
      ) : null}
      {projects.length && !filtered.length ? (
        <div className="lead-section">
          <EmptyState title="No matching projects" description="Try adjusting your search or filters." />
          <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
        </div>
      ) : null}
      {view === 'cards' && visible.length ? (
        <div className="project-cards">
          {visible.map((project) => {
            const meta = STATUS[project.status] || { label: project.status, tone: 'neutral' };
            return (
              <article key={project.id} className="project-card" onClick={() => navigate(`/projects/${project.id}`)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/projects/${project.id}`); }} tabIndex={0}>
                <header>
                  <h2>{project.title}</h2>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </header>
                <div className="project-card__tags">
                  <Badge tone="neutral">{PRIORITY[project.priority] || project.priority}</Badge>
                  <Badge tone="info">{displayType(project)}</Badge>
                  <span>{teamLabel(project)}</span>
                </div>
                <p>{project.description || 'No project description available.'}</p>
                <div className="project-meter">
                  <div><span>Tasks</span><strong>{project.taskTotal ? `${project.taskCompleted} / ${project.taskTotal}` : 'Not assessed'}</strong></div>
                  <div className={`project-meter__track${project.taskTotal ? '' : ' is-empty'}`} role="progressbar" aria-valuenow={project.progress || 0} aria-valuemin={0} aria-valuemax={100}>
                    {project.taskTotal ? <span style={{ width: `${project.progress || 0}%` }} /> : null}
                  </div>
                </div>
                <footer>
                  <div>
                    <strong>{project.projectCode}</strong>
                    <span>{project.projectManager || 'Not assigned'}</span>
                  </div>
                  <span>{formatDate(project.targetDate) || 'No target date'}</span>
                </footer>
                <div className="project-card__actions" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                  <Button size="sm" onClick={() => navigate(`/projects/${project.id}`)}>Open</Button>
                  {manage ? <Button size="sm" variant="secondary" onClick={() => setEditProject({ ...project })}>Edit</Button> : null}
                  {manage ? <button type="button" className="project-more" aria-label="More actions" onClick={() => setMenuId(menuId === project.id ? '' : project.id)}><MoreHorizontal size={16} /></button> : null}
                  {manage && menuId === project.id ? <div className="project-menu"><button type="button" onClick={() => setPendingDelete(project)}>Delete</button></div> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
      {view === 'tiles' && visible.length ? (
        <div className="project-tiles">
          {visible.map((project) => {
            const meta = STATUS[project.status] || { label: project.status, tone: 'neutral' };
            return (
              <button key={project.id} type="button" className="project-tile" onClick={() => navigate(`/projects/${project.id}`)}>
                <span>{project.projectCode}</span>
                <strong>{project.title}</strong>
                <Badge tone={meta.tone}>{meta.label}</Badge>
                <em>{progressText(project)}</em>
                <div className={`project-meter__track${project.taskTotal ? '' : ' is-empty'}`}>
                  {project.taskTotal ? <span style={{ width: `${project.progress || 0}%` }} /> : null}
                </div>
                <small>{project.projectManager || 'Not assigned'}</small>
                <small>{formatDate(project.targetDate) || 'No target date'}</small>
              </button>
            );
          })}
        </div>
      ) : null}
      {view === 'list' && visible.length ? (
        <div className="lead-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project ID</th>
                {activeMode ? <th>Order ID</th> : <th>Lead ID</th>}
                <th>Project</th>
                <th>Customer</th>
                {activeMode ? <th>Order Date</th> : null}
                {activeMode ? <th>Payment</th> : <th>Order ID</th>}
                {activeMode ? <th>Activated</th> : null}
                <th>Manager</th>
                <th>Progress</th>
                <th>Target</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Priority</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((project) => {
                const meta = STATUS[project.status] || { label: project.status, tone: 'neutral' };
                const pay = PAYMENT[project.paymentStatus] || { label: project.paymentStatus || '—', tone: 'neutral' };
                return (
                  <tr key={project.id} className="is-clickable" onClick={() => navigate(`/projects/${project.id}`)}>
                    <td>{project.projectCode}</td>
                    {activeMode ? <td>{project.orderCode || '—'}</td> : <td>{project.leadCode || '—'}</td>}
                    <td>{project.title}</td>
                    <td>{project.customerName}</td>
                    {activeMode ? <td>{formatDate(project.orderDate)}</td> : null}
                    {activeMode ? <td><Badge tone={pay.tone}>{pay.label}</Badge></td> : <td>{project.orderCode || '—'}</td>}
                    {activeMode ? <td>{formatDate(project.activatedAt)}</td> : null}
                    <td>{project.projectManager || 'Not assigned'}</td>
                    <td>{progressText(project)}</td>
                    <td>{formatDate(project.targetDate)}</td>
                    <td>{project.currentStage || meta.label}</td>
                    <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td>{PRIORITY[project.priority] || project.priority}</td>
                    <td className="project-row-actions" onClick={(event) => event.stopPropagation()}>
                      <Button size="sm" onClick={() => navigate(`/projects/${project.id}`)}>View Project</Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/projects/${project.id}?tab=tasks`)}>Tasks</Button>
                      {manage && allowCreate ? <Button size="sm" variant="secondary" onClick={() => setEditProject({ ...project })}>Edit</Button> : null}
                      {manage && allowCreate ? <button type="button" className="project-more" aria-label="More actions" onClick={() => setMenuId(menuId === project.id ? '' : project.id)}><MoreHorizontal size={16} /></button> : null}
                      {manage && allowCreate && menuId === project.id ? <div className="project-menu"><button type="button" onClick={() => setPendingDelete(project)}>Delete</button></div> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {filtered.length > PAGE_SIZE ? (
        <div className="project-pager">
          <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} projects</span>
          <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="secondary" disabled={page === pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      ) : null}
      <Modal open={Boolean(editProject)} title="Edit project" onClose={() => setEditProject(null)}>
        {editProject ? (
          <div className="feas-stack">
            <section>
              <h3>Basic information</h3>
              <label className="field"><span className="field__label">Project name</span><input className="input" value={editProject.title} onChange={(event) => setEditProject({ ...editProject, title: event.target.value })} /></label>
              <label className="field"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={editProject.description || ''} onChange={(event) => setEditProject({ ...editProject, description: event.target.value })} /></label>
              <p className="feas-note">Status is {STATUS[editProject.status]?.label || editProject.status}. Change it from the project page so a hold, risk, or completion reason can be recorded.</p>
            </section>
            <section>
              <h3>Schedule</h3>
              <label className="field"><span className="field__label">Start date</span><input className="input" type="date" value={editProject.startDate || ''} onChange={(event) => setEditProject({ ...editProject, startDate: event.target.value })} /></label>
              <label className="field"><span className="field__label">Target date</span><input className="input" type="date" value={editProject.targetDate || ''} onChange={(event) => setEditProject({ ...editProject, targetDate: event.target.value })} /></label>
            </section>
            <section>
              <h3>Ownership</h3>
              <label className="field"><span className="field__label">Project manager</span>
                <select className="select" value={editProject.projectManagerId || ''} onChange={(event) => setEditProject({ ...editProject, projectManagerId: event.target.value })}>
                  <option value="">Select</option>
                  {managers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>
            </section>
            <section>
              <h3>Classification</h3>
              <label className="field"><span className="field__label">Priority</span>
                <select className="select" value={editProject.priority} onChange={(event) => setEditProject({ ...editProject, priority: event.target.value })}>
                  {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="field"><span className="field__label">Project type</span>
                <select className="select" value={editProject.projectType || displayType(editProject)} onChange={(event) => setEditProject({ ...editProject, projectType: event.target.value })}>
                  {TYPES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
            </section>
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setEditProject(null)}>Cancel</Button>
              <Button onClick={saveEdit} loading={busy}>Save</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(pendingDelete)} title="Delete project?" onClose={() => setPendingDelete(null)}>
        <div className="feas-stack">
          <p>This will remove the project and its project-specific records.</p>
          <div className="lead-actions">
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => remove(pendingDelete)}>Delete project</Button>
          </div>
        </div>
      </Modal>
      <Modal open={createOpen} title="Convert approved opportunity" onClose={() => setCreateOpen(false)}>
        {!form ? (
          <div className="feas-stack">
            {opportunities.length ? opportunities.map((item) => (
              <label key={item.id} className="project-choice">
                <input type="radio" name="opportunity" checked={selectedId === item.id} onChange={() => setSelectedId(item.id)} />
                <span>
                  <strong>{item.leadCode}</strong> · {item.customerName}
                  <small>{item.solutionName || item.title} · {item.costingCode} · Feasibility {item.feasibilityStatus || 'recorded'} · Costing {item.status} · {item.approvedValue != null ? quoteMoney(item.approvedValue) : 'Amount not set'}</small>
                </span>
              </label>
            )) : <p className="feas-note">No approved costing is waiting to become a project.</p>}
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={continueCreate} disabled={!selectedId}>Continue</Button>
            </div>
          </div>
        ) : (
          <div className="feas-stack">
            <section>
              <h3>Project information</h3>
              <p className="feas-note">Project ID is generated automatically when the project is created.</p>
              <label className="field"><span className="field__label">Project name</span><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
              <label className="field"><span className="field__label">Project manager</span>
                <select className="select" value={form.projectManagerId} onChange={(event) => setForm({ ...form, projectManagerId: event.target.value })}>
                  <option value="">Select</option>
                  {managers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
                </select>
              </label>
              <label className="field"><span className="field__label">Project type</span>
                <select className="select" value={form.projectType} onChange={(event) => setForm({ ...form, projectType: event.target.value })}>
                  {TYPES.map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label className="field"><span className="field__label">Priority</span>
                <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </section>
            <section>
              <h3>Schedule</h3>
              <label className="field"><span className="field__label">Start date</span><input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
              <label className="field"><span className="field__label">Target completion</span><input className="input" type="date" value={form.targetDate} onChange={(event) => setForm({ ...form, targetDate: event.target.value })} /></label>
            </section>
            <section>
              <h3>Linked records</h3>
              <p className="feas-note">
                Lead {opportunities.find((item) => item.id === selectedId)?.leadCode || 'linked'} ·
                Feasibility study ·
                Solution & costing {opportunities.find((item) => item.id === selectedId)?.costingCode || 'linked'}
              </p>
            </section>
            <section>
              <h3>Description</h3>
              <label className="field"><span className="field__label">Project description</span><textarea className="textarea" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            </section>
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setForm(null)}>Back</Button>
              <Button onClick={createProject} loading={busy}>Create project</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
