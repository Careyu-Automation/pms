import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GanttChart } from '../../planning/GanttChart';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { formatDate } from '../../../utils/format';
import {
  BOARD,
  MILESTONE_STATUS,
  PRIORITY,
  TASK_STATUS,
  hourText,
  hoursSummary,
  milestoneProgress,
  todayIso,
} from './model';

export function TasksPane({ tasks, access, onCreate, onEdit, onDelete }) {
  const navigate = useNavigate();
  if (!tasks.length) {
    return (
      <div className="pd-section">
        <EmptyState title="No tasks yet" description="Add the first task to start planning this project." />
        {access.canPlan ? <Button onClick={onCreate}>+ Add task</Button> : null}
      </div>
    );
  }

  return (
    <div className="pd-table-scroll">
      <table className="data-table pd-table">
        <thead>
          <tr>
            <th>Task</th>
            <th>Description</th>
            <th>Assignee</th>
            <th>Start date</th>
            <th>Due date</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Progress</th>
            <th>Estimated hours</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const priority = PRIORITY[task.priority] || { label: task.priority, tone: 'neutral' };
            const status = TASK_STATUS[task.status] || { label: task.status, tone: 'neutral' };
            return (
              <tr key={task.id} className="is-clickable" onClick={() => navigate(`/tasks/${task.id}`)}>
                <td><strong>{task.title}</strong><div className="pd-muted">{task.taskCode}</div></td>
                <td className="pd-clip">{task.description || '—'}</td>
                <td>{task.assignee || 'Unassigned'}</td>
                <td>{formatDate(task.startDate)}</td>
                <td>{formatDate(task.endDate)}</td>
                <td><Badge tone={priority.tone}>{priority.label}</Badge></td>
                <td><Badge tone={task.overdue ? 'danger' : status.tone}>{task.overdue ? 'Overdue' : status.label}</Badge></td>
                <td>
                  <div className="pd-mini">
                    <span style={{ width: `${task.progress}%` }} />
                  </div>
                  {task.progress}%
                </td>
                <td>{task.estimatedHours == null ? '—' : hourText(task.estimatedHours)}</td>
                <td className="pd-row-actions" onClick={(event) => event.stopPropagation()}>
                  <button type="button" onClick={() => navigate(`/tasks/${task.id}`)}>Open</button>
                  {access.canPlan ? <button type="button" onClick={() => onEdit(task)}>Edit</button> : null}
                  {access.canPlan ? <button type="button" onClick={() => onDelete(task)}>Delete</button> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BoardPane({ tasks, access, onStatus }) {
  const navigate = useNavigate();

  function drop(event, status) {
    event.preventDefault();
    if (!access.canPlan) return;
    const id = event.dataTransfer.getData('text/plain');
    const task = tasks.find((item) => item.id === id);
    if (task && task.status !== status) onStatus(task, status);
  }

  return (
    <div className="pd-board">
      {BOARD.map((column) => {
        const cards = tasks.filter((task) => column.match.includes(task.status));
        return (
          <section
            key={column.id}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => drop(event, column.status)}
          >
            <header><h2>{column.label}</h2><span>{cards.length}</span></header>
            {cards.map((task) => {
              const priority = PRIORITY[task.priority] || { label: task.priority, tone: 'neutral' };
              return (
                <article
                  key={task.id}
                  draggable={access.canPlan}
                  onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
                  onClick={() => navigate(`/tasks/${task.id}`)}
                >
                  <strong>{task.title}</strong>
                  <span>{task.assignee || 'Unassigned'}</span>
                  <Badge tone={priority.tone}>{priority.label}</Badge>
                  <span>Due: {formatDate(task.endDate)}</span>
                  <div className="pd-mini" aria-hidden="true"><span style={{ width: `${task.progress}%` }} /></div>
                  <small>{task.progress}%</small>
                  {access.canPlan ? (
                    <select
                      className="select"
                      value={column.status}
                      aria-label={`${task.title} status`}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => onStatus(task, event.target.value)}
                    >
                      {BOARD.map((item) => <option key={item.id} value={item.status}>{item.label}</option>)}
                    </select>
                  ) : null}
                </article>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

export function TimelinePane({ project, plan, onSchedule, onOpenTask, onOpenMilestone }) {
  const [mode, setMode] = useState('week');
  const [dayWidth, setDayWidth] = useState(18);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const tasks = plan?.tasks || [];
  const phases = plan?.phases || [];

  if (!tasks.length && !(plan?.milestones || []).length) {
    return (
      <div className="pd-section">
        <EmptyState title="No tasks yet" description="Add the first task to start planning this project." />
      </div>
    );
  }

  return (
    <div className="pd-timeline">
      <div className="pd-cal-tools">
        {['day', 'week', 'month'].map((item) => (
          <button key={item} type="button" className={mode === item ? 'is-active' : ''} onClick={() => {
            setMode(item);
            setDayWidth(item === 'day' ? 32 : item === 'month' ? 8 : 18);
          }}
          >{item}</button>
        ))}
      </div>
      <GanttChart
        project={project}
        phases={phases}
        tasks={tasks}
        milestones={plan.milestones || []}
        dependencies={plan.dependencies || []}
        mode={mode}
        dayWidth={dayWidth}
        collapsed={collapsed}
        hideEmpty={false}
        command={null}
        onDayWidth={setDayWidth}
        onTogglePhase={(id) => setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })}
        onOpenTask={onOpenTask}
        onSchedule={onSchedule}
        onOpenMilestone={onOpenMilestone}
      />
    </div>
  );
}

function isoFromDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function CalendarPane({ tasks, milestones, access, onCreate, onOpenTask }) {
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState('month');
  const events = useMemo(() => {
    const map = new Map();
    function add(date, event) {
      if (!date) return;
      const list = map.get(date) || [];
      list.push(event);
      map.set(date, list);
    }
    tasks.forEach((task) => add(task.endDate, { id: task.id, kind: 'task', title: task.title, assignee: task.assignee || 'Unassigned', status: task.status, date: task.endDate }));
    milestones.forEach((item) => add(item.date, { id: item.id, kind: 'milestone', title: item.name, assignee: item.owner || 'Unassigned', status: item.status, date: item.date }));
    return map;
  }, [milestones, tasks]);

  function shift(step) {
    const next = new Date(cursor);
    if (mode === 'month') next.setMonth(next.getMonth() + step);
    else if (mode === 'week') next.setDate(next.getDate() + step * 7);
    else next.setDate(next.getDate() + step);
    setCursor(next);
  }

  const days = useMemo(() => {
    if (mode === 'day') return [new Date(cursor)];
    if (mode === 'week') {
      const start = new Date(cursor);
      const day = start.getDay();
      start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
      return Array.from({ length: 7 }, (_, index) => {
        const date = new Date(start);
        date.setDate(start.getDate() + index);
        return date;
      });
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    const day = start.getDay();
    start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor, mode]);

  const title = cursor.toLocaleDateString(undefined, mode === 'day'
    ? { dateStyle: 'full' }
    : { month: 'long', year: 'numeric' });

  return (
    <div className="pd-calendar">
      <div className="pd-cal-tools">
        <button type="button" onClick={() => shift(-1)}>Previous</button>
        <strong>{title}</strong>
        <button type="button" onClick={() => setCursor(new Date())}>Today</button>
        <button type="button" onClick={() => shift(1)}>Next</button>
        {['month', 'week', 'day'].map((item) => (
          <button key={item} type="button" className={mode === item ? 'is-active' : ''} onClick={() => setMode(item)}>{item}</button>
        ))}
      </div>
      <div className={mode === 'month' ? 'pd-month' : 'pd-week'}>
        {mode === 'month' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => <div key={label} className="pd-dow">{label}</div>) : null}
        {days.map((date) => {
          const key = isoFromDate(date);
          const list = events.get(key) || [];
          const outside = mode === 'month' && date.getMonth() !== cursor.getMonth();
          return (
            <div key={key} className={outside ? 'is-outside' : ''}>
              <header>
                <span>{date.getDate()}</span>
                {access.canPlan ? <button type="button" onClick={() => onCreate({ startDate: key, endDate: key })}>Add</button> : null}
              </header>
              {list.map((event) => (
                <button
                  key={`${event.kind}-${event.id}`}
                  type="button"
                  className={event.kind === 'milestone' ? 'is-milestone' : ''}
                  onClick={() => (event.kind === 'task' ? onOpenTask(event.id) : null)}
                >
                  <strong>{event.title}</strong>
                  <span>{event.assignee}</span>
                  <span>{formatDate(event.date)} · {(event.kind === 'milestone' ? MILESTONE_STATUS[event.status]?.label : TASK_STATUS[event.status]?.label) || event.status}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HoursPane({ tasks, entries, users, access, onLog, onDelete, busy }) {
  const summary = hoursSummary(tasks, entries);
  const [form, setForm] = useState({
    userId: '',
    taskId: '',
    hours: '',
    workDate: todayIso(),
    billable: true,
    note: '',
  });
  const members = useMemo(() => {
    const map = new Map();
    entries.forEach((entry) => {
      const current = map.get(entry.userId || entry.userName) || { name: entry.userName, hours: 0, tasks: new Set(), date: entry.workDate };
      current.hours += Number(entry.hours) || 0;
      if (entry.taskTitle) current.tasks.add(entry.taskTitle);
      if (entry.workDate > current.date) current.date = entry.workDate;
      map.set(entry.userId || entry.userName, current);
    });
    return [...map.values()];
  }, [entries]);

  return (
    <div className="pd-hours">
      <section className="pd-section">
        <h2>Time summary</h2>
        <dl className="pd-health">
          <div><dt>Total hours</dt><dd>{hourText(summary.actual)}</dd></div>
          <div><dt>Billable hours</dt><dd>{hourText(summary.billable)}</dd></div>
          <div><dt>Non-billable hours</dt><dd>{hourText(summary.nonBillable)}</dd></div>
          <div><dt>Estimated</dt><dd>{hourText(summary.estimated)}</dd></div>
          <div><dt>Actual</dt><dd>{hourText(summary.actual)}</dd></div>
          <div><dt>Remaining</dt><dd>{hourText(summary.remaining)}</dd></div>
          <div><dt>Variance</dt><dd>{hourText(summary.variance)}</dd></div>
        </dl>
      </section>
      <section className="pd-section">
        <h2>Member breakdown</h2>
        {members.length ? (
          <div className="pd-table-scroll">
            <table className="data-table">
              <thead><tr><th>Member</th><th>Hours logged</th><th>Tasks</th><th>Date</th></tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.name}>
                    <td>{member.name}</td>
                    <td>{hourText(member.hours)}</td>
                    <td>{member.tasks.size}</td>
                    <td>{formatDate(member.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="pd-muted">No hours have been logged on this project.</p>}
      </section>
      {access.canPlan ? (
        <section className="pd-section">
          <h2>Log hours</h2>
          <form className="pd-form-grid" onSubmit={async (event) => {
            event.preventDefault();
            const saved = await onLog(form);
            if (saved) setForm((current) => ({ ...current, hours: '', note: '' }));
          }}
          >
            <label className="field">
              <span className="field__label">Member</span>
              <select className="select" value={form.userId} onChange={(event) => setForm({ ...form, userId: event.target.value })}>
                <option value="">Me</option>
                {users.map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Task</span>
              <select className="select" value={form.taskId} onChange={(event) => setForm({ ...form, taskId: event.target.value })}>
                <option value="">Project time</option>
                {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Hours</span>
              <input className="input" required type="number" min="0.5" max="24" step="0.5" value={form.hours} onChange={(event) => setForm({ ...form, hours: event.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">Date</span>
              <input className="input" required type="date" value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} />
            </label>
            <label className="field pd-check">
              <input type="checkbox" checked={form.billable} onChange={(event) => setForm({ ...form, billable: event.target.checked })} />
              <span>Billable</span>
            </label>
            <div className="lead-actions">
              <Button type="submit" loading={busy}>Log hours</Button>
            </div>
          </form>
        </section>
      ) : null}
      {entries.length ? (
        <div className="pd-table-scroll">
          <table className="data-table">
            <thead><tr><th>Member</th><th>Task</th><th>Date</th><th>Hours</th><th>Type</th><th /></tr></thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.userName}</td>
                  <td>{entry.taskTitle || 'Project'}</td>
                  <td>{formatDate(entry.workDate)}</td>
                  <td>{hourText(entry.hours)}</td>
                  <td>{entry.billable ? 'Billable' : 'Non-billable'}</td>
                  <td>{access.canPlan ? <button type="button" className="pd-text" onClick={() => onDelete(entry)}>Delete</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function MilestonesPane({ milestones, access, onCreate, onEdit, onDelete }) {
  if (!milestones.length) {
    return (
      <div className="pd-section">
        <EmptyState title="No milestones yet" description="Add a milestone to mark a delivery point on this project." />
        {access.canPlan ? <Button onClick={onCreate}>+ Add milestone</Button> : null}
      </div>
    );
  }

  return (
    <div className="pd-table-scroll">
      <table className="data-table pd-table">
        <thead>
          <tr><th>Milestone</th><th>Due date</th><th>Owner</th><th>Status</th><th>Progress</th><th /></tr>
        </thead>
        <tbody>
          {milestones.map((item) => {
            const meta = MILESTONE_STATUS[item.status] || { label: item.status, tone: 'neutral' };
            return (
              <tr key={item.id}>
                <td><strong>{item.name}</strong>{item.description ? <div className="pd-muted">{item.description}</div> : null}</td>
                <td>{formatDate(item.date)}</td>
                <td>{item.owner || 'Unassigned'}</td>
                <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                <td>{milestoneProgress(item.status)}%</td>
                <td className="pd-row-actions">
                  {access.canPlan ? <button type="button" onClick={() => onEdit(item)}>Edit</button> : null}
                  {access.canPlan ? <button type="button" onClick={() => onDelete(item)}>Delete</button> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
