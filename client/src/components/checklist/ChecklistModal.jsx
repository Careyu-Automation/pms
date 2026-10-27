import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ChecklistItemInput } from './ChecklistItemInput';
import { ChecklistVisibilitySelect } from './ChecklistVisibilitySelect';
import { EmployeeSelect } from './EmployeeSelect';

function fromChecklist(checklist, userId) {
  if (!checklist) {
    return {
      employeeId: userId,
      title: '',
      note: '',
      visitDate: '',
      visibility: 'EVERYONE',
      viewerIds: [],
      items: [],
    };
  }
  return {
    employeeId: checklist.employeeId,
    title: checklist.title,
    note: checklist.note || '',
    visitDate: checklist.visitDate || '',
    visibility: checklist.visibility,
    viewerIds: checklist.viewerIds || [],
    items: checklist.items.map((item) => ({ key: item.id, id: item.id, title: item.title, completed: item.completed })),
  };
}

export function ChecklistModal({ mode, checklist, people, canAssign, userId, busy, onClose, onSubmit }) {
  const [form, setForm] = useState(() => fromChecklist(checklist, userId));
  const [draft, setDraft] = useState('');
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setForm(fromChecklist(checklist, userId));
    setDraft('');
    setErrors({});
  }, [checklist, userId, mode]);

  function addItem() {
    const title = draft.trim();
    if (!title) return;
    setForm((current) => ({
      ...current,
      items: [...current.items, { key: `new-${Date.now()}`, title, completed: false }],
    }));
    setDraft('');
    setErrors((current) => ({ ...current, items: undefined }));
  }

  function submit(event) {
    event.preventDefault();
    const next = {};
    if (form.title.trim().length < 1) next.title = 'Title is required.';
    const items = form.items.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title);
    if (!items.length) next.items = 'Add at least one checklist item.';
    if (form.visibility === 'SELECTED_USERS' && !form.viewerIds.length) next.visibility = 'Select at least one person.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    onSubmit({
      employeeId: form.employeeId,
      title: form.title.trim(),
      note: form.note.trim(),
      visitDate: form.visitDate,
      visibility: form.visibility,
      viewerIds: form.visibility === 'SELECTED_USERS' ? form.viewerIds : [],
      items: items.map((item) => ({ id: item.id, title: item.title })),
    });
  }

  return (
    <Modal open className="checklist-dialog" title={mode === 'edit' ? 'Edit Checklist' : 'New Checklist'} onClose={onClose}>
      <form className="checklist-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Employee<span className="field__required">*</span></span>
          <EmployeeSelect people={people} value={form.employeeId} disabled={!canAssign} onChange={(employeeId) => setForm({ ...form, employeeId })} />
        </label>
        <label className={errors.title ? 'field field--error' : 'field'}>
          <span className="field__label">Title<span className="field__required">*</span></span>
          <input className="input" placeholder="Client Visit - ABC Company" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
          {errors.title ? <span className="field__error">{errors.title}</span> : null}
        </label>
        <label className="field">
          <span className="field__label">Note</span>
          <textarea className="textarea" rows={3} placeholder="Optional note" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Visit date</span>
          <input className="input" type="date" value={form.visitDate} onChange={(event) => setForm({ ...form, visitDate: event.target.value })} />
        </label>
        <label className={errors.visibility ? 'field field--error' : 'field'}>
          <span className="field__label">Visibility</span>
          <ChecklistVisibilitySelect
            variant="field"
            value={form.visibility}
            viewerIds={form.viewerIds}
            people={people.filter((person) => person.id !== form.employeeId)}
            disabled={mode === 'edit' && checklist && !checklist.access?.canChangeVisibility}
            onChange={(next) => setForm({ ...form, visibility: next.visibility, viewerIds: next.viewerIds })}
          />
          {errors.visibility ? <span className="field__error">{errors.visibility}</span> : null}
        </label>
        <div className={errors.items ? 'field field--error' : 'field'}>
          <span className="field__label">Items</span>
          <ChecklistItemInput
            draft={draft}
            items={form.items}
            onDraft={setDraft}
            onAdd={addItem}
            onChange={(key, title) => setForm({ ...form, items: form.items.map((item) => (item.key === key ? { ...item, title } : item)) })}
            onRemove={(key) => setForm({ ...form, items: form.items.filter((item) => item.key !== key) })}
            onMove={(index, direction) => {
              const items = [...form.items];
              const target = index + direction;
              if (target < 0 || target >= items.length) return;
              const [item] = items.splice(index, 1);
              items.splice(target, 0, item);
              setForm({ ...form, items });
            }}
          />
          {errors.items ? <span className="field__error">{errors.items}</span> : null}
        </div>
        <div className="checklist-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}
