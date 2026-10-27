import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  addEscalationComment, archiveEscalation, assignEscalation, deleteEscalationComment, deleteEscalationFile,
  downloadEscalationFile, editEscalationComment, escalateFurther, getEscalation, loadEscalations, reopenEscalation,
  resolveEscalation, setEscalationStatus, updateEscalation, uploadEscalationFile,
} from '../../services/escalations.service';
import { EscalationPriorityBadge, EscalationStatusBadge } from './EscalationBadges';
import { EscalationEditor } from './EscalationEditor';
import { IMPACT_LABEL, LEVELS, LEVEL_LABEL, NEXT, PRIORITY_LABEL, STATUSES, peopleForTeam, rowToForm, stamp } from './model';
import '../../styles/escalations.css';

export default function EscalationDetailPage() {
  const { escalationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();
  useDocumentTitle('Escalation');
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [options, setOptions] = useState({});
  const [form, setForm] = useState(null);
  const [assign, setAssign] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState('');
  const [further, setFurther] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  function apply(payload) {
    setData(payload.data);
    setStatus('ready');
    const row = payload.data.escalation;
    setTeamId(row.teamId || '');
    setAssignedTo(row.assignedToId || '');
  }

  function load() {
    return getEscalation(escalationId).then(apply).catch(() => setStatus('error'));
  }

  useEffect(() => { load(); }, [escalationId]);
  useEffect(() => {
    loadEscalations({}).then((payload) => setOptions(payload.data.options || {})).catch(() => {});
  }, []);

  async function run(work, message) {
    setBusy(true);
    try {
      const payload = await work();
      if (payload?.data?.escalation) apply(payload);
      else await load();
      push({ tone: 'success', message });
      setForm(null);
      setAssign(false);
      setStatusOpen(false);
      setFurther(null);
      setResolution(null);
      setDraft('');
      setEditing(null);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') {
    return <PageContainer><div className="esc-skeleton" aria-hidden="true"><span /><span /><span /></div></PageContainer>;
  }
  if (status === 'error' || !data) {
    return (
      <PageContainer>
        <ErrorState title="Unable to load escalations" description="This escalation could not be opened." action={<Button onClick={() => { setStatus('loading'); load(); }}>Try again</Button>} />
      </PageContainer>
    );
  }

  const row = data.escalation;
  const transitions = NEXT[row.status] || [];
  const mine = user?.id;

  return (
    <PageContainer>
      <header className="esc-detail-head">
        <div>
          <button type="button" className="esc-back" onClick={() => navigate('/escalations')}>← Escalations</button>
          <p className="esc-number">{row.number}</p>
          <h1>{row.title}</h1>
          <div className="esc-badge-row">
            <EscalationPriorityBadge priority={row.priority} />
            <EscalationStatusBadge status={row.status} overdue={row.overdue} />
            <span className="esc-level">{LEVEL_LABEL[row.level] || row.level}</span>
          </div>
        </div>
        <div className="esc-detail-actions">
          <Button variant="secondary" onClick={() => setForm({ ...rowToForm(row), id: row.id })}>Edit</Button>
          <Button variant="secondary" onClick={() => setAssign(true)}>Assign</Button>
          <Button variant="secondary" onClick={() => { setNextStatus(transitions[0] || ''); setStatusOpen(true); }} disabled={!transitions.length}>Change Status</Button>
          <Button variant="secondary" onClick={() => setFurther({ level: 'PROJECT', assignedTo: '', reason: '' })}>Escalate Further</Button>
          {transitions.includes('RESOLVED') ? <Button onClick={() => setResolution({ rootCause: row.rootCause, correctiveAction: row.correctiveAction, preventiveAction: row.preventiveAction, resolutionNotes: row.resolutionNotes })}>Resolve</Button> : null}
          {transitions.includes('CLOSED') ? <Button variant="secondary" onClick={() => run(() => setEscalationStatus(row.id, 'CLOSED'), 'Escalation closed.')}>Close</Button> : null}
          {transitions.includes('OPEN') && row.status !== 'OPEN' ? <Button variant="secondary" onClick={() => run(() => reopenEscalation(row.id), 'Escalation reopened.')}>Reopen</Button> : null}
          {!row.archivedAt && ['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'].includes(row.status) ? <Button variant="secondary" onClick={() => run(() => archiveEscalation(row.id), 'Escalation archived.')}>Archive</Button> : null}
        </div>
      </header>

      <section className="esc-summary">
        {[
          ['Status', row.status.replace(/_/g, ' ')],
          ['Priority', PRIORITY_LABEL[row.priority]],
          ['Type', row.typeLabel],
          ['Project', row.projectTitle || '—'],
          ['Customer', row.customerName || '—'],
          ['Team', row.teamName || '—'],
          ['Raised By', row.raisedByName],
          ['Assigned To', row.assignedToName || 'Unassigned'],
          ['Created', stamp(row.createdAt, true)],
          ['Due Date', row.dueDate ? stamp(row.dueDate) : '—'],
          ['Age', row.age],
          ['Last Updated', stamp(row.updatedAt, true)],
        ].map(([label, value]) => (
          <article key={label}><span>{label}</span><strong>{value}</strong></article>
        ))}
      </section>

      <section className="esc-panel">
        <h2>Issue Description</h2>
        <p>{row.description}</p>
        {row.recommendedAction ? <><h3>Recommended Action</h3><p>{row.recommendedAction}</p></> : null}
      </section>

      <section className="esc-panel">
        <h2>Impact</h2>
        <p>{row.impactArea ? `${IMPACT_LABEL[row.impactArea] || row.impactArea} · ${PRIORITY_LABEL[row.impactSeverity] || 'Severity not set'}` : 'Impact has not been recorded.'}</p>
      </section>

      <section className="esc-panel">
        <h2>Resolution</h2>
        <dl className="esc-resolution">
          <div><dt>Root Cause</dt><dd>{row.rootCause || '—'}</dd></div>
          <div><dt>Corrective Action</dt><dd>{row.correctiveAction || '—'}</dd></div>
          <div><dt>Preventive Action</dt><dd>{row.preventiveAction || '—'}</dd></div>
          <div><dt>Resolution Notes</dt><dd>{row.resolutionNotes || '—'}</dd></div>
          <div><dt>Resolved Date</dt><dd>{row.resolvedAt ? stamp(row.resolvedAt, true) : '—'}</dd></div>
        </dl>
      </section>

      <section className="esc-panel">
        <h2>Comments</h2>
        <ul className="esc-comments">
          {data.comments.map((item) => (
            <li key={item.id}>
              <strong>{item.name}</strong> <span>{item.role}</span> <time>{stamp(item.createdAt, true)}</time>
              {editing === item.id ? (
                <textarea className="input" rows={3} defaultValue={item.message} onBlur={(event) => run(() => editEscalationComment(row.id, item.id, event.target.value), 'Comment updated.')} />
              ) : <p>{item.message}</p>}
              {item.userId === mine ? (
                <div className="esc-inline">
                  <button type="button" onClick={() => setDraft(`@${item.name} `)}>Reply</button>
                  <button type="button" onClick={() => setEditing(item.id)}>Edit</button>
                  <button type="button" onClick={() => run(() => deleteEscalationComment(row.id, item.id), 'Comment removed.')}>Delete</button>
                </div>
              ) : <button type="button" onClick={() => setDraft(`@${item.name} `)}>Reply</button>}
            </li>
          ))}
        </ul>
        <textarea className="input" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Add a comment" />
        <Button onClick={() => run(() => addEscalationComment(row.id, draft), 'Comment added.')} loading={busy}>Add comment</Button>
      </section>

      <section className="esc-panel">
        <h2>Activity</h2>
        <ol className="esc-timeline">
          {data.activity.map((item) => (
            <li key={item.id}>
              <time>{stamp(item.createdAt, true)}</time>
              <p>{item.actorName} · {item.action.replace(/_/g, ' ').toLowerCase()}{item.description ? ` — ${item.description}` : ''}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="esc-panel">
        <h2>Attachments</h2>
        <ul className="esc-files">
          {data.files.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => downloadEscalationFile(row.id, file.id, file.fileName)}>{file.fileName}</button>
              <span>{file.uploadedByName} · {stamp(file.createdAt)}</span>
              <button type="button" onClick={() => run(() => deleteEscalationFile(row.id, file.id), 'Attachment removed.')}>Remove</button>
            </li>
          ))}
        </ul>
        <input className="input" type="file" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) run(() => uploadEscalationFile(row.id, file), 'Attachment added.');
          event.target.value = '';
        }} />
      </section>

      {(row.taskId || row.workRequestId || row.leadId || row.feasibilityId || row.costingId || row.projectId) ? (
        <section className="esc-panel">
          <h2>Related records</h2>
          <p>
            {row.projectId ? <Link to={`/projects/${row.projectId}`}>{row.projectTitle || 'Project'}</Link> : null}
            {row.taskId ? <> · <Link to={`/tasks/${row.taskId}`}>{row.taskTitle || 'Task'}</Link></> : null}
          </p>
        </section>
      ) : null}

      <EscalationEditor
        key={form?.id || 'edit'}
        form={form}
        setForm={setForm}
        options={options}
        busy={busy}
        formError=""
        onClose={() => setForm(null)}
        onSubmit={async (current, selected) => {
          if (busy) return;
          setBusy(true);
          try {
            const payload = await updateEscalation(row.id, current);
            for (const file of selected || []) await uploadEscalationFile(row.id, file);
            apply(payload);
            push({ tone: 'success', message: 'Escalation updated.' });
            setForm(null);
          } catch (error) {
            push({ tone: 'danger', message: error.message });
          } finally {
            setBusy(false);
          }
        }}
      />
      <Modal open={assign} className="esc-dialog esc-dialog--compact" title="Assign Escalation" subtitle="Choose the team and person who should take this on." onClose={() => setAssign(false)} footer={(
        <>
          <Button variant="secondary" onClick={() => setAssign(false)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => assignEscalation(row.id, { teamId, assignedTo }), 'Escalation assigned.')}>Assign</Button>
        </>
      )}>
        <div className="esc-stack">
          <label className="esc-field"><span>Assigned Team</span>
            <select className="select" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
              <option value="">No team</option>
              {(options.teams || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="esc-field"><span>Assigned Person</span>
            <select className="select" value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}>
              <option value="">Select a person</option>
              {peopleForTeam(options, teamId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </Modal>
      <Modal open={statusOpen} className="esc-dialog esc-dialog--compact" title="Change Status" subtitle="Move this escalation to the next step." onClose={() => setStatusOpen(false)} footer={(
        <>
          <Button variant="secondary" onClick={() => setStatusOpen(false)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => setEscalationStatus(row.id, nextStatus), 'Status updated.')}>Update status</Button>
        </>
      )}>
        <label className="esc-field"><span>Status</span>
          <select className="select" value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
            {transitions.map((id) => <option key={id} value={id}>{STATUSES.find(([key]) => key === id)?.[1] || id}</option>)}
          </select>
        </label>
      </Modal>
      <Modal open={Boolean(further)} className="esc-dialog esc-dialog--compact" title="Escalate Further" subtitle="Send this to the next level when the current owner cannot resolve it." onClose={() => setFurther(null)} footer={further ? (
        <>
          <Button variant="secondary" onClick={() => setFurther(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => escalateFurther(row.id, further), 'Escalation raised further.')}>Escalate</Button>
        </>
      ) : null}>
        {further ? (
          <div className="esc-stack">
            <p className="esc-muted">Current owner: {row.assignedToName || 'Unassigned'}</p>
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
      <Modal open={Boolean(resolution)} className="esc-dialog esc-dialog--compact" title="Resolve Escalation" subtitle="Record how the issue was resolved." onClose={() => setResolution(null)} footer={resolution ? (
        <>
          <Button variant="secondary" onClick={() => setResolution(null)} disabled={busy}>Cancel</Button>
          <Button className="esc-submit" loading={busy} disabled={busy} onClick={() => run(() => resolveEscalation(row.id, resolution), 'Escalation resolved.')}>Resolve</Button>
        </>
      ) : null}>
        {resolution ? (
          <div className="esc-stack">
            {['rootCause', 'correctiveAction', 'preventiveAction', 'resolutionNotes'].map((key) => (
              <label key={key} className="esc-field"><span>{key.replace(/([A-Z])/g, ' $1')}</span>
                <textarea className="input" rows={2} value={resolution[key]} onChange={(event) => setResolution({ ...resolution, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}
