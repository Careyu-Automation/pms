import { ListChecks } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';

export function EmptyChecklistState({ filtered }) {
  if (filtered) {
    return <EmptyState icon={ListChecks} title="No checklists match" description="Try another search, employee, or visibility filter." />;
  }
  return (
    <EmptyState
      icon={ListChecks}
      title="No checklists yet"
      description="Create a checklist to prepare for visits, demos, meetings or other activities."
    />
  );
}
