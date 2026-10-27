import { CalendarClock } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';

export function UpcomingDeadlines({ items = [] }) {
  return (
    <DashboardSection title="Upcoming Deadlines">
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={CalendarClock}
          title="No upcoming deadlines"
          description="Deadlines will appear here as work is scheduled."
        />
      ) : (
        <ol className="deadline-list">
          {items.map((item) => (
            <li key={item.id} className="deadline-list__item">
              <span className="deadline-list__when">{item.when}</span>
              <div className="deadline-list__body">
                <p>{item.task}</p>
                <span>
                  {item.project}
                  <span aria-hidden="true"> · </span>
                  {item.owner}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </DashboardSection>
  );
}
