import { Users } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';

export function TeamWorkload({ teams = [] }) {
  return (
    <DashboardSection title="Team Workload">
      {teams.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title="No workload data"
          description="Team capacity will appear here once assignments are tracked."
        />
      ) : (
        <ul className="workload">
          {teams.map((team) => (
            <li key={team.id}>
              <div className="workload__meta">
                <span>{team.label}</span>
                <strong>{team.value}%</strong>
              </div>
              <div className="progress" aria-hidden="true">
                <div className="progress__bar" style={{ width: `${team.value}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
