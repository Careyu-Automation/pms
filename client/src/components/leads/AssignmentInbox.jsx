import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { useToast } from '../../context/ToastContext';
import { listMyAssignments, respondToAssignment } from '../../services/leads.service';
import '../../styles/lead.css';

export function AssignmentInbox() {
  const navigate = useNavigate();
  const { push } = useToast();
  const [rows, setRows] = useState([]);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  function load() {
    return listMyAssignments()
      .then((payload) => setRows(payload.data.assignments || []))
      .catch(() => setRows([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function accept(row) {
    setBusy(true);
    try {
      await respondToAssignment(row.id, { action: 'ACCEPT' });
      push({ tone: 'success', message: `${row.teamName} assignment accepted.` });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    if (!rejecting) return;
    setBusy(true);
    try {
      await respondToAssignment(rejecting.id, { action: 'REJECT', reason });
      setRejecting(null);
      setReason('');
      push({ tone: 'success', message: 'Assignment returned to the project manager.' });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (!rows.length && !rejecting) return null;

  return (
    <section className="lead-incoming" aria-label="Team assignments waiting for a response">
      <h2>Assignments waiting for you</h2>
      <div className="lead-incoming__grid">
        {rows.map((row) => (
          <article key={row.id} className="lead-incoming__card">
            <p className="lead-code">{row.leadCode}</p>
            <h3>{row.title || 'Untitled lead'}</h3>
            <p>{row.customerName || 'Customer not set'}</p>
            <p>{row.teamName}</p>
            <div className="lead-actions">
              <Button size="sm" disabled={busy} onClick={() => accept(row)}>Accept</Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setRejecting(row); setReason(''); }}>Reject</Button>
              <Button size="sm" variant="secondary" onClick={() => navigate(`/lead-pipeline/${row.leadId}`)}>Open lead</Button>
            </div>
          </article>
        ))}
      </div>
      <Modal open={Boolean(rejecting)} title="Reject assignment?" onClose={() => setRejecting(null)}>
        <div className="lead-confirm">
          <p>Tell the project manager why this assignment is being returned. The lead, feasibility study, and costing stay in place.</p>
          <textarea className="textarea" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Rejection reason" />
          <div className="lead-confirm__actions">
            <Button variant="secondary" onClick={() => setRejecting(null)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={reject} loading={busy}>Reject assignment</Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
