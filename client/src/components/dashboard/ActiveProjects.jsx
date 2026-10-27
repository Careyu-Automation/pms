import { Link } from 'react-router-dom';
import { FolderKanban } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';
import { priorityTone, statusTone } from './tones';

export function ActiveProjects({ projects = [] }) {
  return (
    <DashboardSection title="Active Projects">
      {projects.length === 0 ? (
        <div className="dash-empty">
          <EmptyState
            compact
            icon={FolderKanban}
            title="No active projects"
            description="Projects will appear here once created."
          />
          <Link to="/projects" className="btn btn--primary btn--sm">
            Create Project
          </Link>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table project-table">
            <thead>
              <tr>
                <th>Project ID</th>
                <th>Project Name</th>
                <th>Customer</th>
                <th>Project Manager</th>
                <th>Progress</th>
                <th>Status</th>
                <th>Deadline</th>
                <th>Priority</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td className="project-table__id">{project.code || project.id}</td>
                  <td>{project.projectId ? <Link to={`/projects/${project.projectId}`}>{project.name}</Link> : project.name}</td>
                  <td>{project.customer}</td>
                  <td>{project.manager}</td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress" aria-hidden="true">
                        <div className="progress__bar" style={{ width: `${project.progress}%` }} />
                      </div>
                      <span>{project.progress}%</span>
                    </div>
                  </td>
                  <td>
                    <Badge tone={statusTone(project.status)}>{project.status}</Badge>
                  </td>
                  <td>{project.deadline}</td>
                  <td>
                    <Badge tone={priorityTone(project.priority)}>{project.priority}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardSection>
  );
}
