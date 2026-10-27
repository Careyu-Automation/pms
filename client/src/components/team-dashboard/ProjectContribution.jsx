import { FolderKanban } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { contributionTone } from './tones';

export function ProjectContribution({ projects }) {
  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Project Contribution</h2>
      </header>
      <p className="team-note">
        Project progress is overall delivery. Team contribution is this team’s own share of the work.
      </p>
      {projects.length === 0 ? (
        <EmptyState
          compact
          icon={FolderKanban}
          title="No projects currently assigned to this team."
          description="Projects appear here when this team is added to a delivery."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table team-table team-table--projects">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project</th>
                <th>Customer</th>
                <th>Team Role</th>
                <th>Project Progress</th>
                <th>Team Contribution</th>
                <th>Tasks</th>
                <th>Deadline</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="team-table__id">{project.id}</td>
                  <td>
                    <p className="team-table__title">{project.name}</p>
                    {project.partners.length ? (
                      <p className="team-table__meta">{project.partners.join(' · ')}</p>
                    ) : null}
                  </td>
                  <td>{project.customer}</td>
                  <td>
                    <Badge tone={contributionTone(project.role)}>{project.role}</Badge>
                  </td>
                  <td>
                    <Meter label="Project progress" value={project.progress} />
                  </td>
                  <td>
                    <Meter label="Team contribution" value={project.contribution} />
                  </td>
                  <td>{project.taskCount}</td>
                  <td>{project.deadline.replace(' 2026', '')}</td>
                  <td>
                    <Badge tone={projectStatusTone(project.status)}>{project.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Meter({ label, value }) {
  return (
    <div className="meter">
      <span className="progress" aria-label={`${label} ${value}%`}>
        <span className="progress__bar" style={{ width: `${value}%` }} />
      </span>
      <span>{value}%</span>
    </div>
  );
}

function projectStatusTone(status) {
  if (status === 'Completed') return 'completed';
  if (status === 'Planning') return 'neutral';
  if (status === 'Execution' || status === 'Development') return 'hold';
  return 'progress';
}
