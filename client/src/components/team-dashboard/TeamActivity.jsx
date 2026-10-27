import { Activity } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

export function TeamActivity({ items }) {
  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Recent Team Activity</h2>
      </header>
      {items.length === 0 ? (
        <EmptyState compact icon={Activity} title="No recent activity" description="Updates from this team will show up here." />
      ) : (
        <ol className="team-activity">
          {items.map((item) => (
            <li key={item.id}>
              <span className="team-activity__icon" aria-hidden="true">
                <Activity size={14} strokeWidth={1.75} />
              </span>
              <div>
                <p className="team-activity__time">{item.time}</p>
                <p className="team-activity__title">{item.user} · {item.action}</p>
                <p className="team-activity__ref">{item.projectName}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
