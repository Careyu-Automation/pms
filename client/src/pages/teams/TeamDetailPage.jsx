import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { addTeamMember, deleteTeam, deleteTeamMeeting, getTeam, removeTeamMember, saveTeamMeeting, setTeamStatus, updateTeam, updateTeamMember, updateWorkRequest } from '../../services/teams.service';
import { formatDate, formatDateTime } from '../../utils/format';
import { ASSIGNMENT, LOAD_LABEL, MEETING_PLATFORM, PRIORITY, PROJECT_ROLE, REQUEST_STATUS, TASK_STATUS, TEAM_ROLE, teamToForm, validateTeam } from './teamModel';
import '../../styles/lead.css';
import '../../styles/teams.css';

const TABS = [
  ['overview', 'Overview'],
  ['members', 'Members'],
  ['tasks', 'Tasks'],
  ['projects', 'Projects'],
  ['meetings', 'Meetings'],
  ['requests', 'Requests'],
  ['workload', 'Workload'],
  ['activity', 'Activity'],
];

function hours(value) {
  const number = Number(value) || 0;
  return `${Number.isInteger(number) ? number : number.toFixed(1)}h`;
}

export default function TeamDetailPage() {
  const { teamId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const tab = TABS.some(([id]) => id === params.get('tab')) ? params.get('tab') : 'overview';
  function setTab(next) {
    const values = new URLSearchParams(params);
    values.set('tab', next);
    setParams(values, { replace: true });
  }
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [adding, setAdding] = useState(false);
  const [memberForm, setMemberForm] = useState({ userId: '', role: 'MEMBER', joinedAt: '', status: 'ACTIVE' });
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [taskQuery, setTaskQuery] = useState('');
  const [taskStatus, setTaskStatus] = useState('');
  const [taskPriority, setTaskPriority] = useState('');
  const [taskMember, setTaskMember] = useState('');
  const [taskProject, setTaskProject] = useState('');
  useDocumentTitle(data?.team?.name || 'Team');

  const load = useCallback(() => {
    setStatus('loading');
    return getTeam(teamId)
      .then((payload) => {
        setData(payload.data);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus(error.status === 404 ? 'missing' : 'error');
        if (error.status !== 404) push({ tone: 'danger', message: error.message });
      });
  }, [push, teamId]);

  useEffect(() => { load(); }, [load]);

  const team = data?.team;
  const access = data?.access || {};
  const members = useMemo(() => (data?.members || []).filter((member) => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) return true;
    return `${member.name} ${member.designation} ${member.email}`.toLowerCase().includes(query);
  }), [data, memberQuery]);
  const projects = useMemo(() => (data?.projects || []).filter((project) => {
    const query = projectQuery.trim().toLowerCase();
    if (!query) return true;
    return `${project.projectName} ${project.customerName} ${project.projectCode}`.toLowerCase().includes(query);
  }), [data, projectQuery]);
  const tasks = useMemo(() => (data?.tasks || []).filter((task) => {
    const query = taskQuery.trim().toLowerCase();
    if (query && !`${task.title} ${task.projectName} ${task.assigneeName}`.toLowerCase().includes(query)) return false;
    if (taskStatus && task.status !== taskStatus) return false;
    if (taskPriority && task.priority !== taskPriority) return false;
    if (taskMember && task.assigneeId !== taskMember) return false;
    if (taskProject && task.projectId !== taskProject) return false;
    return true;
  }), [data, taskMember, taskPriority, taskProject, taskQuery, taskStatus]);

  async function saveTeam(event) {
    event.preventDefault();
    const next = validateTeam(form, { code: true });
    if (Object.keys(next).length || busy) {
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      await updateTeam(team.id, form);
      setEditing(false);
      push({ tone: 'success', message: 'Team updated successfully.' });
      await load();
    } catch (error) {
      if (error.details?.fields) setErrors(error.details.fields);
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function saveMember(event) {
    event.preventDefault();
    if (!memberForm.userId || busy) return;
    setBusy(true);
    try {
      await addTeamMember(team.id, memberForm);
      setAdding(false);
      push({ tone: 'success', message: 'Member added successfully.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member, role) {
    try {
      await updateTeamMember(team.id, member.id, { role, status: member.status, joinedAt: member.joinedAt });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function removeMember(member) {
    setBusy(true);
    try {
      await removeTeamMember(team.id, member.id);
      setConfirm('');
      push({ tone: 'success', message: 'Member removed from the team.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    try {
      await setTeamStatus(team.id, 'ARCHIVED');
      setConfirm('');
      push({ tone: 'success', message: 'Team archived.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    setBusy(true);
    try {
      await deleteTeam(team.id);
      push({ tone: 'success', message: 'Team deleted.' });
      navigate('/teams');
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      setBusy(false);
    }
  }

  if (status === 'loading') return <PageContainer><div className="teams-skeleton" aria-hidden="true" /></PageContainer>;
  if (status === 'missing') return <PageContainer><ErrorState title="Team not found." action={<Button onClick={() => navigate('/teams')}>Back to teams</Button>} /></PageContainer>;
  if (status === 'error' || !team) return <PageContainer><ErrorState title="Team could not be loaded." action={<Button onClick={load}>Retry</Button>} /></PageContainer>;

  const available = (data.people || []).filter((person) => !(data.members || []).some((member) => member.userId === person.id && member.status === 'ACTIVE'));
  const kpis = [
    ['Members', team.members],
    ['Active Projects', team.activeProjects],
    ['Active Tasks', team.activeTasks],
    ['Completed Tasks', team.completedTasks],
    ['Overdue Tasks', team.overdueTasks],
    ['Completion', `${team.completion}%`],
  ];

  return (
    <PageContainer>
      <Link className="teams-back" to="/teams">← Back</Link>
      <header className="teams-detail-head">
        <div>
          <h1>{team.name}</h1>
          <div className="teams-pills">
            <Badge tone={team.status === 'ACTIVE' ? 'completed' : 'neutral'}>{team.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
            <span>{team.code}</span>
            <span>{team.department || 'No department'}</span>
            <span>Leads: {team.leadNames || team.leadName || 'Not assigned'}</span>
            <span>{ASSIGNMENT[team.assignmentRule] || 'Team lead assigns'}</span>
          </div>
        </div>
        <div className="teams-actions">
          {access.canManage ? <Button variant="secondary" onClick={() => { setForm(teamToForm(team)); setErrors({}); setEditing(true); }}>Edit Team</Button> : null}
          {access.canManage ? <Button onClick={() => { setMemberForm({ userId: '', role: 'MEMBER', joinedAt: '', status: 'ACTIVE' }); setAdding(true); }}>Add Member</Button> : null}
          {access.canArchive && team.status !== 'ARCHIVED' ? <Button variant="secondary" onClick={() => setConfirm('archive')}>Archive</Button> : null}
          {access.canArchive && team.status === 'ARCHIVED' ? <Button variant="secondary" onClick={() => setTeamStatus(team.id, 'ACTIVE').then(() => { push({ tone: 'success', message: 'Team restored.' }); return load(); }).catch((error) => push({ tone: 'danger', message: error.message }))}>Restore</Button> : null}
          {access.canDelete ? <Button variant="danger" onClick={() => setConfirm('delete')}>Delete</Button> : null}
        </div>
      </header>
      <section className="teams-kpis">
        {kpis.map(([label, value]) => (
          <article key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>
      <div className="teams-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="teams-grid">
          <section className="teams-panel">
            <h2>Team summary</h2>
            <p>{team.description || 'No description yet.'}</p>
            <dl>
              <div><dt>Team leads</dt><dd>{team.leadNames || team.leadName || 'Not assigned'}</dd></div>
              <div><dt>Department</dt><dd>{team.department || 'Not set'}</dd></div>
              <div><dt>Created</dt><dd>{formatDate(team.createdAt)}</dd></div>
              <div><dt>Completion</dt><dd>{team.completion}%</dd></div>
            </dl>
          </section>
          <section className="teams-panel">
            <h2>Recent activity</h2>
            {(data.activity || []).slice(0, 5).length ? (
              <ul className="teams-activity">
                {data.activity.slice(0, 5).map((item) => (
                  <li key={item.id}><Avatar name={item.actorName} size="sm" /><div><strong>{item.actorName}</strong><span>{item.action}</span><small>{formatDateTime(item.createdAt)}</small></div></li>
                ))}
              </ul>
            ) : <p className="teams-muted">No activity yet</p>}
          </section>
          <section className="teams-panel">
            <h2>Project contribution</h2>
            {(data.projects || []).length ? (
              <ul className="teams-activity">
                {data.projects.slice(0, 5).map((project) => (
                  <li key={project.id}>
                    <div>
                      <strong>{project.projectName}</strong>
                      <span>{PROJECT_ROLE[project.teamRole]} · Progress {project.projectProgress}% · Contribution {project.contributionPercent}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="teams-muted">No projects assigned to this team</p>}
          </section>
          <section className="teams-panel">
            <h2>Recent tasks</h2>
            {(data.tasks || []).length ? (
              <ul className="teams-activity">
                {data.tasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.title}</strong>
                      <span>{task.assigneeName || 'Unassigned'} · {TASK_STATUS[task.status] || task.status} · {task.progress}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="teams-muted">No team tasks yet</p>}
          </section>
        </div>
      ) : null}

      {tab === 'members' ? (
        <section className="teams-panel">
          <input className="input" placeholder="Search name or designation" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} />
          {members.length ? members.map((member) => (
            <article key={member.id} className="teams-member">
              <Avatar name={member.name} />
              <div>
                <strong><Link to={`/users?user=${member.userId}`}>{member.name}</Link></strong>
                <span>{member.designation || TEAM_ROLE[member.role]}</span>
                <span>{member.email}</span>
                <span>{member.projects} Projects · {member.activeTasks} Tasks · {member.progress}% Progress</span>
              </div>
              <Badge tone={member.status === 'ACTIVE' ? 'completed' : 'neutral'}>{member.status === 'ACTIVE' ? 'Active' : 'Inactive'}</Badge>
              {access.canManage ? (
                <select className="select" aria-label={`${member.name} role`} value={member.role} onChange={(event) => changeRole(member, event.target.value)}>
                  {Object.entries(TEAM_ROLE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              ) : <span>{TEAM_ROLE[member.role]}</span>}
              {access.canManage ? <Button size="sm" variant="danger" onClick={() => setConfirm(member)}>Remove</Button> : null}
            </article>
          )) : <EmptyState title="No members in this team" description="Add a person to give this team a working membership." />}
        </section>
      ) : null}

      {tab === 'projects' ? (
        <section className="teams-panel">
          <input className="input" placeholder="Search project or customer" value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} />
          {projects.length ? (
            <div className="teams-scroll">
              <table className="data-table">
                <thead><tr><th>Project ID</th><th>Project Name</th><th>Customer</th><th>Team Role</th><th>Project Manager</th><th>Project Progress</th><th>Team Contribution</th><th>Tasks</th><th>Due Date</th><th>Status</th></tr></thead>
                <tbody>
                  {projects.map((project) => (
                    <tr key={project.id} className="is-clickable" onClick={() => navigate(`/projects/${project.projectId}`)}>
                      <td>{project.projectCode}</td>
                      <td>{project.projectName}</td>
                      <td>{project.customerName || '—'}</td>
                      <td>{PROJECT_ROLE[project.teamRole]}</td>
                      <td>{project.managerName || '—'}</td>
                      <td>{project.projectProgress}%</td>
                      <td>{project.contributionPercent}%</td>
                      <td>{project.taskCount}</td>
                      <td>{formatDate(project.dueDate)}</td>
                      <td>{project.projectStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState title="No projects assigned to this team" description="Assign this team from a project to record its role and contribution." />}
        </section>
      ) : null}

      {tab === 'tasks' ? (
        <section className="teams-panel">
          <div className="teams-toolbar">
            <input className="input" placeholder="Search task, project, or member" value={taskQuery} onChange={(event) => setTaskQuery(event.target.value)} />
            <select className="select" aria-label="Project" value={taskProject} onChange={(event) => setTaskProject(event.target.value)}>
              <option value="">Project</option>
              {(data.projects || []).map((project) => <option key={project.projectId} value={project.projectId}>{project.projectName}</option>)}
            </select>
            <select className="select" aria-label="Member" value={taskMember} onChange={(event) => setTaskMember(event.target.value)}>
              <option value="">Member</option>
              {(data.members || []).map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
            </select>
            <select className="select" aria-label="Status" value={taskStatus} onChange={(event) => setTaskStatus(event.target.value)}>
              <option value="">Status</option>
              {Object.entries(TASK_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select className="select" aria-label="Priority" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)}>
              <option value="">Priority</option>
              {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {tasks.length ? (
            <div className="teams-scroll">
              <table className="data-table">
                <thead><tr><th>Task</th><th>Assignee</th><th>Project</th><th>Status</th><th>Priority</th><th>Start</th><th>Due</th><th>Progress</th><th>Estimated</th><th>Actual</th></tr></thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                      <td>{task.title}</td>
                      <td>{task.assigneeName || 'Unassigned'}</td>
                      <td>{task.projectName || '—'}</td>
                      <td>{TASK_STATUS[task.status] || task.status}</td>
                      <td>{PRIORITY[task.priority] || task.priority}</td>
                      <td>{formatDate(task.startDate)}</td>
                      <td>{formatDate(task.endDate)}</td>
                      <td>{task.progress}%</td>
                      <td>{hours(task.estimatedHours)}</td>
                      <td>{hours(task.actualHours)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title={data.tasks.length ? 'No tasks match these filters' : 'No team tasks yet'}
              description={data.tasks.length ? 'Adjust the search or filters to see other team tasks.' : 'Tasks assigned to this team on a project plan will appear here.'}
            />
          )}
        </section>
      ) : null}

      {tab === 'meetings' ? (
        <MeetingsPanel team={team} meetings={data.meetings || []} canManage={access.canEditMeetings} onChange={load} />
      ) : null}
      {tab === 'requests' ? (
        <RequestsPanel team={team} requests={data.requests || []} members={data.members || []} canManage={access.canManage} onChange={load} />
      ) : null}
      {tab === 'workload' ? (
        <section className="teams-panel">
          <div className="teams-kpis">
            <article><span>Total Members</span><strong>{data.workload.members}</strong></article>
            <article><span>Assigned Tasks</span><strong>{data.workload.assigned}</strong></article>
            <article><span>In Progress</span><strong>{data.workload.inProgress}</strong></article>
            <article><span>Completed</span><strong>{data.workload.completed}</strong></article>
            <article><span>Assigned hours</span><strong>{hours(data.workload.assignedHours)}</strong></article>
            <article><span>Logged hours</span><strong>{hours(data.workload.loggedHours)}</strong></article>
            <article><span>Capacity</span><strong>{hours(data.workload.capacityHours)}</strong></article>
            <article><span>Overloaded</span><strong>{data.workload.overloaded || 0}</strong></article>
          </div>
          {(data.workload.rows || []).length ? (
            <div className="teams-scroll">
              <table className="data-table">
                <thead><tr><th>Member</th><th>Open tasks</th><th>Estimated</th><th>Logged</th><th>Capacity</th><th>Utilization</th><th>Status</th></tr></thead>
                <tbody>
                  {data.workload.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.openTasks ?? row.activeTasks}</td>
                      <td>{hours(row.assignedHours ?? row.estimatedHours)}</td>
                      <td>{hours(row.loggedHours ?? row.actualHours)}</td>
                      <td>{hours(row.capacity)}</td>
                      <td>{row.utilization || 0}%</td>
                      <td>{LOAD_LABEL[row.loadStatus] || 'Normal'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="teams-muted">No members in this team</p>}
        </section>
      ) : null}

      {tab === 'performance' ? (
        <section className="teams-kpis">
          <article><span>Tasks Completed</span><strong>{data.performance.completed}</strong></article>
          <article><span>Tasks Pending</span><strong>{data.performance.pending}</strong></article>
          <article><span>Tasks Overdue</span><strong>{data.performance.overdue}</strong></article>
          <article><span>Average Completion</span><strong>{data.performance.averageCompletion}%</strong></article>
          <article><span>Projects Supported</span><strong>{data.performance.projectsSupported}</strong></article>
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="teams-panel">
          {(data.activity || []).length ? (
            <ul className="teams-activity">
              {data.activity.map((item) => (
                <li key={item.id}><Avatar name={item.actorName} size="sm" /><div><strong>{item.actorName}</strong><span>{item.action}</span><small>{formatDateTime(item.createdAt)}</small></div></li>
              ))}
            </ul>
          ) : <EmptyState title="No activity yet" description="Team changes, membership, and project assignments will be recorded here." />}
        </section>
      ) : null}

      <Modal open={editing} className="teams-dialog" title="Edit Team" onClose={() => { if (!busy) setEditing(false); }}>
        {form ? (
          <form className="teams-form" onSubmit={saveTeam}>
            <label className={errors.name ? 'field field--error' : 'field'}><span className="field__label">Team Name</span><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />{errors.name ? <span className="field__error">{errors.name}</span> : null}</label>
            <label className={errors.code ? 'field field--error' : 'field'}><span className="field__label">Team Code</span><input className="input" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} />{errors.code ? <span className="field__error">{errors.code}</span> : null}</label>
            <label className="field"><span className="field__label">Department</span><select className="select" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}><option value="">None</option>{(data.departments || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label className="field"><span className="field__label">Who can assign tasks?</span><select className="select" value={form.assignmentRule} onChange={(event) => setForm({ ...form, assignmentRule: event.target.value })}>{Object.entries(ASSIGNMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span className="field__label">Team Lead</span><select className="select" value={form.leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })}><option value="">No lead yet</option>{(data.people || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
            <label className="field"><span className="field__label">Status</span><select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
            <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" loading={busy}>Save Changes</Button></div>
          </form>
        ) : null}
      </Modal>
      <Modal open={adding} title="Add Member" onClose={() => { if (!busy) setAdding(false); }}>
        <form className="teams-form" onSubmit={saveMember}>
          <label className="field"><span className="field__label">Select User</span><select className="select" required value={memberForm.userId} onChange={(event) => setMemberForm({ ...memberForm, userId: event.target.value })}><option value="">Select</option>{available.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}</select></label>
          <label className="field"><span className="field__label">Team Role</span><select className="select" value={memberForm.role} onChange={(event) => setMemberForm({ ...memberForm, role: event.target.value })}>{Object.entries(TEAM_ROLE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span className="field__label">Joining Date</span><input className="input" type="date" value={memberForm.joinedAt} onChange={(event) => setMemberForm({ ...memberForm, joinedAt: event.target.value })} /></label>
          <label className="field"><span className="field__label">Status</span><select className="select" value={memberForm.status} onChange={(event) => setMemberForm({ ...memberForm, status: event.target.value })}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" loading={busy}>Add Member</Button></div>
        </form>
      </Modal>
      <Modal open={confirm === 'archive'} title={`Archive ${team.name}?`} onClose={() => { if (!busy) setConfirm(''); }}>
        <p>Archived teams leave the active list, keep their history, and cannot receive new tasks. An administrator can restore the team.</p>
        <div className="teams-form__actions"><Button variant="secondary" onClick={() => setConfirm('')}>Cancel</Button><Button variant="danger" onClick={deactivate} loading={busy}>Archive team</Button></div>
      </Modal>
      <Modal open={confirm === 'delete'} title={`Delete ${team.name}?`} onClose={() => { if (!busy) setConfirm(''); }}>
        <p>This is only available when the team has no members, projects, or tasks.</p>
        <div className="teams-form__actions"><Button variant="secondary" onClick={() => setConfirm('')}>Cancel</Button><Button variant="danger" onClick={destroy} loading={busy}>Delete Team</Button></div>
      </Modal>
      <Modal open={Boolean(confirm && typeof confirm === 'object')} title="Remove member?" onClose={() => { if (!busy) setConfirm(''); }}>
        <p>Remove {confirm.name} from {team.name}? Existing task assignments will remain unless they are reassigned.</p>
        <div className="teams-form__actions"><Button variant="secondary" onClick={() => setConfirm('')}>Cancel</Button><Button variant="danger" onClick={() => removeMember(confirm)} loading={busy}>Remove Member</Button></div>
      </Modal>
    </PageContainer>
  );
}

function MeetingsPanel({ team, meetings, canManage, onChange }) {
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ name: '', platform: 'TEAMS', url: '', description: '', isPrimary: true });
  const [busy, setBusy] = useState(false);

  function start(meeting) {
    setCurrent(meeting);
    setForm(meeting ? {
      name: meeting.name,
      platform: meeting.platform,
      url: meeting.url,
      description: meeting.description || '',
      isPrimary: meeting.isPrimary,
    } : { name: 'Team meeting', platform: 'TEAMS', url: '', description: '', isPrimary: meetings.length === 0 });
    setOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await saveTeamMeeting(team.id, form, current?.id);
      setOpen(false);
      push({ tone: 'success', message: 'Meeting saved successfully.' });
      await onChange();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="teams-panel">
      {canManage ? <Button onClick={() => start(null)}>Add meeting</Button> : null}
      {meetings.length ? meetings.map((meeting) => (
        <article key={meeting.id} className="teams-member">
          <div>
            <strong>{meeting.name}{meeting.isPrimary ? ' · Primary' : ''}</strong>
            <span>{MEETING_PLATFORM[meeting.platform] || meeting.platform}</span>
            <span>{meeting.url}</span>
          </div>
          <a href={meeting.url} target="_blank" rel="noreferrer">Join</a>
          <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(meeting.url).then(() => push({ tone: 'success', message: 'Meeting link copied.' }))}>Copy</Button>
          {canManage ? <Button size="sm" variant="secondary" onClick={() => start(meeting)}>Edit</Button> : null}
          {canManage ? <Button size="sm" variant="danger" onClick={() => deleteTeamMeeting(team.id, meeting.id).then(() => onChange()).catch((error) => push({ tone: 'danger', message: error.message }))}>Delete</Button> : null}
        </article>
      )) : <EmptyState title="No meeting link yet" description="Add the team's standing meeting so members can join from the team card." />}
      <Modal open={open} title={current ? 'Edit meeting' : 'Add meeting'} onClose={() => { if (!busy) setOpen(false); }}>
        <form className="teams-form" onSubmit={save}>
          <label className="field is-wide"><span className="field__label">Meeting name *</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label className="field"><span className="field__label">Platform</span><select className="select" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>{Object.entries(MEETING_PLATFORM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span className="field__label">Meeting URL *</span><input className="input" required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
          <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <label className="field"><span className="field__label">Primary meeting</span><select className="select" value={form.isPrimary ? 'yes' : 'no'} onChange={(event) => setForm({ ...form, isPrimary: event.target.value === 'yes' })}><option value="yes">Yes</option><option value="no">No</option></select></label>
          <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Save meeting</Button></div>
        </form>
      </Modal>
    </section>
  );
}

function RequestsPanel({ team, requests, members, canManage, onChange }) {
  const { push } = useToast();
  async function update(request, status, assignedTo = request.assignedTo || '') {
    try {
      await updateWorkRequest(team.id, request.id, { status, assignedTo });
      push({ tone: 'success', message: 'Work request updated.' });
      await onChange();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }
  if (!requests.length) return <EmptyState title="No work requests" description="Requests sent to this team will appear here for the lead to accept." />;
  return (
    <section className="teams-panel">
      <div className="teams-scroll">
        <table className="data-table">
          <thead><tr><th>Request</th><th>Requester</th><th>Project</th><th>Priority</th><th>Deadline</th><th>Status</th><th>Assigned to</th>{canManage ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td>{request.number}<div className="teams-muted">{request.title}</div></td>
                <td>{request.requesterName}</td>
                <td>{request.projectTitle || '—'}</td>
                <td>{PRIORITY[request.priority] || request.priority}</td>
                <td>{formatDate(request.deadline)}</td>
                <td>{REQUEST_STATUS[request.status] || request.status}</td>
                <td>{request.assigneeName || '—'}</td>
                {canManage ? (
                  <td className="teams-actions">
                    <Button size="sm" variant="secondary" onClick={() => update(request, 'ACCEPTED')}>Accept</Button>
                    <Button size="sm" variant="secondary" onClick={() => update(request, 'REJECTED')}>Reject</Button>
                    <select className="select" aria-label="Assign request" value={request.assignedTo || ''} onChange={(event) => update(request, 'ASSIGNED', event.target.value)}>
                      <option value="">Assign</option>
                      {members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
                    </select>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
