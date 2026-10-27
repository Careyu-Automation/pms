import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { ChecklistCard } from '../../components/checklist/ChecklistCard';
import { ChecklistModal } from '../../components/checklist/ChecklistModal';
import { ChecklistVisibilitySelect } from '../../components/checklist/ChecklistVisibilitySelect';
import { DeleteChecklistDialog } from '../../components/checklist/DeleteChecklistDialog';
import { EmptyChecklistState } from '../../components/checklist/EmptyChecklistState';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { createChecklist, deleteChecklist, listChecklistUsers, listChecklists, toggleChecklistItem, updateChecklist } from '../../services/checklists.service';
import '../../styles/checklist.css';

export default function MyChecklistPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [checklists, setChecklists] = useState([]);
  const [people, setPeople] = useState([]);
  const [access, setAccess] = useState({ canAssignEmployee: false });
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('newest');
  const [scope, setScope] = useState('everyone');
  const [selectedIds, setSelectedIds] = useState([]);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(() => {
    if (!loaded.current) setStatus('loading');
    const filters = {
      q: query,
      sort,
      scope: scope === 'mine' ? 'mine' : scope === 'selected' ? 'selected' : 'all',
      employeeIds: scope === 'selected' ? selectedIds.join(',') : '',
    };
    return listChecklists(filters)
      .then((payload) => {
        setChecklists(payload.data.checklists || []);
        setAccess(payload.data.access || { canAssignEmployee: false });
        loaded.current = true;
        setStatus('ready');
      })
      .catch((error) => {
        if (!loaded.current) setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [push, query, scope, selectedIds, sort]);

  useEffect(() => {
    listChecklistUsers()
      .then((payload) => setPeople(payload.data.users || []))
      .catch((error) => push({ tone: 'danger', message: error.message }));
  }, [push]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { load(); }, [load]);

  async function save(body) {
    setBusy(true);
    try {
      if (editing) {
        await updateChecklist(editing.id, body);
        push({ tone: 'success', message: 'Checklist updated.' });
      } else {
        await createChecklist(body);
        push({ tone: 'success', message: 'Checklist created successfully.' });
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(checklist, item) {
    const previous = checklists;
    setChecklists((current) => current.map((entry) => {
      if (entry.id !== checklist.id) return entry;
      const items = entry.items.map((row) => (row.id === item.id ? { ...row, completed: !row.completed } : row));
      const completedCount = items.filter((row) => row.completed).length;
      return {
        ...entry,
        items,
        completedCount,
        progress: items.length ? Math.round((completedCount / items.length) * 100) : 0,
      };
    }));
    try {
      const payload = await toggleChecklistItem(checklist.id, item.id);
      const next = payload.data.checklist;
      setChecklists((current) => current.map((entry) => (entry.id === next.id ? next : entry)));
    } catch (error) {
      setChecklists(previous);
      push({ tone: 'danger', message: error.message });
    }
  }

  async function confirmDelete() {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteChecklist(removing.id);
      setRemoving(null);
      push({ tone: 'success', message: 'Checklist deleted.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const filtered = Boolean(query) || scope !== 'everyone' || sort !== 'newest';

  return (
    <PageContainer>
      <button type="button" className="checklist-back" onClick={() => navigate(-1)}>← Back</button>
      <header className="checklist-head">
        <div>
          <h1>My Checklist</h1>
          <p>Personal preparation lists. These are not tasks.</p>
          <p className="checklist-employee">Employee: {user?.fullName || 'Current user'}</p>
        </div>
        <div className="checklist-head__actions">
          <ChecklistVisibilitySelect
            mode={scope}
            selectedIds={selectedIds}
            people={people}
            onChange={(next) => { setScope(next.mode); setSelectedIds(next.selectedIds); }}
          />
          <Button onClick={() => { setEditing(null); setCreating(true); }}><Plus size={16} /> New Checklist</Button>
        </div>
      </header>
      <div className="checklist-toolbar">
        <input className="input" placeholder="Search checklists..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <select className="select" aria-label="Sort checklists" value={sort} onChange={(event) => setSort(event.target.value)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="visit">Visit date</option>
          <option value="completion">Completion</option>
        </select>
      </div>
      {status === 'loading' ? (
        <div className="checklist-grid" aria-hidden="true">
          <div className="checklist-skeleton" />
          <div className="checklist-skeleton" />
        </div>
      ) : null}
      {status === 'error' ? <ErrorState title="Unable to load checklists." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && !checklists.length ? <EmptyChecklistState filtered={filtered} /> : null}
      {status === 'ready' && checklists.length ? (
        <div className="checklist-grid">
          {checklists.map((checklist) => (
            <ChecklistCard
              key={checklist.id}
              checklist={checklist}
              onToggle={toggle}
              onEdit={setEditing}
              onDelete={setRemoving}
            />
          ))}
        </div>
      ) : null}
      {creating || editing ? (
        <ChecklistModal
          mode={editing ? 'edit' : 'create'}
          checklist={editing}
          people={people}
          canAssign={access.canAssignEmployee}
          userId={user?.id || ''}
          busy={busy}
          onClose={() => { if (!busy) { setCreating(false); setEditing(null); } }}
          onSubmit={save}
        />
      ) : null}
      <DeleteChecklistDialog
        checklist={removing}
        busy={busy}
        onCancel={() => { if (!busy) setRemoving(null); }}
        onConfirm={confirmDelete}
      />
    </PageContainer>
  );
}
