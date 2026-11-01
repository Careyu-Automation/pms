import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { OverviewPane, ProjectSidebar } from '../../components/projects/detail/OverviewPane';
import { MilestoneForm, ProjectForm, TaskForm } from '../../components/projects/detail/forms';
import {
  BoardPane,
  CalendarPane,
  HoursPane,
  MilestonesPane,
  TasksPane,
  TimelinePane,
} from '../../components/projects/detail/WorkPanes';
import {
  PRIORITY,
  PROJECT_STATUS,
  TABS,
  accessFor,
  blankTask,
  hourText,
  projectTeamName,
  taskPayload,
  taskToForm,
  todayIso,
} from '../../components/projects/detail/model';
import { EscalationGlance } from '../escalations/EscalationGlance';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  activateProject,
  confirmProjectPayment,
  deleteProject,
  deleteProjectDocument,
  downloadProjectDocument,
  getProject,
  listProjects,
  openProjectDocument,
  updateProject,
  updateProjectStatus,
  uploadProjectDocuments,
} from '../../services/costing.service';
import {
  createMilestone,
  createTask,
  deleteMilestone,
  deleteTask,
  deleteTime,
  getPlan,
  logTime,
  updateMilestone,
  updateTask,
} from '../../services/planning.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/planning.css';
import '../../styles/project-detail.css';

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { push } = useToast();
  const [project, setProject] = useState(null);
  const [plan, setPlan] = useState(null);
  const [managers, setManagers] = useState([]);
  const [failed, setFailed] = useState('');
  const [planFailed, setPlanFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [taskForm, setTaskForm] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [projectForm, setProjectForm] = useState(null);
  const [milestoneForm, setMilestoneForm] = useState(null);
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [memberId, setMemberId] = useState('');

  const requested = params.get('tab') || 'overview';
  const tab = TABS.some(([id]) => id === requested) ? requested : 'overview';
  useDocumentTitle(project?.title || 'Project');

  const loadProject = useCallback(() => getProject(projectId).then((payload) => {
    setProject(payload.data.project);
    setDescription(payload.data.project.description || '');
    return payload.data.project;
  }), [projectId]);

  const loadPlan = useCallback(() => getPlan(projectId).then((payload) => {
    setPlan(payload.data);
    setPlanFailed(false);
    return payload.data;
  }), [projectId]);

  useEffect(() => {
    let active = true;
    setFailed('');
    setProject(null);
    setPlan(null);
    setPlanFailed(false);
    loadProject()
      .catch((error) => {
        if (!active) return;
        setFailed(error.status === 404 ? 'missing' : 'error');
        if (error.status !== 404) push({ tone: 'danger', message: error.message });
      });
    loadPlan().catch(() => {
      if (active) setPlanFailed(true);
    });
    listProjects()
      .then((payload) => {
        if (active) setManagers(payload.data.managers || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loadPlan, loadProject, push]);

  function chooseTab(id) {
    const next = new URLSearchParams(params);
    if (id === 'overview') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  }

  async function refreshAfterPlan(payload) {
    setPlan(payload.data);
    try {
      await loadProject();
    } catch {
      /* The plan already reflects the task change. */
    }
  }

  async function run(action, success) {
    setBusy(true);
    try {
      const payload = await action();
      if (success) push({ tone: 'success', message: success });
      return payload;
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      return null;
    } finally {
      setBusy(false);
    }
  }

  function openCreate(seed) {
    setEditingTask(null);
    setTaskForm(blankTask({ ...seed, teamCode: project?.teamCode || '' }));
  }

  function openEditTask(task) {
    setEditingTask(task);
    setTaskForm(taskToForm(task));
  }

  async function submitTask(event) {
    event.preventDefault();
    const body = taskPayload(taskForm);
    const payload = await run(
      () => (editingTask ? updateTask(projectId, editingTask.id, body) : createTask(projectId, body)),
      editingTask ? 'Task updated.' : 'Task created.',
    );
    if (payload) {
      await refreshAfterPlan(payload);
      setTaskForm(null);
      setEditingTask(null);
    }
  }

  async function changeStatus(task, status) {
    const payload = await run(() => updateTask(projectId, task.id, { status }), 'Task status updated.');
    if (payload) await refreshAfterPlan(payload);
  }

  async function saveSchedule(task, startDate, endDate) {
    const payload = await run(() => updateTask(projectId, task.id, { startDate, endDate }), 'Task schedule updated.');
    if (payload) await refreshAfterPlan(payload);
  }

  async function submitProject(event) {
    event.preventDefault();
    const payload = await run(async () => {
      const saved = await updateProject(projectId, projectForm);
      if (projectForm.status !== project.status) {
        return updateProjectStatus(projectId, {
          status: projectForm.status,
          holdReason: projectForm.status === 'ON_HOLD' ? projectForm.statusNote : '',
          riskReason: projectForm.status === 'AT_RISK' ? projectForm.statusNote : '',
          completionDate: projectForm.status === 'COMPLETED' ? todayIso() : '',
          completionRemarks: projectForm.status === 'COMPLETED' ? projectForm.statusNote : '',
        });
      }
      return saved;
    }, 'Project updated.');
    if (payload) {
      setProject(payload.data.project);
      setDescription(payload.data.project.description || '');
      setProjectForm(null);
      loadPlan().catch(() => setPlanFailed(true));
    }
  }

  async function saveDescription() {
    const payload = await run(() => updateProject(projectId, {
      title: project.title,
      projectCode: project.projectCode,
      customerName: project.customerName,
      projectManagerId: project.projectManagerId,
      teamCode: project.teamCode,
      department: project.department,
      priority: project.priority,
      startDate: project.startDate,
      targetDate: project.targetDate,
      projectType: project.projectType,
      description,
    }), 'Description updated.');
    if (payload) {
      setProject(payload.data.project);
      setEditingDescription(false);
    }
  }

  async function completeProject() {
    const payload = await run(() => updateProjectStatus(projectId, {
      status: 'COMPLETED',
      completionDate: todayIso(),
      completionRemarks: 'Marked complete from the project page.',
    }), 'Project marked complete.');
    if (payload) {
      setProject(payload.data.project);
      setConfirm(null);
      loadPlan().catch(() => {});
    }
  }

  async function removeProject() {
    const payload = await run(() => deleteProject(projectId), 'Project deleted.');
    if (payload) navigate('/projects');
  }

  async function removeTask() {
    const payload = await run(() => deleteTask(projectId, confirm.task.id), 'Task deleted.');
    if (payload) {
      await refreshAfterPlan(payload);
      setConfirm(null);
    }
  }

  async function submitMilestone(event) {
    event.preventDefault();
    const payload = await run(
      () => (editingMilestone
        ? updateMilestone(projectId, editingMilestone.id, milestoneForm)
        : createMilestone(projectId, milestoneForm)),
      editingMilestone ? 'Milestone updated.' : 'Milestone created.',
    );
    if (payload) {
      await refreshAfterPlan(payload);
      setMilestoneForm(null);
      setEditingMilestone(null);
    }
  }

  async function removeMilestone() {
    const payload = await run(() => deleteMilestone(projectId, confirm.milestone.id), 'Milestone deleted.');
    if (payload) {
      await refreshAfterPlan(payload);
      setConfirm(null);
    }
  }

  async function uploadFiles(event) {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    const body = new FormData();
    files.forEach((file) => body.append('documents', file));
    const payload = await run(() => uploadProjectDocuments(projectId, body), 'Files uploaded.');
    if (payload) {
      setProject((current) => ({ ...current, documents: payload.data.documents }));
      loadProject().catch(() => {});
    }
  }

  async function viewFile(file) {
    try {
      const blob = await openProjectDocument(projectId, file.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  if (failed === 'missing') {
    return (
      <PageContainer>
        <ErrorState
          title="Project not found"
          description="The project you're looking for does not exist or you don't have access."
          action={<Button onClick={() => navigate('/projects')}>Back to Internal Projects</Button>}
        />
      </PageContainer>
    );
  }

  if (failed === 'error') {
    return (
      <PageContainer>
        <ErrorState title="This project could not be loaded." action={<Button onClick={() => window.location.reload()}>Retry</Button>} />
      </PageContainer>
    );
  }

  if (!project) {
    return (
      <PageContainer>
        <div className="pd-skeleton" aria-hidden="true">
          <span /><span /><span />
        </div>
      </PageContainer>
    );
  }

  const access = accessFor(project, user);
  const meta = PROJECT_STATUS[project.status] || { label: project.status, tone: 'neutral' };
  const priority = PRIORITY[project.priority] || { label: project.priority, tone: 'neutral' };
  const summary = plan?.summary;
  const tasks = plan?.tasks || [];
  const timeSpent = (plan?.timeEntries || []).reduce((sum, entry) => sum + (Number(entry.hours) || 0), 0);
  const users = plan?.users || managers.map((person) => ({ id: person.id, fullName: person.fullName }));

  return (
    <PageContainer>
      <div className="pd-page">
        <header className="pd-header">
          <div>
            <button type="button" className="pd-back" onClick={() => navigate('/projects')}>← Back</button>
            <p className="pd-crumb"><Link to="/projects">Internal Projects</Link> / {project.title}</p>
            <h1>{project.title}</h1>
            <div className="pd-pills">
              <Badge tone={meta.tone}>{meta.label}</Badge>
              <span className="pd-code">{project.projectCode}</span>
            </div>
            <p className="pd-meta">
              {projectTeamName(project)}
              <span aria-hidden="true"> · </span>
              {formatDate(project.startDate)}
              <span aria-hidden="true"> · </span>
              {priority.label}
              <span aria-hidden="true"> · </span>
              {summary?.progress == null ? 'Not assessed' : `${summary.progress}%`}
              <span aria-hidden="true"> · </span>
              {summary ? `${summary.taskCompleted} / ${summary.taskTotal} completed` : '0 / 0 completed'}
              <span aria-hidden="true"> · </span>
              {hourText(timeSpent)} spent
            </p>
          </div>
          <div className="pd-actions">
            {access.canEdit && project.orderCode && !['PAYMENT_CONFIRMED', 'CREDIT_APPROVED', 'WAIVED'].includes(project.paymentStatus) ? (
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  const payload = await run(
                    () => confirmProjectPayment(projectId, { paymentStatus: 'PAYMENT_CONFIRMED', activate: true }),
                    'Payment confirmed and project activated where eligible.',
                  );
                  if (payload?.data?.project) setProject(payload.data.project);
                }}
              >
                Confirm Payment
              </Button>
            ) : null}
            {access.canEdit && project.orderCode && !project.isActivated && ['PAYMENT_CONFIRMED', 'CREDIT_APPROVED', 'WAIVED', 'PARTIALLY_PAID'].includes(project.paymentStatus) ? (
              <Button
                variant="secondary"
                loading={busy}
                onClick={async () => {
                  const payload = await run(() => activateProject(projectId), 'Project activated for execution.');
                  if (payload?.data?.project) setProject(payload.data.project);
                }}
              >
                Activate Project
              </Button>
            ) : null}
            {access.canComplete && project.status !== 'COMPLETED' ? (
              <Button variant="secondary" onClick={() => setConfirm({ type: 'complete' })}>Mark complete</Button>
            ) : null}
            {access.canEdit ? (
              <Button variant="secondary" onClick={() => setProjectForm({
                title: project.title,
                projectCode: project.projectCode,
                customerName: project.customerName || '',
                projectManagerId: project.projectManagerId || '',
                teamCode: project.teamCode || '',
                department: project.department || '',
                priority: project.priority,
                status: project.status,
                startDate: project.startDate || '',
                targetDate: project.targetDate || '',
                description: project.description || '',
                statusNote: '',
                projectType: project.projectType || '',
              })}
              >Edit Project</Button>
            ) : null}
            {access.canPlan ? <Button onClick={() => openCreate()}>+ New task</Button> : null}
            {access.canDelete ? <Button variant="danger" onClick={() => setConfirm({ type: 'project' })}>Delete</Button> : null}
          </div>
        </header>

        <EscalationGlance projectId={project.id} />

        <div className="pd-tabs" role="tablist" aria-label="Project sections">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => chooseTab(id)}>{label}</button>
          ))}
        </div>

        {planFailed && !plan ? (
          <ErrorState title="The project plan could not be loaded." action={<Button onClick={() => loadPlan().catch(() => setPlanFailed(true))}>Retry</Button>} />
        ) : null}
        {!plan && !planFailed ? <div className="pd-skeleton" aria-hidden="true"><span /><span /></div> : null}

        {plan && tab === 'overview' ? (
          <div className="pd-layout">
            <OverviewPane
              project={project}
              plan={plan}
              access={access}
              editing={editingDescription}
              description={description}
              onDescription={setDescription}
              onEditDescription={() => { setDescription(project.description || ''); setEditingDescription(true); }}
              onSaveDescription={saveDescription}
              onCancelDescription={() => setEditingDescription(false)}
              memberId={memberId}
              onMember={setMemberId}
              busy={busy}
              onUpload={uploadFiles}
              onViewFile={viewFile}
              onDownloadFile={(file) => downloadProjectDocument(projectId, file).catch((error) => push({ tone: 'danger', message: error.message }))}
              onDeleteFile={async (file) => {
                const payload = await run(() => deleteProjectDocument(projectId, file.id), 'File removed.');
                if (payload) setProject((current) => ({ ...current, documents: payload.data.documents }));
              }}
            />
            <ProjectSidebar project={project} plan={plan} />
          </div>
        ) : null}

        {plan && tab === 'tasks' ? (
          <TasksPane tasks={tasks} access={access} onCreate={() => openCreate()} onEdit={openEditTask} onDelete={(task) => setConfirm({ type: 'task', task })} />
        ) : null}
        {plan && tab === 'board' ? <BoardPane tasks={tasks} access={access} onStatus={changeStatus} /> : null}
        {plan && tab === 'timeline' ? (
          <TimelinePane project={plan.project || project} plan={plan} onSchedule={saveSchedule} onOpenTask={openEditTask} onOpenMilestone={(item) => { setEditingMilestone(item); setMilestoneForm({ name: item.name, date: item.date, ownerId: item.ownerId || '', description: item.description || '', status: item.status === 'MISSED' ? 'PENDING' : item.status }); }} />
        ) : null}
        {plan && tab === 'calendar' ? (
          <CalendarPane tasks={tasks} milestones={plan.milestones || []} access={access} onCreate={openCreate} onOpenTask={(id) => navigate(`/tasks/${id}`)} />
        ) : null}
        {plan && tab === 'hours' ? (
          <HoursPane
            tasks={tasks}
            entries={plan.timeEntries || []}
            users={users}
            access={access}
            busy={busy}
            onLog={async (form) => {
              const payload = await run(() => logTime(projectId, form), 'Hours logged.');
              if (payload) await refreshAfterPlan(payload);
              return payload;
            }}
            onDelete={async (entry) => {
              const payload = await run(() => deleteTime(projectId, entry.id), 'Hours entry removed.');
              if (payload) await refreshAfterPlan(payload);
            }}
          />
        ) : null}
        {plan && tab === 'milestones' ? (
          <div className="pd-stack">
            {access.canPlan ? <div className="pd-toolbar"><Button onClick={() => { setEditingMilestone(null); setMilestoneForm({ name: '', date: todayIso(), ownerId: '', description: '', status: 'PENDING' }); }}>+ Add milestone</Button></div> : null}
            <MilestonesPane
              milestones={plan.milestones || []}
              access={access}
              onCreate={() => { setEditingMilestone(null); setMilestoneForm({ name: '', date: todayIso(), ownerId: '', description: '', status: 'PENDING' }); }}
              onEdit={(item) => { setEditingMilestone(item); setMilestoneForm({ name: item.name, date: item.date, ownerId: item.ownerId || '', description: item.description || '', status: item.status === 'MISSED' ? 'PENDING' : item.status }); }}
              onDelete={(item) => setConfirm({ type: 'milestone', milestone: item })}
            />
          </div>
        ) : null}
      </div>

      <Modal open={Boolean(taskForm)} title={editingTask ? 'Edit task' : 'New task'} onClose={() => setTaskForm(null)}>
        {taskForm ? (
          <TaskForm
            form={taskForm}
            setForm={setTaskForm}
            users={users}
            phases={plan?.phases || []}
            busy={busy}
            submitLabel={editingTask ? 'Save task' : 'Create task'}
            onCancel={() => setTaskForm(null)}
            onSubmit={submitTask}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(projectForm)} title="Edit project" onClose={() => setProjectForm(null)}>
        {projectForm ? (
          <ProjectForm form={projectForm} setForm={setProjectForm} managers={managers.some((person) => person.id === project.projectManagerId) || !project.projectManagerId ? managers : [...managers, { id: project.projectManagerId, fullName: project.projectManager }]} busy={busy} onCancel={() => setProjectForm(null)} onSubmit={submitProject} />
        ) : null}
      </Modal>

      <Modal open={Boolean(milestoneForm)} title={editingMilestone ? 'Edit milestone' : 'Add milestone'} onClose={() => setMilestoneForm(null)}>
        {milestoneForm ? (
          <MilestoneForm
            form={milestoneForm}
            setForm={setMilestoneForm}
            users={users}
            busy={busy}
            submitLabel={editingMilestone ? 'Save milestone' : 'Create milestone'}
            onCancel={() => setMilestoneForm(null)}
            onSubmit={submitMilestone}
          />
        ) : null}
      </Modal>

      <Modal open={Boolean(confirm)} title={confirm?.type === 'project' ? 'Delete project?' : confirm?.type === 'complete' ? 'Mark project complete?' : confirm?.type === 'milestone' ? 'Delete milestone?' : 'Delete task?'} onClose={() => setConfirm(null)}>
        <div className="feas-stack">
          <p>
            {confirm?.type === 'project' ? 'This will remove the project and its project-specific records.' : null}
            {confirm?.type === 'complete' ? 'This changes the project status to Completed and records the completion time.' : null}
            {confirm?.type === 'task' ? `This removes ${confirm.task.title} from the project plan.` : null}
            {confirm?.type === 'milestone' ? `This removes ${confirm.milestone.name} from the project.` : null}
          </p>
          <div className="lead-actions">
            <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm?.type === 'complete' ? <Button onClick={completeProject} loading={busy}>Mark complete</Button> : null}
            {confirm?.type === 'project' ? <Button variant="danger" onClick={removeProject} loading={busy}>Delete project</Button> : null}
            {confirm?.type === 'task' ? <Button variant="danger" onClick={removeTask} loading={busy}>Delete task</Button> : null}
            {confirm?.type === 'milestone' ? <Button variant="danger" onClick={removeMilestone} loading={busy}>Delete milestone</Button> : null}
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
