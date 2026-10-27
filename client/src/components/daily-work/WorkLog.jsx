import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PRIORITY, STATUS_TONE, WORK_STATUS, formatWorkDate, weekdayLabel } from '../../pages/daily-work/dailyWorkModel';

const DEPENDENCY = {
  '': 'None',
  TEAM: 'Internal team',
  EMPLOYEE: 'Team member',
  APPROVAL: 'Management approval',
  CUSTOMER: 'Customer',
  VENDOR: 'Vendor',
  PROCUREMENT: 'Procurement',
  TECHNICAL: 'Technical information',
  MATERIAL: 'Material',
  SOFTWARE: 'Software',
  HARDWARE: 'Hardware',
  OTHER: 'Other',
};

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD'];
const COLUMNS = ['Date', 'Employee', 'Team', 'Work Type', 'Work Title', 'Description', 'Product', 'Project', 'Status', 'Priority', 'Dependency', 'Next Action', 'Progress', 'Hours', 'Actions'];
const COLUMN_WIDTHS = [118, 150, 130, 140, 200, 240, 140, 160, 120, 110, 160, 180, 96, 110, 132];

function hoursText(row) {
  const hours = Number(row.hours) || 0;
  const minutes = Number(row.minutes) || 0;
  if (!hours && !minutes) return '—';
  if (!minutes) return `${hours}h`;
  if (!hours) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function membershipsFor(lookups, employeeId) {
  return (lookups.memberships || []).filter((item) => item.userId === employeeId);
}

function primaryTeam(lookups, employeeId) {
  const memberships = membershipsFor(lookups, employeeId);
  return memberships.find((item) => item.isPrimary) || memberships[0] || null;
}

function kolkataShift() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return hour < 14 ? 'MORNING' : 'EVENING';
}

function blankRow(user, lookups, today) {
  const team = primaryTeam(lookups, user?.id);
  return {
    key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workDate: today,
    period: kolkataShift(),
    employeeId: user?.id || '',
    teamId: team?.teamId || '',
    workType: '',
    workTitle: '',
    description: '',
    productId: '',
    projectId: '',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dependencyType: '',
    dependencyDetails: '',
    nextAction: '',
    hours: 0,
    minutes: 0,
    progress: '',
    taskId: '',
    entryKind: 'MANUAL',
  };
}

function formFrom(row) {
  return {
    key: row.id || `task:${row.taskId}`,
    id: row.id,
    workDate: row.currentDate,
    period: row.period || 'MORNING',
    employeeId: row.employeeId,
    teamId: row.teamId || '',
    workType: row.workType,
    workTitle: row.workTitle,
    description: row.description,
    productId: row.productId || '',
    projectId: row.projectId || '',
    status: row.status,
    priority: row.priority || 'MEDIUM',
    dependencyType: row.dependencyType || '',
    dependencyDetails: row.dependencyDetails || '',
    nextAction: row.nextAction || '',
    hours: row.hours || 0,
    minutes: row.minutes || 0,
    progress: row.progress ?? '',
    taskId: row.taskId || '',
    entryKind: row.entryKind || 'MANUAL',
  };
}

function entered(row) {
  return Boolean(
    row.workType
    || row.workTitle.trim()
    || row.description.trim()
    || row.productId
    || row.projectId
    || row.dependencyType
    || row.dependencyDetails.trim()
    || row.nextAction.trim()
    || Number(row.hours)
    || Number(row.minutes),
  );
}

function validate(row) {
  if (!row.workDate) return 'Date is required.';
  if (!row.employeeId) return 'Employee is required.';
  if (!row.workType) return 'Work type is required.';
  if (row.workTitle.trim().length < 2) return 'Work title is required.';
  if (row.description.trim().length < 2) return 'Description is required.';
  if (!row.status) return 'Status is required.';
  return '';
}

function payloadOf(row) {
  const payload = {
    ...row,
    workTitle: row.workTitle.trim(),
    description: row.description.trim(),
    hours: Number(row.hours) || 0,
    minutes: Number(row.minutes) || 0,
    projectId: row.projectId || '',
    productId: row.productId || '',
    dependencyType: row.dependencyType || 'NONE',
    taskId: row.taskId || '',
    progress: row.progress === '' || row.progress == null ? null : Number(row.progress),
  };
  if (row.entryKind === 'ASSIGNED') delete payload.id;
  return payload;
}

