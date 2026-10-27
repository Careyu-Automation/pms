import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export function EmployeeSelect({ people, value, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listId = useId();
  const selected = people.find((person) => person.id === value);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const visible = people.filter((person) => {
    const text = `${person.fullName} ${person.email}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });

  return (
    <div className="checklist-picker" ref={rootRef}>
      <button
        type="button"
        className="select checklist-picker__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.fullName || 'Select employee'}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="checklist-picker__panel" id={listId} role="listbox">
          <input className="input" placeholder="Search people..." value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          <ul>
            {visible.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={person.id === value}
                  onClick={() => { onChange(person.id); setOpen(false); }}
                >
                  <span>{person.fullName}</span>
                  {person.id === value ? <Check size={14} /> : null}
                </button>
              </li>
            ))}
            {visible.length ? null : <li className="checklist-picker__empty">No people match.</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
