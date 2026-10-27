import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../ui/Button';
import { useToast } from '../../../context/ToastContext';
import { assignProjectTeam, listProjectTeams, listTeams, removeProjectTeam, updateProjectTeam } from '../../../services/teams.service';
import { PROJECT_ROLE } from '../../../pages/teams/teamModel';

export function ProjectTeams({ projectId, canEdit }) {
  const { push } = useToast();
  const [links, setLinks] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [teamRole, setTeamRole] = useState('SUPPORTING');
  const [contribution, setContribution] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    listProjectTeams(projectId)
      .then((payload) => setLinks(payload.data.teams || []))
      .catch((error) => push({ tone: 'danger', message: error.message }));
  }, [projectId, push]);

  useEffect(() => { load(); }, [load]);

  async function add(event) {
    event.preventDefault();
    if (!teamId) return;
    try {
      const payload = await assignProjectTeam(projectId, { teamId, teamRole, contributionPercent: Number(contribution) || 0 });
      setLinks(payload.data.teams || []);
      setOpen(false);
      setTeamId('');
      push({ tone: 'success', message: 'Team assigned.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function change(link, patch) {
    try {
      const payload = await updateProjectTeam(projectId, link.teamId, {
        teamRole: patch.teamRole || link.teamRole,
        contributionPercent: patch.contributionPercent ?? link.contributionPercent,
      });
      setLinks(payload.data.teams || []);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function remove(link) {
    try {
      const payload = await removeProjectTeam(projectId, link.teamId);
      setLinks(payload.data.teams || []);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  const available = catalog.filter((team) => !links.some((link) => link.teamId === team.id));

  return (
    <section className="pd-section">
      <header className="pd-section__head">
        <h2>Teams involved</h2>
        {canEdit ? <Button size="sm" onClick={() => { setOpen(true); listTeams({ catalog: '1', status: 'ACTIVE' }).then((payload) => setCatalog(payload.data.teams || [])).catch(() => {}); }}>Add Team</Button> : null}
      </header>
      {links.length ? (
        <ul className="pd-team">
          {links.map((link) => (
            <li key={link.id}>
              <div>
                <Link to={`/teams/${link.teamId}`}><strong>{link.teamName}</strong></Link>
                <small>{PROJECT_ROLE[link.teamRole]} · Project {link.projectProgress}% · Contribution {link.contributionPercent}%</small>
              </div>
              {canEdit ? (
                <span className="teams-inline">
                  <select className="select" aria-label={`${link.teamName} role`} value={link.teamRole} onChange={(event) => change(link, { teamRole: event.target.value })}>
                    {Object.entries(PROJECT_ROLE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <input className="input" type="number" min="0" max="100" aria-label={`${link.teamName} contribution`} defaultValue={link.contributionPercent} onBlur={(event) => {
                    if (Number(event.target.value) !== link.contributionPercent) change(link, { contributionPercent: Number(event.target.value) });
                  }} />
                  <Button size="sm" variant="secondary" onClick={() => remove(link)}>Remove</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="pd-muted">No teams are assigned to this project yet.</p>}
      {open ? (
        <form className="feas-stack" onSubmit={add}>
          <select className="select" value={teamId} onChange={(event) => setTeamId(event.target.value)} required>
            <option value="">Select team</option>
            {available.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <select className="select" value={teamRole} onChange={(event) => setTeamRole(event.target.value)}>
            {Object.entries(PROJECT_ROLE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input className="input" type="number" min="0" max="100" value={contribution} onChange={(event) => setContribution(event.target.value)} aria-label="Contribution percent" />
          <div className="lead-actions">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Assign team</Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