function groupLabel(row, groupBy) {
  if (groupBy === 'employee') return row.employeeName || 'Employee';
  if (groupBy === 'team') return row.teamName || 'No team';
  if (groupBy === 'workType') return row.workTypeName || 'Work type';
  if (groupBy === 'product') return row.productName || 'No product';
  if (groupBy === 'project') return row.projectName || 'No project';
  if (groupBy === 'status') return WORK_STATUS[row.status] || row.status;
  return weekdayLabel(row.currentDate);
}

export const WorkLog = forwardRef(function WorkLog({ rows, lookups, groupBy, user, canAssign, today, onSave, onDelete, emptyLabel = 'No daily work updates for the selected filters.' }, ref) {
  const [drafts, setDrafts] = useState([]);
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState('');
  const [errors, setErrors] = useState({});
  const [discardKey, setDiscardKey] = useState('');
  const [confirmId, setConfirmId] = useState('');
  const [openDesc, setOpenDesc] = useState('');
  const scroller = useRef(null);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    function onWheel(event) {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const sideways = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!event.shiftKey && !sideways) return;
      el.scrollLeft += sideways ? event.deltaX : event.deltaY;
      event.preventDefault();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useImperativeHandle(ref, () => ({
    addRow() {
      setDrafts((current) => [blankRow(user, lookups, today), ...current]);
    },
  }), [lookups, today, user]);

  const groups = useMemo(() => {
    const buckets = new Map();
    rows.forEach((row) => {
      const key = groupLabel(row, groupBy);
      buckets.set(key, [...(buckets.get(key) || []), row]);
    });
    return [...buckets.entries()];
  }, [groupBy, rows]);

  function patchDraft(key, next) {
    setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
  }

  function chooseEmployee(key, employeeId, patch) {
    const team = primaryTeam(lookups, employeeId);
    patch(key, { employeeId, teamId: team?.teamId || '' });
  }

  function cancelDraft(row) {
    if (!entered(row)) {
      setDrafts((current) => current.filter((item) => item.key !== row.key));
      return;
    }
    setDiscardKey(row.key);
  }

  async function saveRow(row, clear) {
    const message = validate(row);
    if (message) {
      setErrors((current) => ({ ...current, [row.key || row.id]: message }));
      return;
    }
    const id = row.key || row.id;
    setBusy(id);
    setErrors((current) => ({ ...current, [id]: '' }));
    try {
      await onSave(payloadOf(row));
      clear();
    } catch (error) {
      setErrors((current) => ({ ...current, [id]: error.details?.fields?.workTitle || error.details?.fields?.description || error.details?.fields?.workType || error.message }));
    } finally {
      setBusy('');
    }
  }

  function cells(row, patch, key) {
    const memberships = membershipsFor(lookups, row.employeeId);
    const teamName = memberships.find((item) => item.teamId === row.teamId)?.teamName || memberships[0]?.teamName || '';
    const emphasizeProject = row.workType === 'PROJECT_WORK';
    const emphasizeProduct = row.workType === 'PRODUCT_DEVELOPMENT' || row.workType === 'RND';
    return (
      <>
        <td>
          <input className="daily-cell-input" type="date" aria-label="Date" value={row.workDate} onChange={(event) => patch(key, { workDate: event.target.value })} />
          <select className="daily-status" aria-label="Period" value={row.period || 'MORNING'} onChange={(event) => patch(key, { period: event.target.value })}>
            <option value="MORNING">Morning</option>
            <option value="EVENING">Evening</option>
          </select>
        </td>
        <td>
          {canAssign ? (
            <select className="daily-status" aria-label="Employee" value={row.employeeId} onChange={(event) => chooseEmployee(key, event.target.value, patch)}>
              {lookups.people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
            </select>
          ) : <span>{user?.fullName || 'You'}</span>}
        </td>
        <td>
          {memberships.length > 1 ? (
            <select className="daily-status" aria-label="Team" value={row.teamId} onChange={(event) => patch(key, { teamId: event.target.value })}>
              {memberships.map((item) => <option key={item.teamId} value={item.teamId}>{item.teamName}</option>)}
            </select>
          ) : <span>{teamName || '—'}</span>}
        </td>
        <td>
          <select className="daily-status" aria-label="Work type" value={row.workType} onChange={(event) => patch(key, { workType: event.target.value })}>
            <option value="">Select work type</option>
            {(lookups.workTypes || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </td>
        <td>
          <span className={`daily-kind${row.entryKind === 'UPDATE' ? ' is-update' : ''}`}>{row.entryKind === 'ASSIGNED' ? 'Assigned task' : row.taskId ? 'Daily update' : 'Daily update'}</span>
          <input className="daily-cell-input" aria-label="Work title" placeholder="Enter work title" value={row.workTitle} onChange={(event) => patch(key, { workTitle: event.target.value })} />
        </td>
        <td><textarea className="daily-cell-input" rows={2} aria-label="Description" placeholder="Enter today's work/update..." value={row.description} onChange={(event) => patch(key, { description: event.target.value })} /></td>
        <td>
          <select className={`daily-status${emphasizeProduct ? ' is-emphasis' : ''}`} aria-label="Product" value={row.productId} onChange={(event) => patch(key, { productId: event.target.value })}>
            <option value="">No product</option>
            {(lookups.products || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </td>
        <td>
          <select className={`daily-status${emphasizeProject ? ' is-emphasis' : ''}`} aria-label="Project" value={row.projectId} onChange={(event) => patch(key, { projectId: event.target.value })}>
            <option value="">No project</option>
            {lookups.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </td>
        <td>
          <select className="daily-status" aria-label="Status" value={row.status} onChange={(event) => patch(key, { status: event.target.value })}>
            {STATUSES.map((value) => <option key={value} value={value}>{WORK_STATUS[value]}</option>)}
          </select>
        </td>
        <td>
          <select className="daily-status" aria-label="Priority" value={row.priority} onChange={(event) => patch(key, { priority: event.target.value })}>
            {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </td>
        <td>
          <select className="daily-status" aria-label="Dependency" value={row.dependencyType} onChange={(event) => patch(key, { dependencyType: event.target.value })}>
            {Object.entries(DEPENDENCY).map(([value, label]) => <option key={label} value={value}>{label}</option>)}
          </select>
          {row.dependencyType ? <input className="daily-cell-input" aria-label="Dependency details" placeholder="Details" value={row.dependencyDetails} onChange={(event) => patch(key, { dependencyDetails: event.target.value })} /> : null}
        </td>
        <td><input className="daily-cell-input" aria-label="Next action" placeholder="Next action" value={row.nextAction} onChange={(event) => patch(key, { nextAction: event.target.value })} /></td>
        <td><input className="daily-cell-input" type="number" min="0" max="100" aria-label="Progress" value={row.progress} onChange={(event) => patch(key, { progress: event.target.value })} /></td>
        <td>
          <span className="daily-hours">
            <input className="daily-cell-input" type="number" min="0" max="24" aria-label="Hours" value={row.hours} onChange={(event) => patch(key, { hours: event.target.value })} />
            <input className="daily-cell-input" type="number" min="0" max="59" aria-label="Minutes" value={row.minutes} onChange={(event) => patch(key, { minutes: event.target.value })} />
          </span>
        </td>
      </>
    );
  }

  return (
    <div className="daily-scroll" ref={scroller}>
      <table className="daily-sheet">
        <colgroup>
          {COLUMN_WIDTHS.map((width, index) => <col key={COLUMNS[index]} style={{ width }} />)}
        </colgroup>
        <thead>
          <tr>{COLUMNS.map((label) => <th key={label}>{label}</th>)}</tr>
        </thead>
        {drafts.length ? (
          <tbody>
            {drafts.map((row) => (
              <tr key={row.key} className="daily-draft">
                {cells(row, patchDraft, row.key)}
                <td className="daily-actions">
                  {errors[row.key] ? <small className="daily-cell-error">{errors[row.key]}</small> : null}
                  {discardKey === row.key ? (
                    <div className="daily-inline-confirm">
                      <span>Discard this unsaved work update?</span>
                      <button type="button" onClick={() => setDiscardKey('')}>Cancel</button>
                      <button type="button" onClick={() => { setDrafts((current) => current.filter((item) => item.key !== row.key)); setDiscardKey(''); }}>Discard</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => saveRow(row, () => setDrafts((current) => current.filter((item) => item.key !== row.key)))} disabled={busy === row.key}><Check size={14} /> {busy === row.key ? 'Saving' : 'Save'}</button>
                      <button type="button" onClick={() => cancelDraft(row)}><X size={14} /> Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        ) : null}
        {!rows.length && !drafts.length ? (
          <tbody>
            <tr className="daily-empty"><td colSpan={COLUMNS.length}>{emptyLabel}</td></tr>
          </tbody>
        ) : null}
        {groups.map(([label, items]) => (
          <tbody key={label}>
            <tr className="daily-group"><td colSpan={COLUMNS.length}><strong>{label}</strong><span>{items.length}</span></td></tr>
            {items.map((row) => {
              const rowKey = row.id || `task:${row.taskId}`;
              const editing = edit?.key === rowKey;
              return (
                <tr key={rowKey}>
                  {editing ? cells(edit, (id, next) => setEdit((current) => ({ ...current, ...next })), rowKey) : (
                    <>
                      <td>{formatWorkDate(row.currentDate)}<small className="daily-period">{row.period === 'EVENING' ? 'Evening' : 'Morning'}</small></td>
                      <td>{row.employeeName}</td>
                      <td>{row.teamName || '—'}</td>
                      <td>{row.workTypeName}</td>
                      <td>
                        <span className={`daily-kind${row.entryKind === 'ASSIGNED' ? '' : ' is-update'}`}>{row.entryKind === 'ASSIGNED' ? 'Assigned task' : 'Daily update'}</span>
                        {row.workTitle}
                      </td>
                      <td>
                        <button type="button" className={`daily-desc-btn${openDesc === row.id ? ' is-open' : ''}`} title={row.description} onClick={() => setOpenDesc((current) => (current === row.id ? '' : row.id))}>{row.description}</button>
                      </td>
                      <td>{row.productName || '—'}</td>
                      <td>{row.projectName || 'No project'}</td>
                      <td><Badge tone={STATUS_TONE[row.status] || 'neutral'}>{WORK_STATUS[row.status] || row.status}</Badge></td>
                      <td><Badge tone={row.priority === 'CRITICAL' ? 'danger' : row.priority === 'HIGH' ? 'warning' : row.priority === 'LOW' ? 'neutral' : 'info'}>{PRIORITY[row.priority] || row.priority}</Badge></td>
                      <td title={row.dependencyDetails}>{row.dependencyDetails || DEPENDENCY[row.dependencyType] || 'None'}</td>
                      <td><span className="daily-desc" title={row.nextAction}>{row.nextAction || '—'}</span></td>
                      <td>{row.progress == null || row.progress === '' ? '—' : `${row.progress}%`}</td>
                      <td>{hoursText(row)}</td>
                    </>
                  )}
                  <td className="daily-actions">
                    {errors[rowKey] ? <small className="daily-cell-error">{errors[rowKey]}</small> : null}
                    {editing ? (
                      <>
                        <button type="button" onClick={() => saveRow(edit, () => setEdit(null))} disabled={busy === rowKey}><Check size={14} /> {busy === rowKey ? 'Saving' : 'Save'}</button>
                        <button type="button" onClick={() => { setEdit(null); setErrors((current) => ({ ...current, [rowKey]: '' })); }}><X size={14} /> Cancel</button>
                      </>
                    ) : confirmId === row.id ? (
                      <div className="daily-inline-confirm">
                        <span>Delete this daily work update?</span>
                        <button type="button" onClick={() => setConfirmId('')}>Cancel</button>
                        <button type="button" onClick={() => onDelete(row.id).then(() => setConfirmId('')).catch(() => setConfirmId(''))}>Delete</button>
                      </div>
                    ) : (
                      <>
                        {row.access?.canEdit ? <button type="button" onClick={() => setEdit(formFrom(row))}>Edit</button> : null}
                        {row.access?.canDelete ? <button type="button" onClick={() => setConfirmId(row.id)}>Delete</button> : null}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
});
