import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { WORK_STATUS } from '../../pages/daily-work/dailyWorkModel';

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'];

const STAKEHOLDER_NAMES = [
  'Mr. Arun',
  'Arivan',
  'Akash',
  'Abinash',
  'Sabarigiri',
  'CEO',
  'Raja',
  'Mrs. Shradha Patil',
  'Kabitha',
  'Vanippriya',
];

function kolkataShift() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour < 14 ? 'MORNING' : 'EVENING';
}

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/^(mr\.?|mrs\.?|ms\.?)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function resolveStakeholders(people = []) {
  return STAKEHOLDER_NAMES.map((label) => {
    const target = normalizeName(label);
    const match = people.find((person) => {
      const full = normalizeName(person.fullName);
      return full === target
        || full.includes(target)
        || target.includes(full)
        || (label === 'CEO' && /\bceo\b|chief executive/i.test(person.fullName || person.designation || ''));
    });
    return {
      key: match?.id || `name:${label}`,
      id: match?.id || '',
      name: match?.fullName || label,
      label,
    };
  });
}

function parseDependencies(raw, stakeholders) {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') {
          const byId = stakeholders.find((person) => person.id && person.id === item);
          if (byId) return byId.key;
          const byName = stakeholders.find((person) => normalizeName(person.label) === normalizeName(item)
            || normalizeName(person.name) === normalizeName(item));
          return byName?.key || `name:${item}`;
        }
        if (item && typeof item === 'object') {
          if (item.id) {
            const byId = stakeholders.find((person) => person.id === item.id);
            return byId?.key || item.id;
          }
          if (item.name || item.label) {
            const byName = stakeholders.find((person) => normalizeName(person.label) === normalizeName(item.name || item.label)
              || normalizeName(person.name) === normalizeName(item.name || item.label));
            return byName?.key || `name:${item.name || item.label}`;
          }
        }
        return '';
      }).filter(Boolean);
    }
  } catch {
    // legacy free text
  }
  return text.split(/[,;|/]+/).map((part) => part.trim()).filter(Boolean).map((part) => {
    const byName = stakeholders.find((person) => normalizeName(person.label) === normalizeName(part)
      || normalizeName(person.name) === normalizeName(part));
    return byName?.key || `name:${part}`;
  });
}

function serializeDependencies(keys, stakeholders) {
  const selected = keys.map((key) => {
    const person = stakeholders.find((item) => item.key === key);
    if (!person) {
      const name = String(key).replace(/^name:/, '');
      return { name };
    }
    return person.id ? { id: person.id, name: person.name } : { name: person.label };
  });
  return selected.length ? JSON.stringify(selected) : '';
}

function membershipsFor(lookups, employeeId) {
  return (lookups.memberships || []).filter((item) => item.userId === employeeId);
}

function primaryTeam(lookups, employeeId) {
  const memberships = membershipsFor(lookups, employeeId);
  return memberships.find((item) => item.isPrimary) || memberships[0] || null;
}

function blankRow(user, lookups, today) {
  const team = primaryTeam(lookups, user?.id);
  return {
    key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workDate: today,
    period: kolkataShift(),
    employeeId: user?.id || '',
    employeeName: user?.fullName || '',
    teamId: team?.teamId || '',
    workType: 'INTERNAL',
    task: '',
    projectId: '',
    dependencyKeys: [],
    dependencyType: '',
    dependencyDetails: '',
    status: 'IN_PROGRESS',
    startDate: today,
    deadline: '',
    loggedHours: '',
    reasonForDelay: '',
    morningWork: '',
    eveningWork: '',
    progress: '',
    nextAction: '',
    priority: 'MEDIUM',
    taskId: '',
    entryKind: 'MANUAL',
  };
}

