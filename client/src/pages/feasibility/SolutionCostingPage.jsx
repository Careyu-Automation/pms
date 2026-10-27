import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Eye, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { statusMeta, formatMoney } from '../../components/costing/costingModel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { Select } from '../../components/ui/Select';
import { Tooltip } from '../../components/ui/Tooltip';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { createCosting, deleteCosting, duplicateCosting, listCostingSources, listCostings, submitCostingReview } from '../../services/costing.service';
import { formatDateTime } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/dashboard.css';
import '../../styles/costing.css';

function ActionIcon({ label, onClick, children, danger = false }) {
  return (
    <Tooltip content={label}>
      <button type="button" className={danger ? 'icon-button icon-button--danger' : 'icon-button'} aria-label={label} onClick={onClick}>
        {children}
      </button>
    </Tooltip>
  );
}

const EMPTY_SUMMARY = { total: 0, draft: 0, underReview: 0, pendingApproval: 0, approved: 0, quotationReady: 0 };

export default function SolutionCostingPage() {
  useDocumentTitle('Solution & Costing');
  const navigate = useNavigate();
  const { push } = useToast();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState({ search: '', customer: '', project: '', owner: '', status: '', version: '', from: '', to: '' });
  const [creating, setCreating] = useState(false);
  const [sources, setSources] = useState([]);
  const [sourceId, setSourceId] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    return listCostings()
      .then((payload) => {
        setRows(payload.data.costings || []);
        setSummary(payload.data.summary || EMPTY_SUMMARY);
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

  const projects = useMemo(() => [...new Set(rows.map((row) => row.title).filter(Boolean))], [rows]);
  const customers = useMemo(() => [...new Set(rows.map((row) => row.customerName).filter(Boolean))], [rows]);
  const owners = useMemo(() => [...new Set(rows.map((row) => row.ownerName).filter(Boolean))], [rows]);
  const versions = useMemo(() => [...new Set(rows.map((row) => String(row.versionNo)))], [rows]);

  const visible = rows.filter((row) => {
    const haystack = `${row.costingCode} ${row.leadCode} ${row.customerName} ${row.title}`.toLowerCase();
    if (filters.search && !haystack.includes(filters.search.toLowerCase())) return false;
    if (filters.customer && row.customerName !== filters.customer) return false;
    if (filters.project && row.title !== filters.project) return false;
    if (filters.owner && row.ownerName !== filters.owner) return false;
    if (filters.status && row.status !== filters.status) return false;
    if (filters.version && String(row.versionNo) !== filters.version) return false;
    const updated = row.updatedAt ? new Date(row.updatedAt) : null;
    if (filters.from && updated && updated < new Date(filters.from)) return false;
    if (filters.to && updated && updated > new Date(`${filters.to}T23:59:59`)) return false;
    return true;
  });

  function openCreate() {
    setCreating(true);
    setSourceId('');
    listCostingSources()
      .then((payload) => setSources(payload.data.studies || []))
      .catch((error) => push({ tone: 'danger', message: error.message }));
  }

  async function confirmCreate() {
    if (!sourceId) return;
    setBusy(true);
    try {
      const payload = await createCosting(sourceId);
      navigate(`/solution-costing/${payload.data.costing.id}`);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function duplicate(row) {
    try {
      const payload = await duplicateCosting(row.id);
      push({ tone: 'success', message: `Version ${payload.data.costing.version.versionNo} created.` });
      navigate(`/solution-costing/${row.id}`);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function submit(row) {
    if (row.status === 'INTERNAL_REVIEW') {
      navigate(`/solution-costing/${row.id}?submit=1`);
      return;
    }
    try {
      await submitCostingReview(row.id);
      push({ tone: 'success', message: 'Costing moved to internal review.' });
      load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteCosting(pendingDelete.id);
      setPendingDelete(null);
      push({ tone: 'success', message: 'Costing deleted.' });
      load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const cards = [
    ['Total costing records', summary.total],
    ['Draft', summary.draft],
    ['Under review', summary.underReview],
    ['Pending approval', summary.pendingApproval],
    ['Approved', summary.approved],
    ['Quotation ready', summary.quotationReady],
  ];

  return (
    <PageContainer>
      <div className="cost-head">
        <PageHeader
          title="Solution & Costing"
          description="Develop, calculate and review solution costs for feasible opportunities."
        />
        <Button onClick={openCreate}><Plus size={16} /> New Solution Costing</Button>
      </div>
      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Solution costing could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' ? (
        <div className="kpi-row cost-kpis">
          {cards.map(([label, value], index) => (
            <article className={index === 0 ? 'kpi-card is-highlight' : 'kpi-card'} key={label}>
              <div className="kpi-card__top"><span className="kpi-card__label">{label}</span></div>
              <div className="kpi-card__value">{value}</div>
            </article>
          ))}
        </div>
      ) : null}
      {status === 'ready' && !rows.length ? (
        <div className="lead-section lead-empty">
          <EmptyState
            title="No solution costing records yet."
            description="Create a costing from an approved feasibility study."
          />
          <Button variant="secondary" onClick={() => navigate('/feasibility-studies')}>View Feasibility Studies</Button>
        </div>
      ) : null}
      {status === 'ready' && rows.length ? (
        <>
          <div className="cost-filters">
            <label className="field">
              <span className="field__label">Search</span>
              <input className="input" value={filters.search} placeholder="Lead ID, customer, solution, costing ID" onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} />
            </label>
            <Select id="cost-customer" label="Customer" value={filters.customer} onChange={(event) => setFilters((current) => ({ ...current, customer: event.target.value }))}>
              <option value="">All customers</option>
              {customers.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
            <Select id="cost-project" label="Project" value={filters.project} onChange={(event) => setFilters((current) => ({ ...current, project: event.target.value }))}>
              <option value="">All projects</option>
              {projects.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
            <Select id="cost-owner" label="Owner" value={filters.owner} onChange={(event) => setFilters((current) => ({ ...current, owner: event.target.value }))}>
              <option value="">All owners</option>
              {owners.map((name) => <option key={name} value={name}>{name}</option>)}
            </Select>
            <Select id="cost-status" label="Status" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
              <option value="">All statuses</option>
              {Object.entries({ DRAFT: 'Draft', IN_PROGRESS: 'In Progress', INTERNAL_REVIEW: 'Internal Review', CHANGES_REQUESTED: 'Changes Requested', SUBMITTED_FOR_APPROVAL: 'Submitted for Approval', APPROVED: 'Approved', REJECTED: 'Rejected', SUPERSEDED: 'Superseded' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select id="cost-version" label="Version" value={filters.version} onChange={(event) => setFilters((current) => ({ ...current, version: event.target.value }))}>
              <option value="">All versions</option>
              {versions.map((value) => <option key={value} value={value}>Version {value}</option>)}
            </Select>
            <label className="field">
              <span className="field__label">Updated from</span>
              <input className="input" type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
            </label>
            <label className="field">
              <span className="field__label">Updated to</span>
              <input className="input" type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
            </label>
          </div>
          <div className="lead-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Costing ID</th>
                  <th>Lead ID</th>
                  <th>Customer</th>
                  <th>Project / Solution</th>
                  <th>Version</th>
                  <th>Owner</th>
                  <th>Total internal cost</th>
                  <th>Selling price</th>
                  <th>Margin %</th>
                  <th>Status</th>
                  <th>Last updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const meta = statusMeta(row.status);
                  const canSubmit = ['DRAFT', 'IN_PROGRESS', 'CHANGES_REQUESTED', 'INTERNAL_REVIEW'].includes(row.status);
                  const canDelete = ['DRAFT', 'IN_PROGRESS'].includes(row.status);
                  return (
                    <tr key={row.id}>
                      <td><Link className="lead-code" to={`/solution-costing/${row.id}`}>{row.costingCode}</Link></td>
                      <td>{row.leadCode}</td>
                      <td>{row.customerName}</td>
                      <td>{row.title}</td>
                      <td>V{row.versionNo}</td>
                      <td>{row.ownerName || '—'}</td>
                      <td>{formatMoney(row.totalInternalCost, row.currency)}</td>
                      <td>{formatMoney(row.sellingPrice, row.currency)}</td>
                      <td>{Number(row.marginPercent).toFixed(2)}%</td>
                      <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td>{formatDateTime(row.updatedAt)}</td>
                      <td>
                        <div className="cost-actions">
                          <ActionIcon label="View" onClick={() => navigate(`/solution-costing/${row.id}`)}><Eye size={16} /></ActionIcon>
                          <ActionIcon label="Edit" onClick={() => navigate(`/solution-costing/${row.id}`)}><Pencil size={16} /></ActionIcon>
                          <ActionIcon label="Duplicate version" onClick={() => duplicate(row)}><Copy size={16} /></ActionIcon>
                          <ActionIcon label="Delete" danger={canDelete} onClick={() => canDelete && setPendingDelete(row)}><Trash2 size={16} /></ActionIcon>
                          <ActionIcon label="Submit for approval" onClick={() => canSubmit && submit(row)}><Send size={16} /></ActionIcon>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!visible.length ? <p className="feas-note">No costing records match these filters.</p> : null}
          </div>
        </>
      ) : null}
      <Modal open={creating} title="New solution costing" onClose={() => setCreating(false)}>
        <p>Choose an approved feasibility study. Lead, customer, solution, risks, and documents are carried forward.</p>
        <Select id="costing-source" label="Feasibility study" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
          <option value="">Select a study</option>
          {sources.map((study) => (
            <option key={study.id} value={study.id}>{study.leadCode} · {study.customerName} · {study.title}</option>
          ))}
        </Select>
        {!sources.length ? <p className="feas-note">No feasible studies are waiting. Approve a feasibility study first.</p> : null}
        <div className="lead-actions">
          <Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
          <Button onClick={confirmCreate} loading={busy} disabled={!sourceId}>Create Solution & Costing</Button>
        </div>
      </Modal>
      <Modal open={Boolean(pendingDelete)} title="Delete this costing?" onClose={() => setPendingDelete(null)}>
        <p>{pendingDelete ? `${pendingDelete.costingCode} and its draft version will be removed.` : ''}</p>
        <div className="lead-actions">
          <Button variant="secondary" onClick={() => setPendingDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={busy}>Delete</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
