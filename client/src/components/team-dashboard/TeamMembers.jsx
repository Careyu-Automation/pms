import { Users } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { EmptyState } from '../ui/EmptyState';

export function TeamMembers({ members, onSelect }) {
  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Team Members</h2>
      </header>
      {members.length === 0 ? (
        <EmptyState compact icon={Users} title="No team members found." description="Members will appear here once they are assigned to this team." />
      ) : (
        <div className="table-scroll">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Projects</th>
                <th>Tasks</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr
                  key={member.id}
                  className="is-clickable"
                  tabIndex={0}
                  onClick={() => onSelect(member)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelect(member);
                    }
                  }}
                >
                  <td>
                    <span className="member-cell">
                      <Avatar name={member.name} size="sm" />
                      <span>
                        <strong>{member.name}</strong>
                        <small>{member.designation}</small>
                      </span>
                    </span>
                  </td>
                  <td>{member.projectCount}</td>
                  <td>{member.taskCount}</td>
                  <td>
                    <div className="meter">
                      <span className="progress" aria-hidden="true">
                        <span className="progress__bar" style={{ width: `${member.progress}%` }} />
                      </span>
                      <span>{member.progress}%</span>
                    </div>
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