function formFrom(row, stakeholders) {
  const task = row.workTitle && row.description && row.description !== row.workTitle && row.workTitle !== 'Daily work'
    ? `${row.workTitle}\n${row.description}`
    : (row.description && row.description !== 'Daily work' ? row.description : (row.workTitle && row.workTitle !== 'Daily work' ? row.workTitle : ''));
  const logged = row.loggedHours != null && row.loggedHours !== ''
    ? row.loggedHours
    : (Number(row.hours) || 0) + ((Number(row.minutes) || 0) / 60);
  return {
    key: row.id || `task:${row.taskId}:${row.period || 'MORNING'}`,
    id: row.id,
    workDate: row.currentDate || row.workDate,
    period: row.period || 'MORNING',
    employeeId: row.employeeId,
    employeeName: row.employeeName || '',
    teamId: row.teamId || '',
    workType: row.workType || 'INTERNAL',
    task,
    projectId: row.projectId || '',
    dependencyKeys: parseDependencies(row.dependencyDetails, stakeholders),
    dependencyType: row.dependencyType || '',
    dependencyDetails: row.dependencyDetails || '',
    status: row.status || 'IN_PROGRESS',
    startDate: row.startDate || '',
    deadline: row.deadline || '',
    loggedHours: logged ? String(Math.round(Number(logged) * 10) / 10) : '',
    reasonForDelay: row.reasonForDelay || '',
    morningWork: row.morningWork || '',
    eveningWork: row.eveningWork || '',
    progress: row.progress ?? '',
    nextAction: row.nextAction || '',
    priority: row.priority || 'MEDIUM',
    taskId: row.taskId || '',
    entryKind: row.entryKind || 'MANUAL',
    canDelete: Boolean(row.access?.canDelete),
    canEdit: row.access ? row.access.canEdit : true,
  };
}

function delayed(row) {
  return row.status === 'BLOCKED' || (row.deadline && row.workDate && row.deadline < row.workDate && row.status !== 'COMPLETED');
}

function rowHasContent(row) {
  return Boolean(
    String(row.task || '').trim()
    || row.projectId
    || (row.dependencyKeys || []).length
    || String(row.loggedHours || '').trim()
    || String(row.reasonForDelay || '').trim()
    || row.deadline
    || (row.status && row.status !== 'IN_PROGRESS'),
  );
}

function validate(row) {
  const fields = {};
  if (!row.workDate) fields.workDate = 'Report date is required.';
  if (!row.employeeId) fields.employee = 'Employee is required.';
  if (!row.workType) fields.workType = 'Work type is required.';
  if (String(row.task || '').trim().length < 2) fields.task = 'Task description is required.';
  if (!row.status) fields.status = 'Status is required.';
  if (row.startDate && row.deadline && row.deadline < row.startDate) fields.deadline = 'Deadline cannot be before the start date.';
  if (row.loggedHours !== '' && row.loggedHours != null) {
    const hours = Number(row.loggedHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) fields.loggedHours = 'Enter hours from 0 to 24.';
  }
  if (delayed(row) && String(row.reasonForDelay || '').trim().length < 2) fields.reason = 'Explain why this work is delayed.';
  return fields;
}

function payloadOf(row, stakeholders) {
  const task = String(row.task || '').trim();
  const logged = row.loggedHours === '' || row.loggedHours == null ? 0 : Number(row.loggedHours);
  const details = serializeDependencies(row.dependencyKeys || [], stakeholders);
  return {
    id: row.id,
    employeeId: row.employeeId,
    teamId: row.teamId || '',
    workType: row.workType || 'INTERNAL',
    workTitle: task.split('\n')[0].slice(0, 200),
    description: task,
    projectId: row.projectId || '',
    productId: '',
    status: row.status,
    priority: row.priority || 'MEDIUM',
    dependencyType: (row.dependencyKeys || []).length ? 'EMPLOYEE' : 'NONE',
    dependencyDetails: details,
    nextAction: row.nextAction || '',
    workDate: row.workDate,
    period: row.period,
    startDate: row.startDate || '',
    deadline: row.deadline || '',
    reasonForDelay: row.reasonForDelay || '',
    morningWork: row.morningWork || '',
    eveningWork: row.eveningWork || '',
    loggedHours: Number.isFinite(logged) ? logged : 0,
    hours: Number.isFinite(logged) ? logged : 0,
    minutes: 0,
    progress: row.progress === '' || row.progress == null ? null : Number(row.progress),
    taskId: row.taskId || '',
  };
}

function rowIdentity(row) {
  return row.id || row.key;
}

