import { Link } from 'react-router-dom';
import { FileUp, Plus } from 'lucide-react';

const ACTIONS = [
  { label: 'Create Lead', to: '/lead-pipeline/create', primary: true },
  { label: 'Active Projects', to: '/projects/active' },
  { label: 'Add Task', to: '/tasks' },
  { label: 'Upload Drawing', to: '/projects', upload: true },
  { label: 'Upload BOM', to: '/solution-costing', upload: true },
];

export function QuickActions() {
  return (
    <div className="quick-actions" aria-label="Quick actions">
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          to={action.to}
          className={action.primary ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
        >
          {action.upload ? <FileUp size={14} strokeWidth={1.75} aria-hidden="true" /> : <Plus size={14} strokeWidth={1.75} aria-hidden="true" />}
          {action.label}
        </Link>
      ))}
    </div>
  );
}
