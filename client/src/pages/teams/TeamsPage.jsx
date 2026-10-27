import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Circle, Copy, LayoutGrid, List, Pencil, Plus, SquareStack, UsersRound } from 'lucide-react';
import { PageContainer, PageContent } from '../../components/layout/PageContainer';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { addTeamMember, createTeam, createWorkRequest, getTeam, listTeams, removeTeamMember, saveTeamMeeting, setTeamStatus, updateTeam, updateTeamMember } from '../../services/teams.service';
import { ASSIGNMENT, ASSIGNMENT_HELP, MEETING_PLATFORM, PRIORITY, REQUEST_STATUS, REQUEST_TAGS, blankTeam, validateTeam } from './teamModel';
import '../../styles/lead.css';
import '../../styles/teams.css';

const VIEW_KEY = 'teamsView';

function storedView() {
  const value = localStorage.getItem(VIEW_KEY);
  return value === 'list' || value === 'tiles' ? value : 'cards';
}

function TeamForm({ form, setForm, departments, people, errors, busy, onCancel, onSubmit }) {
  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  return (
    <form className="teams-form" onSubmit={onSubmit}>
      <p className="teams-muted is-wide">Set up a new team with members and assignment rules.</p>
      <label className={errors.name ? 'field field--error is-wide' : 'field is-wide'}>
        <span className="field__label">Name<span className="field__required">*</span></span>
        <input className="input" placeholder="e.g. Platform Engineering" value={form.name} onChange={(event) => set('name', event.target.value)} />
        {errors.name ? <span className="field__error">{errors.name}</span> : null}
      </label>
      <label className="field is-wide">
        <span className="field__label">Description</span>
        <textarea className="textarea" rows={3} placeholder="What this team owns" value={form.description} onChange={(event) => set('description', event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Who can assign tasks?</span>
        <select className="select" value={form.assignmentRule} onChange={(event) => set('assignmentRule', event.target.value)}>
          {Object.entries(ASSIGNMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <span className="field__hint">{ASSIGNMENT_HELP[form.assignmentRule]}</span>
      </label>
      <label className="field">
        <span className="field__label">Department</span>
        <select className="select" value={form.department} onChange={(event) => set('department', event.target.value)}>
          <option value="">None</option>
          {departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Category</span>
        <input className="input" placeholder="Software, Robotics, Vision..." value={form.category || ''} onChange={(event) => set('category', event.target.value)} />
      </label>
      <label className="field">
        <span className="field__label">Status</span>
        <select className="select" value={form.status || 'ACTIVE'} onChange={(event) => set('status', event.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>
      <label className="field">
        <span className="field__label">Meeting platform</span>
        <select className="select" value={form.meetingPlatform || 'TEAMS'} onChange={(event) => set('meetingPlatform', event.target.value)}>
          {Object.entries(MEETING_PLATFORM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="field">
        <span className="field__label">Meeting link</span>
        <input className="input" type="url" placeholder="https://" value={form.meetingUrl || ''} onChange={(event) => set('meetingUrl', event.target.value)} />
      </label>
      <label className="field is-wide">
        <span className="field__label">Initial team lead</span>
        <select className="select" value={form.leadId} onChange={(event) => set('leadId', event.target.value)}>
          <option value="">No lead yet</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
      </label>
      <label className="field is-wide">
        <span className="field__label">Team members</span>
        <select className="select" multiple value={form.memberIds || []} onChange={(event) => set('memberIds', [...event.target.selectedOptions].map((option) => option.value))}>
          {people.filter((person) => person.id !== form.leadId).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
        <span className="field__hint">Hold Ctrl to select more than one member.</span>
      </label>
      <div className="teams-form__actions">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={form.name.trim().length < 2}>{busy ? 'Creating team...' : 'Create team'}</Button>
      </div>
    </form>
  );
}

function Avatars({ names, onMore }) {
  const shown = names.slice(0, 5);
  const extra = names.length - shown.length;
  return (
    <div className="teams-avatars">
      {shown.map((name) => <Avatar key={name} name={name} size="sm" />)}
      {extra > 0 ? <button type="button" className="teams-more" onClick={onMore}>+{extra}</button> : null}
    </div>
  );
}

export default function TeamsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { push } = useToast();
  const [view, setView] = useState(storedView);
  const [status, setStatus] = useState('loading');
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [access, setAccess] = useState({ canCreate: false });
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [leadId, setLeadId] = useState('');
  const [rule, setRule] = useState('');
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState('name');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blankTeam);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [requestTeam, setRequestTeam] = useState(null);
  const [manageId, setManageId] = useState('');
  const [meetingTeam, setMeetingTeam] = useState(null);
  const loaded = useRef(false);

  const load = useCallback(() => {
    if (!loaded.current) setStatus('loading');
    return listTeams({
      q: query,
      status: archived ? 'ARCHIVED' : '',
      department,
      leadId,
      assignmentRule: rule,
    }).then((payload) => {
      setTeams(payload.data.teams || []);
      setDepartments(payload.data.departments || []);
      setLeads(payload.data.leads || []);
      setPeople(payload.data.people || []);
      setProjects(payload.data.projects || []);
      setAccess(payload.data.access || { canCreate: false });
      setSummary(payload.data.summary || null);
      loaded.current = true;
      setStatus('ready');
    }).catch((error) => {
      if (!loaded.current) setStatus('error');
      push({ tone: 'danger', message: error.message });
    });
  }, [archived, department, leadId, push, query, rule]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  const rows = useMemo(() => {
    const copy = [...teams];
    copy.sort((a, b) => {
      if (sort === 'members') return b.members - a.members;
      if (sort === 'open') return b.activeTasks - a.activeTasks;
      if (sort === 'overdue') return b.overdueTasks - a.overdueTasks;
      if (sort === 'projects') return b.activeProjects - a.activeProjects;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [sort, teams]);

  async function submit(event) {
    event.preventDefault();
    const next = validateTeam(form);
    if (Object.keys(next).length || busy) {
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const result = await createTeam(form);
      setCreating(false);
      push({ tone: 'success', message: 'Team created successfully.' });
      await load();
      if (result.data?.team?.id) navigate(`/teams/${result.data.team.id}`);
    } catch (error) {
      if (error.details?.fields) setErrors(error.details.fields);
      push({ tone: 'danger', message: error.message || 'Unable to create team.' });
    } finally {
      setBusy(false);
    }
  }

  async function archive(team) {
    try {
      await setTeamStatus(team.id, 'ARCHIVED');
      push({ tone: 'success', message: `${team.name} archived.` });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function restore(team) {
    try {
      await setTeamStatus(team.id, 'ACTIVE');
      push({ tone: 'success', message: `${team.name} restored.` });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  function openTeam(id) {
    navigate(`/teams/${id}`);
  }

  return (
    <PageContainer>
      <PageHeader
        title="Teams"
        description="Manage teams, members, leadership, workload and team assignments."
        actions={(
          <div className="teams-actions">
            <div className="teams-views" role="tablist" aria-label="Team view">
              <button type="button" className={view === 'cards' ? 'is-active' : ''} onClick={() => setView('cards')}><LayoutGrid size={16} /> Cards</button>
              <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={16} /> List</button>
              <button type="button" className={view === 'tiles' ? 'is-active' : ''} onClick={() => setView('tiles')}><SquareStack size={16} /> Tiles</button>
            </div>
            {access.canCreate ? <Button onClick={() => { setForm(blankTeam()); setErrors({}); setCreating(true); }}><Plus size={16} /> Create Team</Button> : null}
          </div>
        )}
      />
      {summary ? (
        <section className="teams-kpis">
          <article><span>Total teams</span><strong>{summary.teams}</strong></article>
          <article><span>Team members</span><strong>{summary.members}</strong></article>
          <article><span>Active team leads</span><strong>{summary.leads}</strong></article>
          <article><span>Open tasks</span><strong>{summary.openTasks}</strong></article>
          <article><span>Overdue tasks</span><strong>{summary.overdueTasks}</strong></article>
          <article><span>Active projects</span><strong>{summary.activeProjects}</strong></article>
        </section>
      ) : null}
      <div className="teams-toolbar">
        <input className="input" placeholder="Search teams..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)}>
          <option value="">Department</option>
          {departments.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select className="select" aria-label="Team lead" value={leadId} onChange={(event) => setLeadId(event.target.value)}>
          <option value="">Team lead</option>
          {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
        </select>
        <select className="select" aria-label="Assignment rule" value={rule} onChange={(event) => setRule(event.target.value)}>
          <option value="">Assignment</option>
          {Object.entries(ASSIGNMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="button" className="teams-clear" onClick={() => { setSearch(''); setDepartment(''); setLeadId(''); setRule(''); setArchived(false); }}>Clear filters</button>
        {access.canArchive ? <button type="button" className={archived ? 'teams-clear is-on' : 'teams-clear'} onClick={() => setArchived((value) => !value)}>{archived ? 'Showing archived' : 'Archived'}</button> : null}
      </div>
      {status === 'loading' ? <div className="teams-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Unable to load teams." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && !rows.length ? (
        <PageContent>
          <EmptyState icon={UsersRound} title="No teams yet" description="Create your first team." />
        </PageContent>
      ) : null}
      {status === 'ready' && rows.length && view === 'cards' ? (
        <div className="teams-cards">
          {rows.map((team) => (
            <article key={team.id} className="teams-card">
              <header className="teams-card__top">
                <div>
                  <button type="button" className="teams-card__title" onClick={() => openTeam(team.id)}>{team.name}</button>
                  {team.description ? <p className="teams-card__sub">{team.description}</p> : null}
                </div>
                <span className={team.assignmentRule === 'ANY_TEAM_MEMBER' ? 'teams-pill teams-pill--line' : 'teams-pill'}>{ASSIGNMENT[team.assignmentRule] || 'Team lead assigns'}</span>
              </header>
              <div className="teams-card__row">
                {team.category || team.department ? <span className="teams-pill">{team.category || team.department}</span> : <span />}
                <div className="teams-actions">
                  <button type="button" className="teams-request" onClick={() => setRequestTeam(team)}>Request work</button>
                  {team.canManage ? <Button size="sm" variant="secondary" onClick={() => setManageId(team.id)}>Manage</Button> : <Button size="sm" variant="secondary" onClick={() => openTeam(team.id)}>Open</Button>}
                </div>
              </div>
              <div className="teams-meetbox">
                {team.meetingUrl ? (
                  <>
                    <div className="teams-meetbox__head">
                      <span><Calendar size={16} /> Team meeting</span>
                      {team.canEditMeetings ? <button type="button" aria-label="Edit meeting link" onClick={() => setMeetingTeam(team)}><Pencil size={15} /></button> : null}
                    </div>
                    <p>{team.meetingUrl}</p>
                    <div className="teams-join">
                      <a className="btn btn--primary teams-join__go" href={team.meetingUrl} target="_blank" rel="noreferrer">Join meeting</a>
                      <button type="button" className="teams-join__copy" aria-label="Copy meeting link" onClick={() => navigator.clipboard.writeText(team.meetingUrl).then(() => push({ tone: 'success', message: 'Meeting link copied.' }))}><Copy size={16} /></button>
                    </div>
                  </>
                ) : (
                  <button type="button" className="teams-meetbox__add" onClick={() => setMeetingTeam(team)}>
                    <Circle size={16} /> Add meeting link
                  </button>
                )}
              </div>
              <p className="teams-lead"><Circle size={14} /> Leads: {team.leadNames || team.leadName || 'Not assigned'}</p>
              <p className="teams-muted">
                {team.members} members · {team.activeTasks} open tasks · {team.overdueTasks > 0 ? <span className="teams-overdue">{team.overdueTasks} overdue</span> : <span className="teams-clear">0 overdue</span>}
              </p>
              <Avatars names={team.memberPreview || []} onMore={() => navigate(`/teams/${team.id}?tab=members`)} />
              {access.canArchive && team.status === 'ARCHIVED' ? <button type="button" className="teams-clear" onClick={() => restore(team)}>Restore team</button> : null}
              {access.canArchive && team.status !== 'ARCHIVED' ? <button type="button" className="teams-clear" onClick={() => archive(team)}>Archive team</button> : null}
            </article>
          ))}
        </div>
      ) : null}
      {status === 'ready' && rows.length && view === 'tiles' ? (
        <div className="teams-tiles">
          {rows.map((team) => (
            <button key={team.id} type="button" className="teams-tile" onClick={() => openTeam(team.id)}>
              <Avatar name={team.name} />
              <strong>{team.name}</strong>
              <span>{team.department || 'No department'}</span>
              <span>Leads: {team.leadNames || team.leadName || 'Not assigned'}</span>
              <span>{team.members} members · {team.activeTasks} open · {team.overdueTasks} overdue · {team.activeProjects} projects</span>
            </button>
          ))}
        </div>
      ) : null}
      {status === 'ready' && rows.length && view === 'list' ? (
        <div className="teams-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => setSort('name')}>Team</button></th>
                <th>Department</th>
                <th>Team lead</th>
                <th><button type="button" onClick={() => setSort('members')}>Members</button></th>
                <th><button type="button" onClick={() => setSort('open')}>Open tasks</button></th>
                <th><button type="button" onClick={() => setSort('overdue')}>Overdue</button></th>
                <th><button type="button" onClick={() => setSort('projects')}>Projects</button></th>
                <th>Assignment</th>
                <th>Meeting</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((team) => (
                <tr key={team.id} className="is-clickable" onClick={() => openTeam(team.id)}>
                  <td>{team.name}</td>
                  <td>{team.department || '—'}</td>
                  <td>{team.leadNames || team.leadName || 'Not assigned'}</td>
                  <td>{team.members}</td>
                  <td>{team.activeTasks}</td>
                  <td>{team.overdueTasks}</td>
                  <td>{team.activeProjects}</td>
                  <td>{ASSIGNMENT[team.assignmentRule]}</td>
                  <td>{team.meetingUrl ? 'Linked' : '—'}</td>
                  <td onClick={(event) => event.stopPropagation()}>
                    <div className="teams-actions">
                      {team.canManage ? <Button size="sm" variant="secondary" onClick={() => setManageId(team.id)}>Manage</Button> : <Button size="sm" variant="secondary" onClick={() => openTeam(team.id)}>Open</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <Modal open={creating} className="teams-dialog" title="Create team" onClose={() => { if (!busy) setCreating(false); }}>
        <TeamForm form={form} setForm={(value) => { setErrors({}); setForm(value); }} departments={departments} people={people} errors={errors} busy={busy} onCancel={() => setCreating(false)} onSubmit={submit} />
      </Modal>
      <RequestModal team={requestTeam} projects={projects} busy={busy} onClose={() => setRequestTeam(null)} onSubmit={async (body) => {
        setBusy(true);
        try {
          await createWorkRequest(requestTeam.id, body);
          setRequestTeam(null);
          push({ tone: 'success', message: 'Work request submitted successfully.' });
        } catch (error) {
          push({ tone: 'danger', message: error.message });
        } finally {
          setBusy(false);
        }
      }} />
      <ManageModal teamId={manageId} people={people} departments={departments} busy={busy} onClose={() => setManageId('')} onChanged={load} push={push} />
      <MeetingModal team={meetingTeam} busy={busy} onClose={() => setMeetingTeam(null)} onSubmit={async (body) => {
        setBusy(true);
        try {
          await saveTeamMeeting(meetingTeam.id, { ...body, isPrimary: true }, meetingTeam.meetingId || '');
          setMeetingTeam(null);
          push({ tone: 'success', message: 'Meeting saved successfully.' });
          await load();
        } catch (error) {
          push({ tone: 'danger', message: error.message });
        } finally {
          setBusy(false);
        }
      }} />
    </PageContainer>
  );
}

function RequestModal({ team, projects, busy, onClose, onSubmit }) {
  const blank = { projectId: '', title: '', description: '', priority: 'MEDIUM', startDate: '', dueDate: '', hours: '', minutes: '', tag: '', item: '', checklist: [] };
  const [form, setForm] = useState(blank);
  useEffect(() => { if (team) setForm(blank); }, [team]);
  if (!team) return null;
  const dateWarning = form.startDate && form.dueDate && form.dueDate < form.startDate;
  function addItem() {
    const text = form.item.trim();
    if (!text) return;
    setForm({ ...form, item: '', checklist: [...form.checklist, text] });
  }
  return (
    <Modal open title={`Request work from ${team.name}`} onClose={onClose}>
      <form className="teams-form" onSubmit={(event) => { event.preventDefault(); if (!dateWarning) onSubmit(form); }}>
        <p className="teams-muted is-wide">Send a work request to the team queue. The team lead will assign someone.</p>
        <label className="field is-wide"><span className="field__label">Title *</span><input className="input" required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="WCS-RCS integration testing" /></label>
        <label className="field"><span className="field__label">Team</span><input className="input" readOnly value={team.name} /></label>
        <p className="field__hint is-wide">Leads: {team.leadNames || team.leadName || 'Not assigned'}. Team leads will be notified and can assign this request.</p>
        <label className="field"><span className="field__label">Priority</span>
          <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Project</span>
          <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
            <option value="">No project</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Start date</span><input className="input" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <div className="teams-actions">
          <Button type="button" size="sm" variant="secondary" onClick={() => setForm({ ...form, startDate: isoShift(0) })}>Today</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setForm({ ...form, startDate: isoShift(1) })}>Tomorrow</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setForm({ ...form, startDate: isoShift(7) })}>Next week</Button>
        </div>
        <label className="field"><span className="field__label">Due date</span><input className="input" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
        {dateWarning ? <p className="teams-overdue is-wide">Due date cannot be before the start date.</p> : null}
        {!form.dueDate ? <p className="field__hint is-wide">Add a due date so this does not stay in the queue.</p> : null}
        <label className="field"><span className="field__label">Estimated hours</span><input className="input" type="number" min="0" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} /></label>
        <label className="field"><span className="field__label">Minutes</span><input className="input" type="number" min="0" max="59" value={form.minutes} onChange={(event) => setForm({ ...form, minutes: event.target.value })} /></label>
        <label className="field"><span className="field__label">Tag</span>
          <select className="select" value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })}>
            <option value="">None</option>
            {REQUEST_TAGS.map((tag) => <option key={tag}>{tag}</option>)}
          </select>
        </label>
        <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={3} placeholder="Optional details" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="field is-wide">
          <span className="field__label">Checklist</span>
          {form.checklist.map((item, index) => (
            <div key={`${item}-${index}`} className="teams-actions">
              <span>{item}</span>
              <button type="button" onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
            </div>
          ))}
          <div className="teams-actions">
            <input className="input" value={form.item} placeholder="Add item" onChange={(event) => setForm({ ...form, item: event.target.value })} />
            <Button type="button" variant="secondary" onClick={addItem}>Add item</Button>
          </div>
        </div>
        <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy} disabled={form.title.trim().length < 2 || dateWarning}>Request work</Button></div>
      </form>
    </Modal>
  );
}

function isoShift(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function ManageModal({ teamId, people, departments, onClose, onChanged, push }) {
  const [pack, setPack] = useState(null);
  const [form, setForm] = useState(null);
  const [memberId, setMemberId] = useState('');
  const [meeting, setMeeting] = useState({ name: 'Team meeting', platform: 'TEAMS', url: '' });
  const [confirm, setConfirm] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);

  useEffect(() => {
    if (!teamId) { setPack(null); return undefined; }
    let live = true;
    getTeam(teamId).then((payload) => {
      if (!live) return;
      const team = payload.data.team;
      setPack(payload.data);
      setForm({
        name: team.name, description: team.description || '', department: team.department || '', category: team.category || '',
        status: team.status, assignmentRule: team.assignmentRule, leadId: team.leadId || '', code: team.code,
      });
      const primary = (payload.data.meetings || [])[0];
      setMeeting(primary ? { name: primary.name, platform: primary.platform, url: primary.url, id: primary.id } : { name: 'Team meeting', platform: 'TEAMS', url: '' });
    }).catch((error) => push({ tone: 'danger', message: error.message }));
    return () => { live = false; };
  }, [teamId]);

  if (!teamId || !pack || !form) return <Modal open={Boolean(teamId)} title="Manage team" onClose={onClose}><div className="teams-skeleton" /></Modal>;
  const team = pack.team;
  const members = (pack.members || []).filter((member) => member.status === 'ACTIVE');

  async function run(work, message) {
    setLocalBusy(true);
    try {
      await work();
      push({ tone: 'success', message });
      const payload = await getTeam(teamId);
      setPack(payload.data);
      await onChanged();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setLocalBusy(false);
      setConfirm(null);
    }
  }

  return (
    <Modal open className="teams-dialog" title={`Manage ${team.name}`} onClose={onClose}>
      <form className="teams-form" onSubmit={(event) => { event.preventDefault(); run(() => updateTeam(team.id, form), 'Team saved.'); }}>
        <label className="field is-wide"><span className="field__label">Name</span><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <label className="field"><span className="field__label">Department</span>
          <select className="select" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })}>
            <option value="">None</option>
            {departments.map((department) => <option key={department}>{department}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Category</span><input className="input" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></label>
        <label className="field"><span className="field__label">Status</span>
          <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </label>
        <label className="field"><span className="field__label">Who can assign tasks?</span>
          <select className="select" value={form.assignmentRule} onChange={(event) => setForm({ ...form, assignmentRule: event.target.value })}>
            {Object.entries(ASSIGNMENT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="field__hint">{ASSIGNMENT_HELP[form.assignmentRule]}</span>
        </label>
        <div className="teams-form__actions"><Button type="submit" loading={localBusy}>Save details</Button></div>
      </form>
      <h3>Members ({members.length})</h3>
      <div className="teams-manage-list">
        {members.map((member) => (
          <div key={member.id} className="teams-member">
            <div><strong>{member.name}</strong><span>{member.designation || 'Member'}{member.role === 'TEAM_LEAD' ? ' · Lead' : ''}</span>{member.openTasks ? <span>{member.openTasks} open tasks stay assigned if removed</span> : null}</div>
            {member.role === 'TEAM_LEAD'
              ? <Button size="sm" variant="secondary" onClick={() => run(() => updateTeamMember(team.id, member.id, { role: 'MEMBER', status: 'ACTIVE' }), 'Lead role removed.')}>Remove lead</Button>
              : <Button size="sm" variant="secondary" onClick={() => run(() => updateTeamMember(team.id, member.id, { role: 'TEAM_LEAD', status: 'ACTIVE' }), `${member.name} is a team lead.`)}>Make lead</Button>}
            <Button size="sm" variant="danger" onClick={() => setConfirm(member)}>Remove</Button>
          </div>
        ))}
        {!members.length ? <p className="teams-muted">No members assigned to this team yet.</p> : null}
      </div>
      <div className="teams-actions">
        <select className="select" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
          <option value="">Add member...</option>
          {people.filter((person) => !members.some((member) => member.userId === person.id)).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
        </select>
        <Button onClick={() => memberId && run(() => addTeamMember(team.id, { userId: memberId, role: 'MEMBER' }).then(() => setMemberId('')), 'Member added.')}>+ Add</Button>
      </div>
      <h3>Meeting</h3>
      <div className="teams-form">
        <label className="field"><span className="field__label">Title</span><input className="input" value={meeting.name} onChange={(event) => setMeeting({ ...meeting, name: event.target.value })} /></label>
        <label className="field"><span className="field__label">Platform</span>
          <select className="select" value={meeting.platform} onChange={(event) => setMeeting({ ...meeting, platform: event.target.value })}>
            {Object.entries(MEETING_PLATFORM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field is-wide"><span className="field__label">URL</span><input className="input" type="url" value={meeting.url} onChange={(event) => setMeeting({ ...meeting, url: event.target.value })} /></label>
        <div className="teams-form__actions">
          <Button variant="secondary" onClick={() => run(() => saveTeamMeeting(team.id, { ...meeting, isPrimary: true }, meeting.id || ''), 'Meeting saved.')}>Save meeting</Button>
          {meeting.url ? <a className="btn btn--secondary" href={meeting.url} target="_blank" rel="noreferrer">Open link</a> : null}
        </div>
      </div>
      {pack.access?.canArchive ? <Button variant="danger" onClick={() => run(() => setTeamStatus(team.id, team.status === 'ARCHIVED' ? 'ACTIVE' : 'ARCHIVED'), team.status === 'ARCHIVED' ? 'Team restored.' : 'Team archived.')}>{team.status === 'ARCHIVED' ? 'Restore team' : 'Archive team'}</Button> : null}
      <Modal open={Boolean(confirm)} title="Remove member" onClose={() => setConfirm(null)}>
        {confirm ? (
          <div className="teams-form">
            <p>Remove {confirm.name} from {team.name}?</p>
            <p>{confirm.openTasks ? `This member currently has ${confirm.openTasks} open tasks. Those tasks will not be deleted.` : 'Existing tasks assigned to this employee will not be deleted.'}</p>
            <div className="teams-form__actions">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button variant="danger" loading={localBusy} onClick={() => run(() => removeTeamMember(team.id, confirm.id), 'Member removed.')}>Remove member</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </Modal>
  );
}

function MeetingModal({ team, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ name: 'Team meeting', platform: 'TEAMS', url: '', description: '' });
  useEffect(() => {
    if (team) setForm({ name: team.meetingName || 'Team meeting', platform: team.meetingPlatform || 'TEAMS', url: team.meetingUrl || '', description: '' });
  }, [team]);
  if (!team) return null;
  return (
    <Modal open title="Team meeting" onClose={onClose}>
      <form className="teams-form" onSubmit={(event) => { event.preventDefault(); onSubmit(form); }}>
        <label className="field is-wide"><span className="field__label">Meeting name *</span><input className="input" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
        <label className="field"><span className="field__label">Platform</span>
          <select className="select" value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })}>
            {Object.entries(MEETING_PLATFORM).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="field"><span className="field__label">Meeting URL *</span><input className="input" required type="url" value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} /></label>
        <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        <div className="teams-form__actions"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save meeting</Button></div>
      </form>
    </Modal>
  );
}
