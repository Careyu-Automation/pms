import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { EscalationForm } from './EscalationForm';
import { escalationFieldErrors } from './model';

const ORDER = ['title', 'type', 'priority', 'description'];

export function EscalationEditor({ form, setForm, options, busy, formError, onClose, onSubmit }) {
  const baseline = useRef('');
  const lock = useRef(false);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [discard, setDiscard] = useState(false);
  const open = Boolean(form);

  useEffect(() => {
    if (!open) return undefined;
    baseline.current = JSON.stringify(form);
    setFiles([]);
    setErrors({});
    setDiscard(false);
    return undefined;
  }, [open]);

  function dirty() {
    return JSON.stringify(form) !== baseline.current || files.length > 0;
  }

  function requestClose() {
    if (!form || busy) return;
    if (discard) {
      setDiscard(false);
      return;
    }
    if (dirty()) {
      setDiscard(true);
      return;
    }
    onClose();
  }

  async function submit() {
    if (busy || lock.current) return;
    const next = escalationFieldErrors(form);
    setErrors(next);
    const first = ORDER.find((key) => next[key]);
    if (first) {
      const node = document.getElementById(`esc-${first}`);
      const scroller = node?.closest('.modal__body');
      if (node && scroller) {
        const top = node.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - 12;
        scroller.scrollTo({ top, behavior: 'smooth' });
        node.focus({ preventScroll: true });
      }
      return;
    }
    lock.current = true;
    try {
      await onSubmit(form, files);
    } finally {
      lock.current = false;
    }
  }

  const editing = Boolean(form?.id);

  return (
    <Modal
      open={open}
      className="esc-dialog"
      title={discard ? 'Discard escalation?' : (editing ? 'Edit Escalation' : 'Create Escalation')}
      subtitle={discard ? 'You have unsaved changes.' : (editing ? 'Update the issue, impact, and who is responsible.' : 'Raise an issue that requires attention, action or management intervention.')}
      onClose={requestClose}
      footer={discard ? (
        <>
          <Button variant="secondary" onClick={() => setDiscard(false)}>Keep Editing</Button>
          <Button variant="danger" onClick={() => { setDiscard(false); onClose(); }}>Discard</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={requestClose} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" onClick={submit} loading={busy} disabled={busy}>
            {busy ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save Changes' : 'Create Escalation')}
          </Button>
        </>
      )}
    >
      {form && !discard ? (
        <EscalationForm form={form} setForm={setForm} options={options} errors={errors} files={files} setFiles={setFiles} formError={formError} onEdit={(key) => setErrors((current) => { const next = { ...current }; delete next[key]; return next; })} />
      ) : null}
      {discard ? <p className="esc-muted">The details you entered stay here until you discard them.</p> : null}
    </Modal>
  );
}
