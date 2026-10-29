import { Link } from 'react-router-dom';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ProjectTeams } from './ProjectTeams';
import { MILESTONE_STATUS, PRIORITY, PROJECT_STATUS, fileKind, milestoneProgress, projectMembers, projectTeamName, scheduleLabel } from './model';
import { formatBytes, formatDate, formatDateTime } from '../../../utils/format';

export function OverviewPane({
  project,
  plan,
  access,
  editing,
  description,
  onDescription,
  onEditDescription,
  onSaveDescription,
  onCancelDescription,
  memberId,
  onMember,
  busy,
  onUpload,
  onViewFile,
  onDownloadFile,
  onDeleteFile,
}) {
  const tasks = plan?.tasks || [];
  const summary = plan?.summary;
  const milestones = plan?.milestones || [];
  const progress = summary?.progress;
  const members = projectMembers(project, tasks);
  const selected = members.find((member) => member.id === memberId);
  const memberTasks = selected ? tasks.filter((task) => task.assigneeId === selected.id) : [];
  const status = PROJECT_STATUS[project.status] || { label: project.status, tone: 'neutral' };
  const priority = PRIORITY[project.priority] || { label: project.priority, tone: 'neutral' };
  const milestoneDone = summary?.milestoneCompleted ?? milestones.filter((item) => item.status === 'COMPLETED').length;

  return (
    <div className="pd-main">
      <section className="pd-section">
        <header className="pd-section__head">
          <h2>Project summary</h2>
          {access.canEdit && !editing ? <Button size="sm" variant="secondary" onClick={onEditDescription}>Edit</Button> : null}
        </header>
        {editing ? (
          <div className="feas-stack">
            <textarea className="textarea" rows={4} value={description} onChange={(event) => onDescription(event.target.value)} />
            <div className="lead-actions">
              <Button variant="secondary" onClick={onCancelDescription}>Cancel</Button>
              <Button onClick={onSaveDescription} loading={busy}>Save</Button>
            </div>
          </div>
        ) : (
          <p className="pd-description">{project.description || 'No project description available.'}</p>
        )}
      </section>

      <section className="pd-section">
        <h2>Project progress</h2>
        <div className="pd-progress-block">
          <div className="pd-progress-label">
            <span>Overall progress</span>
            <strong>{progress == null ? 'Not assessed' : `${progress}%`}</strong>
          </div>
          <div className="pd-bar" role="progressbar" aria-valuenow={progress || 0} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress || 0}%` }} />
          </div>
        </div>
        <dl className="pd-health">
          <div><dt>Schedule</dt><dd>{scheduleLabel(summary)}</dd></div>
          <div><dt>Tasks</dt><dd>{summary ? `${summary.taskCompleted} / ${summary.taskTotal}` : '0 / 0'}</dd></div>
          <div><dt>Overdue</dt><dd>{summary?.overdue || 0}</dd></div>
          <div><dt>Milestones</dt><dd>{milestones.length ? `${milestoneDone} / ${summary?.milestoneTotal ?? milestones.length}` : '0 / 0'}</dd></div>
          <div><dt>Progress</dt><dd>{progress == null ? '—' : `${progress}%`}</dd></div>
        </dl>
      </section>

      <section className="pd-section">
        <h2>Project team</h2>
        {members.length ? (
          <ul className="pd-team">
            {members.map((member) => (
              <li key={member.id}>
                <button type="button" className={member.id === memberId ? 'is-selected' : ''} onClick={() => onMember(member.id === memberId ? '' : member.id)}>
                  <Avatar name={member.name} size="sm" />
                  <span>
                    <strong>{member.name}</strong>
                    <small>{member.role}</small>
                  </span>
                  <em>{member.taskCount} tasks · {member.progress}%</em>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="pd-muted">No members are assigned yet.</p>}
        {selected ? (
          <div className="pd-member-work">
            <h3>{selected.name}</h3>
            <p>{selected.role} · {memberTasks.length} tasks on this project · {selected.progress}% progress</p>
            {memberTasks.length ? (
              <ul>
                {memberTasks.map((task) => (
                  <li key={task.id}>
                    <Link to={`/tasks/${task.id}`}>{task.title}</Link>
                    <span>{TASK_LABEL(task)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="pd-muted">No tasks are assigned to this member on this project.</p>}
          </div>
        ) : null}
      </section>

      <ProjectTeams projectId={project.id} canEdit={access.canPlan} />

      <section className="pd-section">
        <h2>Project activity</h2>
        {(project.activity || []).length ? (
          <ol className="pd-activity">
            {project.activity.map((item) => (
              <li key={item.id}>
                <Avatar name={item.actor} size="sm" />
                <div>
                  <strong>{item.actor}</strong>
                  <span>{item.action}{item.comment ? ` · ${item.comment}` : ''}</span>
                  <time>{formatDateTime(item.createdAt)}</time>
                </div>
              </li>
            ))}
          </ol>
        ) : <EmptyState title="No activity yet" description="Project updates will appear here." />}
      </section>

      <section className="pd-section">
        <header className="pd-section__head">
          <h2>Attachments</h2>
          {access.canPlan ? (
            <label className="btn btn--secondary btn--sm">
              Upload
              <input type="file" multiple hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.dwg,.zip,.jpg,.jpeg,.png,.webp,.gif" onChange={onUpload} />
            </label>
          ) : null}
        </header>
        {(project.documents || []).length ? (
          <div className="pd-table-scroll">
            <table className="data-table pd-table">
              <thead>
                <tr><th>File name</th><th>Type</th><th>Uploaded by</th><th>Uploaded</th><th>Size</th><th /></tr>
              </thead>
              <tbody>
                {project.documents.map((file) => (
                  <tr key={file.id}>
                    <td>{file.name}</td>
                    <td>{fileKind(file.name)}</td>
                    <td>{file.uploadedBy}</td>
                    <td>{formatDate(file.createdAt)}</td>
                    <td>{formatBytes(file.sizeBytes)}</td>
                    <td className="pd-row-actions">
                      <button type="button" onClick={() => onViewFile(file)}>View</button>
                      <button type="button" onClick={() => onDownloadFile(file)}>Download</button>
                      {access.canPlan ? <button type="button" onClick={() => onDeleteFile(file)}>Delete</button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="pd-muted">No files have been added to this project.</p>}
      </section>

      {milestones.length ? (
        <section className="pd-section">
          <h2>Milestones</h2>
          <ul className="pd-points">
            {milestones.map((item) => {
              const meta = MILESTONE_STATUS[item.status] || { label: item.status, tone: 'neutral' };
              return (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{formatDate(item.date)}</span>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <span>{milestoneProgress(item.status)}%</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="pd-muted pd-source">
        Status {status.label} · Priority {priority.label}
        {project.leadCode ? <> · Source lead <Link to={`/lead-pipeline/${project.leadId}`}>{project.leadCode}</Link></> : null}
      </p>
    </div>
  );
}

function TASK_LABEL(task) {
  return task.overdue ? 'Overdue' : (task.status || '').replaceAll('_', ' ').toLowerCase();
}

export function ProjectSidebar({ project, plan }) {
  const summary = plan?.summary;
  const status = PROJECT_STATUS[project.status] || { label: project.status, tone: 'neutral' };
  const priority = PRIORITY[project.priority] || { label: project.priority, tone: 'neutral' };
  const progress = summary?.progress;
  const paymentLabel = String(project.paymentStatus || '').replaceAll('_', ' ') || 'Not recorded';

  return (
    <aside className="pd-side">
      <section>
        <h2>Details</h2>
        <dl>
          <div><dt>Project owner</dt><dd>{project.ownerName || 'Not assigned'}</dd></div>
          <div><dt>Project manager</dt><dd>{project.projectManager || 'Not assigned'}</dd></div>
          <div><dt>Team</dt><dd>{projectTeamName(project)}</dd></div>
          <div><dt>Customer</dt><dd>{project.customerName || 'Not specified'}</dd></div>
          <div><dt>Department</dt><dd>{project.department || 'Not specified'}</dd></div>
          <div><dt>Priority</dt><dd><Badge tone={priority.tone}>{priority.label}</Badge></dd></div>
          <div><dt>Status</dt><dd><Badge tone={status.tone}>{status.label}</Badge></dd></div>
          <div><dt>Lifecycle stage</dt><dd><Badge tone="info">{project.currentStage || status.label}</Badge></dd></div>
          {project.leadCode ? <div><dt>Linked lead</dt><dd><Link to={`/lead-pipeline/${project.leadId}`}>{project.leadCode}</Link></dd></div> : null}
          {project.feasibilityId ? <div><dt>Feasibility</dt><dd><Link to={`/feasibility-studies/${project.feasibilityId}`}>Open study</Link></dd></div> : null}
          {project.costingId ? <div><dt>Solution costing</dt><dd><Link to={`/solution-costing/${project.costingId}`}>{project.costingCode || 'Open costing'}</Link></dd></div> : null}
          <div><dt>Order ID</dt><dd>{project.orderCode || 'Not converted'}</dd></div>
          {project.orderCode ? <div><dt>Payment status</dt><dd>{paymentLabel}</dd></div> : null}
          <div><dt>Activation</dt><dd>{project.isActivated ? `Active · ${formatDate(project.activatedAt)}` : 'Not in Active Projects'}</dd></div>
          {project.enquiryReference ? <div><dt>Enquiry ref</dt><dd>{project.enquiryReference}</dd></div> : null}
          {project.holdReason ? <div><dt>Hold reason</dt><dd>{project.holdReason}</dd></div> : null}
          <div><dt>Created by</dt><dd>{project.createdBy || 'Not recorded'}</dd></div>
        </dl>
      </section>
      <section>
        <h2>Dates</h2>
        <dl>
          <div><dt>Order date</dt><dd>{formatDate(project.orderDate)}</dd></div>
          <div><dt>Start date</dt><dd>{formatDate(project.startDate)}</dd></div>
          <div><dt>End date</dt><dd>{formatDate(project.targetDate)}</dd></div>
          <div><dt>Created date</dt><dd>{formatDate(project.createdAt)}</dd></div>
        </dl>
      </section>
      <section>
        <h2>Progress</h2>
        <dl>
          <div><dt>Overall progress</dt><dd>{progress == null ? 'Not assessed' : `${progress}%`}</dd></div>
          <div><dt>Completed tasks</dt><dd>{summary ? `${summary.taskCompleted} / ${summary.taskTotal}` : '0 / 0'}</dd></div>
          <div><dt>Overdue tasks</dt><dd>{summary?.overdue || 0}</dd></div>
        </dl>
      </section>
    </aside>
  );
}
