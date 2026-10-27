import { Pencil, Trash2 } from 'lucide-react';
import { formatDate } from '../../utils/format';
import { ChecklistItem } from './ChecklistItem';
import { ChecklistProgress } from './ChecklistProgress';

export function ChecklistCard({ checklist, onToggle, onEdit, onDelete }) {
  const done = checklist.totalCount > 0 && checklist.completedCount === checklist.totalCount;
  const dateLabel = checklist.visitDate ? formatDate(checklist.visitDate) : '';
  return (
    <article className={done ? 'checklist-card is-complete' : 'checklist-card'}>
      <header>
        <div>
          <h2>{checklist.title}</h2>
          <p>{checklist.employeeName}</p>
        </div>
        <div>
          {done ? <span className="checklist-complete">✓ Complete</span> : null}
          {checklist.access?.canEdit ? (
            <button type="button" className="icon-button" aria-label={`Edit ${checklist.title}`} onClick={() => onEdit(checklist)}>
              <Pencil size={16} />
            </button>
          ) : null}
          {checklist.access?.canDelete ? (
            <button type="button" className="icon-button" aria-label={`Delete ${checklist.title}`} onClick={() => onDelete(checklist)}>
              <Trash2 size={16} />
            </button>
          ) : null}
        </div>
      </header>
      <ChecklistProgress completed={checklist.completedCount} total={checklist.totalCount} dateLabel={dateLabel} />
      <div>
        {checklist.items.map((item) => (
          <ChecklistItem
            key={item.id}
            item={item}
            disabled={!checklist.access?.canToggle}
            onToggle={(next) => onToggle(checklist, next)}
          />
        ))}
      </div>
    </article>
  );
}
