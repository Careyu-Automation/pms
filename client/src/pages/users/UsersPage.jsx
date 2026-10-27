import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { RoleSelector, TeamSelector, UserSelector } from '../../components/common/UserSelector';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { createUser, deleteUser, getUser, listUsers, resetInitialPassword, resetUserPassword, setUserStatus, updateUser } from '../../services/users.service';
import '../../styles/users.css';

const BLANK = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  employeeCode: '',
  designation: '',
  department: '',
  roleId: '',
  managerId: '',
  teamId: '',
  teamRole: 'MEMBER',
  extraTeamIds: [],
  accessScope: 'TEAM_ONLY',
  status: 'ACTIVE',
};

const STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  SUSPENDED: 'Suspended',
  PENDING_INVITATION: 'Pending invitation',
};

const SCOPE = {
  ORGANIZATION: 'Organization',
  ALL_TEAMS: 'All teams',
  ENGINEERING: 'Engineering',
  BUSINESS: 'Business',
  PROJECTS: 'Projects',
  TEAM_ONLY: 'Team',
};

const TEAM_ROLE = {
  TEAM_LEAD: 'Team lead',
  SENIOR_MEMBER: 'Senior member',
  MEMBER: 'Member',
  PROJECT_COORDINATION: 'Coordinator',
  OVERSIGHT: 'Oversight',
};

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

