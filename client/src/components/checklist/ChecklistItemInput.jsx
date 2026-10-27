import { ChevronDown, ChevronUp, Plus, X } from 'lucide-react';
import { Button } from '../ui/Button';

export function ChecklistItemInput({ draft, items, onDraft, onAdd, onChange, onRemove, onMove }) {
  return (
    <div className="checklist-items">
      <div className="checklist-items__add">
        <input
          className="input"
          placeholder="Laptop, documents..."
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onAdd();
            }
          }}
        />
        <Button type="button" variant="secondary" onClick={onAdd}><Plus size={16} /> Add</Button>
      </div>
      <ul>
        {items.map((item, index) => (
          <li key={item.key}>
            <span className="checklist-row__box" aria-hidden="true" />
            <input
              className="input"
              aria-label={`Item ${index + 1}`}
              value={item.title}
              onChange={(event) => onChange(item.key, event.target.value)}
            />
            <button type="button" className="icon-button" aria-label="Move item up" disabled={index === 0} onClick={() => onMove(index, -1)}>
              <ChevronUp size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="Move item down" disabled={index === items.length - 1} onClick={() => onMove(index, 1)}>
              <ChevronDown size={16} />
            </button>
            <button type="button" className="icon-button" aria-label="Remove item" onClick={() => onRemove(item.key)}>
              <X size={16} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
