import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Tooltip } from '../../components/ui/Tooltip';
import { canEditLead, canSubmitLead, leadStatusMeta } from '../../components/leads/leadModel';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { deleteLead, listLeads, submitLead } from '../../services/leads.service';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../styles/lead.css';

function ActionIcon({ label, onClick, children, danger = false }) {
  return (
    <Tooltip content={label}>
      <button type="button" className={danger ? 'icon-button icon-button--danger' : 'icon-button'} aria-label={label} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  );
}

export default function LeadPipelinePage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const navigate = useNavigate();
  const { push } = useToast();
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState('loading');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingSubmit, setPendingSubmit] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    return listLeads()
      .then((payload) => {
        setLeads(payload.data.leads);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    const target = pendingDelete;
    if (!target) return;
    setBusy(true);
    try {
      await deleteLead(target.id);
      setLeads((current) => current.filter((item) => item.id !== target.id));
      setPendingDelete(null);
      push({ tone: 'success', message: `${target.leadCode} deleted.` });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function confirmSubmit() {
    const target = pendingSubmit;
    if (!target) return;
    setBusy(true);
    try {
      const result = await submitLead(target.id);
      setLeads((current) => current.map((item) => (item.id === target.id ? { ...item, ...result.data.lead, documentCount: item.documentCount } : item)));
      setPendingSubmit(null);
      push({ tone: 'success', message: `${target.leadCode} submitted to the project manager.` });
    } catch (error) {
      setPendingSubmit(null);
      const fields = error.details?.fields;
      if (fields) {
        push({ tone: 'warning', message: Object.values(fields)[0] });
        navigate(`/lead-pipeline/${target.id}/edit`, { state: { errors: fields } });
      } else {
        push({ tone: 'danger', message: error.message });
      }
    } finally {
      setBusy(false);
    }
  }

  const incoming = leads.filter((item) => item.status === 'SUBMITTED_TO_PM');

  return (
    <PageContainer>
      <PageHeader
        title={meta.title}
        description="Business and engineering inputs move through PM review, feasibility, costing, quotation, and order conversion."
        actions={(
          <Button onClick={() => navigate('/lead-pipeline/create')}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Create Lead
          </Button>
        )}
      />

      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? (
        <ErrorState title="Leads could not be loaded." action={<Button onClick={load}>Retry</Button>} />
      ) : null}

      {status === 'ready' && incoming.length ? (
        <section className="lead-incoming" aria-label="New leads for project manager review">
          <h2>New lead submitted</h2>
          <div className="lead-incoming__grid">
            {incoming.map((item) => (
              <article key={item.id} className="lead-incoming__card">
                <p className="lead-code">{item.leadCode}</p>
                <h3>{item.title || 'Untitled lead'}</h3>
                <p>{item.customerName || 'Customer not set'}</p>
                <p>Submitted by {item.submittedBy || item.createdBy}</p>
                <Badge tone="info">Pending PM review</Badge>
                <Button size="sm" onClick={() => navigate(`/lead-pipeline/${item.id}`)}>Review lead</Button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {status === 'ready' && !leads.length ? (
        <div className="lead-section lead-empty">
          <EmptyState
            title="No leads yet"
            description="Create the first lead and save it as a draft until it is ready for the project manager."
          />
          <Button onClick={() => navigate('/lead-pipeline/create')}>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            Create Lead
          </Button>
        </div>
      ) : null}

      {status === 'ready' && leads.length ? (
        <div className="lead-table-wrap">
          <table className="data-table lead-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Lead title</th>
                <th>Customer</th>
                <th>Created by</th>
                <th>Business vertical</th>
                <th>Priority</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Expected decision</th>
                <th>Created</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((item) => {
                const statusMeta = leadStatusMeta(item.status);
                return (
                  <tr key={item.id}>
                    <td><Link className="lead-code" to={`/lead-pipeline/${item.id}`}>{item.leadCode}</Link></td>
                    <td>{item.title || 'Untitled lead'}</td>
                    <td>{item.customerName || '—'}</td>
                    <td>{item.createdBy}</td>
                    <td>{item.businessVertical || '—'}</td>
                    <td>{item.priority}</td>
                    <td>{item.stage}</td>
                    <td>
                      <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
                      {item.submittedToPmAt && !canSubmitLead(item.status) ? (
                        <span className="lead-submitted">Submitted to PM<br />{formatDateTime(item.submittedToPmAt)}</span>
                      ) : null}
                    </td>
                    <td>{formatDate(item.expectedDecisionDate)}</td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                    <td>
                      <div className="lead-row-actions">
                        <ActionIcon label="View" onClick={() => navigate(`/lead-pipeline/${item.id}`)}>
                          <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
                        </ActionIcon>
                        <ActionIcon
                          label={canEditLead(item.status) ? 'Edit' : 'Editing opens after the project manager requests changes'}
                          onClick={() => {
                            if (canEditLead(item.status)) navigate(`/lead-pipeline/${item.id}/edit`);
                            else push({ tone: 'info', message: 'This lead can be edited after the project manager requests changes.' });
                          }}
                        >
                          <Pencil size={16} strokeWidth={1.75} aria-hidden="true" />
                        </ActionIcon>
                        <ActionIcon label="Delete" danger onClick={() => setPendingDelete(item)}>
                          <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                        </ActionIcon>
                        {canSubmitLead(item.status) ? (
                          <ActionIcon label="Submit to PM" onClick={() => setPendingSubmit(item)}>
                            <Send size={16} strokeWidth={1.75} aria-hidden="true" />
                          </ActionIcon>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <Modal open={Boolean(pendingDelete)} title="Delete lead?" onClose={() => setPendingDelete(null)}>
        {pendingDelete ? (
          <div className="lead-confirm">
            <p>Are you sure you want to delete:</p>
            <strong>{pendingDelete.leadCode} — {pendingDelete.title || 'Untitled lead'}</strong>
            <p>This action cannot be undone.</p>
            <div className="lead-confirm__actions">
              <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={busy}>Cancel</Button>
              <Button variant="danger" onClick={confirmDelete} loading={busy}>Delete lead</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(pendingSubmit)} title="Submit lead to project manager?" onClose={() => setPendingSubmit(null)}>
        {pendingSubmit ? (
          <div className="lead-confirm">
            <dl>
              <div><dt>Lead</dt><dd>{pendingSubmit.leadCode}</dd></div>
              <div><dt>Customer</dt><dd>{pendingSubmit.customerName || 'Not set'}</dd></div>
              <div><dt>Project</dt><dd>{pendingSubmit.title || 'Untitled lead'}</dd></div>
              <div><dt>Priority</dt><dd>{pendingSubmit.priority}</dd></div>
              <div><dt>Expected decision</dt><dd>{formatDate(pendingSubmit.expectedDecisionDate)}</dd></div>
            </dl>
            <p>Once submitted, this lead will be sent to the project manager for review.</p>
            <div className="lead-confirm__actions">
              <Button variant="secondary" onClick={() => setPendingSubmit(null)} disabled={busy}>Cancel</Button>
              <Button onClick={confirmSubmit} loading={busy}>Submit to PM</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
