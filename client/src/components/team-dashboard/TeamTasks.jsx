import { ListTodo } from 'lucide-react';
import { TASK_STATUSES } from '../../data/teamDashboardModel';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { priorityTone, statusTone } from '../dashboard/tones';

export function TeamTasks({ tasks, status, filtered, onStatus }) {
  const emptyTitle = filtered ? 'No tasks match these filters.' : 'No active tasks for this team.';
  const seen = new Set();
  const rows = tasks.filter((task) => {
    const id = String(task.id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Team Tasks</h2>
        <div className="task-chips" role="tablist" aria-label="Task status">
          {TASK_STATUSES.map((item) => {
            const value = item === 'All' ? 'all' : item;
            return (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={status === value}
                className={status === value ? 'is-selected' : undefined}
                onClick={() => onStatus(value)}
              >
                {item}
              </button>
            );
          })}
        </div>
      </header>
      {rows.length === 0 ? (
        <EmptyState compact icon={ListTodo} title={emptyTitle} description="Tasks assigned to this team will be listed here." />
      ) : (
        <div className="table-scroll team-task-scroll">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Assigned To</th>
                <th>Priority</th>
                <th>Due Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((task) => (
                <tr key={task.id}>
                  <td>{task.title}</td>
                  <td>{task.projectName}</td>
                  <td>{task.assignee}</td>
                  <td><Badge tone={priorityTone(task.priority)}>{task.priority}</Badge></td>
                  <td>{task.due}</td>
                  <td><Badge tone={statusTone(task.status)}>{task.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
