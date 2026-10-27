import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Copy, Save, Send } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import {
  ActivityTab,
  ApprovalTab,
  BomTab,
  CommercialCard,
  CommercialTab,
  CompareTable,
  CostsTab,
  DesignTab,
  DocumentsTab,
  OverviewTab,
  QuotationTab,
  TeamContribution,
  VendorsTab,
  RisksTab,
  ScopeTab,
  TermsFields,
} from '../../components/costing/CostingSections';
import { TABS, calculateQuote, costingStage, formatMoney, statusMeta } from '../../components/costing/costingModel';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  convertCosting,
  listProjects,
  decideCosting,
  deleteCostingDocument,
  downloadCostingBom,
  downloadCostingDocument,
  duplicateCosting,
  getCosting,
  importCostingBom,
  saveCosting,
  submitCostingApproval,
  submitCostingReview,
  uploadCostingDocuments,
} from '../../services/costing.service';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/costing.css';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => String(value).trim()));
}

const HEADER_MAP = {
  component: 'component',
  category: 'category',
  description: 'description',
  specification: 'specification',
  manufacturer: 'manufacturer',
  'part number': 'partNumber',
  supplier: 'supplier',
  quantity: 'quantity',
  unit: 'unit',
  'unit cost': 'unitCost',
  'lead time': 'leadTime',
  remarks: 'remarks',
  'quotation reference': 'quotationReference',
  'quoted price': 'quotedPrice',
  'quote date': 'quoteDate',
  'quote validity': 'quoteValidity',
  'purchase status': 'purchaseStatus',
};

