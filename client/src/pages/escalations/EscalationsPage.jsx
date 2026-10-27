import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  addEscalationComment, assignEscalation, createEscalation, deleteEscalation, duplicateEscalation,
  escalateFurther, exportEscalations, loadEscalations, setEscalationStatus, updateEscalation, uploadEscalationFile,
} from '../../services/escalations.service';
import { EscalationCharts } from './EscalationCharts';
import { EscalationEditor } from './EscalationEditor';
import { EscalationFilters } from './EscalationFilters';
import { EscalationKpiCard } from './EscalationKpiCard';
import { EscalationTable } from './EscalationTable';
import { LEVELS, NEXT, STATUSES, blankEscalation, peopleForTeam, rowToForm } from './model';
import '../../styles/escalations.css';

function readFilters(params) {
  return {
    q: params.get('q') || '',
    status: params.get('status') || '',
    priority: params.get('priority') || '',
    type: params.get('type') || '',
    projectId: params.get('projectId') || params.get('project') || '',
    teamId: params.get('teamId') || params.get('team') || '',
    assignedTo: params.get('assignedTo') || '',
    raisedBy: params.get('raisedBy') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    quick: params.get('quick') || '',
    overdue: params.get('overdue') || '',
    archived: params.get('archived') || '',
    sort: params.get('sort') || 'priority',
    range: params.get('range') || '30',
    taskId: params.get('taskId') || '',
  };
}

