import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TASK_STATUS, barStyle, diffDays, parseDate, taskTone, timelineColumns, timelineRange, todayIso } from './planningModel';

const LABEL_WIDTH = 360;
const TASK_HEIGHT = 40;
const PHASE_HEIGHT = 32;

export function GanttChart({
  project,
  phases = [],
  tasks = [],
  milestones = [],
  dependencies = [],
  mode,
  dayWidth,
  collapsed,
  hideEmpty,
  command,
  onDayWidth,
  onTogglePhase,
  onOpenTask,
  onSchedule,
  onOpenMilestone,
}) {
  const scrollRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const range = useMemo(
    () => timelineRange(project, tasks, milestones, mode),
    [project, tasks, milestones, mode],
  );
  const columns = useMemo(() => timelineColumns(range, mode, dayWidth), [range, mode, dayWidth]);
  const timelineWidth = Math.max(diffDays(range.start, range.end) + 1, 1) * dayWidth;
  const today = todayIso();
  const todayX = diffDays(range.start, today) * dayWidth;
  const showToday = today >= range.start && today <= range.end;

  const rows = useMemo(() => {
    const built = [];
    const grouped = new Map();
    tasks.forEach((task) => {
      const key = task.phaseId || 'none';
      const list = grouped.get(key) || [];
      list.push(task);
      grouped.set(key, list);
    });
    phases.forEach((phase) => {
      const children = grouped.get(phase.id) || [];
      if (hideEmpty && !children.length) return;
      built.push({ type: 'phase', id: phase.id, phase, height: PHASE_HEIGHT });
      if (!collapsed.has(phase.id)) {
        children.forEach((task) => built.push({ type: 'task', id: task.id, task, height: TASK_HEIGHT }));
      }
    });
    const loose = grouped.get('none') || [];
    if (loose.length) {
      if (phases.length) built.push({ type: 'phase', id: 'none', phase: { id: 'none', name: 'Unassigned' }, height: PHASE_HEIGHT });
      if (!collapsed.has('none')) {
        loose.forEach((task) => built.push({ type: 'task', id: task.id, task, height: TASK_HEIGHT }));
      }
    }
    if (milestones.length) built.push({ type: 'milestones', id: 'milestones', height: TASK_HEIGHT });
    return built;
  }, [collapsed, hideEmpty, milestones.length, phases, tasks]);

  const rowIndex = useMemo(() => {
    const map = new Map();
    let y = 0;
    rows.forEach((row) => {
      if (row.type === 'task') map.set(row.task.id, { y: y + row.height / 2, height: row.height, top: y });
      y += row.height;
    });
    return { map, height: y };
  }, [rows]);

  useEffect(() => {
    if (!command || !scrollRef.current) return;
    if (command.type === 'today') {
      scrollRef.current.scrollLeft = Math.max(0, LABEL_WIDTH + todayX - 120);
    }
    if (command.type === 'fit') {
      const available = scrollRef.current.clientWidth - LABEL_WIDTH - 24;
      const days = Math.max(diffDays(range.start, range.end) + 1, 1);
      onDayWidth(Math.max(6, Math.min(42, available / days)));
    }
  }, [command, onDayWidth, range.end, range.start, todayX]);

  function datesFor(task) {
    if (draft?.id === task.id) return { startDate: draft.start, endDate: draft.end };
    return task;
  }

  function beginDrag(event, task, edge) {
    event.preventDefault();
    event.stopPropagation();
    const originX = event.clientX;
    const snapshot = { start: task.startDate, end: task.endDate };
    let latest = snapshot;
    let moved = false;
    function move(pointer) {
      const days = Math.round((pointer.clientX - originX) / dayWidth);
      if (Math.abs(pointer.clientX - originX) > 4) moved = true;
      let start = snapshot.start;
      let end = snapshot.end;
      if (edge === 'move') {
        start = shift(snapshot.start, days);
        end = shift(snapshot.end, days);
      } else if (edge === 'start') {
        start = shift(snapshot.start, days);
        if (start > end) start = end;
      } else {
        end = shift(snapshot.end, days);
        if (end < start) end = start;
      }
      latest = { start, end };
      setDraft({ id: task.id, ...latest });
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDraft(null);
      if (!moved && edge === 'move') onOpenTask(task);
      else if (moved && (latest.start !== snapshot.start || latest.end !== snapshot.end)) onSchedule(task, latest.start, latest.end);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return (
    <div className="gantt-scroll" ref={scrollRef}>
      <div className="gantt-sheet" style={{ width: LABEL_WIDTH + timelineWidth }}>
        <div className="gantt-head">
          <div className="gantt-freeze gantt-freeze--head">
            <span>Task</span>
            <span>Assignee</span>
            <span>Status</span>
          </div>
          <div className="gantt-scale" style={trackBox(timelineWidth)}>
            {columns.map((column) => (
              <div key={column.key} className="gantt-col" style={columnBox(column.width)}>
                <strong>{column.label}</strong>
                {column.sub ? <small>{column.sub}</small> : null}
              </div>
            ))}
            {showToday ? <div className="gantt-today gantt-today--head" style={{ left: todayX }}><span>Today</span></div> : null}
          </div>
        </div>
        <div className="gantt-body">
          <div className="gantt-grid" style={{ ...trackBox(timelineWidth), height: rowIndex.height }} aria-hidden="true">
            {columns.map((column) => <span key={column.key} style={columnBox(column.width)} />)}
          </div>
          {rows.map((row, index) => {
            if (row.type === 'phase') {
              const open = !collapsed.has(row.phase.id);
              return (
                <div key={row.id} className="gantt-row gantt-row--phase" style={rowBox(row.height)}>
                  <button type="button" className="gantt-freeze gantt-phase" onClick={() => onTogglePhase(row.phase.id)}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span>{row.phase.name}</span>
                  </button>
                  <div className="gantt-track" style={trackBox(timelineWidth)} />
                </div>
              );
            }
            if (row.type === 'milestones') {
              return (
                <div key="milestones" className="gantt-row" style={rowBox(row.height)}>
                  <div className="gantt-freeze gantt-phase"><span>Milestones</span></div>
                  <div className="gantt-track" style={trackBox(timelineWidth)}>
                    {milestones.map((item) => {
                      if (!parseDate(item.date)) return null;
                      const left = diffDays(range.start, item.date) * dayWidth;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`gantt-diamond${item.missed ? ' is-missed' : ''}${item.status === 'COMPLETED' ? ' is-done' : ''}`}
                          style={{ left }}
                          title={item.name}
                          onClick={() => onOpenMilestone(item)}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            }
            const task = row.task;
            const dated = datesFor(task);
            const scheduled = Boolean(parseDate(dated.startDate) && parseDate(dated.endDate) && dated.endDate >= dated.startDate);
            const box = scheduled ? barStyle(dated.startDate, dated.endDate, range.start, dayWidth) : null;
            const tone = taskTone({ ...task, overdue: task.overdue && draft?.id !== task.id });
            return (
              <div key={task.id} className={`gantt-row${index % 2 ? ' is-alt' : ''}`} style={rowBox(row.height)}>
                <div className="gantt-freeze">
                  <button type="button" className="gantt-task-name" onClick={() => onOpenTask(task)}>
                    <strong>{task.title}</strong>
                    <small>{task.taskCode}</small>
                  </button>
                  <span>{task.assignee || 'Unassigned'}</span>
                  <span className={`gantt-status gantt-status--${tone}`}>{!scheduled ? 'Not scheduled' : task.overdue ? 'Overdue' : TASK_STATUS[task.status] || task.status}</span>
                </div>
                <div className="gantt-track" style={trackBox(timelineWidth)}>
                  {box ? <div
                    className={`gantt-bar gantt-bar--${tone}`}
                    style={{ left: box.left, width: box.width }}
                    onPointerDown={(event) => beginDrag(event, task, 'move')}
                  >
                    <span className="gantt-bar__fill" style={{ width: `${task.progress}%` }} />
                    <em>{task.progress}%</em>
                    <button type="button" className="gantt-handle gantt-handle--start" aria-label="Change start date" onPointerDown={(event) => beginDrag(event, task, 'start')} />
                    <button type="button" className="gantt-handle gantt-handle--end" aria-label="Change end date" onPointerDown={(event) => beginDrag(event, task, 'end')} />
                  </div> : <span className="gantt-unscheduled">Not scheduled</span>}
                </div>
              </div>
            );
          })}
          {showToday ? <div className="gantt-today" style={{ left: LABEL_WIDTH + todayX, height: rowIndex.height }} /> : null}
          <svg className="gantt-links" width={timelineWidth} height={rowIndex.height} style={{ left: LABEL_WIDTH }}>
            {dependencies.map((link) => {
              const from = rowIndex.map.get(link.predecessorId);
              const to = rowIndex.map.get(link.successorId);
              if (!from || !to) return null;
              const pred = tasks.find((task) => task.id === link.predecessorId);
              const succ = tasks.find((task) => task.id === link.successorId);
              if (!pred || !succ || !parseDate(pred.startDate) || !parseDate(pred.endDate) || !parseDate(succ.startDate) || !parseDate(succ.endDate)) return null;
              const startBox = barStyle(pred.startDate, pred.endDate, range.start, dayWidth);
              const endBox = barStyle(succ.startDate, succ.endDate, range.start, dayWidth);
              const x1 = startBox.left + startBox.width;
              const x2 = endBox.left;
              const mid = x1 + Math.max(12, (x2 - x1) / 2);
              return (
                <path
                  key={link.id}
                  d={`M ${x1} ${from.y} H ${mid} V ${to.y} H ${x2}`}
                  fill="none"
                />
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

function columnBox(width) {
  return { width, flex: `0 0 ${width}px`, minWidth: width, maxWidth: width };
}

function trackBox(width) {
  return { width, flex: `0 0 ${width}px`, minWidth: width };
}

function rowBox(height) {
  return { height, minHeight: height, maxHeight: height };
}

function shift(value, days) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
