import { Link } from 'react-router-dom';
import { ListTodo } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { DashboardSection } from './DashboardSection';
import { priorityTone, statusTone } from './tones';

export function MyWork({ tasks = [] }) {
  return (
    <DashboardSection
      title="My Work"
      action={
        <Link to="/tasks" className="dash-link">
          View all tasks →
        </Link>
      }
    >
      {tasks.length === 0 ? (
        <EmptyState
          compact
          icon={ListTodo}
          title="No tasks assigned"
          description="Tasks assigned to you will appear here."
        />
      ) : (
        <div className="table-scroll">
          <table className="data-table work-table">
            <thead>
              <tr>
                <th>Task</th>
                <th>Project</th>
                <th>Due Date</th>
                <th>Priority</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.taskId ? <Link to={`/tasks/${task.taskId}`}>{task.task}</Link> : task.task}</td>
                  <td className="project-table__id">{task.project}</td>
                  <td>{task.due}</td>
                  <td>
                    <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                  </td>
                  <td>
                    <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardSection>
  );
}
