import { Activity, ArrowRightLeft, CheckCheck, FileUp, UserPlus } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';

const ICONS = {
  upload: FileUp,
  approved: CheckCheck,
  status: ArrowRightLeft,
  lead: UserPlus,
};

export function RecentActivity({ items = [] }) {
  return (
    <DashboardSection title="Recent Activity">
      {items.length === 0 ? (
        <EmptyState
          compact
          icon={Activity}
          title="No recent activity"
          description="Updates from projects and leads will show up here."
        />
      ) : (
        <ol className="activity">
          {items.map((item) => {
            const Icon = ICONS[item.kind] || Activity;
            return (
              <li key={item.id} className="activity__item">
                <span className="activity__icon" aria-hidden="true">
                  <Icon size={14} strokeWidth={1.75} />
                </span>
                <div>
                  <p className="activity__time">{item.time}</p>
                  <p className="activity__title">{item.title}</p>
                  <p className="activity__ref">{item.ref}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </DashboardSection>
  );
}
