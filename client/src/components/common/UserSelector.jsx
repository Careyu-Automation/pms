import { useEffect, useMemo, useState } from 'react';
import { listUsers } from '../../services/users.service';

const ROLE_LABEL = {
  TEAM_LEAD: 'Team Lead',
  MEMBER: 'Member',
  SENIOR_MEMBER: 'Senior Member',
  OVERSIGHT: 'Oversight',
  PROJECT_COORDINATION: 'Project Coordinator',
};

export function UserSelector({
  value,
  onChange,
  teamId = '',
  role = '',
  activeOnly = true,
  placeholder = 'Select user',
  allowEmpty = true,
}) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let live = true;
    listUsers({
      search,
      teamId,
      role,
      activeOnly: activeOnly ? 'true' : '',
    }).then((payload) => {
      if (live) setUsers(payload.data.users || []);
    }).catch(() => {
      if (live) setUsers([]);
    });
    return () => { live = false; };
  }, [search, teamId, role, activeOnly]);

  const options = useMemo(() => users, [users]);

  return (
    <div className="user-selector">
      <input
        type="search"
        value={search}
        placeholder="Search name, role, or team"
        onChange={(event) => setSearch(event.target.value)}
        aria-label="Search users"
      />
      <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {options.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} — {user.designation || user.role}{user.team ? ` · ${user.team}` : ''}{user.teamRole ? ` (${ROLE_LABEL[user.teamRole] || user.teamRole})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TeamSelector({ value, onChange, teams = [], allowEmpty = true, placeholder = 'No functional team' }) {
  return (
    <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
      {allowEmpty ? <option value="">{placeholder}</option> : null}
      {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
    </select>
  );
}

export function RoleSelector({ value, onChange, roles = [] }) {
  return (
    <select value={value || ''} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select role</option>
      {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
    </select>
  );
}
