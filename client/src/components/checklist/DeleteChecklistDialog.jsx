import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export function DeleteChecklistDialog({ checklist, busy, onCancel, onConfirm }) {
  return (
    <Modal open={Boolean(checklist)} title="Delete checklist?" onClose={onCancel}>
      <p>Are you sure you want to delete:</p>
      <p><strong>{checklist?.title}</strong></p>
      <p>This action cannot be undone.</p>
      <div className="checklist-form__actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm} loading={busy}>Delete</Button>
      </div>
    </Modal>
  );
}
