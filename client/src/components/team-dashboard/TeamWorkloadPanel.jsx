export function TeamWorkloadPanel({ workload, filtered = false }) {
  const segments = [
    ['completed', 'Completed', workload.completed],
    ['progress', 'In Progress', workload.inProgress],
    ['pending', 'Pending', workload.pending],
    ['overdue', 'Overdue', workload.overdue],
  ];
  const total = workload.assigned || 1;

  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Team Workload</h2>
      </header>
      {workload.assigned === 0 ? (
        <p className="team-note">{filtered ? 'No tasks match these filters.' : 'No active tasks for this team.'}</p>
      ) : (
        <>
          <div className="stack" aria-hidden="true">
            {segments.map(([key, , value]) => (
              <span key={key} className={`stack__${key}`} style={{ width: `${(value / total) * 100}%` }} />
            ))}
          </div>
          <ul className="stack-legend">
            <li>
              <span>Assigned</span>
              <strong>{workload.assigned}</strong>
            </li>
            {segments.map(([key, label, value]) => (
              <li key={key}>
                <span><i className={`stack__dot stack__${key}`} />{label}</span>
                <strong>{value}</strong>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
