import { PieChart } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';

export function ProjectOverview({ statuses = [] }) {
  const total = statuses.reduce((sum, item) => sum + item.count, 0);

  let cursor = 0;
  const gradient = statuses
    .map((item) => {
      const start = cursor;
      const share = total ? (item.count / total) * 100 : 0;
      cursor += share;
      return `${item.color} ${start}% ${cursor}%`;
    })
    .join(', ');

  return (
    <DashboardSection title="Project Overview">
      {total === 0 ? (
        <EmptyState
          compact
          icon={PieChart}
          title="No project status yet"
          description="Status counts will appear here once projects are created."
        />
      ) : (
        <div className="overview">
          <div
            className="donut"
            style={{ background: `conic-gradient(${gradient})` }}
            role="img"
            aria-label={`Project status across ${total} projects`}
          >
            <div className="donut__hole">
              <strong>{total}</strong>
              <span>Projects</span>
            </div>
          </div>
          <ul className="overview-legend">
            {statuses.map((item) => {
              const percent = Math.round((item.count / total) * 100);
              return (
                <li key={item.id}>
                  <span className="overview-legend__swatch" style={{ background: item.color }} />
                  <span className="overview-legend__label">{item.label}</span>
                  <span className="overview-legend__value">
                    {item.count}
                    <small>{percent}%</small>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardSection>
  );
}