function DependencySelect({ value, options, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const root = useRef(null);
  const selected = options.filter((item) => value.includes(item.key));
  const filtered = options.filter((item) => {
    if (!query.trim()) return true;
    const hay = `${item.label} ${item.name}`.toLowerCase();
    return hay.includes(query.trim().toLowerCase());
  });

  useEffect(() => {
    if (!open) return undefined;
    function place() {
      const box = root.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(240, Math.max(180, box.width));
      const left = Math.min(box.left, window.innerWidth - width - 8);
      const below = box.bottom + 4;
      const maxHeight = Math.min(240, window.innerHeight - below - 8);
      setMenuStyle({
        position: 'fixed',
        top: below,
        left: Math.max(8, left),
        width,
        maxHeight: Math.max(120, maxHeight),
      });
    }
    place();
    function onDoc(event) {
      if (!root.current?.contains(event.target)) setOpen(false);
    }
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('mousedown', onDoc);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('mousedown', onDoc);
    };
  }, [open]);

  function toggle(key) {
    if (value.includes(key)) onChange(value.filter((item) => item !== key));
    else onChange([...value, key]);
  }

  return (
    <div className={`daily-dep${open ? ' is-open' : ''}`} ref={root}>
      <button type="button" className="daily-dep__trigger" disabled={disabled} onClick={() => setOpen((current) => !current)}>
        {selected.length
          ? selected.map((item) => item.label).join(', ')
          : 'Select'}
      </button>
      {open ? (
        <div className="daily-dep__menu" role="listbox" aria-multiselectable="true" style={menuStyle}>
          <input
            className="daily-dep__search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoFocus
          />
          <div className="daily-dep__list">
            {filtered.map((item) => (
              <label key={item.key} className="daily-dep__option">
                <input
                  type="checkbox"
                  checked={value.includes(item.key)}
                  onChange={() => toggle(item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          {selected.length ? (
            <button type="button" className="daily-dep__clear" onClick={() => onChange([])}>Clear</button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const WorkLog = forwardRef(function WorkLog({
  rows, lookups, user, canAssign, today, onSave, onDelete, onDirty, onReload, emptyLabel,
}, ref) {
  const stakeholders = useMemo(() => resolveStakeholders(lookups.people || []), [lookups.people]);
  const [drafts, setDrafts] = useState(() => [blankRow(user, lookups, today)]);
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState({});
  const [errors, setErrors] = useState({});
  const [confirmId, setConfirmId] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const scroller = useRef(null);
  const savingKeys = useRef(new Set());
  const primed = useRef('');

  const forms = useMemo(() => rows.map((row) => {
    const base = formFrom(row, stakeholders);
    return edits[base.key] ? { ...base, ...edits[base.key], key: base.key } : base;
  }), [edits, rows, stakeholders]);

  const sheetRows = useMemo(() => [...forms, ...drafts], [drafts, forms]);

  const dirtyCount = Object.values(dirty).filter(Boolean).length
    + drafts.filter((row) => rowHasContent(row)).length;

  const dirtyNotify = useRef(onDirty);
  dirtyNotify.current = onDirty;
  useEffect(() => { dirtyNotify.current?.(dirtyCount); }, [dirtyCount]);

  useEffect(() => {
    const stamp = `${today}|${user?.id || ''}`;
    if (primed.current === stamp) return;
    primed.current = stamp;
    setDrafts([blankRow(user, lookups, today)]);
    setEdits({});
    setDirty({});
    setErrors({});
    setNotice('');
  }, [lookups, today, user]);

  function ensureTrailingBlank(list) {
    if (!list.length) return [blankRow(user, lookups, today)];
    const last = list[list.length - 1];
    if (rowHasContent(last)) return [...list, blankRow(user, lookups, today)];
    return list;
  }

  useImperativeHandle(ref, () => ({
    saveAll,
    discard() {
      setDrafts([blankRow(user, lookups, today)]);
      setEdits({});
      setDirty({});
      setErrors({});
      setNotice('');
    },
  }));

  function patch(key, next, draft) {
    if (draft) {
      setDrafts((current) => ensureTrailingBlank(current.map((row) => (row.key === key ? { ...row, ...next } : row))));
    } else {
      setEdits((current) => ({ ...current, [key]: { ...(current[key] || {}), ...next } }));
    }
    setDirty((current) => ({ ...current, [key]: true }));
    setNotice('');
  }

  function chooseEmployee(key, employeeId, draft) {
    const team = primaryTeam(lookups, employeeId);
    const person = lookups.people.find((item) => item.id === employeeId);
    patch(key, { employeeId, employeeName: person?.fullName || '', teamId: team?.teamId || '' }, draft);
  }

  async function saveRows(list) {
    const failed = [];
    let saved = 0;
    for (const row of list) {
      if (!rowHasContent(row) && !row.id) continue;
      const fields = validate(row);
      if (Object.keys(fields).length) {
        setErrors((current) => ({ ...current, [rowIdentity(row)]: fields }));
        failed.push(rowIdentity(row));
        continue;
      }
      const id = rowIdentity(row);
      if (savingKeys.current.has(id)) continue;
      savingKeys.current.add(id);
      try {
        await onSave(payloadOf(row, stakeholders));
        saved += 1;
        setDirty((current) => ({ ...current, [id]: false }));
        setEdits((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        setErrors((current) => ({ ...current, [id]: {} }));
        if (!row.id) setDrafts((current) => ensureTrailingBlank(current.filter((item) => item.key !== row.key)));
      } catch (error) {
        const message = error.details?.fields?.reasonForDelay
          || error.details?.fields?.deadline
          || error.details?.fields?.description
          || error.message;
        setErrors((current) => ({ ...current, [id]: { form: message } }));
        failed.push(id);
      } finally {
        savingKeys.current.delete(id);
      }
    }
    if (saved) await onReload?.();
    return { saved, failed };
  }

  async function saveAll() {
    const pending = [
      ...drafts.filter((row) => rowHasContent(row)),
      ...forms.filter((row) => dirty[row.key]),
    ];
    if (!pending.length) return { saved: 0, failed: [] };
    setSaving(true);
    setNotice('Saving…');
    try {
      const result = await saveRows(pending);
      if (result.failed.length) setNotice('Some rows could not be saved. Your entries are still in the sheet.');
      else setNotice(result.saved ? 'Saved' : '');
      return result;
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(event) {
    const cell = event.target.closest('[data-row][data-col]');
    if (!cell) return;
    const rowIndex = Number(cell.dataset.row);
    const colIndex = Number(cell.dataset.col);
    const field = event.target;
    if (event.key === 'Enter' && field.tagName !== 'TEXTAREA') {
      event.preventDefault();
      focusAt(rowIndex + 1, colIndex);
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && field.tagName !== 'TEXTAREA' && field.tagName !== 'SELECT') {
      event.preventDefault();
      focusAt(rowIndex + (event.key === 'ArrowDown' ? 1 : -1), colIndex);
    }
  }

  function focusAt(rowIndex, colIndex) {
    const next = scroller.current?.querySelector(`[data-row="${rowIndex}"][data-col="${colIndex}"]`);
    const field = next?.querySelector('input, textarea, select, button');
    field?.focus();
  }

  function renderRow(row, rowIndex, draft) {
    const key = rowIdentity(row);
    const fieldErrors = errors[key] || {};
    const locked = row.canEdit === false;
    const statusOptions = STATUSES.includes(row.status) ? STATUSES : [...STATUSES, row.status].filter(Boolean);
    const cell = (col, className, node) => (
      <td
        key={col}
        data-row={rowIndex}
        data-col={col}
        className={`${className || ''} ${fieldErrors[className] || (className === 'reason' && fieldErrors.reason) ? 'is-invalid' : ''}`}
      >
        {node}
        {fieldErrors[className] || (className === 'task' && fieldErrors.task) ? (
          <small className="daily-cell-error">{fieldErrors[className] || fieldErrors.task}</small>
        ) : null}
      </td>
    );

    return (
      <tr key={key} className={`${draft ? 'daily-draft' : ''} ${dirty[key] || (draft && rowHasContent(row)) ? 'is-dirty' : ''}`}>
        {cell(0, 'employee', canAssign && !locked ? (
          <select className="daily-status" aria-label="Employee" value={row.employeeId} onChange={(event) => chooseEmployee(key, event.target.value, draft)}>
            {lookups.people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        ) : <span className="daily-ellipsis" title={row.employeeName || user?.fullName || 'You'}>{row.employeeName || user?.fullName || 'You'}</span>)}
        {cell(1, 'project', (
          <select
            className="daily-status"
            aria-label="Project"
            value={row.projectId || ''}
            disabled={locked}
            onChange={(event) => patch(key, { projectId: event.target.value }, draft)}
          >
            <option value="">No project</option>
            {lookups.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        ))}
        {cell(2, 'task', (
          <textarea
            className="daily-cell-input"
            rows={1}
            aria-label="Task description"
            value={row.task}
            disabled={locked}
            onChange={(event) => patch(key, { task: event.target.value }, draft)}
          />
        ))}
        {cell(3, 'dependency', (
          <DependencySelect
            value={row.dependencyKeys || []}
            options={stakeholders}
            disabled={locked}
            onChange={(dependencyKeys) => patch(key, { dependencyKeys }, draft)}
          />
        ))}
        {cell(4, 'status', (
          <select className="daily-status" aria-label="Status" value={row.status} disabled={locked} onChange={(event) => patch(key, { status: event.target.value }, draft)}>
            {statusOptions.map((value) => <option key={value} value={value}>{WORK_STATUS[value] || value}</option>)}
          </select>
        ))}
        {cell(5, 'startDate', (
          <input className="daily-cell-input" type="date" aria-label="Start date" value={row.startDate || ''} disabled={locked} onChange={(event) => patch(key, { startDate: event.target.value }, draft)} />
        ))}
        {cell(6, 'deadline', (
          <input className={`daily-cell-input${delayed(row) ? ' is-overdue' : ''}`} type="date" aria-label="Task deadline" value={row.deadline || ''} disabled={locked} onChange={(event) => patch(key, { deadline: event.target.value }, draft)} />
        ))}
        {cell(7, 'loggedHours', (
          <input className="daily-cell-input" type="number" min="0" max="24" step="0.5" aria-label="Logged hours" value={row.loggedHours} disabled={locked} onChange={(event) => patch(key, { loggedHours: event.target.value }, draft)} />
        ))}
        {cell(8, 'reason', (
          <input className="daily-cell-input" aria-label="Reason for delay" value={row.reasonForDelay} disabled={locked} onChange={(event) => patch(key, { reasonForDelay: event.target.value }, draft)} />
        ))}
        <td data-row={rowIndex} data-col={9} className="daily-actions">
          {fieldErrors.form ? <small className="daily-cell-error">{fieldErrors.form}</small> : null}
          {confirmId === key ? (
            <div className="daily-inline-confirm">
              <button type="button" onClick={() => setConfirmId('')}>Cancel</button>
              <button
                type="button"
                onClick={() => {
                  if (draft) {
                    setDrafts((current) => ensureTrailingBlank(current.filter((item) => item.key !== row.key)));
                    setConfirmId('');
                    return;
                  }
                  onDelete(row.id).then(() => setConfirmId('')).catch((error) => {
                    setErrors((current) => ({ ...current, [key]: { form: error.message } }));
                    setConfirmId('');
                  });
                }}
              >
                Delete
              </button>
            </div>
          ) : (
            (draft && rowHasContent(row)) || row.canDelete
              ? <button type="button" className="daily-row-delete" aria-label="Delete row" onClick={() => setConfirmId(key)}>×</button>
              : null
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="daily-sheet-wrap daily-sheet-wrap--compact">
      <p className="daily-sheet-note" aria-live="polite">
        {saving ? 'Saving…' : notice || (dirtyCount ? `${dirtyCount} unsaved ${dirtyCount === 1 ? 'change' : 'changes'}` : 'Click any cell to enter work. A new blank row appears as you type.')}
      </p>
      <div className="daily-scroll daily-scroll--fit" ref={scroller} onKeyDown={onKeyDown}>
        <table className="daily-sheet daily-sheet--compact">
          <colgroup>
            <col className="col-person" />
            <col className="col-project" />
            <col className="col-task" />
            <col className="col-deps" />
            <col className="col-status" />
            <col className="col-date" />
            <col className="col-date" />
            <col className="col-hours" />
            <col className="col-reason" />
            <col className="col-actions" />
          </colgroup>
          <thead>
            <tr>
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Dependencies</th>
              <th>Status</th>
              <th>Start Date</th>
              <th>Task Deadline</th>
              <th>Logged Hours</th>
              <th>Reason for Delay</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {!sheetRows.length ? (
              <tr className="daily-empty"><td colSpan={10}>{emptyLabel}</td></tr>
            ) : sheetRows.map((row, index) => renderRow(row, index, !row.id && String(row.key || '').startsWith('new-')))}
          </tbody>
        </table>
      </div>
    </div>
  );
});
