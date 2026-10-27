import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import {
  checkIn,
  checkOut,
  createTimeEntry,
  deleteTimeEntry,
  endBreak,
  getTimeCatalog,
  exportTimesheet,
  getTimesheet,
  startBreak,
} from '../../services/time.service';
import {
  ATTENDANCE_LABEL,
  buildLog,
  formatClock,
  formatMinutes,
  formatSlash,
  isoToday,
  localStamp,
  longDate,
  shiftIso,
  timeZone,
  weekdayName,
} from './timeModel';

function LogTimeDialog({ open, date, lookups, busy, onClose, onSubmit }) {
  const [form, setForm] = useState({ projectId: '', taskId: '', start: '09:00', end: '10:00', description: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ projectId: '', taskId: '', start: '09:00', end: '10:00', description: '' });
      setError('');
    }
  }, [open]);

  const tasks = (lookups.tasks || []).filter((task) => !form.projectId || task.projectId === form.projectId);
  const startAt = localStamp(date, form.start);
  const endAt = localStamp(date, form.end);
  const minutes = Math.round((new Date(endAt) - new Date(startAt)) / 60000);

  function chooseTask(taskId) {
    const task = (lookups.tasks || []).find((item) => item.id === taskId);
    setForm((current) => ({
      ...current,
      taskId,
      projectId: task?.projectId || current.projectId,
    }));
  }

  function submit(event) {
    event.preventDefault();
    if (!form.description.trim()) {
      setError('Description is required.');
      return;
    }
    if (!(minutes > 0)) {
      setError('End time must be after the start time.');
      return;
    }
    onSubmit({
      projectId: form.projectId || undefined,
      taskId: form.taskId || undefined,
      date,
      startAt,
      endAt,
      description: form.description.trim(),
      timeZone: timeZone(),
    });
  }

  return (
    <Modal open={open} title="Log time" onClose={onClose} className="time-dialog">
      <form className="time-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">Project</span>
          <select className="select" value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value, taskId: '' })}>
            <option value="">No project</option>
            {(lookups.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Task</span>
          <select className="select" value={form.taskId} onChange={(event) => chooseTask(event.target.value)}>
            <option value="">No task</option>
            {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Date</span>
          <input className="input" value={formatSlash(date)} disabled />
        </label>
        <div className="time-form__times">
          <label className="field">
            <span className="field__label">Start time</span>
            <input className="input" type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">End time</span>
            <input className="input" type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
          </label>
        </div>
        <p className="time-duration">Duration {minutes > 0 ? formatMinutes(minutes) : '—'}</p>
        <label className="field">
          <span className="field__label">Description</span>
          <textarea className="input" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What did you work on?" />
        </label>
        {error ? <p className="time-error">{error}</p> : null}
        <div className="time-form__actions">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" loading={busy}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

export function TimesheetPanel({ userId, onUserChange }) {
  const { push } = useToast();
  const [date, setDate] = useState(isoToday());
  const [day, setDay] = useState(null);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [logging, setLogging] = useState(false);
  const [breakName, setBreakName] = useState('Break');
  const [people, setPeople] = useState([]);

  const load = useCallback(() => {
    setStatus('loading');
    return getTimesheet(date, { userId, timeZone: timeZone() })
      .then((result) => {
        setDay(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [date, push, userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!day?.access?.canViewTeam) return undefined;
    let active = true;
    getTimeCatalog().then((result) => {
      if (active) setPeople(result.data.people || []);
    }).catch(() => {});
    return () => { active = false; };
  }, [day?.access?.canViewTeam]);

  function apply(request) {
    setBusy(true);
    return request
      .then((result) => {
        if (result?.data?.session || result?.data?.date) setDay(result.data);
        else load();
      })
      .catch((error) => push({ tone: 'danger', message: error.message }))
      .finally(() => setBusy(false));
  }

  const summary = day?.summary || {};
  const access = day?.access || {};
  const log = day ? buildLog(day) : [];
  const isToday = date === (day?.today || isoToday());

  return (
    <div className="time-sheet">
      <div className="time-nav">
        <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setDate(shiftIso(date, -1))}><ChevronLeft size={18} /></button>
        <label className="time-nav__date">
          <span>{isToday ? 'Today' : weekdayName(date)} · {formatSlash(date)}</span>
          <input type="date" aria-label="Timesheet date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </label>
        <button type="button" className="icon-button" aria-label="Next day" onClick={() => setDate(shiftIso(date, 1))}><ChevronRight size={18} /></button>
        {day?.access?.canExport ? (
          <>
            <Button variant="secondary" onClick={() => exportTimesheet({ from: day.week?.[0]?.date || date, to: day.week?.[6]?.date || date, userId, timeZone: timeZone() }, 'excel').catch((error) => push({ tone: 'danger', message: error.message }))}>Export Excel</Button>
            <Button variant="secondary" onClick={() => exportTimesheet({ from: day.week?.[0]?.date || date, to: day.week?.[6]?.date || date, userId, timeZone: timeZone() }, 'pdf').catch((error) => push({ tone: 'danger', message: error.message }))}>Export PDF</Button>
          </>
        ) : null}
        {people.length > 1 ? (
          <select className="select" aria-label="Employee" value={userId || day?.userId || ''} onChange={(event) => onUserChange(event.target.value)}>
            {people.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
          </select>
        ) : null}
      </div>

      {status === 'error' ? <ErrorState title="Unable to load the timesheet." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'loading' && !day ? <div className="time-skeleton" /> : null}

      {day ? (
        <>
          <section className="time-stats">
            <div><span>Today</span><strong>{longDate(date)}</strong></div>
            <div><span>On site</span><strong>{day.session ? formatMinutes(summary.spanMinutes) : '—'}</strong></div>
            <div><span>Logged</span><strong>{formatMinutes(day.loggedMinutes)}</strong></div>
            <div><span>Status</span><strong>{ATTENDANCE_LABEL[summary.status] || 'Not checked in'}</strong></div>
          </section>

          <section className="time-card">
            <div className="time-card__copy">
              <Clock size={18} />
              <div>
                <strong>{ATTENDANCE_LABEL[summary.status]}</strong>
                <p>
                  {summary.status === 'NOT_CHECKED_IN'
                    ? (access.canCheckIn ? 'Check in when you start work. Check out or take a break when you step away.' : 'No attendance recorded for this date.')
                    : summary.status === 'CHECKED_IN'
                      ? (day.openBreak ? `Break started · ${day.openBreak.type}` : 'You are checked in. Check out when you finish for the day.')
                      : `Checked out at ${formatClock(day.session?.checkOut)}. Total logged time ${formatMinutes(summary.workedMinutes)}.`}
                </p>
              </div>
            </div>
            <div className="time-card__actions">
              {access.canCheckIn ? <Button onClick={() => apply(checkIn({ date, timeZone: timeZone(), userId }))} loading={busy}>Check in</Button> : null}
              {access.canBreak && !day.openBreak ? (
                <>
                  <input className="input" aria-label="Break name" value={breakName} onChange={(event) => setBreakName(event.target.value)} />
                  <Button variant="secondary" onClick={() => apply(startBreak({ date, type: breakName || 'Break', timeZone: timeZone() }))} disabled={busy}>Start Break</Button>
                </>
              ) : null}
              {day.openBreak && access.canBreak ? <Button variant="secondary" onClick={() => apply(endBreak(day.openBreak.id))} disabled={busy}>End Break</Button> : null}
              {access.canCheckOut ? <Button onClick={() => apply(checkOut({ date, timeZone: timeZone(), userId }))} loading={busy}>Check out</Button> : null}
            </div>
          </section>

          <section className="time-summary">
            <h2>Daily summary</h2>
            <dl>
              <div><dt>Working time</dt><dd>{formatMinutes(summary.workedMinutes)}</dd></div>
              <div><dt>Break time</dt><dd>{formatMinutes(summary.breakMinutes)}</dd></div>
              <div><dt>Total span</dt><dd>{formatMinutes(summary.spanMinutes)}</dd></div>
              <div><dt>Check-in</dt><dd>{formatClock(day.session?.checkIn)}</dd></div>
              <div><dt>Check-out</dt><dd>{formatClock(day.session?.checkOut)}</dd></div>
              <div><dt>Attendance status</dt><dd>{ATTENDANCE_LABEL[summary.status]}</dd></div>
            </dl>
            {(day.breaks || []).length ? (
              <div className="time-breaks">
                <h3>Breaks</h3>
                <ul>
                  {day.breaks.map((item) => (
                    <li key={item.id}>{item.type} — {item.endTime ? formatMinutes(item.durationMinutes) : 'In progress'}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="time-week">
            {(day.week || []).map((item) => (
              <button key={item.date} type="button" className={item.date === date ? 'is-active' : ''} onClick={() => setDate(item.date)}>
                <span>{weekdayName(item.date)}</span>
                <strong>{Number(item.date.slice(8))}</strong>
                <i className={`time-dot time-dot--${item.indicator}`} aria-label={item.indicator} />
              </button>
            ))}
          </section>
          <p className="time-week-total">Week total <strong>{formatMinutes(day.weekTotalMinutes)}</strong></p>

          <section className="time-log">
            <header>
              <h2>Day log</h2>
              {access.canLog ? <Button onClick={() => setLogging(true)}><Plus size={16} /> Log time</Button> : null}
            </header>
            {log.length ? (
              <ol>
                {log.map((item) => (
                  <li key={item.id}>
                    <time>{formatClock(item.at)}</time>
                    <span>{item.text}</span>
                    {item.entry && access.canEdit ? (
                      <button type="button" onClick={() => apply(deleteTimeEntry(item.id).then(() => load()))}>Delete</button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="time-muted">No time logged yet.</p>
            )}
          </section>

          <LogTimeDialog
            open={logging}
            date={date}
            lookups={day.lookups || { projects: [], tasks: [] }}
            busy={busy}
            onClose={() => { if (!busy) setLogging(false); }}
            onSubmit={(body) => {
              setBusy(true);
              createTimeEntry(body)
                .then(() => {
                  setLogging(false);
                  push({ tone: 'success', message: 'Time entry saved.' });
                  return load();
                })
                .catch((error) => push({ tone: 'danger', message: error.message }))
                .finally(() => setBusy(false));
            }}
          />
        </>
      ) : null}
    </div>
  );
}
