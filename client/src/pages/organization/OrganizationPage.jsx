import { useEffect, useMemo, useState } from 'react';
import { Bot, BriefcaseBusiness, Building2, ClipboardList, Code2, Crown, Eye, HardHat, Plus, Search, Settings, ShoppingCart, UsersRound } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  addTeamMember,
  createEmployee,
  loadEmployeeAccess,
  loadOrganization,
  removeTeamMember,
  saveEmployeeAccess,
  setTeamLead,
  updateEmployee,
  updateEmployeeStatus,
} from '../../services/organization.service';
import '../../styles/organization.css';

const OPEN_KEY = 'careyu-org-open';
const BLANK = {
  firstName: '', lastName: '', email: '', phone: '', employeeCode: '', designation: '', department: '',
  roleId: '', managerId: '', teamId: '', secondaryTeamIds: [], joiningDate: '', status: 'ACTIVE', password: '',
};

function splitName(name) {
  const parts = String(name || '').trim().split(/\s+/);
  return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') };
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'CY';
}

const TEAM_ORDER = ['software', 'vision', 'robotics', 'procurement', 'execution'];
const TEAM_LABEL = {
  software: 'Software Team',
  vision: 'Vision Team',
  robotics: 'Robotics & Solutions Team',
  procurement: 'Procurement / Costing Team',
  execution: 'Execution Team',
};

function teamLabel(team) {
  return TEAM_LABEL[team?.code] || team?.name || 'Team';
}

const LEVEL_ORDER = ['cto', 'business', 'director', 'pm', 'ceo', 'member'];

function nodeTone(person) {
  const title = `${person.designation || ''} ${person.role || ''}`.toLowerCase();
  if (/\bceo\b|chief executive/.test(title) || person.roleCode === 'super_admin') return 'ceo';
  if (/\bcto\b|chief technology/.test(title)) return 'cto';
  if (/business head/.test(title)) return 'business';
  if (/engineering director|\bdirector\b/.test(title)) return 'director';
  if (/project manager/.test(title) || person.roleCode === 'project_manager') return 'pm';
  if (person.roleCode === 'management') return 'business';
  return 'member';
}

function accessLine(person, teamCount) {
  const title = `${person.designation || ''} ${person.role || ''}`.toLowerCase();
  const count = teamCount || 0;
  if (/\bceo\b|chief executive/.test(title) || person.roleCode === 'super_admin') {
    return { scope: 'All Dashboards', phrase: 'Monitor All Dashboards' };
  }
  if (/\bcto\b|chief technology/.test(title)) {
    return { scope: 'Software Team Only', phrase: 'Monitor Software Team Only' };
  }
  if (/business head|engineering director|\bdirector\b/.test(title)) {
    return { scope: `PM + ${count} Teams`, phrase: `Monitor PM + ${count} Teams` };
  }
  if (/project manager/.test(title) || person.roleCode === 'project_manager') {
    return { scope: `${count} Teams`, phrase: `Monitor & Manage ${count} Teams` };
  }
  if (person.teams.length === 1) {
    const name = teamLabel(person.teams[0]);
    return { scope: `${name} Only`, phrase: `Monitor ${name} Only` };
  }
  if (person.teams.length > 1) {
    return { scope: `${person.teams.length} Teams`, phrase: `Monitor ${person.teams.length} Teams` };
  }
  return { scope: 'Assigned work', phrase: 'Monitor assigned work' };
}

function leadershipChart(people) {
  const active = people.filter((person) => person.status !== 'INACTIVE');
  const ceo = active.find((person) => nodeTone(person) === 'ceo');
  if (!ceo) return null;
  const reports = active.filter((person) => person.managerId === ceo.id);
  const cto = reports.find((person) => nodeTone(person) === 'cto');
  const business = reports.find((person) => nodeTone(person) === 'business');
  const director = reports.find((person) => nodeTone(person) === 'director');
  const branch = [business?.id, director?.id].filter(Boolean);
  const managers = active.filter((person) => nodeTone(person) === 'pm' && (branch.includes(person.managerId) || branch.includes(person.coManagerId)));
  if (!cto || !business || !director || managers.length !== 1) return null;
  const pm = managers[0];
  const linked = new Set([pm.managerId, pm.coManagerId].filter(Boolean));
  return { ceo, cto, business, director, pm, joint: linked.has(business.id) && linked.has(director.id) };
}

