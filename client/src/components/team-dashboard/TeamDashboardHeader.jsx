import { RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { PageHeader } from '../ui/PageHeader';

export function TeamDashboardHeader({ updatedAt, refreshing, onRefresh }) {
  return (
    <PageHeader
      title="Team Dashboard"
      description="Monitor team contribution, workload, project involvement and progress."
      actions={
        <div className="team-updated">
          <p>
            Last updated
            <strong>{updatedAt || '—'}</strong>
          </p>
          <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing}>
            <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" />
            Refresh
          </Button>
        </div>
      }
    />
  );
}
