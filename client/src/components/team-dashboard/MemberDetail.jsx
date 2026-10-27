import { Badge } from '../ui/Badge';
import { Modal } from '../ui/Modal';
import { priorityTone, statusTone } from '../dashboard/tones';

export function MemberDetail({ member, onClose }) {
  return (
    <Modal open={Boolean(member)} title={member?.name || 'Team member'} onClose={onClose} className="modal--member">
      {member ? (
        <>
          <p className="member-detail__role">{member.designation} · {member.teamName}</p>
          <ul className="member-detail__facts">
            <li><span>Projects</span><strong>{member.projectCount}</strong></li>
            <li><span>Active tasks</span><strong>{member.activeTasks}</strong></li>
            <li><span>Completed</span><strong>{member.completedTasks}</strong></li>
            <li><span>Overdue</span><strong>{member.overdueTasks}</strong></li>
            <li><span>Workload</span><strong>{member.workload}%</strong></li>
          </ul>
          <section>
            <h3>Projects</h3>
            {member.projects.length === 0 ? <p className="team-note">No projects in this view.</p> : (
              <ul className="member-detail__list">
                {member.projects.map((project) => (
                  <li key={project.id}>
                    <strong>{project.name}</strong>
                    <span>Project progress {project.progress}% · Team contribution {project.contribution}% · {project.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Tasks</h3>
            {member.tasks.length === 0 ? <p className="team-note">No tasks in this view.</p> : (
              <ul className="member-detail__list">
                {member.tasks.map((task) => (
                  <li key={task.id}>
                    <strong>{task.title}</strong>
                    <span>
                      {task.projectName}
                      <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
                      <Badge tone={statusTone(task.status)}>{task.status}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3>Recent activity</h3>
            {member.activity.length === 0 ? <p className="team-note">No recent activity for this member.</p> : (
              <ul className="member-detail__list">
                {member.activity.map((item) => (
                  <li key={item.id}>
                    <strong>{item.action}</strong>
                    <span>{item.time} · {item.projectName}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </Modal>
  );
}
