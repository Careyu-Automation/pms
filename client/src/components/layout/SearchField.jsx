import { useState } from 'react';
import { Search } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';

function SearchForm({ id, autoFocus = false }) {
  const { push } = useToast();
  const [query, setQuery] = useState('');

  const onSubmit = (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    push({
      tone: 'info',
      message: 'Workspace search will be available in a later phase.',
    });
  };

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor={id}>Search workspace</label>
      <Search className="search__icon" size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        id={id}
        className="search__input"
        type="search"
        name="q"
        value={query}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder="Search workspace"
        onChange={(event) => setQuery(event.target.value)}
      />
    </form>
  );
}

export function SearchField() {
  const isCompact = useMediaQuery('(max-width: 860px)');
  const [open, setOpen] = useState(false);

  if (isCompact) {
    return (
      <>
        <button
          type="button"
          className="icon-button"
          aria-label="Search workspace"
          onClick={() => setOpen(true)}
        >
          <Search size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <Modal open={open} title="Search" onClose={() => setOpen(false)}>
          <p className="form-note">Workspace search will be available in a later phase.</p>
          <SearchForm id="workspace-search-mobile" autoFocus />
        </Modal>
      </>
    );
  }

  return <SearchForm id="workspace-search" />;
}
