import { GitBranch } from 'lucide-react';
import { cx } from '../../utils/cx';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';

export function LeadPipeline({ stages = [] }) {
  const max = Math.max(1, ...stages.map((stage) => stage.count));

  return (
    <DashboardSection title="Lead Pipeline">
      {stages.length === 0 ? (
        <EmptyState
          compact
          icon={GitBranch}
          title="No leads in the pipeline"
          description="New leads will appear here as they move through qualification."
        />
      ) : (
        <ul className="pipeline">
          {stages.map((stage) => (
            <li key={stage.id} className="pipeline-row">
              <span className="pipeline-row__label">{stage.label}</span>
              <span className="pipeline-row__track" aria-hidden="true">
                <span
                  className={cx('pipeline-row__bar', stage.tone && `is-${stage.tone}`)}
                  style={{ width: `${(stage.count / max) * 100}%` }}
                />
              </span>
              <span className="pipeline-row__count">{stage.count}</span>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
