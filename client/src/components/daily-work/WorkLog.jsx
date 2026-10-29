import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { PRIORITY, WORK_STATUS, formatWorkDate } from '../../pages/daily-work/dailyWorkModel';

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
const COLUMNS = [
  ['employee', 'Person', 160, true],
  ['project', 'Project', 170, true],
  ['task', 'Task Description', 240, true],
  ['dependency', 'Dependencies', 170, true],
  ['status', 'Status', 130, true],
  ['startDate', 'Start Date', 130, true],
  ['deadline', 'Task Deadline', 140, true],
  ['loggedHours', 'Logged Hours', 120, true],
  ['reason', 'Reason for Delay', 200, true],
  ['team', 'Team', 140, false],
  ['workType', 'Work Type', 150, false],
  ['morning', 'Morning Work', 200, false],
  ['evening', 'Evening Work', 200, false],
  ['progress', 'Progress', 100, false],
  ['next', 'Next Action', 180, false],
  ['priority', 'Priority', 120, false],
  ['workDate', 'Report Date', 140, false],
  ['period', 'Period', 120, false],
  ['actions', 'Actions', 120, false],
];

function kolkataShift() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  return hour < 14 ? 'MORNING' : 'EVENING';
}

function displayDate(iso) {
  if (!iso) return '';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!year || !month || !day) return '';
  return `${day}-${month}-${year}`;
}

function membershipsFor(lookups, employeeId) {
  return (lookups.memberships || []).filter((item) => item.userId === employeeId);
}

function primaryTeam(lookups, employeeId) {
  const memberships = membershipsFor(lookups, employeeId);
  return memberships.find((item) => item.isPrimary) || memberships[0] || null;
}