function managerNames(person, people) {
  const managers = [person.managerId, person.coManagerId]
    .filter(Boolean)
    .map((id) => people.find((item) => item.id === id))
    .filter(Boolean)
    .sort((a, b) => LEVEL_ORDER.indexOf(nodeTone(a)) - LEVEL_ORDER.indexOf(nodeTone(b)) || a.name.localeCompare(b.name));
  return managers.map((item) => item.name).join(' & ');
}

function directReportsOf(person, people) {
  return people
    .filter((item) => item.managerId === person.id || item.coManagerId === person.id)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function RoleGlyph({ tone }) {
  const props = { size: 20, strokeWidth: 1.75, 'aria-hidden': true };
  if (tone === 'ceo') return <Crown {...props} />;
  if (tone === 'cto') return <Code2 {...props} />;
  if (tone === 'business') return <BriefcaseBusiness {...props} />;
  if (tone === 'director') return <Settings {...props} />;
  if (tone === 'pm') return <ClipboardList {...props} />;
  return <UsersRound {...props} />;
}

function OrgNode({ person, selected, onSelect, scope }) {
  const tone = nodeTone(person);
  return (
    <button type="button" className={`org-node org-node--${tone} ${selected ? 'is-selected' : ''}`} onClick={() => onSelect(person)}>
      <span className="org-node__icon"><RoleGlyph tone={tone} /></span>
      <strong>{person.name}</strong>
      <span className="org-node__role">{person.designation || person.role}</span>
      <small>Access: {scope}</small>
    </button>
  );
}

function TeamGlyph({ code }) {
  const props = { size: 22, strokeWidth: 1.75, 'aria-hidden': true };
  if (code === 'software') return <Code2 {...props} />;
  if (code === 'vision') return <Eye {...props} />;
  if (code === 'robotics') return <Bot {...props} />;
  if (code === 'procurement') return <ShoppingCart {...props} />;
  if (code === 'execution') return <HardHat {...props} />;
  return <UsersRound {...props} />;
}

function statusLabel(status) {
  if (status === 'INACTIVE') return 'Inactive';
  if (status === 'ON_LEAVE') return 'On leave';
  return 'Active';
}

function descendants(id, people) {
  return people.filter((person) => person.managerId === id).flatMap((person) => [person.id, ...descendants(person.id, people)]);
}

function readOpen() {
  try {
    const raw = sessionStorage.getItem(OPEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export default function OrganizationPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title || 'Organization Management');
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ role: '', department: '', team: '', status: '' });
  const [selection, setSelection] = useState(null);
  const [detail, setDetail] = useState(null);
  const [openIds, setOpenIds] = useState(readOpen);
  const [form, setForm] = useState(null);
  const [access, setAccess] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [memberId, setMemberId] = useState('');

  const load = () => {
    setStatus('loading');
    return loadOrganization().then((payload) => {
      setData(payload.data);
      setStatus('ready');
    }).catch(() => setStatus('error'));
  };

  useEffect(() => { load(); }, []);

  const people = data?.employees || [];
  const teams = data?.teams || [];
  const departments = [...new Set(people.map((person) => person.department).filter(Boolean))].sort();
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return people.filter((person) => {
      if (filters.status && person.status !== filters.status) return false;
      if (filters.role && String(person.roleId) !== filters.role) return false;
      if (filters.department && person.department !== filters.department) return false;
      if (filters.team && !person.teams.some((team) => team.id === filters.team)) return false;
      if (!text) return true;
      const haystack = [person.name, person.designation, person.department, person.role, ...person.teams.map((team) => team.name)].join(' ').toLowerCase();
      return haystack.includes(text);
    });
  }, [people, query, filters]);

  const shown = useMemo(() => {
    const ids = new Set(visible.map((person) => person.id));
    visible.forEach((person) => {
      let managerId = person.managerId;
      while (managerId && people.some((item) => item.id === managerId)) {
        ids.add(managerId);
        managerId = people.find((item) => item.id === managerId)?.managerId;
      }
    });
    return people.filter((person) => ids.has(person.id));
  }, [visible, people]);

  const unfiltered = !query && !filters.role && !filters.department && !filters.team && !filters.status;
  const childrenOf = (id) => shown
    .filter((person) => person.managerId === id && (!unfiltered || person.accessScope !== 'TEAM_ONLY'))
    .sort((a, b) => LEVEL_ORDER.indexOf(nodeTone(a)) - LEVEL_ORDER.indexOf(nodeTone(b)) || a.name.localeCompare(b.name));
  const roots = shown.filter((person) => !person.managerId || !shown.some((item) => item.id === person.managerId));
  const ceo = shown.find((person) => /\bceo\b/i.test(person.designation || ''));
  const chartRoots = unfiltered && ceo ? [ceo] : roots;
  const orderedTeams = [...teams]
    .filter((team) => !filters.team || team.id === filters.team)
    .sort((a, b) => {
      const left = TEAM_ORDER.indexOf(a.code);
      const right = TEAM_ORDER.indexOf(b.code);
      return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
    });
  const projectManagers = people.filter((person) => person.status !== 'INACTIVE' && (person.roleCode === 'project_manager' || /project manager/i.test(person.designation || '')));
  const anchorId = projectManagers.length === 1 ? projectManagers[0].id : '';
  const chart = unfiltered ? leadershipChart(people) : null;
  const functionalTeams = [...teams].sort((a, b) => {
    const left = TEAM_ORDER.indexOf(a.code);
    const right = TEAM_ORDER.indexOf(b.code);
    return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
  });
  const accessCount = functionalTeams.filter((team) => TEAM_ORDER.includes(team.code)).length || functionalTeams.length;
  const titleRank = ['CEO', 'CTO', 'Business Head', 'Engineering Director', 'Project Manager'];
  const summaryGroups = [];
  people.filter((person) => person.status !== 'INACTIVE' && ['ceo', 'cto', 'business', 'director', 'pm'].includes(nodeTone(person))).forEach((person) => {
    const line = accessLine(person, accessCount);
    const title = person.designation || person.role;
    const group = summaryGroups.find((item) => item.phrase === line.phrase);
    if (group) {
      if (!group.titles.includes(title)) group.titles.push(title);
      return;
    }
    summaryGroups.push({ phrase: line.phrase, titles: [title] });
  });
  summaryGroups.forEach((group) => {
    group.titles.sort((a, b) => (titleRank.indexOf(a) === -1 ? 99 : titleRank.indexOf(a)) - (titleRank.indexOf(b) === -1 ? 99 : titleRank.indexOf(b)));
  });
  summaryGroups.sort((a, b) => {
    const rank = (phrase) => {
      if (phrase.includes('All Dashboards')) return 0;
      if (phrase.includes('PM +')) return 1;
      if (phrase.includes('Software Team Only')) return 2;
      if (phrase.includes('Manage')) return 3;
      return 4;
    };
    return rank(a.phrase) - rank(b.phrase);
  });
  const selectedPerson = selection?.type === 'employee' ? people.find((person) => person.id === selection.id) : null;
  const selectedTeam = selection?.type === 'team' ? teams.find((team) => team.id === selection.id) : null;
  const teamMembers = selectedTeam
    ? people.filter((person) => person.teams.some((team) => team.id === selectedTeam.id && ['TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER'].includes(team.role)))
      .sort((a, b) => {
        const rank = (person) => (person.teams.find((team) => team.id === selectedTeam.id)?.role === 'TEAM_LEAD' ? 0 : 1);
        return rank(a) - rank(b) || a.name.localeCompare(b.name);
      })
    : [];
  const canManage = Boolean(data?.access?.canManage);
  const parentIds = people.filter((person) => people.some((child) => child.managerId === person.id)).map((person) => person.id);
  const isOpen = (id) => (openIds ? openIds.has(id) : true);

  const toggle = (id) => {
    const next = new Set(openIds || parentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    sessionStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    setOpenIds(next);
  };

  const chooseEmployee = (person) => {
    setSelection({ type: 'employee', id: person.id });
    setDetail(null);
    loadEmployeeAccess(person.id).then((payload) => setDetail(payload.data)).catch(() => setDetail(null));
  };

  const openCreate = () => {
    setFormError('');
    setForm({ ...BLANK, roleId: data?.roles?.[0] ? String(data.roles[0].id) : '' });
  };

  const openEdit = (person) => {
    const name = splitName(person.name);
    const primary = person.teams.find((team) => team.primary) || person.teams[0];
    setFormError('');
    setForm({
      ...BLANK,
      id: person.id,
      firstName: name.firstName,
      lastName: name.lastName,
      email: person.email,
      phone: person.phone,
      employeeCode: person.employeeCode,
      designation: person.designation,
      department: person.department,
      roleId: String(person.roleId),
      managerId: person.managerId || '',
      teamId: primary?.id || '',
      secondaryTeamIds: person.teams.filter((team) => team.id !== primary?.id).map((team) => team.id),
      joiningDate: person.joiningDate,
      status: person.status,
    });
  };

  const saveEmployee = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.designation.trim() || !form.email.trim() || !form.roleId) {
      setFormError('First name, last name, email, designation, and role are required.');
      return;
    }
    if (!form.id && form.password.length < 8) {
      setFormError('A temporary password of at least 8 characters is required.');
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      if (form.id) await updateEmployee(form.id, form);
      else await createEmployee(form);
      push({ tone: 'success', message: form.id ? 'Employee updated.' : 'Employee created.' });
      setForm(null);
      await load();
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (person, next) => {
    try {
      await updateEmployeeStatus(person.id, next);
      push({ tone: 'success', message: 'Employee status updated.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  };

  const openAccess = async (person) => {
    try {
      const payload = detail && selection?.id === person.id ? { data: detail } : await loadEmployeeAccess(person.id);
      setAccess({ id: person.id, name: person.name, role: person.role, modules: payload.data.modules });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  };

  const saveAccess = async () => {
    setBusy(true);
    try {
      await saveEmployeeAccess(access.id, access.modules);
      push({ tone: 'success', message: 'Access updated.' });
      setAccess(null);
      if (selection?.id === access.id) {
        const payload = await loadEmployeeAccess(access.id);
        setDetail(payload.data);
      }
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'remove') await removeTeamMember(confirm.teamId, confirm.userId);
      if (confirm.kind === 'lead') await setTeamLead(confirm.teamId, confirm.userId, confirm.lead);
      push({ tone: 'success', message: 'Team updated.' });
      setConfirm(null);
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  };

  const askLead = (team, person, lead) => {
    const leads = people.filter((item) => item.teams.some((entry) => entry.id === team.id && entry.lead));
    if (!lead && leads.length === 1 && leads[0].id === person.id) {
      setConfirm({ kind: 'lead', teamId: team.id, userId: person.id, lead: false, message: `${person.name} is the only lead for ${team.name}. Remove the team lead?` });
      return;
    }
    setTeamLead(team.id, person.id, lead).then(() => load()).catch((error) => push({ tone: 'danger', message: error.message }));
  };

  const askRemove = (team, person) => {
    const leads = people.filter((item) => item.teams.some((entry) => entry.id === team.id && entry.lead));
    const isOnlyLead = leads.length === 1 && leads[0].id === person.id && person.teams.some((entry) => entry.id === team.id && entry.lead);
    setConfirm({
      kind: 'remove',
      teamId: team.id,
      userId: person.id,
      message: isOnlyLead ? `${person.name} is the only lead for ${team.name}. Remove them from the team?` : `Remove ${person.name} from ${team.name}?`,
    });
  };

  const addMember = async () => {
    if (!memberId || !selectedTeam) return;
    try {
      await addTeamMember(selectedTeam.id, { userId: memberId, primary: false });
      setMemberId('');
      push({ tone: 'success', message: 'Added to the team.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  };

  const blockedManagers = form?.id ? new Set([form.id, ...descendants(form.id, people)]) : new Set();

  const rosterOf = (team) => shown
    .filter((person) => person.teams.some((item) => item.id === team.id && ['TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER'].includes(item.role)))
    .sort((a, b) => {
      const rank = (person) => (person.teams.find((item) => item.id === team.id)?.role === 'TEAM_LEAD' ? 0 : 1);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });

  const renderTeamCard = (team) => {
    const roster = rosterOf(team);
    const visibleRoster = roster.slice(0, 4);
    const hidden = roster.length - visibleRoster.length;
    return (
      <li key={team.id} className="org-branch org-branch--team">
        <div className="org-team-stack">
          <button type="button" className={`org-team-card org-team-card--${team.code} ${selection?.id === team.id ? 'is-selected' : ''}`} onClick={() => { setSelection({ type: 'team', id: team.id }); setDetail(null); }}>
            <span className="org-team-card__icon"><TeamGlyph code={team.code} /></span>
            <strong>{teamLabel(team)}</strong>
            <span className="org-team-card__foot">{roster.length ? `${roster.length} ${roster.length === 1 ? 'person' : 'people'}` : 'Team Lead / Members'}</span>
          </button>
          {roster.length ? (
            <ul className="org-roster">
              {visibleRoster.map((person) => {
                const role = person.teams.find((item) => item.id === team.id)?.role;
                return (
                  <li key={person.id}>
                    <button type="button" onClick={() => chooseEmployee(person)}>
                      <strong>{person.name}</strong>
                      <span>{role === 'TEAM_LEAD' ? 'Team Lead' : 'Member'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="org-roster-empty">No members assigned.</p>}
          {hidden > 0 ? (
            <button type="button" className="org-roster-more" onClick={() => { setSelection({ type: 'team', id: team.id }); setDetail(null); }}>View all members</button>
          ) : null}
        </div>
      </li>
    );
  };

  const renderCanonical = (model) => {
    const scope = (person) => accessLine(person, accessCount).scope;
    const leaders = [model.cto, model.business, model.director];
    return (
      <div className="org-canon">
        <div className="org-canon__axis">
          <div className="org-canon__ceo">
            <OrgNode person={model.ceo} selected={selection?.id === model.ceo.id} onSelect={chooseEmployee} scope={scope(model.ceo)} />
          </div>
          <div className="org-canon__leaders">
            {leaders.map((person) => (
              <div key={person.id} className="org-canon__leader">
                <OrgNode person={person} selected={selection?.id === person.id} onSelect={chooseEmployee} scope={scope(person)} />
              </div>
            ))}
          </div>
          {model.joint ? (
            <div className="org-canon__bridge" aria-hidden="true">
              <span />
              <span className="org-canon__pair"><i /><i /></span>
            </div>
          ) : null}
          <div className="org-canon__pm-row">
            <span />
            <div className="org-canon__pm-cell">
              <OrgNode person={model.pm} selected={selection?.id === model.pm.id} onSelect={chooseEmployee} scope={scope(model.pm)} />
            </div>
          </div>
        </div>
        <div className="org-canon__stem" aria-hidden="true" />
        <div className="org-canon__teams">
          <div className="org-canon__team-links" aria-hidden="true">
            {functionalTeams.map((team) => <span key={team.id} />)}
          </div>
          <ul className="org-canon__team-row">
            {functionalTeams.map((team) => renderTeamCard(team))}
          </ul>
        </div>
      </div>
    );
  };

  const renderNode = (person) => {
    const kids = childrenOf(person.id);
    const open = true;
    const ownsTeams = person.id === anchorId;
    const line = accessLine(person, teams.length);
    const hasChildren = kids.length > 0 || ownsTeams;
    return (
      <li key={person.id} className="org-branch">
        <div className="org-node-wrap">
          <OrgNode person={person} selected={selection?.id === person.id} onSelect={chooseEmployee} scope={line.scope} />
        </div>
        {hasChildren && open ? (
          <ul className="org-children">
            {kids.map(renderNode)}
            {ownsTeams ? orderedTeams.map(renderTeamCard) : null}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Organization Management"
        description="Organizational hierarchy and role-based access."
        actions={canManage ? <Button onClick={openCreate}><Plus size={16} /> Add Employee</Button> : null}
      />

      {status === 'loading' ? (
        <div className="org-skeleton" aria-hidden="true">
          <div className="org-kpis">{[0, 1, 2, 3].map((item) => <span key={item} />)}</div>
          <span className="org-skeleton__chart" />
          <div className="org-team-grid">{[0, 1, 2].map((item) => <span key={item} />)}</div>
        </div>
      ) : null}

      {status === 'error' ? (
        <ErrorState title="Unable to load organization data." description="The organization could not be loaded." action={<Button onClick={load}>Try Again</Button>} />
      ) : null}

      {status === 'ready' && data ? (
        <>
          <section className="org-overview">
            <span>Organization: {data.organization}</span>
            <span>Employees: {data.kpis.employees}</span>
            <span>Teams: {data.kpis.teams}</span>
            <span>Active: {data.kpis.active}</span>
            <span>Management: {data.kpis.management}</span>
            <span>Functional Members: {data.kpis.functional}</span>
          </section>

          <section className="org-kpis">
            {[
              ['employees', '', 'Total Employees', data.kpis.employees],
              ['teams', '', 'Teams', data.kpis.teams],
              ['active', 'ACTIVE', 'Active Members', data.kpis.active],
              ['inactive', 'INACTIVE', 'Inactive Members', data.kpis.inactive],
            ].map(([key, value, label, count]) => (
              <button key={key} type="button" className={`org-kpi ${value && filters.status === value ? 'is-selected' : ''}`} onClick={() => {
                if (key === 'teams') {
                  document.getElementById('org-teams')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  return;
                }
                setFilters({ ...filters, status: value && filters.status === value ? '' : value });
              }}>
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </section>

          <div className="org-toolbar">
            <label className="org-search">
              <Search size={16} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search organization..." aria-label="Search organization" />
            </label>
            <select className="select" aria-label="Role" value={filters.role} onChange={(event) => setFilters({ ...filters, role: event.target.value })}>
              <option value="">All roles</option>
              {(data.roles || []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
            </select>
            <select className="select" aria-label="Department" value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select className="select" aria-label="Team" value={filters.team} onChange={(event) => setFilters({ ...filters, team: event.target.value })}>
              <option value="">All teams</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{teamLabel(team)}</option>)}
            </select>
            <select className="select" aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ON_LEAVE">On leave</option>
            </select>
          </div>

          <div className="org-layout">
            <div className="org-main">
              <section className="org-board" id="org-teams">
                <h2>1. Organizational hierarchy &amp; access scope</h2>
                {people.length ? (
                  shown.length ? (
                    <div className="org-chart">
                      {chart ? renderCanonical(chart) : (
                        <>
                          <ul className="org-tree">{chartRoots.map(renderNode)}</ul>
                          {anchorId || !orderedTeams.length ? null : (
                            <ul className="org-children org-children--detached">{orderedTeams.map(renderTeamCard)}</ul>
                          )}
                        </>
                      )}
                    </div>
                  ) : <EmptyState icon={Building2} title="No matching people" description="Try another name, role, team, or status." />
                ) : (
                  <div className="org-board__empty">
                    <EmptyState icon={Building2} title="No employees yet" description="Add your first employee to build the organization hierarchy." />
                    {canManage ? <Button onClick={openCreate}><Plus size={16} /> Add Employee</Button> : null}
                  </div>
                )}
                {summaryGroups.length ? (
                  <div className="org-summary">
                    <h3>Access summary</h3>
                    <ul>
                      {summaryGroups.map((group) => (
                        <li key={group.phrase}><strong>{group.titles.join(' & ')}</strong> – {group.phrase}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </section>
            </div>

            <aside className={`org-panel ${selection ? 'is-open' : ''}`}>
              <h2>Details</h2>
              {!selection ? (
                <div className="org-panel__empty">
                  <p>Nothing selected</p>
                  <p className="org-muted">Select an employee or a team to see the name, role, reporting manager, membership, access scope, and account status.</p>
                </div>
              ) : null}
              {selectedPerson ? (
                <>
                  <div className="org-person">
                    <span className="org-avatar">{initials(selectedPerson.name)}</span>
                    <div>
                      <strong>{selectedPerson.name}</strong>
                      <span>{selectedPerson.designation || 'No designation'}</span>
                    </div>
                  </div>
                  <dl className="org-facts">
                    <div><dt>Designation</dt><dd>{selectedPerson.designation || 'Not set'}</dd></div>
                    <div><dt>Email</dt><dd>{selectedPerson.email || 'Not set'}</dd></div>
                    <div><dt>Phone</dt><dd>{selectedPerson.phone || 'Not set'}</dd></div>
                    <div><dt>Reports to</dt><dd>{managerNames(selectedPerson, people) || 'Top level'}</dd></div>
                    <div><dt>Team membership</dt><dd>{selectedPerson.teams.map((team) => `${teamLabel(team)}${team.lead ? ' · Lead' : team.role === 'MEMBER' ? ' · Member' : ''}`).join(', ') || 'None'}</dd></div>
                    <div><dt>Access scope</dt><dd>{accessLine(selectedPerson, accessCount).scope}</dd></div>
                    <div><dt>Direct reports</dt><dd>{directReportsOf(selectedPerson, people).map((person) => person.name).join(', ') || 'None'}</dd></div>
                    <div><dt>Role</dt><dd>{selectedPerson.role}</dd></div>
                    <div><dt>Department</dt><dd>{selectedPerson.department || 'Not set'}</dd></div>
                    <div><dt>Status</dt><dd>{statusLabel(selectedPerson.status)}</dd></div>
                  </dl>
                  {canManage ? (
                    <label className="org-status">Status
                      <select className="select" value={selectedPerson.status} onChange={(event) => changeStatus(selectedPerson, event.target.value)}>
                        <option value="ACTIVE">Active</option>
                        <option value="ON_LEAVE">On leave</option>
                        <option value="INACTIVE">Inactive</option>
                      </select>
                    </label>
                  ) : null}
                  {detail?.modules ? (
                    <div>
                      <h3>Allowed modules</h3>
                      <p>{detail.modules.filter((module) => module.actions.view).map((module) => module.label).join(', ') || 'None'}</p>
                    </div>
                  ) : null}
                  <div id="org-activity">
                    <h3>Recent activity</h3>
                    {detail?.activity?.length ? (
                      <ul className="org-activity">
                        {detail.activity.map((item, index) => <li key={`${item.action}-${index}`}><strong>{item.action}</strong><span>{item.actor}</span></li>)}
                      </ul>
                    ) : <p className="org-muted">No organization changes recorded yet.</p>}
                  </div>
                  {canManage ? (
                    <div className="org-actions">
                      <Button variant="secondary" onClick={() => openEdit(selectedPerson)}>Edit Employee</Button>
                      <Button variant="secondary" onClick={() => openAccess(selectedPerson)}>Manage Access</Button>
                      <Button variant="secondary" onClick={() => document.getElementById('org-activity')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}>View Activity</Button>
                    </div>
                  ) : null}
                </>
              ) : null}
              {selectedTeam ? (
                <>
                  <dl className="org-facts">
                    <div><dt>Team</dt><dd>{teamLabel(selectedTeam)}</dd></div>
                    <div><dt>Team lead</dt><dd>{rosterOf(selectedTeam).filter((person) => person.teams.some((team) => team.id === selectedTeam.id && team.role === 'TEAM_LEAD')).map((person) => person.name).join(', ') || 'Not assigned'}</dd></div>
                    <div><dt>Members</dt><dd>{rosterOf(selectedTeam).filter((person) => person.teams.some((team) => team.id === selectedTeam.id && team.role !== 'TEAM_LEAD')).map((person) => person.name).join(', ') || 'No members assigned.'}</dd></div>
                    <div><dt>Department</dt><dd>{selectedTeam.department || 'Not set'}</dd></div>
                    <div><dt>Reporting manager</dt><dd>{chart?.pm?.name || (anchorId ? people.find((person) => person.id === anchorId)?.name : '') || 'Not assigned'}</dd></div>
                    <div><dt>Open tasks</dt><dd>{selectedTeam.openTasks}</dd></div>
                    <div><dt>Overdue</dt><dd>{selectedTeam.overdueTasks}</dd></div>
                    <div><dt>Active projects</dt><dd>{selectedTeam.activeProjects}</dd></div>
                  </dl>
                  <h3>Members</h3>
                  {teamMembers.length ? teamMembers.map((person) => {
                    const membership = person.teams.find((team) => team.id === selectedTeam.id);
                    return (
                      <div key={person.id} className="org-member">
                        <button type="button" onClick={() => chooseEmployee(person)}>
                          <span className="org-avatar">{initials(person.name)}</span>
                          <span><strong>{person.name}</strong><small>{person.designation || person.role} · {statusLabel(person.status)}</small></span>
                        </button>
                        {canManage ? (
                          <span>
                            <button type="button" onClick={() => askLead(selectedTeam, person, !membership?.lead)}>{membership?.lead ? 'Remove team lead' : 'Make team lead'}</button>
                            <button type="button" onClick={() => askRemove(selectedTeam, person)}>Remove</button>
                          </span>
                        ) : null}
                      </div>
                    );
                  }) : <p className="org-muted">No members assigned.</p>}
                  {canManage ? (
                    <div className="org-add-member">
                      <select className="select" aria-label="Add employee to team" value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                        <option value="">Add an employee</option>
                        {people.filter((person) => person.status !== 'INACTIVE' && !person.teams.some((team) => team.id === selectedTeam.id)).map((person) => (
                          <option key={person.id} value={person.id}>{person.name}</option>
                        ))}
                      </select>
                      <Button variant="secondary" onClick={addMember} disabled={!memberId}>Add</Button>
                    </div>
                  ) : null}
                </>
              ) : null}
            </aside>
          </div>
        </>
      ) : null}

      <Modal
        open={Boolean(form)}
        className="org-dialog"
        title={form?.id ? 'Edit Employee' : 'Add Employee'}
        subtitle="Role-based access is applied from the selected role."
        onClose={() => !busy && setForm(null)}
        footer={form ? (
          <>
            <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
            <Button onClick={saveEmployee} loading={busy}>{form.id ? 'Save Changes' : 'Create Employee'}</Button>
          </>
        ) : null}
      >
        {form ? (
          <div className="org-form">
            {formError ? <p className="org-form-error">{formError}</p> : null}
            <label>First name *<input className="input" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} /></label>
            <label>Last name *<input className="input" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} /></label>
            <label>Email *<input className="input" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Phone<input className="input" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
            <label>Employee ID<input className="input" value={form.employeeCode} onChange={(event) => setForm({ ...form, employeeCode: event.target.value })} /></label>
            <label>Designation *<input className="input" value={form.designation} onChange={(event) => setForm({ ...form, designation: event.target.value })} /></label>
            <label>Department<input className="input" value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
            <label>Role *
              <select className="select" value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}>
                <option value="">Choose a role</option>
                {(data?.roles || []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <label>Reporting manager
              <select className="select" value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}>
                <option value="">Top level</option>
                {people.filter((person) => !blockedManagers.has(person.id)).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <label>Primary team
              <select className="select" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value, secondaryTeamIds: form.secondaryTeamIds.filter((id) => id !== event.target.value) })}>
                <option value="">None</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
            <fieldset>
              <legend>Secondary teams</legend>
              {teams.filter((team) => team.id !== form.teamId).map((team) => (
                <label key={team.id} className="org-check">
                  <input type="checkbox" checked={form.secondaryTeamIds.includes(team.id)} onChange={() => setForm({ ...form, secondaryTeamIds: form.secondaryTeamIds.includes(team.id) ? form.secondaryTeamIds.filter((id) => id !== team.id) : [...form.secondaryTeamIds, team.id] })} />
                  {team.name}
                </label>
              ))}
            </fieldset>
            <label>Joining date<input className="input" type="date" value={form.joiningDate} onChange={(event) => setForm({ ...form, joiningDate: event.target.value })} /></label>
            <label>Employment status
              <select className="select" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                <option value="ACTIVE">Active</option>
                <option value="ON_LEAVE">On leave</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            {form.id ? null : <label>Temporary password *<input className="input" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(access)}
        className="org-dialog org-dialog--wide"
        title="Manage Access"
        subtitle={access ? `${access.name} · ${access.role}` : ''}
        onClose={() => !busy && setAccess(null)}
        footer={access ? (
          <>
            <Button variant="secondary" onClick={() => setAccess(null)} disabled={busy}>Cancel</Button>
            <Button onClick={saveAccess} loading={busy}>Save Access</Button>
          </>
        ) : null}
      >
        {access ? (
          <div className="org-matrix-wrap">
            <table className="org-matrix">
              <thead>
                <tr>
                  <th>Module</th>
                  {(data?.actions || []).map((action) => <th key={action}>{action}</th>)}
                </tr>
              </thead>
              <tbody>
                {access.modules.map((module, index) => (
                  <tr key={module.id}>
                    <td>{module.label}</td>
                    {(data?.actions || []).map((action) => (
                      <td key={action}>
                        <input
                          type="checkbox"
                          aria-label={`${module.label} ${action}`}
                          checked={Boolean(module.actions[action])}
                          onChange={(event) => {
                            const modules = access.modules.map((item, itemIndex) => itemIndex === index ? { ...item, actions: { ...item.actions, [action]: event.target.checked } } : item);
                            setAccess({ ...access, modules });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(confirm)} className="org-dialog" title="Confirm team change" onClose={() => !busy && setConfirm(null)} footer={confirm ? (
        <>
          <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
          <Button onClick={runConfirm} loading={busy}>Confirm</Button>
        </>
      ) : null}>
        <p>{confirm?.message}</p>
      </Modal>
    </PageContainer>
  );
}
