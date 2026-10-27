import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { deleteProcurementRequest, loadProcurementRequests, saveProcurementRequest, setProcurementStatus } from '../../services/procurement.service';
import '../../styles/procurement.css';
import '../../styles/escalations.css';

const STATUSES = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['UNDER_REVIEW', 'Under Review'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected'],
  ['ORDERED', 'Ordered'],
  ['RECEIVED', 'Received'],
  ['CANCELLED', 'Cancelled'],
];
const NEXT = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'CANCELLED'],
  APPROVED: ['ORDERED', 'CANCELLED'],
  ORDERED: ['RECEIVED', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  RECEIVED: [],
  CANCELLED: [],
};
const REVIEW = new Set(['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED']);
const LABEL = Object.fromEntries(STATUSES);
const EMPTY = { title: '', description: '', priority: 'MEDIUM', projectId: '', teamId: '', vendorName: '', neededBy: '', justification: '', items: [{ description: '', quantity: 1, unit: '', estimatedCost: '' }] };

function money(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function ProcurementRequestsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title || 'Procurement Requests');
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', priority: '' });
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');
  const [statusRow, setStatusRow] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [busy, setBusy] = useState(false);

  function load(current = filters) {
    return loadProcurementRequests(current).then((payload) => {
      setData(payload.data);
      setStatus('ready');
    }).catch(() => setStatus('error'));
  }

  useEffect(() => { load(); }, [filters.q, filters.status, filters.priority]);

  function openEdit(row) {
    setError('');
    setForm({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      projectId: row.projectId || '',
      teamId: row.teamId || '',
      vendorName: row.vendorName || '',
      neededBy: row.neededBy || '',
      justification: row.justification || '',
      items: row.items.length ? row.items.map((item) => ({ ...item, estimatedCost: item.estimatedCost })) : EMPTY.items,
    });
  }

  async function save() {
    if (busy) return;
    if (form.title.trim().length < 2) {
      setError('Request title is required.');
      return;
    }
    if (form.description.trim().length < 2) {
      setError('Describe what needs to be procured.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveProcurementRequest({
        ...form,
        items: form.items.filter((item) => item.description.trim()),
      }, form.id);
      push({ tone: 'success', message: form.id ? 'Procurement request updated.' : 'Procurement request created.' });
      setForm(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function setItem(index, key, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }));
  }

  const kpis = data?.kpis || {};
  const options = data?.options || {};
  const canReview = data?.access?.canReview;

  return (
    <PageContainer>
      <PageHeader
        title="Procurement Requests"
        description="Request, review, and track items that need to be purchased."
        actions={<Button onClick={() => { setError(''); setForm({ ...EMPTY, items: [{ description: '', quantity: 1, unit: '', estimatedCost: '' }] }); }}>+ New Request</Button>}
      />

      {status === 'loading' ? <div className="pr-skeleton" aria-hidden="true"><span /><span /><span /><span /></div> : null}
      {status === 'error' ? <ErrorState title="Unable to load procurement requests" action={<Button onClick={() => { setStatus('loading'); load(); }}>Try again</Button>} /> : null}

      {status === 'ready' ? (
        <>
          <section className="pr-kpis">
            {[
              ['Open', kpis.open, ''],
              ['Pending approval', kpis.pending, 'SUBMITTED'],
              ['Approved', kpis.approved, 'APPROVED'],
              ['Received this month', kpis.receivedThisMonth, 'RECEIVED'],
            ].map(([label, value, key]) => (
              <button key={label} type="button" className={filters.status === key && key ? 'is-active' : ''} onClick={() => setFilters({ ...filters, status: key })}>
                <span>{label}</span>
                <strong>{value ?? 0}</strong>
              </button>
            ))}
          </section>
          <div className="pr-toolbar">
            <input className="input" value={filters.q} placeholder="Search requests..." aria-label="Search requests" onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
            <select className="select" value={filters.status} aria-label="Status" onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">All statuses</option>
              {STATUSES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
            <select className="select" value={filters.priority} aria-label="Priority" onChange={(event) => setFilters({ ...filters, priority: event.target.value })}>
              <option value="">All priorities</option>
              {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((id) => <option key={id} value={id}>{id[0] + id.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          {data.rows.length ? (
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th>Request</th><th>Title</th><th>Project</th><th>Vendor</th><th>Requested by</th><th>Priority</th><th>Status</th><th>Needed by</th><th>Amount</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => {
                    const moves = (NEXT[row.status] || []).filter((id) => canReview || !REVIEW.has(id));
                    return (
                      <tr key={row.id}>
                        <td>{row.number}</td>
                        <td>{row.title}</td>
                        <td>{row.projectTitle || '—'}</td>
                        <td>{row.vendorName || '—'}</td>
                        <td>{row.requestedByName}</td>
                        <td>{row.priority}</td>
                        <td>{LABEL[row.status]}{row.overdue ? ' · Overdue' : ''}</td>
                        <td>{row.neededBy || '—'}</td>
                        <td>{money(row.amount)}</td>
                        <td className="pr-actions">
                          {['DRAFT', 'REJECTED'].includes(row.status) || canReview ? <button type="button" onClick={() => openEdit(row)}>Edit</button> : null}
                          {moves.length ? <button type="button" onClick={() => { setStatusRow(row); setNextStatus(moves[0]); }}>Change status</button> : null}
                          {row.status === 'DRAFT' ? <button type="button" onClick={() => deleteProcurementRequest(row.id).then(() => load()).catch((err) => push({ tone: 'danger', message: err.message }))}>Delete</button> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={ShoppingCart} title={filters.q || filters.status || filters.priority ? 'No matching requests' : 'No procurement requests yet'} description={filters.q || filters.status || filters.priority ? 'Try a different search or status.' : 'Create a request when materials, equipment, or services need to be purchased.'} />
          )}
        </>
      ) : null}

      <Modal open={Boolean(form)} className="esc-dialog" title={form?.id ? 'Edit Request' : 'New Procurement Request'} subtitle="Describe what needs to be purchased, who needs it, and when." onClose={() => !busy && setForm(null)} footer={form ? (
        <>
          <Button variant="secondary" onClick={() => setForm(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" onClick={save} loading={busy} disabled={busy}>{busy ? 'Saving...' : (form.id ? 'Save Changes' : 'Create Request')}</Button>
        </>
      ) : null}>
        {form ? (
          <div className="pr-form">
            {error ? <p className="pr-error">{error}</p> : null}
            <label><span>Title *</span><input className="input" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Vision cameras for the inspection cell" /></label>
            <div className="pr-grid">
              <label><span>Priority</span>
                <select className="select" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
                  {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((id) => <option key={id} value={id}>{id[0] + id.slice(1).toLowerCase()}</option>)}
                </select>
              </label>
              <label><span>Needed by</span><input className="input" type="date" value={form.neededBy} onChange={(event) => setForm({ ...form, neededBy: event.target.value })} /></label>
              <label><span>Project</span>
                <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })}>
                  <option value="">No project</option>
                  {(options.projects || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label><span>Team</span>
                <select className="select" value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>
                  <option value="">No team</option>
                  {(options.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label><span>Vendor</span><input className="input" value={form.vendorName} onChange={(event) => setForm({ ...form, vendorName: event.target.value })} placeholder="Preferred vendor, if known" /></label>
            </div>
            <label><span>Description *</span><textarea className="input" rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What needs to be bought, and why." /></label>
            <label><span>Justification</span><textarea className="input" rows={2} value={form.justification} onChange={(event) => setForm({ ...form, justification: event.target.value })} /></label>
            <div className="pr-lines">
              <header><strong>Items</strong><button type="button" onClick={() => setForm({ ...form, items: [...form.items, { description: '', quantity: 1, unit: '', estimatedCost: '' }] })}>Add item</button></header>
              {form.items.map((item, index) => (
                <div key={index} className="pr-line">
                  <input className="input" value={item.description} placeholder="Item" onChange={(event) => setItem(index, 'description', event.target.value)} />
                  <input className="input" type="number" min="1" value={item.quantity} aria-label="Quantity" onChange={(event) => setItem(index, 'quantity', event.target.value)} />
                  <input className="input" value={item.unit} placeholder="Unit" onChange={(event) => setItem(index, 'unit', event.target.value)} />
                  <input className="input" type="number" min="0" value={item.estimatedCost} placeholder="Cost" aria-label="Estimated cost" onChange={(event) => setItem(index, 'estimatedCost', event.target.value)} />
                  <button type="button" onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(statusRow)} className="esc-dialog esc-dialog--compact" title="Change status" subtitle={statusRow ? statusRow.number : ''} onClose={() => setStatusRow(null)} footer={statusRow ? (
        <>
          <Button variant="secondary" onClick={() => setStatusRow(null)}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await setProcurementStatus(statusRow.id, nextStatus);
              push({ tone: 'success', message: 'Status updated.' });
              setStatusRow(null);
              await load();
            } catch (err) {
              push({ tone: 'danger', message: err.message });
            } finally {
              setBusy(false);
            }
          }}>Update status</Button>
        </>
      ) : null}>
        {statusRow ? (
          <select className="select" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
            {(NEXT[statusRow.status] || []).filter((id) => canReview || !REVIEW.has(id)).map((id) => <option key={id} value={id}>{LABEL[id]}</option>)}
          </select>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
