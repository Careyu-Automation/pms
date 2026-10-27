import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Code2, Eye, HardHat, ShoppingCart } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';

const ICONS = {
  software: Code2,
  robotics: Bot,
  procurement: ShoppingCart,
  execution: HardHat,
  vision: Eye,
};

const STATUS = {
  NOT_STARTED: { label: 'Not Started', tone: 'neutral' },
  PLANNING: { label: 'Planning', tone: 'review' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  AT_RISK: { label: 'At Risk', tone: 'warning' },
  ON_HOLD: { label: 'On Hold', tone: 'hold' },
  COMPLETED: { label: 'Completed', tone: 'completed' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
};

const PRIORITY = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };

function memberLabel(member) {
  return member.role === 'TEAM_LEAD' ? `${member.name} (Lead)` : member.name;
}

export function TeamProjectHub({ teams }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const teamCode = params.get('team') || '';
  const projectId = params.get('project') || '';
  const team = useMemo(() => teams.find((item) => item.code === teamCode) || null, [teams, teamCode]);
  const project = team?.projects.find((item) => item.id === projectId) || null;

  function openTeam(code) {
    setParams({ team: code });
  }

  function openProject(id) {
    setParams({ team: team.code, project: id });
  }

  return (
    <div className="project-board team-hub">
      <header className="project-board__head">
        <div>
          <p className="project-board__crumb">
            <button type="button" onClick={() => setParams({})}>Active Projects</button>
            {team ? <> → <button type="button" onClick={() => openTeam(team.code)}>{team.name}</button></> : null}
            {project ? <> → {project.title}</> : null}
          </p>
          <h1>{project ? project.title : team ? team.name : 'Active Projects'}</h1>
          <p>
            {project
              ? 'Select a team member to open only that person\'s tasks.'
              : team
                ? 'Projects assigned to this team.'
                : 'Choose a team to see its active projects, then a member to see their tasks.'}
          </p>
        </div>
      </header>

      {!team ? (
        <div className="team-hub__grid">
          {teams.map((item) => {
            const Icon = ICONS[item.code] || Code2;
            return (
              <button key={item.code} type="button" className={`team-hub__card team-hub__card--${item.code}`} onClick={() => openTeam(item.code)}>
                <span className="team-hub__icon" aria-hidden="true"><Icon size={18} /></span>
                <strong>{item.name}</strong>
                <span>Members: {item.members.length ? item.members.map(memberLabel).join(', ') : item.leadName}</span>
                <span>{item.activeProjects} active projects</span>
                <span>{item.openTasks} open tasks · {item.overdueTasks} overdue</span>
                <span>Progress {item.progress}%</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {team && !project ? (
        <>
        <section className="lead-section">
          <header className="lead-section__header">
            <h2>Team members</h2>
            <p>{team.members.length} on this team</p>
          </header>
          {team.members.length ? (
            <ul className="team-hub__members">
              {team.members.map((member) => (
                <li key={member.id}>
                  <button type="button" onClick={() => navigate(`/tasks?assigneeId=${member.id}`)}>
                    <strong>{member.name}</strong>
                    <span>{member.role === 'TEAM_LEAD' ? 'Team lead' : 'Member'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No members on this team" description="Add members from the Teams page. Their tasks will open from here." />
          )}
        </section>
        {team.projects.length ? (
          <div className="lead-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project ID</th>
                  <th>Project</th>
                  <th>Customer</th>
                  <th>Project manager</th>
                  <th>Teams</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Progress</th>
                  <th>Deadline</th>
                </tr>
              </thead>
              <tbody>
                {team.projects.map((item) => {
                  const meta = STATUS[item.status] || { label: item.status, tone: 'neutral' };
                  return (
                    <tr key={item.id}>
                      <td><button type="button" className="link-button" onClick={() => openProject(item.id)}>{item.projectCode}</button></td>
                      <td>{item.title}</td>
                      <td>{item.customerName || '—'}</td>
                      <td>{item.projectManager || '—'}</td>
                      <td>{item.teams || team.name}</td>
                      <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td>{PRIORITY[item.priority] || item.priority}</td>
                      <td>{item.progress}%</td>
                      <td>{item.deadline || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lead-section">
            <EmptyState title="No active projects for this team" description="Projects appear here after they are assigned to this team." />
          </div>
        )}
        </>
      ) : null}

      {team && project ? (
        <section className="lead-section">
          <header className="lead-section__header">
            <h2>Team members</h2>
            <p>{project.projectCode} · {project.customerName || 'Customer not set'}</p>
          </header>
          {team.members.length ? (
            <ul className="team-hub__members">
              {team.members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/tasks?projectId=${project.id}&assigneeId=${member.id}`)}
                  >
                    <strong>{member.name}</strong>
                    <span>{member.role === 'TEAM_LEAD' ? 'Team lead' : 'Member'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No members on this team" description="Add members from the Teams page. Their tasks will open from here." />
          )}
          <div className="lead-actions">
            <Button variant="secondary" onClick={() => navigate(`/projects/${project.id}`)}>Open project</Button>
            <Button variant="secondary" onClick={() => openTeam(team.code)}>Back to team projects</Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