export default function SolutionCostingDetailPage() {
  const { costingId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { push } = useToast();
  useDocumentTitle('Solution & Costing');
  const [costing, setCosting] = useState(null);
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState('loading');
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState('Vendor Quote');
  const [submitOpen, setSubmitOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [managers, setManagers] = useState([]);
  const [convertForm, setConvertForm] = useState(null);
  const [decisionNote, setDecisionNote] = useState('');

  const load = useCallback(() => {
    setStatus('loading');
    return getCosting(costingId)
      .then((payload) => {
        setCosting(payload.data.costing);
        setDraft(payload.data.costing.version);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [costingId, push]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (status === 'ready' && searchParams.get('submit') === '1') setSubmitOpen(true);
  }, [status, searchParams]);

  const quote = useMemo(() => (draft ? calculateQuote(draft) : null), [draft]);
  const access = costing?.access || {};
  const meta = statusMeta(draft?.status);

  async function save() {
    setBusy(true);
    try {
      const payload = await saveCosting(costingId, draft);
      setCosting(payload.data.costing);
      setDraft(payload.data.costing.version);
      push({ tone: 'success', message: 'Draft saved.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function duplicate() {
    setBusy(true);
    try {
      const payload = await duplicateCosting(costingId);
      setCosting(payload.data.costing);
      setDraft(payload.data.costing.version);
      push({ tone: 'success', message: `Version ${payload.data.costing.version.versionNo} created. The previous version is unchanged.` });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitApproval() {
    setBusy(true);
    try {
      if (access.canSave) await saveCosting(costingId, draft);
      const payload = await submitCostingApproval(costingId);
      setCosting(payload.data.costing);
      setDraft(payload.data.costing.version);
      setSubmitOpen(false);
      setSearchParams({});
      push({ tone: 'success', message: 'Submitted for approval.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function decide(action) {
    setBusy(true);
    try {
      const payload = await decideCosting(costingId, { action, note: decisionNote });
      setCosting(payload.data.costing);
      setDraft(payload.data.costing.version);
      setDecisionNote('');
      push({ tone: 'success', message: 'Decision recorded.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set('documentType', documentType);
    setBusy(true);
    try {
      const payload = await uploadCostingDocuments(costingId, form);
      setCosting(payload.data.costing);
      setDraft(payload.data.costing.version);
      event.currentTarget.reset();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  function onImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const table = parseCsv(await file.text());
      const headers = (table[0] || []).map((header) => HEADER_MAP[header.trim().toLowerCase()] || '');
      const missing = ['component', 'quantity', 'unitCost'].filter((key) => !headers.includes(key));
      if (missing.length) {
        push({ tone: 'danger', message: `BOM import needs columns: Component, Quantity, Unit Cost. Missing ${missing.join(', ')}.` });
        return;
      }
      const rows = table.slice(1).map((line) => {
        const record = {};
        headers.forEach((key, index) => {
          if (key) record[key] = line[index] ?? '';
        });
        return record;
      }).filter((row) => String(row.component || '').trim());
      const invalid = rows.find((row) => !Number.isFinite(Number(row.quantity)) || !Number.isFinite(Number(row.unitCost)));
      if (!rows.length || invalid) {
        push({ tone: 'danger', message: 'Every BOM row needs a component, a numeric quantity, and a numeric unit cost. Nothing was imported.' });
        return;
      }
      try {
        const payload = await importCostingBom(costingId, rows);
        setCosting(payload.data.costing);
        setDraft(payload.data.costing.version);
        push({ tone: 'success', message: 'BOM imported.' });
      } catch (error) {
        const details = error.details?.fields;
        push({ tone: 'danger', message: Array.isArray(details) ? details[0] : error.message });
      }
    };
    input.click();
  }

  async function openConvert() {
    const lead = costing?.lead || {};
    setConvertForm({
      title: draft?.solutionName || lead.title || '',
      projectManagerId: '',
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: '',
      priority: 'MEDIUM',
      description: draft?.solutionDescription || '',
      customerContact: '',
      siteLocation: '',
    });
    setConvertOpen(true);
    try {
      const payload = await listProjects();
      setManagers(payload.data.managers || []);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function convert() {
    setBusy(true);
    try {
      const payload = await convertCosting(costingId, convertForm);
      setConvertOpen(false);
      push({ tone: 'success', message: `Project ${payload.data.projectCode} created successfully.` });
      navigate(`/projects/${payload.data.projectId}`);
    } catch (error) {
      if (error.details?.projectId) {
        setConvertOpen(false);
        push({ tone: 'warning', message: error.message });
        navigate(`/projects/${error.details.projectId}`);
        return;
      }
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (status === 'error') {
    return (
      <PageContainer>
        <ErrorState title="This costing record could not be loaded." action={<Button onClick={() => navigate('/solution-costing')}>Back</Button>} />
      </PageContainer>
    );
  }
  if (!costing || !draft || !quote) {
    return <PageContainer><div className="lead-skeleton" aria-hidden="true" /></PageContainer>;
  }

  const lead = costing.lead || {};
  const stages = costingStage(draft.status);
  const vendorQuotes = (draft.bom || []).filter((row) => row.quotationReference || row.quotedPrice).length;
  return (
    <PageContainer>
      <header className="feas-top">
        <div>
          <button type="button" className="feas-back" onClick={() => navigate(costing.feasibilityId ? `/feasibility-studies/${costing.feasibilityId}` : '/solution-costing')}>← Back to Feasibility</button>
          <h1>Solution & Costing</h1>
          <p className="feas-context">
            <span>{costing.costingCode}</span>
            <span>Lead ID: {lead.leadCode || 'Not specified'}</span>
            <span>Customer: {lead.customerName || 'Not specified'}</span>
            <span>Solution: {draft.solutionName || lead.title || 'Not specified'}</span>
          </p>
          <div className="feas-context feas-context--meta">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <span>Version V{draft.versionNo}</span>
            <span>Owner: {costing.ownerName || 'Not assigned'}</span>
            {costing.feasibilityId ? <button type="button" className="feas-back" onClick={() => navigate(`/feasibility-studies/${costing.feasibilityId}`)}>Linked feasibility</button> : null}
          </div>
        </div>
        <div className="feas-top__actions">
          {access.canSave ? <Button onClick={save} loading={busy}><Save size={16} /> Save Draft</Button> : null}
          {access.canDuplicate ? <Button variant="secondary" onClick={duplicate}><Copy size={16} /> Duplicate Version</Button> : null}
          {access.canSubmitReview ? <Button variant="secondary" onClick={async () => {
            setBusy(true);
            try {
              if (access.canSave) await saveCosting(costingId, draft);
              const payload = await submitCostingReview(costingId);
              setCosting(payload.data.costing);
              setDraft(payload.data.costing.version);
              push({ tone: 'success', message: 'Submitted for internal review.' });
            } catch (error) {
              push({ tone: 'danger', message: error.message });
            } finally {
              setBusy(false);
            }
          }}><Send size={16} /> Submit for Review</Button> : null}
          {access.canSubmitApproval ? <Button onClick={() => setSubmitOpen(true)}><Send size={16} /> Submit for Approval</Button> : null}
          {access.canConvert ? <Button onClick={openConvert}>Convert to Project</Button> : null}
          {costing.projectId ? <Button variant="secondary" onClick={() => navigate(`/projects/${costing.projectId}`)}>{costing.projectCode}</Button> : null}
          {(costing.versions || []).length > 1 ? <Button variant="secondary" onClick={() => setCompareOpen(true)}>Compare Versions</Button> : null}
        </div>
      </header>
      <section className="feas-strip" aria-label="Costing summary">
        <article><p>Internal cost</p><strong>{formatMoney(quote.totalInternal, draft.currency)}</strong></article>
        <article><p>Selling price</p><strong>{formatMoney(quote.selling, draft.currency)}</strong></article>
        <article><p>Margin</p><strong>{quote.marginPercent}%</strong></article>
        <article><p>BOM items</p><strong>{(draft.bom || []).length}</strong></article>
        <article><p>Vendor quotes</p><strong>{vendorQuotes}</strong></article>
        <article><p>Costing status</p><strong>{meta.label}</strong></article>
      </section>
      <ol className="feas-track" aria-label="Costing workflow">
        {stages.map((step) => (
          <li key={step.label} className={`is-${step.state}`}><span>{step.state === 'done' ? '✓' : step.state === 'current' ? '●' : '○'}</span>{step.label}</li>
        ))}
      </ol>
      <div>
          <div className="feas-tabs" role="tablist">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>
            ))}
          </div>
          {tab === 'overview' ? (
            <div className="feas-stack">
              <OverviewTab costing={costing} draft={draft} quote={quote} disabled={!access.canEditSolution} onChange={setDraft} onOpenFeasibility={() => navigate(`/feasibility-studies/${costing.feasibilityId}`)} />
              <TeamContribution draft={draft} disabled={!access.canEditSolution} onChange={setDraft} />
            </div>
          ) : null}
          {tab === 'design' ? <DesignTab draft={draft} disabled={!access.canEditSolution} onChange={setDraft} /> : null}
          {tab === 'bom' ? (
            <BomTab
              draft={draft}
              canEditBom={access.canEditBom}
              canEditProcurement={access.canEditProcurement}
              onChange={setDraft}
              onImport={onImport}
              onExport={() => downloadCostingBom(costingId, `${costing.costingCode}-v${draft.versionNo}.csv`)}
            />
          ) : null}
          {tab === 'vendors' ? <VendorsTab draft={draft} canEditBom={access.canEditBom} canEditProcurement={access.canEditProcurement} onChange={setDraft} /> : null}
          {tab === 'costs' ? <CostsTab draft={draft} disabled={!access.canEditSolution} onChange={setDraft} /> : null}
          {tab === 'commercial' ? (
            <div className="feas-stack">
              <CommercialTab draft={draft} quote={quote} disabled={!access.canEditCommercial} onChange={setDraft} />
              <CommercialCard quote={quote} currency={draft.currency} />
            </div>
          ) : null}
          {tab === 'scope' ? <ScopeTab draft={draft} disabled={!access.canEditSolution} onChange={setDraft} /> : null}
          {tab === 'risks' ? <RisksTab draft={draft} disabled={!access.canEditSolution} onChange={setDraft} /> : null}
          {tab === 'documents' ? (
            <DocumentsTab
              draft={draft}
              canUpload={access.canSave}
              documentType={documentType}
              onType={setDocumentType}
              onUpload={onUpload}
              onDownload={(document) => downloadCostingDocument(costingId, document)}
              onDelete={async (documentId) => {
                const payload = await deleteCostingDocument(costingId, documentId);
                setCosting(payload.data.costing);
                setDraft(payload.data.costing.version);
              }}
            />
          ) : null}
          {tab === 'quotation' ? (
            <>
              <QuotationTab costing={costing} draft={draft} quote={quote} />
              <TermsFields draft={draft} disabled={!access.canEditCommercial} onChange={setDraft} />
            </>
          ) : null}
          {tab === 'approval' ? <ApprovalTab draft={draft} /> : null}
          {tab === 'activity' ? <ActivityTab activity={costing.activity} /> : null}
          {access.canApprove ? (
            <section className="lead-section">
              <h2>Approval decision</h2>
              <textarea className="input" rows={3} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Comments or rejection reason" />
              <div className="lead-actions">
                <Button onClick={() => decide('approve')}>Approve</Button>
                <Button variant="secondary" onClick={() => decide('changes')}>Request changes</Button>
                <Button variant="danger" onClick={() => decide('reject')}>Reject</Button>
              </div>
            </section>
          ) : null}
          <p className="feas-note">Current version V{draft.versionNo}. Earlier versions stay available: {(costing.versions || []).filter((item) => !item.isCurrent).map((item) => `V${item.versionNo} ${item.status}`).join(', ') || 'none'}.</p>
      </div>
      <Modal open={submitOpen} title="Submit for approval" onClose={() => { setSubmitOpen(false); setSearchParams({}); }}>
        <dl className="lead-read">
          <div><dt>Customer</dt><dd>{lead.customerName}</dd></div>
          <div><dt>Solution</dt><dd>{draft.solutionName}</dd></div>
          <div><dt>Version</dt><dd>{draft.versionNo}</dd></div>
          <div><dt>Internal cost</dt><dd>{formatMoney(quote.totalInternal, draft.currency)}</dd></div>
          <div><dt>Margin</dt><dd>{quote.marginPercent}%</dd></div>
          <div><dt>Selling price</dt><dd>{formatMoney(quote.selling, draft.currency)}</dd></div>
          <div><dt>Quotation value</dt><dd>{formatMoney(quote.finalQuote, draft.currency)}</dd></div>
          <div><dt>Major risks</dt><dd>{(draft.risks || []).map((risk) => risk.risk).filter(Boolean).join('; ') || '—'}</dd></div>
          <div><dt>Assumptions</dt><dd>{draft.technicalAssumptions || draft.keyAssumptions || '—'}</dd></div>
          <div><dt>Exclusions</dt><dd>{draft.exclusions || '—'}</dd></div>
        </dl>
        <div className="lead-actions">
          <Button variant="secondary" onClick={() => { setSubmitOpen(false); setSearchParams({}); }}>Cancel</Button>
          <Button onClick={submitApproval} loading={busy}>Submit for Approval</Button>
        </div>
      </Modal>
      <Modal open={convertOpen} title="Convert to Project" onClose={() => setConvertOpen(false)}>
        {convertForm ? (
          <div className="feas-stack">
            <dl className="lead-read">
              <div><dt>Lead ID</dt><dd>{lead.leadCode || 'Not specified'}</dd></div>
              <div><dt>Customer</dt><dd>{lead.customerName || 'Not specified'}</dd></div>
              <div><dt>Solution</dt><dd>{draft.solutionName || 'Not specified'}</dd></div>
              <div><dt>Approved amount</dt><dd>{formatMoney(quote.finalQuote, draft.currency)}</dd></div>
            </dl>
            <label className="field"><span className="field__label">Project name</span><input className="input" value={convertForm.title} onChange={(event) => setConvertForm({ ...convertForm, title: event.target.value })} /></label>
            <label className="field"><span className="field__label">Project manager</span>
              <select className="select" value={convertForm.projectManagerId} onChange={(event) => setConvertForm({ ...convertForm, projectManagerId: event.target.value })}>
                <option value="">Select</option>
                {managers.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </label>
            <label className="field"><span className="field__label">Start date</span><input className="input" type="date" value={convertForm.startDate} onChange={(event) => setConvertForm({ ...convertForm, startDate: event.target.value })} /></label>
            <label className="field"><span className="field__label">Target completion</span><input className="input" type="date" value={convertForm.targetDate} onChange={(event) => setConvertForm({ ...convertForm, targetDate: event.target.value })} /></label>
            <label className="field"><span className="field__label">Priority</span>
              <select className="select" value={convertForm.priority} onChange={(event) => setConvertForm({ ...convertForm, priority: event.target.value })}>
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="field"><span className="field__label">Description</span><textarea className="textarea" rows={3} value={convertForm.description} onChange={(event) => setConvertForm({ ...convertForm, description: event.target.value })} /></label>
            <label className="field"><span className="field__label">Customer contact</span><input className="input" value={convertForm.customerContact} onChange={(event) => setConvertForm({ ...convertForm, customerContact: event.target.value })} /></label>
            <label className="field"><span className="field__label">Site location</span><input className="input" value={convertForm.siteLocation} onChange={(event) => setConvertForm({ ...convertForm, siteLocation: event.target.value })} /></label>
            <div className="lead-actions">
              <Button variant="secondary" onClick={() => setConvertOpen(false)}>Cancel</Button>
              <Button onClick={convert} loading={busy}>Convert to Project</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={compareOpen} title="Compare versions" onClose={() => setCompareOpen(false)} className="modal--wide">
        <CompareTable versions={costing.versions || []} currency={draft.currency} />
      </Modal>
    </PageContainer>
  );
}
