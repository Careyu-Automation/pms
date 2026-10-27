import { PageHeader } from '../ui/PageHeader';
import { QuickActions } from './QuickActions';

export function DashboardHeader() {
  return (
    <PageHeader
      title="Dashboard"
      description="Overview of your workspace and project activity"
      actions={<QuickActions />}
    />
  );
}
