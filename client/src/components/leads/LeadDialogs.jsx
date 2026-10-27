import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { formatDate } from '../../utils/format';

export function LeadDeleteDialog({ lead, busy, onCancel, onConfirm }) {
  return (
    <Modal open={Boolean(lead)} title="Delete lead?" onClose={onCancel}>
      <div className="lead-dialog">
        <p>Are you sure you want to delete:</p>
        <p className="lead-dialog__subject">
          {lead?.leadCode} — {lead?.title || 'Untitled lead'}
        </p>
        <p>This action cannot be undone.</p>
        <div className="lead-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>Delete lead</Button>
        </div>
      </div>
    </Modal>
  );
}

export function LeadSubmitDialog({ lead, busy, onCancel, onConfirm }) {
  return (
    <Modal open={Boolean(lead)} title="Submit lead to project manager?" onClose={onCancel}>
      <div className="lead-dialog">
        <dl className="lead-dialog__facts">
          <div><dt>Lead</dt><dd>{lead?.leadCode || 'New lead'}</dd></div>
          <div><dt>Customer</dt><dd>{lead?.customerName || 'Not set'}</dd></div>
          <div><dt>Project</dt><dd>{lead?.title || 'Untitled lead'}</dd></div>
          <div><dt>Priority</dt><dd>{lead?.priority || 'Medium'}</dd></div>
          <div><dt>Expected decision</dt><dd>{formatDate(lead?.expectedDecisionDate)}</dd></div>
        </dl>
        <p>Once submitted, this lead will be sent to the project manager for review.</p>
        <div className="lead-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button loading={busy} onClick={onConfirm}>Submit to PM</Button>
        </div>
      </div>
    </Modal>
  );
}