export default function UsersPage() {
  const { push } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [another, setAnother] = useState(false);
  const [view, setView] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [password, setPassword] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useDocumentTitle('User Management');

  const load = () => {
    setStatus((current) => (current === 'ready' ? 'ready' : 'loading'));
    listUsers({
      search,
      status: filterStatus,
      role: filterRole,
      teamId: filterTeam,
      department: filterDepartment,
      page,
      pageSize: 20,
    })
      .then((payload) => {
        setData(payload.data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  };

  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [search, filterStatus, filterRole, filterTeam, filterDepartment, page]);

  useEffect(() => {
    const userId = searchParams.get('user');
    if (!userId) return undefined;
    let live = true;
    getUser(userId).then((payload) => {
      if (live) setView(payload.data);
    }).catch((err) => push({ tone: 'danger', message: err.message }));
    return () => { live = false; };
  }, [searchParams]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  function openCreate() {
    setError('');
    setEditingId('');
    setAnother(false);
    setForm({ ...BLANK, roleId: String(data?.roles?.[0]?.id || '') });
  }

  async function openEdit(user) {
    setError('');
    setBusy(true);
    try {
      const payload = await getUser(user.id);
      const person = payload.data.user;
      const names = splitName(person.name);
      const primary = (person.teams || []).find((team) => team.primary) || person.teams?.[0];
      setEditingId(user.id);
      setForm({
        ...BLANK,
        ...names,
        phone: person.phone,
        email: person.email,
        employeeCode: person.employeeCode,
        designation: person.designation,
        department: person.department,
        roleId: String(person.roleId),
        managerId: person.managerId,
        teamId: primary?.id || '',
        teamRole: primary?.role === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'MEMBER',
        extraTeamIds: (person.teams || []).filter((team) => team.id !== primary?.id).map((team) => team.id),
        accessScope: person.accessScope,
        status: person.status,
      });
    } catch (err) {
      push({ tone: 'danger', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function openView(user) {
    try {
      const payload = await getUser(user.id);
      setView(payload.data);
    } catch (err) {
      push({ tone: 'danger', message: err.message });
    }
  }

  const save = async (keepOpen) => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.phone.trim() || !form.email.trim() || !form.roleId) {
      setError('First name, last name, phone, email, and role are required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await updateUser(editingId, form);
        push({ tone: 'success', message: 'User updated.' });
        setForm(null);
        setEditingId('');
      } else {
        const result = await createUser(form);
        setPassword({ name: `${form.firstName} ${form.lastName}`.trim(), value: result.data.temporaryPassword });
        push({ tone: 'success', message: 'User added and available across Project Hub.' });
        if (keepOpen) {
          setForm({ ...BLANK, roleId: form.roleId, department: form.department, accessScope: form.accessScope });
        } else {
          setForm(null);
        }
      }
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === 'status') {
        await setUserStatus(confirm.user.id, confirm.next);
        push({ tone: 'success', message: `${confirm.user.name} is now ${STATUS[confirm.next].toLowerCase()}.` });
      } else if (confirm.kind === 'reset') {
        const result = await resetUserPassword(confirm.user.id);
        setPassword({ name: confirm.user.name, value: result.data.temporaryPassword });
        push({ tone: 'success', message: 'A temporary password was created.' });
      } else if (confirm.kind === 'initial') {
        await resetInitialPassword(confirm.user.id);
        push({ tone: 'success', message: 'The initial password was restored. The employee must choose a new password at the next sign-in.' });
      } else if (confirm.kind === 'delete') {
        const result = await deleteUser(confirm.user.id);
        push({ tone: 'success', message: result.data.archived ? result.data.reason : 'User deleted.' });
      }
      setConfirm(null);
      load();
    } catch (err) {
      push({ tone: 'danger', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const roles = (data?.roles || []).filter((role) => data?.canAssignPrivileged || !['admin', 'super_admin'].includes(role.code));

  return (
    <PageContainer>
      <PageHeader
        title="User Management"
        description="Manage employee accounts, roles, team memberships, and system access."
        actions={data?.canManage ? <Button onClick={openCreate}><Plus size={16} /> Add User</Button> : null}
      />

      {status === 'error' ? <ErrorState title="Unable to load users." description="The user directory could not be loaded." action={<Button onClick={load}>Try Again</Button>} /> : null}
      {status === 'loading' && !data ? <div className="users-skeleton" /> : null}

      {data ? (
        <>
          <section className="users-kpis">
            <article><span>Total Users</span><strong>{data.totals.total}</strong></article>
            <article><span>Active Users</span><strong>{data.totals.active}</strong></article>
            <article><span>Inactive Users</span><strong>{data.totals.inactive}</strong></article>
            <article><span>Suspended Users</span><strong>{data.totals.suspended}</strong></article>
          </section>
          <div className="users-toolbar">
            <label className="users-search">
              <Search size={16} />
              <input value={search} placeholder="Search name, email, designation, or role" onChange={(event) => { setPage(1); setSearch(event.target.value); }} />
            </label>
            <select value={filterRole} onChange={(event) => { setPage(1); setFilterRole(event.target.value); }} aria-label="Role">
              <option value="">All roles</option>
              {(data.roles || []).map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}
            </select>
            <select value={filterTeam} onChange={(event) => { setPage(1); setFilterTeam(event.target.value); }} aria-label="Team">
              <option value="">All teams</option>
              {(data.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
            <select value={filterDepartment} onChange={(event) => { setPage(1); setFilterDepartment(event.target.value); }} aria-label="Department">
              <option value="">All departments</option>
              {(data.departments || []).map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select value={filterStatus} onChange={(event) => { setPage(1); setFilterStatus(event.target.value); }} aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          {data.users.length ? (
            <div className="users-table-wrap">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Designation</th>
                    <th>Role</th>
                    <th>Department</th>
                    <th>Team membership</th>
                    <th>Reporting manager</th>
                    <th>Access scope</th>
                    <th>Account status</th>
                    <th>Login</th>
                    <th>Password</th>
                    <th>Last login</th>
                    {data.canManage ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td><button type="button" className="users-link" onClick={() => openView(user)}>{user.name}</button></td>
                      <td>{user.email}</td>
                      <td>{user.phone || '—'}</td>
                      <td>{user.designation || '—'}</td>
                      <td>{user.role}</td>
                      <td>{user.department || '—'}</td>
                      <td>{user.teams?.length ? user.teams.map((team) => `${team.name}${team.role === 'TEAM_LEAD' ? ' (Lead)' : ''}`).join(', ') : 'No functional team'}</td>
                      <td>{user.managerName || '—'}</td>
                      <td>{SCOPE[user.accessScope] || user.accessScope}</td>
                      <td><span className={`users-status users-status--${String(user.status).toLowerCase()}`}>{STATUS[user.status] || user.status}</span></td>
                      <td>{user.loginEnabled ? 'Enabled' : 'Disabled'}</td>
                      <td>{user.passwordSetup || 'Not set'}</td>
                      <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</td>
                      {data.canManage ? (
                        <td>
                          <div className="users-actions">
                            <button type="button" onClick={() => openView(user)}>View</button>
                            <button type="button" onClick={() => openEdit(user)}>Edit</button>
                            <button type="button" onClick={() => openEdit(user)}>Manage teams</button>
                            {user.status === 'ACTIVE'
                              ? <button type="button" onClick={() => setConfirm({ kind: 'status', user, next: 'INACTIVE', title: `Deactivate ${user.name}?`, body: user.openTasks ? `${user.name} has ${user.openTasks} open tasks. The account will be blocked from signing in. Tasks stay assigned.` : 'This account will be blocked from signing in. Existing work stays assigned.' })}>Deactivate</button>
                              : <button type="button" onClick={() => setConfirm({ kind: 'status', user, next: 'ACTIVE', title: `Activate ${user.name}?`, body: 'This account will be able to sign in again.' })}>Activate</button>}
                            {user.status === 'SUSPENDED'
                              ? <button type="button" onClick={() => setConfirm({ kind: 'status', user, next: 'ACTIVE', title: `Reactivate ${user.name}?`, body: 'This account will be able to sign in again.' })}>Reactivate</button>
                              : <button type="button" onClick={() => setConfirm({ kind: 'status', user, next: 'SUSPENDED', title: `Suspend ${user.name}?`, body: 'Existing sessions stop working on the next request, and the person cannot sign in.' })}>Suspend</button>}
                            <button type="button" onClick={() => setConfirm({ kind: 'reset', user, title: `Reset password for ${user.name}?`, body: 'A temporary password will be shown once. Share it with the employee through a secure channel.' })}>Reset password</button>
                            <button type="button" onClick={() => setConfirm({ kind: 'initial', user, title: `Restore the initial password for ${user.name}?`, body: 'The employee will need to choose a new password the next time they sign in. The password is not shown here.' })}>Reset initial password</button>
                            <button type="button" onClick={() => setConfirm({ kind: 'delete', user, title: `Delete ${user.name}?`, body: user.openTasks ? `${user.name} has ${user.openTasks} open tasks. The account will be deactivated and history kept.` : 'If this person owns projects, tasks, or history, the account is deactivated instead of deleted.' })}>Delete</button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="users-pager">
                <span>{data.total} users</span>
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <span>Page {page} of {pages}</span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          ) : <EmptyState title="No users match these filters." description="Adjust the search or add a user from User Management." />}
        </>
      ) : null}

      <Modal
        open={Boolean(form)}
        title={editingId ? 'Edit user' : 'Add user'}
        subtitle="This person is saved in the directory and can be assigned to teams."
        onClose={() => { if (!busy) { setForm(null); setEditingId(''); } }}
        footer={(
          <>
            <Button variant="secondary" onClick={() => { setForm(null); setEditingId(''); }}>Cancel</Button>
            {!editingId ? <Button variant="secondary" onClick={() => save(true)} loading={busy && another}>Save and add another</Button> : null}
            <Button onClick={() => { setAnother(false); save(false); }} loading={busy && !another}>{editingId ? 'Save user' : 'Save user'}</Button>
          </>
        )}
      >
        {form ? (
          <div className="users-form">
            {error ? <p className="users-form__error">{error}</p> : null}
            <h3>Personal information</h3>
            <label>Full name — first<input value={form.firstName} onChange={(event) => setField('firstName', event.target.value)} /></label>
            <label>Full name — last<input value={form.lastName} onChange={(event) => setField('lastName', event.target.value)} /></label>
            <label>Work email<input type="email" value={form.email} onChange={(event) => setField('email', event.target.value)} /></label>
            <label>Phone number<input value={form.phone} onChange={(event) => setField('phone', event.target.value)} /></label>
            <label>Employee ID<input value={form.employeeCode} onChange={(event) => setField('employeeCode', event.target.value)} /></label>
            <label>Designation<input value={form.designation} onChange={(event) => setField('designation', event.target.value)} /></label>
            <h3>Organization</h3>
            <label>Department<input value={form.department} onChange={(event) => setField('department', event.target.value)} /></label>
            <label>System role<RoleSelector value={form.roleId} roles={roles} onChange={(value) => setField('roleId', value)} /></label>
            <label>Reporting manager<UserSelector value={form.managerId} activeOnly onChange={(value) => setField('managerId', value)} placeholder="No manager" /></label>
            <label>Account status
              <select value={form.status} onChange={(event) => setField('status', event.target.value)}>
                {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Access scope
              <select value={form.accessScope} onChange={(event) => setField('accessScope', event.target.value)}>
                {Object.entries(SCOPE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <h3>Team assignment</h3>
            <label>Primary team<TeamSelector value={form.teamId} teams={data?.teams || []} onChange={(value) => setField('teamId', value)} /></label>
            <label>Team role
              <select value={form.teamRole} onChange={(event) => setField('teamRole', event.target.value)}>
                <option value="TEAM_LEAD">Team lead</option>
                <option value="MEMBER">Member</option>
              </select>
            </label>
            <label className="is-wide">Additional teams
              <select multiple value={form.extraTeamIds} onChange={(event) => setField('extraTeamIds', [...event.target.selectedOptions].map((option) => option.value))}>
                {(data?.teams || []).filter((team) => team.id !== form.teamId).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            {!editingId ? <p className="users-note">Saving creates the account and shows a temporary password once. The person uses that password to sign in.</p> : null}
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(view)} title={view?.user?.name || 'User'} onClose={() => { setView(null); if (searchParams.get('user')) setSearchParams({}); }}>
        {view ? (
          <div className="users-detail">
            <p>{view.user.email}</p>
            <p>{view.user.phone || 'No phone'} · {view.user.employeeCode || 'No employee ID'}</p>
            <p>{view.user.designation || 'No designation'} · {view.user.department || 'No department'}</p>
            <p>Role: {view.user.role}</p>
            <p>Access: {SCOPE[view.user.accessScope] || view.user.accessScope}</p>
            <p>Reports to: {view.user.managerName || 'No reporting manager'}</p>
            <p>Status: {STATUS[view.user.status] || view.user.status}</p>
            <p>Login: {view.user.loginEnabled ? 'Enabled' : 'Disabled'}</p>
            <p>Password: {view.user.passwordSetup || 'Not set'}</p>
            <p>Last login: {view.user.lastLoginAt ? new Date(view.user.lastLoginAt).toLocaleString() : 'Never'}</p>
            <p>Teams: {view.user.teams?.length ? view.user.teams.map((team) => `${team.name} (${TEAM_ROLE[team.role] || team.role}${team.primary ? ', primary' : ''})`).join(', ') : 'No functional team'}</p>
            <p>Open tasks: {view.user.openTasks}</p>
            <p>Created: {view.user.createdAt ? new Date(view.user.createdAt).toLocaleString() : '—'}</p>
            <p>Updated: {view.user.updatedAt ? new Date(view.user.updatedAt).toLocaleString() : '—'}</p>
            <h3>Recent activity</h3>
            {view.activity?.length ? view.activity.map((item) => (
              <p key={`${item.action}-${item.at}`}>{item.action}{item.actor ? ` · ${item.actor}` : ''} · {new Date(item.at).toLocaleString()}</p>
            )) : <p>No directory changes recorded yet.</p>}
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(confirm)} title={confirm?.title || ''} onClose={() => setConfirm(null)} footer={(
        <>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant={confirm?.kind === 'delete' ? 'danger' : 'primary'} loading={busy} onClick={runConfirm}>Confirm</Button>
        </>
      )}>
        <p>{confirm?.body}</p>
      </Modal>

      <Modal open={Boolean(password)} title="Temporary password" onClose={() => setPassword(null)}>
        {password ? (
          <div className="users-detail">
            <p>Give this password to {password.name}. It is shown only this once.</p>
            <p className="users-password">{password.value}</p>
            <Button onClick={() => navigator.clipboard.writeText(password.value).then(() => push({ tone: 'success', message: 'Password copied.' }))}>Copy password</Button>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
