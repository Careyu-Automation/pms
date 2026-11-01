import { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  approveLeaveRequest,
  approvePermissionRequest,
  createLeaveRequest,
  createPermissionRequest,
  getLeaveOverview,
  getLeaveRequest,
  getPendingApprovals,
  getPermissionRequest,
  listLeaveRequests,
  rejectLeaveRequest,
  rejectPermissionRequest,
  withdrawLeaveRequest,
  withdrawPermissionRequest,
} from '../../services/leave.service';
import { formatDate, formatDateTime } from '../../utils/format';
import { CalendarDays } from 'lucide-react';
import { DURATION_LABEL, STATUS_LABEL, STATUS_TONE, estimateLeaveDays, formatAmount, requestDays } from './leaveModel';
import '../../styles/leave.css';

function daysLabel(item) {
  return requestDays(item);
}

export default function LeavePage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { user } = useAuth();
  const { push } = useToast();
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [status, setStatus] = useState('loading');
  const [filters, setFilters] = useState({ q: '', from: '', to: '', status: '', leaveTypeId: '', teamId: '', employeeId: '' });
  const [search, setSearch] = useState('');
  const [applying, setApplying] = useState(false);
  const [permitting, setPermitting] = useState(false);
  const [detail, setDetail] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadOverview = useCallback(() => {
    return getLeaveOverview().then((result) => setOverview(result.data));
  }, []);

  const loadRows = useCallback(() => {
    return listLeaveRequests(filters).then((result) => setRows(result.data.requests || []));
  }, [filters]);

  const loadPending = useCallback(() => {
    return getPendingApprovals().then((result) => setPending(result.data.requests || []));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([loadOverview(), loadRows(), loadPending()])
      .then(() => { if (active) setStatus('ready'); })
      .catch((error) => {
        if (!active) return;
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
    return () => { active = false; };
  }, [loadOverview, loadPending, loadRows, push]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((current) => (current.q === search ? current : { ...current, q: search }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  function refresh() {
    return Promise.all([loadOverview(), loadRows(), loadPending()]).catch((error) => push({ tone: 'danger', message: error.message }));
  }

  async function openDetail(item) {
    setBusy(true);
    try {
      const result = item.kind === 'PERMISSION' ? await getPermissionRequest(item.id) : await getLeaveRequest(item.id);
      setDetail(result.data);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(item) {
    setBusy(true);
    try {
      const result = item.kind === 'PERMISSION' ? await withdrawPermissionRequest(item.id) : await withdrawLeaveRequest(item.id);
      setDetail(result.data);
      push({ tone: 'success', message: 'Request withdrawn.' });
      await refresh();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!review) return;
    setBusy(true);
    try {
      const permission = review.item.kind === 'PERMISSION';
      if (review.mode === 'approve') {
        const result = permission
          ? await approvePermissionRequest(review.item.id, review.comment)
          : await approveLeaveRequest(review.item.id, review.comment);
        setDetail(result.data);
        push({ tone: 'success', message: 'Request approved.' });
      } else {
        if (review.comment.trim().length < 2) {
          push({ tone: 'danger', message: 'A rejection reason is required.' });
          setBusy(false);
          return;
        }
        const result = permission
          ? await rejectPermissionRequest(review.item.id, review.comment)
          : await rejectLeaveRequest(review.item.id, review.comment);
        setDetail(result.data);
        push({ tone: 'success', message: 'Request rejected.' });
      }
      setReview(null);
      await refresh();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const summary = overview?.summary;
  const balances = overview?.balances || [];
  const canApprove = Boolean(overview?.access?.canApprove);
  const filteredEmpty = status === 'ready' && !rows.length;
  const filtersOn = Boolean(search || filters.from || filters.to || filters.status || filters.leaveTypeId || filters.teamId || filters.employeeId);

  return (
    <PageContainer>
      <header className="leave-head">
        <div>
          <h1>Leave & Permission</h1>
          <p>Manage leave requests, permissions, approvals and leave history.</p>
        </div>
        <div className="leave-head__actions">
          <Button onClick={() => setApplying(true)}><Plus size={16} /> Apply Leave</Button>
          <Button variant="secondary" onClick={() => setPermitting(true)}><Plus size={16} /> Permission</Button>
        </div>
      </header>

      {status === 'error' ? <ErrorState title="Unable to load leave requests." action={<Button onClick={refresh}>Retry</Button>} /> : null}
      {status === 'loading' && !overview ? <div className="leave-skeleton" /> : null}

      {summary ? (
        <>
          <section className="leave-cards">
            <article><span>Entitlement</span><strong>{formatAmount(summary.entitlementDays ?? 12)} days</strong></article>
            <article><span>Remaining</span><strong>{formatAmount(summary.availableDays)} days</strong></article>
            <article><span>Used</span><strong>{formatAmount(summary.usedDays)} days</strong></article>
            <article><span>Pending</span><strong>{summary.pendingRequests} {summary.pendingRequests === 1 ? 'request' : 'requests'}</strong></article>
          </section>
          {balances.length ? (
            <section className="leave-balances">
              {balances.map((item) => (
                <div key={item.id}>
                  <strong>{item.name}</strong>
                  <span>Entitlement {formatAmount(item.allocatedDays)}</span>
                  <span>Used {formatAmount(item.usedDays)}</span>
                  <span>Remaining {formatAmount(item.availableDays)}</span>
                </div>
              ))}
            </section>
          ) : <p className="leave-muted">No leave balance configured.</p>}
        </>
      ) : null}

      {(overview?.myPending || []).length ? (
        <section className="leave-panel">
          <h2>My pending requests ({overview.myPending.length})</h2>
          <div className="leave-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th><th>Reason</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {overview.myPending.map((item) => (
                  <tr key={`mine-${item.kind}-${item.id}`}>
                    <td>{item.typeName}</td>
                    <td>{item.reason}</td>
                    <td>{formatDate(item.startDate)}</td>
                    <td>{formatDate(item.endDate)}</td>
                    <td>{daysLabel(item)}</td>
                    <td><Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge></td>
                    <td className="leave-actions">
                      <button type="button" onClick={() => openDetail(item)}>View</button>
                      <button type="button" onClick={() => withdraw(item)}>Withdraw</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canApprove ? (
        <section className="leave-panel">
          <h2>Pending approvals ({pending.length})</h2>
          {pending.length ? (
            <div className="leave-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th><th>Type</th><th>Reason</th><th>Start</th><th>End</th><th>Days</th><th>Applied On</th><th>Status</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>{item.employeeName}</td>
                      <td>{item.typeName}</td>
                      <td>{item.reason}</td>
                      <td>{formatDate(item.startDate)}</td>
                      <td>{formatDate(item.endDate)}</td>
                      <td>{daysLabel(item)}</td>
                      <td>{formatDate(item.submittedAt)}</td>
                      <td><Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge></td>
                      <td className="leave-actions">
                        <button type="button" onClick={() => openDetail(item)}>View</button>
                        <button type="button" onClick={() => setReview({ item, mode: 'approve', comment: '' })}>Approve</button>
                        <button type="button" onClick={() => setReview({ item, mode: 'reject', comment: '' })}>Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="leave-muted">No pending leave requests for your team.</p>}
        </section>
      ) : null}

      <section className="leave-panel">
        <h2>Leave history</h2>
        <div className="leave-filters">
          <input className="input" placeholder="Search name, type, reason..." value={search} onChange={(event) => setSearch(event.target.value)} />
          <input className="input" type="date" aria-label="Start date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          <span>to</span>
          <input className="input" type="date" aria-label="End date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          <select className="select" aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select className="select" aria-label="Leave type" value={filters.leaveTypeId} onChange={(event) => setFilters({ ...filters, leaveTypeId: event.target.value })}>
            <option value="">Leave type</option>
            <option value="PERMISSION">Permission</option>
            {(overview?.types || []).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          {(overview?.teams || []).length ? (
            <select className="select" aria-label="Team" value={filters.teamId} onChange={(event) => setFilters({ ...filters, teamId: event.target.value })}>
              <option value="">Team</option>
              {overview.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          ) : null}
          {(overview?.employees || []).length ? (
            <select className="select" aria-label="Employee" value={filters.employeeId} onChange={(event) => setFilters({ ...filters, employeeId: event.target.value })}>
              <option value="">Employee</option>
              {overview.employees.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          ) : null}
          {filtersOn ? <Button variant="secondary" onClick={() => { setSearch(''); setFilters({ q: '', from: '', to: '', status: '', leaveTypeId: '', teamId: '', employeeId: '' }); }}>Clear</Button> : null}
        </div>
        {filteredEmpty ? (
          <EmptyState icon={CalendarDays} title={filtersOn ? 'No requests match your filters.' : 'No leave requests found.'} description={filtersOn ? 'Try a different search or date range.' : 'Apply for leave or permission when you need time away.'} />
        ) : null}
        {rows.length ? (
          <>
            <div className="leave-table-wrap leave-history">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Person</th><th>Type</th><th>Reason</th><th>Start</th><th>End</th><th>Days</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={`${item.kind}-${item.id}`}>
                      <td>{item.employeeName}</td>
                      <td>{item.typeName}</td>
                      <td>{item.reason}</td>
                      <td>{formatDate(item.startDate)}</td>
                      <td>{formatDate(item.endDate)}</td>
                      <td>{daysLabel(item)}</td>
                      <td><Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge></td>
                      <td className="leave-actions"><button type="button" onClick={() => openDetail(item)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="leave-cards-mobile">
              {rows.map((item) => (
                <article key={`card-${item.kind}-${item.id}`}>
                  <strong>{item.employeeName}</strong>
                  <span>{item.typeName} · {daysLabel(item)}</span>
                  <p>{item.reason}</p>
                  <span>{formatDate(item.startDate)} – {formatDate(item.endDate)}</span>
                  <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                  <button type="button" onClick={() => openDetail(item)}>View</button>
                </article>
              ))}
            </div>
          </>
        ) : null}
      </section>

      <LeaveForm
        open={applying}
        employeeName={user?.fullName || ''}
        types={overview?.types || []}
        holidays={overview?.holidays || []}
        weekendDays={overview?.weekendDays || [0, 6]}
        busy={busy}
        onClose={() => { if (!busy) setApplying(false); }}
        onSubmit={async (formData) => {
          setBusy(true);
          try {
            await createLeaveRequest(formData);
            setApplying(false);
            push({ tone: 'success', message: 'Leave request submitted.' });
            await refresh();
          } catch (error) {
            push({ tone: 'danger', message: error.message });
          } finally {
            setBusy(false);
          }
        }}
      />
      <PermissionForm
        open={permitting}
        employeeName={user?.fullName || ''}
        busy={busy}
        onClose={() => { if (!busy) setPermitting(false); }}
        onSubmit={async (body) => {
          setBusy(true);
          try {
            await createPermissionRequest(body);
            setPermitting(false);
            push({ tone: 'success', message: 'Permission request submitted.' });
            await refresh();
          } catch (error) {
            push({ tone: 'danger', message: error.message });
          } finally {
            setBusy(false);
          }
        }}
      />
      <DetailDialog
        data={detail}
        busy={busy}
        onClose={() => setDetail(null)}
        onWithdraw={() => detail && withdraw(detail.request)}
        onReview={(mode) => detail && setReview({ item: detail.request, mode, comment: '' })}
      />
      <Modal open={Boolean(review)} title={review?.mode === 'reject' ? 'Reject request?' : 'Approve request?'} onClose={() => { if (!busy) setReview(null); }}>
        {review ? (
          <div className="leave-form">
            <p>{review.item.employeeName} · {review.item.typeName}</p>
            <p>{formatDate(review.item.startDate)} – {formatDate(review.item.endDate)} · {daysLabel(review.item)}</p>
            <label className="field">
              <span className="field__label">{review.mode === 'reject' ? 'Reason for rejection *' : 'Approval comment'}</span>
              <textarea className="input" rows={3} value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} />
            </label>
            <div className="leave-form__actions">
              <Button variant="secondary" onClick={() => setReview(null)} disabled={busy}>Cancel</Button>
              <Button variant={review.mode === 'reject' ? 'danger' : 'primary'} onClick={submitReview} loading={busy}>{review.mode === 'reject' ? 'Reject Request' : 'Approve'}</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}

function LeaveForm({ open, employeeName, types, holidays, weekendDays, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', durationType: 'FULL', reason: '', note: '', file: null });
  useEffect(() => {
    if (open) setForm({ leaveTypeId: '', startDate: '', endDate: '', durationType: 'FULL', reason: '', note: '', file: null });
  }, [open]);
  const estimate = estimateLeaveDays(form.startDate, form.endDate, form.durationType, holidays, weekendDays);

  function submit(event) {
    event.preventDefault();
    const data = new FormData();
    data.set('leaveTypeId', form.leaveTypeId);
    data.set('startDate', form.startDate);
    data.set('endDate', form.endDate);
    data.set('durationType', form.durationType);
    data.set('reason', form.reason);
    data.set('note', form.note);
    if (form.file) data.set('attachment', form.file);
    onSubmit(data);
  }

  return (
    <Modal open={open} title="Apply Leave" onClose={onClose} className="leave-dialog">
      <form className="leave-form" onSubmit={submit}>
        <label className="field"><span className="field__label">Employee</span><input className="input" value={employeeName} disabled /></label>
        <label className="field">
          <span className="field__label">Leave Type *</span>
          <select className="select" required value={form.leaveTypeId} onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}>
            <option value="">Select</option>
            {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
        </label>
        <div className="leave-form__row">
          <label className="field"><span className="field__label">Start Date *</span><input className="input" required type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
          <label className="field"><span className="field__label">End Date *</span><input className="input" required type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
        </div>
        <label className="field">
          <span className="field__label">Duration</span>
          <select className="select" value={form.durationType} onChange={(event) => setForm({ ...form, durationType: event.target.value })}>
            {Object.entries(DURATION_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <small>
            {!form.startDate || !form.endDate
              ? 'Weekends and holidays are excluded.'
              : estimate > 0
                ? `${estimate} ${estimate === 1 || estimate === 0.5 ? 'day' : 'days'}`
                : 'The selected dates do not include a working day.'}
          </small>
        </label>
        <label className="field"><span className="field__label">Reason *</span><textarea className="input" required rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        <label className="field"><span className="field__label">Additional Note</span><textarea className="input" rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <label className="field"><span className="field__label">Attachment</span><input className="input" type="file" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label>
        <div className="leave-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>Submit Request</Button>
        </div>
      </form>
    </Modal>
  );
}

function PermissionForm({ open, employeeName, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ date: '', start: '14:00', end: '16:00', reason: '', note: '' });
  useEffect(() => {
    if (open) setForm({ date: '', start: '14:00', end: '16:00', reason: '', note: '' });
  }, [open]);
  const minutes = form.date ? Math.round((stamp(form.date, form.end) - stamp(form.date, form.start)) / 60000) : 0;

  function submit(event) {
    event.preventDefault();
    onSubmit({
      date: form.date,
      startAt: new Date(stamp(form.date, form.start)).toISOString(),
      endAt: new Date(stamp(form.date, form.end)).toISOString(),
      reason: form.reason,
      note: form.note,
    });
  }

  return (
    <Modal open={open} title="Permission" onClose={onClose} className="leave-dialog">
      <form className="leave-form" onSubmit={submit}>
        <label className="field"><span className="field__label">Employee</span><input className="input" value={employeeName} disabled /></label>
        <label className="field"><span className="field__label">Date *</span><input className="input" required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
        <div className="leave-form__row">
          <label className="field"><span className="field__label">From Time *</span><input className="input" required type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} /></label>
          <label className="field"><span className="field__label">To Time *</span><input className="input" required type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} /></label>
        </div>
        <p className="leave-muted">Duration {minutes > 0 ? requestDays({ kind: 'PERMISSION', durationMinutes: minutes }) : '—'}</p>
        <label className="field"><span className="field__label">Reason *</span><textarea className="input" required rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
        <label className="field"><span className="field__label">Note</span><textarea className="input" rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label>
        <div className="leave-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>Submit Permission</Button>
        </div>
      </form>
    </Modal>
  );
}

function stamp(date, time) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
}

function DetailDialog({ data, busy, onClose, onWithdraw, onReview }) {
  const request = data?.request;
  return (
    <Modal open={Boolean(data)} title={request?.requestNumber || 'Request'} onClose={onClose} className="leave-dialog">
      {request ? (
        <div className="leave-detail">
          <dl>
            <div><dt>Employee</dt><dd>{request.employeeName}</dd></div>
            <div><dt>Team</dt><dd>{request.teamName || '—'}</dd></div>
            <div><dt>Type</dt><dd>{request.typeName}</dd></div>
            <div><dt>Reason</dt><dd>{request.reason}</dd></div>
            <div><dt>Start</dt><dd>{formatDate(request.startDate)}</dd></div>
            <div><dt>End</dt><dd>{formatDate(request.endDate)}</dd></div>
            <div><dt>Duration</dt><dd>{request.kind === 'PERMISSION' ? requestDays(request) : `${DURATION_LABEL[request.durationType] || 'Full Day'} · ${requestDays(request)}`}</dd></div>
            <div><dt>Applied on</dt><dd>{formatDateTime(request.submittedAt)}</dd></div>
            <div><dt>Status</dt><dd><Badge tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Badge></dd></div>
            {request.reviewerName ? <div><dt>Reviewed by</dt><dd>{request.reviewerName}</dd></div> : null}
            {request.reviewedAt ? <div><dt>Reviewed on</dt><dd>{formatDateTime(request.reviewedAt)}</dd></div> : null}
            {request.approvalComment ? <div><dt>Approval comment</dt><dd>{request.approvalComment}</dd></div> : null}
            {request.rejectionReason ? <div><dt>Rejection reason</dt><dd>{request.rejectionReason}</dd></div> : null}
          </dl>
          {(data.history || []).length ? (
            <ol>
              {data.history.map((item) => (
                <li key={item.id}><strong>{item.action}</strong> · {item.actorName || 'System'} · {formatDateTime(item.createdAt)}{item.comment ? ` — ${item.comment}` : ''}</li>
              ))}
            </ol>
          ) : null}
          <div className="leave-form__actions">
            {data.canWithdraw ? <Button variant="secondary" onClick={onWithdraw} disabled={busy}>Withdraw Request</Button> : null}
            {data.canReview ? <Button variant="secondary" onClick={() => onReview('reject')} disabled={busy}>Reject</Button> : null}
            {data.canReview ? <Button onClick={() => onReview('approve')} disabled={busy}>Approve</Button> : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