function blankRow(user, lookups, today, period) {
  const team = primaryTeam(lookups, user?.id);
  return {
    key: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workDate: today,
    period: period === 'EVENING' || period === 'MORNING' ? period : kolkataShift(),
    employeeId: user?.id || '',
    teamId: team?.teamId || '',
    workType: 'INTERNAL',
    task: '',
    projectId: '',
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

function formFrom(row) {
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
  if (row.progress !== '' && row.progress != null) {
    const progress = Number(row.progress);
    if (!Number.isFinite(progress) || progress < 0 || progress > 100) fields.progress = 'Enter progress from 0 to 100.';
  }
  if (delayed(row) && String(row.reasonForDelay || '').trim().length < 2) fields.reason = 'Explain why this work is delayed.';
  return fields;
}

function payloadOf(row) {
  const task = String(row.task || '').trim();
  const logged = row.loggedHours === '' || row.loggedHours == null ? 0 : Number(row.loggedHours);
  return {
    id: row.id,
    employeeId: row.employeeId,
    teamId: row.teamId || '',
    workType: row.workType,
    workTitle: task.split('\n')[0].slice(0, 200),
    description: task,
    projectId: row.projectId || '',
    productId: '',
    status: row.status,
    priority: row.priority || 'MEDIUM',
    dependencyType: row.dependencyType || 'NONE',
    dependencyDetails: row.dependencyDetails || '',
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

function ProjectField({ projectId, projects, disabled, onPick }) {
  const name = projects.find((item) => item.id === projectId)?.name || '';
  const [text, setText] = useState(name);
  useEffect(() => { setText(name); }, [name]);
  return (
    <>
      <input
        className="daily-cell-input"
        aria-label="Project"
        list="daily-project-list"
        value={text}
        placeholder="No project"
        disabled={disabled}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => onPick(text)}
      />
    </>
  );
}

export const WorkLog = forwardRef(function WorkLog({
  rows, lookups, groupBy, user, canAssign, today, defaultPeriod, onSave, onDelete, onDirty, onReload, emptyLabel,
}, ref) {
  const [drafts, setDrafts] = useState([]);
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState({});
  const [errors, setErrors] = useState({});
  const [confirmId, setConfirmId] = useState('');
  const [selected, setSelected] = useState(null);
  const [sort, setSort] = useState({ key: '', dir: 1 });
  const [widths, setWidths] = useState(COLUMNS.map((column) => column[2]));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const scroller = useRef(null);
  const savingKeys = useRef(new Set());
  const visualRows = useRef([]);

  const forms = useMemo(() => rows.map((row) => {
    const base = formFrom(row);
    return edits[base.key] ? { ...base, ...edits[base.key], key: base.key } : base;
  }), [edits, rows]);

  const ordered = useMemo(() => {
    const list = [...forms];
    if (!sort.key) return list;
    const read = {
      workDate: (row) => row.workDate || '',
      employee: (row) => row.employeeName || '',
      project: (row) => lookups.projects.find((item) => item.id === row.projectId)?.name || '',
      status: (row) => row.status || '',
      deadline: (row) => row.deadline || '',
    }[sort.key];
    if (!read) return list;
    list.sort((a, b) => read(a).localeCompare(read(b)) * sort.dir);
    return list;
  }, [forms, lookups.projects, sort]);

  const groups = useMemo(() => {
    const buckets = new Map();
    ordered.forEach((row) => {
      const label = groupBy === 'employee'
        ? (row.employeeName || lookups.people.find((person) => person.id === row.employeeId)?.fullName || 'Employee')
        : formatWorkDate(row.workDate) || 'Date';
      buckets.set(label, [...(buckets.get(label) || []), row]);
    });
    return [...buckets.entries()];
  }, [groupBy, lookups.people, ordered]);

  const flat = useMemo(() => [...drafts, ...ordered], [drafts, ordered]);
  const dirtyCount = Object.values(dirty).filter(Boolean).length + drafts.length;

  const dirtyNotify = useRef(onDirty);
  dirtyNotify.current = onDirty;
  useEffect(() => { dirtyNotify.current?.(dirtyCount); }, [dirtyCount]);

  useImperativeHandle(ref, () => ({
    addRow() {
      const row = blankRow(user, lookups, today, defaultPeriod);
      setDrafts((current) => [row, ...current]);
      setDirty((current) => ({ ...current, [row.key]: true }));
      setSelected({ key: row.key, col: 0 });
    },
    saveAll,
    discard() {
      setDrafts([]);
      setEdits({});
      setDirty({});
      setErrors({});
      setNotice('');
    },
  }), [defaultPeriod, lookups, today, user, drafts, edits, ordered]);

  function patch(key, next, draft) {
    if (draft) {
      setDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));
    } else {
      setEdits((current) => ({ ...current, [key]: { ...(current[key] || {}), ...next } }));
    }
    setDirty((current) => ({ ...current, [key]: true }));
    setNotice('');
  }

  function chooseEmployee(key, employeeId, draft) {
    const team = primaryTeam(lookups, employeeId);
    patch(key, { employeeId, teamId: team?.teamId || '' }, draft);
  }

  function chooseProject(key, name, draft, currentId) {
    const text = name.trim();
    if (!text || /^(no project|internal|non-project)$/i.test(text)) {
      patch(key, { projectId: '' }, draft);
      return;
    }
    const found = lookups.projects.find((item) => item.name.toLowerCase() === text.toLowerCase());
    const nextId = found ? found.id : (!text ? '' : currentId);
    if (nextId !== currentId) patch(key, { projectId: nextId }, draft);
    setErrors((current) => ({ ...current, [key]: { ...(current[key] || {}), project: found || !text ? '' : 'Select a project from the list.' } }));
  }

  async function saveRows(list) {
    const failed = [];
    let saved = 0;
    for (const row of list) {
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
        await onSave(payloadOf(row));
        saved += 1;
        setDirty((current) => ({ ...current, [id]: false }));
        setEdits((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        setErrors((current) => ({ ...current, [id]: {} }));
        if (!row.id) setDrafts((current) => current.filter((item) => item.key !== row.key));
      } catch (error) {
        const message = error.details?.fields?.reasonForDelay || error.details?.fields?.deadline || error.details?.fields?.description || error.message;
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
      ...drafts,
      ...ordered.filter((row) => dirty[row.key]),
    ];
    if (!pending.length) return;
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
    const field = next?.querySelector('input, textarea, select');
    field?.focus();
  }

  function onPaste(event) {
    const text = event.clipboardData?.getData('text/plain') || '';
    if (!text.includes('\t') && !text.includes('\n')) return;
    const cell = event.target.closest('[data-row][data-col]');
    if (!cell) return;
    event.preventDefault();
    const grid = text.replace(/\r/g, '').split('\n').filter((line) => line.length).map((line) => line.split('\t'));
    const startRow = Number(cell.dataset.row);
    const startCol = Number(cell.dataset.col);
    const visual = visualRows.current;
    grid.forEach((line, rowOffset) => {
      const target = visual[startRow + rowOffset];
      if (!target) return;
      const next = {};
      line.forEach((value, colOffset) => {
        const column = COLUMNS[startCol + colOffset];
        if (!column || column[0] === 'actions') return;
        applyPasted(next, column[0], value, target);
      });
      patch(rowIdentity(target), next, !target.id && String(target.key).startsWith('new-'));
    });
  }

  function applyPasted(next, column, value, row) {
    const text = value.trim();
    if (column === 'employee') {
      const person = lookups.people.find((item) => item.fullName.toLowerCase() === text.toLowerCase());
      if (person && canAssign) next.employeeId = person.id;
    } else if (column === 'project') {
      const project = lookups.projects.find((item) => item.name.toLowerCase() === text.toLowerCase());
      next.projectId = project ? project.id : (!text || /no project/i.test(text) ? '' : row.projectId);
    } else if (column === 'task') next.task = value;
    else if (column === 'dependency') next.dependencyDetails = text.toLowerCase() === 'none' ? '' : text;
    else if (column === 'status') {
      const found = STATUSES.find((item) => WORK_STATUS[item].toLowerCase() === text.toLowerCase() || item === text.toUpperCase());
      if (found) next.status = found;
    } else if (column === 'startDate' || column === 'deadline' || column === 'workDate') {
      const match = text.match(/^(\d{2})-(\d{2})-(\d{4})$/) || text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match && match[0].includes('-') && match[1].length === 4) next[column] = text.slice(0, 10);
      else if (match) next[column] = `${match[3]}-${match[2]}-${match[1]}`;
    } else if (column === 'loggedHours') next.loggedHours = text;
    else if (column === 'reason') next.reasonForDelay = text;
    else if (column === 'team') {
      const team = membershipsFor(lookups, row.employeeId).find((item) => item.teamName.toLowerCase() === text.toLowerCase());
      if (team) next.teamId = team.teamId;
    } else if (column === 'workType') {
      const kind = (lookups.workTypes || []).find((item) => item.name.toLowerCase() === text.toLowerCase() || item.code === text);
      if (kind) next.workType = kind.code;
    } else if (column === 'morning') next.morningWork = text;
    else if (column === 'evening') next.eveningWork = text;
    else if (column === 'progress') next.progress = text.replace('%', '');
    else if (column === 'next') next.nextAction = text;
    else if (column === 'priority') {
      const found = Object.entries(PRIORITY).find(([, label]) => label.toLowerCase() === text.toLowerCase());
      if (found) next.priority = found[0];
    } else if (column === 'period') next.period = /eve/i.test(text) ? 'EVENING' : 'MORNING';
  }

  function startResize(event, index) {
    event.preventDefault();
    const startX = event.clientX;
    const start = widths[index];
    function move(moveEvent) {
      setWidths((current) => current.map((width, item) => (item === index ? Math.max(96, start + moveEvent.clientX - startX) : width)));
    }
    function stop() {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', stop);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', stop);
  }

  function renderRow(row, rowIndex, draft) {
    const key = rowIdentity(row);
    const fieldErrors = errors[key] || {};
    const memberships = membershipsFor(lookups, row.employeeId);
    const locked = row.canEdit === false;
    const cell = (col, node) => (
      <td
        key={COLUMNS[col][0]}
        data-row={rowIndex}
        data-col={col}
        className={`${selected?.key === key && selected?.col === col ? 'is-selected' : ''} ${fieldErrors[COLUMNS[col][0]] || (COLUMNS[col][0] === 'reason' && fieldErrors.reason) ? 'is-invalid' : ''} ${col === 0 ? 'is-sticky' : ''}`}
        onFocus={() => setSelected({ key, col })}
      >
        {node}
        {fieldErrors[COLUMNS[col][0]] || (COLUMNS[col][0] === 'task' && fieldErrors.task) ? <small className="daily-cell-error">{fieldErrors[COLUMNS[col][0]] || fieldErrors.task}</small> : null}
      </td>
    );
    return (
      <tr key={key} className={`${draft ? 'daily-draft' : ''} ${dirty[key] ? 'is-dirty' : ''} ${rowIndex % 2 ? 'is-alt' : ''}`}>
        {cell(0, canAssign && !locked ? (
          <select className="daily-status" aria-label="Person" value={row.employeeId} onChange={(event) => chooseEmployee(key, event.target.value, draft)}>
            {lookups.people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        ) : <span>{row.employeeName || user?.fullName || 'You'}</span>)}
        {cell(1, (
          <ProjectField projectId={row.projectId} projects={lookups.projects} disabled={locked} onPick={(name) => chooseProject(key, name, draft, row.projectId)} />
        ))}
        {cell(2, <textarea className="daily-cell-input" rows={2} aria-label="Task description" value={row.task} disabled={locked} onChange={(event) => patch(key, { task: event.target.value }, draft)} />)}
        {cell(3, (
          <>
            <select className="daily-status" aria-label="Dependency" value={row.dependencyType} disabled={locked} onChange={(event) => patch(key, { dependencyType: event.target.value }, draft)}>
              {Object.entries(DEPENDENCY).map(([value, label]) => <option key={label} value={value}>{label}</option>)}
            </select>
            <input className="daily-cell-input" aria-label="Dependency details" placeholder="None" value={row.dependencyDetails} disabled={locked} onChange={(event) => patch(key, { dependencyDetails: event.target.value }, draft)} />
          </>
        ))}
        {cell(4, (
          <select className="daily-status" aria-label="Status" value={row.status} disabled={locked} onChange={(event) => patch(key, { status: event.target.value }, draft)}>
            {STATUSES.map((value) => <option key={value} value={value}>{WORK_STATUS[value]}</option>)}
          </select>
        ))}
        {cell(5, <span className="daily-date">{displayDate(row.startDate) || 'DD-MM-YYYY'}<input type="date" aria-label="Start date" value={row.startDate} disabled={locked} onChange={(event) => patch(key, { startDate: event.target.value }, draft)} /></span>)}
        {cell(6, <span className={`daily-date${delayed(row) ? ' is-overdue' : ''}`}>{displayDate(row.deadline) || 'DD-MM-YYYY'}<input type="date" aria-label="Task deadline" value={row.deadline} disabled={locked} onChange={(event) => patch(key, { deadline: event.target.value }, draft)} /></span>)}
        {cell(7, <input className="daily-cell-input" type="number" min="0" max="24" step="0.5" aria-label="Logged hours" value={row.loggedHours} disabled={locked} onChange={(event) => patch(key, { loggedHours: event.target.value }, draft)} />)}
        {cell(8, <textarea className="daily-cell-input" rows={2} aria-label="Reason for delay" value={row.reasonForDelay} disabled={locked} onChange={(event) => patch(key, { reasonForDelay: event.target.value }, draft)} />)}
        {cell(9, memberships.length > 1 ? (
          <select className="daily-status" aria-label="Team" value={row.teamId} disabled={locked} onChange={(event) => patch(key, { teamId: event.target.value }, draft)}>
            {memberships.map((item) => <option key={item.teamId} value={item.teamId}>{item.teamName}</option>)}
          </select>
        ) : <span>{memberships[0]?.teamName || '—'}</span>)}
        {cell(10, (
          <select className="daily-status" aria-label="Work type" value={row.workType} disabled={locked} onChange={(event) => patch(key, { workType: event.target.value }, draft)}>
            {(lookups.workTypes || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        ))}
        {cell(11, <textarea className="daily-cell-input" rows={2} aria-label="Morning work completed" value={row.morningWork} disabled={locked} onChange={(event) => patch(key, { morningWork: event.target.value }, draft)} />)}
        {cell(12, <textarea className="daily-cell-input" rows={2} aria-label="Evening work completed" value={row.eveningWork} disabled={locked} onChange={(event) => patch(key, { eveningWork: event.target.value }, draft)} />)}
        {cell(13, <input className="daily-cell-input" type="number" min="0" max="100" aria-label="Progress percentage" value={row.progress} disabled={locked} onChange={(event) => patch(key, { progress: event.target.value }, draft)} />)}
        {cell(14, <input className="daily-cell-input" aria-label="Next action" value={row.nextAction} disabled={locked} onChange={(event) => patch(key, { nextAction: event.target.value }, draft)} />)}
        {cell(15, (
          <select className="daily-status" aria-label="Priority" value={row.priority} disabled={locked} onChange={(event) => patch(key, { priority: event.target.value }, draft)}>
            {Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ))}
        {cell(16, <span className="daily-date">{displayDate(row.workDate) || 'DD-MM-YYYY'}<input type="date" aria-label="Report date" value={row.workDate} disabled={locked} onChange={(event) => patch(key, { workDate: event.target.value }, draft)} /></span>)}
        {cell(17, (
          <select className="daily-status" aria-label="Period" value={row.period} disabled={locked || Boolean(row.id)} onChange={(event) => patch(key, { period: event.target.value }, draft)}>
            <option value="MORNING">Morning</option>
            <option value="EVENING">Evening</option>
          </select>
        ))}
        <td data-row={rowIndex} data-col={18} className="daily-actions">
          {fieldErrors.form ? <small className="daily-cell-error">{fieldErrors.form}</small> : null}
          {confirmId === key ? (
            <div className="daily-inline-confirm">
              <span>Delete this row?</span>
              <button type="button" onClick={() => setConfirmId('')}>Cancel</button>
              <button type="button" onClick={() => {
                if (draft) {
                  setDrafts((current) => current.filter((item) => item.key !== row.key));
                  setConfirmId('');
                  return;
                }
                onDelete(row.id).then(() => setConfirmId('')).catch((error) => {
                  setErrors((current) => ({ ...current, [key]: { form: error.message } }));
                  setConfirmId('');
                });
              }}>Delete</button>
            </div>
          ) : (
            <>
              {dirty[key] ? <button type="button" onClick={() => saveRows([row])} disabled={saving}>Save</button> : null}
              {draft || row.canDelete ? <button type="button" onClick={() => setConfirmId(key)}>Delete</button> : null}
            </>
          )}
        </td>
      </tr>
    );
  }

  const visual = [...drafts];
  groups.forEach(([, items]) => items.forEach((row) => visual.push(row)));
  visualRows.current = visual;
  return (
    <div className="daily-sheet-wrap">
      <p className="daily-sheet-note" aria-live="polite">
        {saving ? 'Saving…' : notice || (dirtyCount ? `${dirtyCount} unsaved ${dirtyCount === 1 ? 'change' : 'changes'}` : 'Click a cell to edit. Tab, Enter, and arrow keys move between cells.')}
      </p>
      <div className="daily-scroll" ref={scroller} onKeyDown={onKeyDown} onPaste={onPaste}>
        <datalist id="daily-project-list">
          <option value="No project" />
          {lookups.projects.map((item) => <option key={item.id} value={item.name} />)}
        </datalist>
        <table className="daily-sheet">
          <colgroup>
            {widths.map((width, index) => <col key={COLUMNS[index][0]} style={{ width }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map(([key, label], index) => (
                <th key={key} className={index === 0 ? 'is-sticky' : ''}>
                  {['workDate', 'employee', 'project', 'status', 'deadline'].includes(key) ? (
                    <button type="button" className={sort.key === key ? 'is-active' : ''} onClick={() => setSort((current) => ({ key, dir: current.key === key ? -current.dir : 1 }))}>{label}</button>
                  ) : label}
                  <span className="col-resize" onMouseDown={(event) => startResize(event, index)} />
                </th>
              ))}
            </tr>
          </thead>
          {!flat.length ? (
            <tbody><tr className="daily-empty"><td colSpan={COLUMNS.length}>{emptyLabel}</td></tr></tbody>
          ) : null}
          {drafts.length ? <tbody>{drafts.map((row) => renderRow(row, visual.findIndex((item) => rowIdentity(item) === rowIdentity(row)), true))}</tbody> : null}
          {groups.map(([label, items]) => (
            <tbody key={label}>
              <tr className="daily-group"><td colSpan={COLUMNS.length}><strong>{label}</strong><span>{items.length}</span></td></tr>
              {items.map((row) => renderRow(row, visual.findIndex((item) => rowIdentity(item) === rowIdentity(row)), false))}
            </tbody>
          ))}
        </table>
      </div>
    </div>
  );
});
