import { Check } from 'lucide-react';

export function ChecklistItem({ item, disabled, onToggle }) {
  return (
    <label className={item.completed ? 'checklist-row is-done' : 'checklist-row'}>
      <input
        type="checkbox"
        checked={item.completed}
        disabled={disabled}
        onChange={() => onToggle(item)}
      />
      <span className="checklist-row__box" aria-hidden="true">
        {item.completed ? <Check size={12} strokeWidth={2.5} /> : null}
      </span>
      <span>{item.title}</span>
    </label>
  );
}
