import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, Plus } from 'lucide-react';
import { listLeads } from '../../services/leads.service';

const BASE_ACTIONS = [
  { id: 'active-projects', label: 'Active Projects', to: '/projects/active' },
  { id: 'add-task', label: 'Add Task', to: '/tasks' },
  { id: 'upload-drawing', label: 'Upload Drawing', to: '/projects', upload: true },
  { id: 'upload-bom', label: 'Upload BOM', to: '/solution-costing', upload: true },
];

export function QuickActions() {
  const [canCreateLead, setCanCreateLead] = useState(false);

  useEffect(() => {
    let active = true;
    listLeads()
      .then((payload) => {
        if (active) setCanCreateLead(Boolean(payload.data.access?.canCreate));
      })
      .catch(() => {
        if (active) setCanCreateLead(false);
      });
    return () => { active = false; };
  }, []);

  const actions = canCreateLead
    ? [{ id: 'create-lead', label: 'Create Lead', to: '/lead-pipeline/create', primary: true }, ...BASE_ACTIONS]
    : BASE_ACTIONS;

  return (
    <div className="quick-actions" aria-label="Quick actions">
      {actions.map((action) => (
        <Link
          key={action.id}
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
