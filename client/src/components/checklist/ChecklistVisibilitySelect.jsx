import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const FILTER_LABEL = {
  everyone: 'Everyone can view',
  mine: 'Only me',
  selected: 'Selected people',
};

const SHARE_LABEL = {
  EVERYONE: 'Everyone can view',
  PRIVATE: 'Only me',
  SELECTED_USERS: 'Selected people',
};

export function ChecklistVisibilitySelect({
  variant = 'filter',
  mode = 'everyone',
  selectedIds = [],
  value = 'EVERYONE',
  viewerIds = [],
  people,
  disabled,
  onChange,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const listId = useId();
  const share = variant === 'field';
  const chosen = share ? viewerIds : selectedIds;

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = people.filter((person) => `${person.fullName} ${person.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const label = share
    ? SHARE_LABEL[value]
    : (mode === 'selected' && selectedIds.length === 1
      ? people.find((person) => person.id === selectedIds[0])?.fullName || FILTER_LABEL.selected
      : mode === 'selected' && selectedIds.length > 1
        ? `${selectedIds.length} people`
        : FILTER_LABEL[mode]);

  function chooseFilter(next) {
    onChange({ mode: next, selectedIds: next === 'selected' ? selectedIds : [] });
    if (next !== 'selected') setOpen(false);
  }

  function chooseShare(next) {
    onChange({ visibility: next, viewerIds: next === 'SELECTED_USERS' ? viewerIds : [] });
    if (next !== 'SELECTED_USERS') setOpen(false);
  }

  function togglePerson(id) {
    const next = chosen.includes(id) ? chosen.filter((item) => item !== id) : [...chosen, id];
    if (share) onChange({ visibility: 'SELECTED_USERS', viewerIds: next });
    else onChange({ mode: 'selected', selectedIds: next });
  }

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
        <span>{label}</span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="checklist-picker__panel" id={listId}>
          <input className="input" placeholder="Search people..." value={query} onChange={(event) => setQuery(event.target.value)} autoFocus />
          <ul role="listbox" aria-multiselectable="true">
            {share ? (
              <>
                <li><button type="button" role="option" aria-selected={value === 'EVERYONE'} onClick={() => chooseShare('EVERYONE')}><span>Everyone can view</span>{value === 'EVERYONE' ? <Check size={14} /> : null}</button></li>
                <li><button type="button" role="option" aria-selected={value === 'PRIVATE'} onClick={() => chooseShare('PRIVATE')}><span>Only me</span>{value === 'PRIVATE' ? <Check size={14} /> : null}</button></li>
                <li><button type="button" role="option" aria-selected={value === 'SELECTED_USERS'} onClick={() => chooseShare('SELECTED_USERS')}><span>Selected people</span>{value === 'SELECTED_USERS' ? <Check size={14} /> : null}</button></li>
              </>
            ) : (
              <>
                <li><button type="button" role="option" aria-selected={mode === 'everyone'} onClick={() => chooseFilter('everyone')}><span>Everyone can view</span>{mode === 'everyone' ? <Check size={14} /> : null}</button></li>
                <li><button type="button" role="option" aria-selected={mode === 'mine'} onClick={() => chooseFilter('mine')}><span>Only me</span>{mode === 'mine' ? <Check size={14} /> : null}</button></li>
                <li><button type="button" role="option" aria-selected={mode === 'selected'} onClick={() => chooseFilter('selected')}><span>Selected people</span>{mode === 'selected' ? <Check size={14} /> : null}</button></li>
              </>
            )}
            {visible.map((person) => (
              <li key={person.id}>
                <button type="button" role="option" aria-selected={chosen.includes(person.id)} onClick={() => togglePerson(person.id)}>
                  <span>{person.fullName}</span>
                  {chosen.includes(person.id) ? <Check size={14} /> : null}
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