export default function EscalationsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title || 'Escalations');
  const { push } = useToast();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [showFilters, setShowFilters] = useState(Boolean(filters.teamId || filters.projectId || filters.priority || filters.overdue));
  const [exportOpen, setExportOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [assign, setAssign] = useState(null);
  const [statusRow, setStatusRow] = useState(null);
  const [nextStatus, setNextStatus] = useState('');
  const [further, setFurther] = useState(null);
  const [comment, setComment] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  function write(next) {
    const query = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (!value || value === 'priority' && key === 'sort' || value === '30' && key === 'range') return;
      if (key === 'projectId') query.set('project', value);
      else if (key === 'teamId') query.set('team', value);
      else query.set(key, value);
    });
    setParams(query, { replace: true });
  }

  function load(current = filters) {
    const request = {
      ...current,
      projectId: current.projectId,
      teamId: current.teamId,
      sort: current.sort === 'priority' ? '' : current.sort,
    };
    return loadEscalations(request).then((payload) => {
      setData(payload.data);
      setStatus('ready');
      return payload.data;
    }).catch(() => setStatus('error'));
  }

  useEffect(() => { load(); }, [params]);

  useEffect(() => {
    if (params.get('create') !== '1' || !data) return;
    setFormError('');
    setForm(blankEscalation({
      taskId: params.get('taskId') || '',
      projectId: params.get('project') || params.get('projectId') || '',
    }));
    const next = new URLSearchParams(params);
    next.delete('create');
    setParams(next, { replace: true });
  }, [data, params, setParams]);

  async function saveForm(current, selected) {
    if (busy) return;
    setBusy(true);
    setFormError('');
    let saved;
    try {
      saved = current.id ? await updateEscalation(current.id, current) : await createEscalation(current);
    } catch (error) {
      setFormError(error.message);
      setBusy(false);
      return;
    }
    try {
      for (const file of selected || []) await uploadEscalationFile(saved.data.escalation.id, file);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
    push({ tone: 'success', message: current.id ? 'Escalation updated.' : 'Escalation created successfully.' });
    setForm(null);
    setBusy(false);
    await load();
  }

  async function run(work, message) {
    setBusy(true);
    try {
      await work();
      push({ tone: 'success', message });
      setAssign(null);
      setStatusRow(null);
      setFurther(null);
      setComment(null);
      setConfirm(null);
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const kpis = data?.kpis || {};
  const options = data?.options || {};
  const filtersActive = Boolean(filters.q || filters.status || filters.priority || filters.type || filters.projectId || filters.teamId || filters.assignedTo || filters.raisedBy || filters.from || filters.to || filters.quick || filters.overdue || filters.taskId);

  return (
    <PageContainer>
      <PageHeader
        title="Escalations"
        description="Track issues, blockers and risks that require attention across projects and teams."
        actions={(
          <>
            <Button variant="secondary" onClick={() => setExportOpen((open) => !open)}>Export</Button>
            <Button variant="secondary" onClick={() => setShowFilters((open) => !open)}>Filters</Button>
            <Button onClick={() => { setFormError(''); setForm(blankEscalation({ taskId: filters.taskId, projectId: filters.projectId, teamId: filters.teamId })); }}>+ New Escalation</Button>
          </>
        )}
      />
      {exportOpen ? (
        <div className="esc-export">
          {['excel', 'csv', 'pdf'].map((format) => (
            <button key={format} type="button" onClick={() => exportEscalations({ ...filters, format }).catch((error) => push({ tone: 'danger', message: error.message }))}>{format.toUpperCase()}</button>
          ))}
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="esc-skeleton" aria-hidden="true"><span /><span /><span /><span /><span /></div>
      ) : null}
      {status === 'error' ? (
        <ErrorState title="Unable to load escalations" description="The escalation list could not be loaded." action={<Button onClick={() => { setStatus('loading'); load(); }}>Try again</Button>} />
      ) : null}

      {status === 'ready' && data ? (
        <>
          <section className="esc-kpis" aria-label="Escalation summary">
            <EscalationKpiCard label="Open Escalations" value={kpis.open} active={filters.quick === 'open'} onClick={() => write({ ...filters, quick: 'open', priority: '', overdue: '', status: '' })} />
            <EscalationKpiCard label="Critical" value={kpis.critical} active={filters.priority === 'CRITICAL' || filters.quick === 'critical'} onClick={() => write({ ...filters, priority: 'CRITICAL', quick: '', overdue: '' })} />
            <EscalationKpiCard label="Overdue" value={kpis.overdue} active={filters.overdue === 'true' || filters.quick === 'overdue'} onClick={() => write({ ...filters, overdue: 'true', quick: '', priority: '' })} />
            <EscalationKpiCard label="Under Review" value={kpis.underReview} active={filters.status === 'UNDER_REVIEW'} onClick={() => write({ ...filters, status: 'UNDER_REVIEW', quick: '' })} />
            <EscalationKpiCard label="Resolved This Month" value={kpis.resolvedThisMonth} onClick={() => write({ ...filters, quick: 'resolved', priority: '', overdue: '', status: '' })} />
          </section>
          <EscalationCharts byType={data.byType} byTeam={data.byTeam} trend={data.trend} range={filters.range} onRange={(range) => write({ ...filters, range })} />
          <div className="esc-toolbar">
            <input className="input" value={filters.q} placeholder="Search escalations..." aria-label="Search escalations" onChange={(event) => write({ ...filters, q: event.target.value })} />
            <select className="select" value={filters.sort} aria-label="Sort" onChange={(event) => write({ ...filters, sort: event.target.value })}>
              <option value="priority">Highest priority, oldest unresolved</option>
              <option value="created">Created date</option>
              <option value="updated">Updated date</option>
              <option value="due">Due date</option>
              <option value="age">Age</option>
              <option value="status">Status</option>
            </select>
          </div>
          {showFilters ? <EscalationFilters filters={filters} options={options} onChange={write} onClear={() => write({ sort: filters.sort, range: filters.range })} /> : null}
          {data.rows.length ? (
            <EscalationTable
              rows={data.rows}
              sort={filters.sort}
              onSort={(key) => write({ ...filters, sort: key })}
              canDelete={data.access?.canDelete}
              onEdit={(row) => { setFormError(''); setForm({ ...rowToForm(row), id: row.id }); }}
              onAssign={setAssign}
              onStatus={(row) => { setStatusRow(row); setNextStatus((NEXT[row.status] || [])[0] || ''); }}
              onMore={(action, row) => {
                if (action === 'duplicate') run(() => duplicateEscalation(row.id), 'Escalation duplicated.');
                if (action === 'comment') setComment({ id: row.id, message: '' });
                if (action === 'escalate') setFurther({ id: row.id, level: 'PROJECT', assignedTo: '', reason: '' });
                if (action === 'close') {
                  if (!(NEXT[row.status] || []).includes('CLOSED')) {
                    push({ tone: 'danger', message: 'Resolve the escalation before closing it.' });
                    return;
                  }
                  run(() => setEscalationStatus(row.id, 'CLOSED'), 'Escalation closed.');
                }
                if (action === 'delete') setConfirm(row);
              }}
            />
          ) : (
            <EmptyState
              icon={AlertTriangle}
              title={filtersActive ? 'No matching escalations' : 'No escalations yet'}
              description={filtersActive ? 'No escalations match the current search or filters.' : 'There are no active escalations requiring attention.'}
            />
          )}
        </>
      ) : null}

      <EscalationEditor key={form?.id || 'create'} form={form} setForm={setForm} options={options} busy={busy} formError={formError} onClose={() => setForm(null)} onSubmit={saveForm} />

      <Modal open={Boolean(assign)} className="esc-dialog esc-dialog--compact" title="Assign Escalation" subtitle="Choose the team and person who should take this on." onClose={() => setAssign(null)} footer={assign ? (
        <>
          <Button variant="secondary" onClick={() => setAssign(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => document.getElementById('esc-assign-form')?.requestSubmit()}>Assign</Button>
        </>
      ) : null}>
        {assign ? (
          <AssignForm row={assign} options={options} onSave={(body) => run(() => assignEscalation(assign.id, body), 'Escalation assigned.')} />
        ) : null}
      </Modal>
      <Modal open={Boolean(statusRow)} className="esc-dialog esc-dialog--compact" title="Change Status" subtitle="Move this escalation to the next step." onClose={() => setStatusRow(null)} footer={statusRow ? (
        <>
          <Button variant="secondary" onClick={() => setStatusRow(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => setEscalationStatus(statusRow.id, nextStatus), 'Status updated.')}>Update status</Button>
        </>
      ) : null}>
        {statusRow ? (
          <label className="esc-field"><span>Status</span>
            <select className="select" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
              {(NEXT[statusRow.status] || []).map((id) => <option key={id} value={id}>{STATUSES.find(([key]) => key === id)?.[1] || id}</option>)}
            </select>
          </label>
        ) : null}
      </Modal>
      <Modal open={Boolean(further)} className="esc-dialog esc-dialog--compact" title="Escalate Further" subtitle="Send this to the next level when the current owner cannot resolve it." onClose={() => setFurther(null)} footer={further ? (
        <>
          <Button variant="secondary" onClick={() => setFurther(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => escalateFurther(further.id, further), 'Escalation raised further.')}>Escalate</Button>
        </>
      ) : null}>
        {further ? (
          <div className="esc-stack">
            <label className="esc-field"><span>Escalate To</span>
              <select className="select" value={further.level} onChange={(event) => setFurther({ ...further, level: event.target.value })}>
                {LEVELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="esc-field"><span>Person</span>
              <select className="select" value={further.assignedTo} onChange={(event) => setFurther({ ...further, assignedTo: event.target.value })}>
                <option value="">Keep current owner</option>
                {(options.people || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="esc-field"><span>Reason</span>
              <textarea className="input" rows={3} value={further.reason} onChange={(event) => setFurther({ ...further, reason: event.target.value })} />
            </label>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(comment)} className="esc-dialog esc-dialog--compact" title="Add Comment" onClose={() => setComment(null)} footer={comment ? (
        <>
          <Button variant="secondary" onClick={() => setComment(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => addEscalationComment(comment.id, comment.message), 'Comment added.')}>Add comment</Button>
        </>
      ) : null}>
        {comment ? <textarea className="input" rows={4} value={comment.message} onChange={(event) => setComment({ ...comment, message: event.target.value })} /> : null}
      </Modal>
      <Modal open={Boolean(confirm)} className="esc-dialog esc-dialog--compact" title="Delete escalation?" onClose={() => setConfirm(null)} footer={confirm ? (
        <>
          <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={busy} onClick={() => run(() => deleteEscalation(confirm.id), 'Escalation deleted.')}>Delete</Button>
        </>
      ) : null}>
        {confirm ? <p>This permanently removes {confirm.number}. Cancel or archive is the usual way to keep history.</p> : null}
      </Modal>
    </PageContainer>
  );
}

function AssignForm({ row, options, onSave }) {
  const [teamId, setTeamId] = useState(row.teamId || '');
  const [assignedTo, setAssignedTo] = useState(row.assignedToId || '');
  const people = peopleForTeam(options, teamId);
  return (
    <form id="esc-assign-form" className="esc-stack" onSubmit={(event) => { event.preventDefault(); onSave({ teamId, assignedTo }); }}>
      <p className="esc-muted">Current owner: {row.assignedToName || 'Unassigned'}</p>
      <label className="esc-field"><span>Assigned Team</span>
        <select className="select" value={teamId} onChange={(event) => { setTeamId(event.target.value); setAssignedTo(''); }}>
          <option value="">No team</option>
          {(options.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="esc-field"><span>Assigned Person</span>
        <select className="select" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
          <option value="">Select a person</option>
          {people.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </form>
  );
}
