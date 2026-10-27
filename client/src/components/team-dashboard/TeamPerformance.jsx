export function TeamPerformance({ performance, filtered = false }) {
  const counts = [
    ['Completed', performance.completed],
    ['Pending', performance.pending],
    ['Overdue', performance.overdue],
  ];
  const max = Math.max(1, ...counts.map(([, value]) => value));

  return (
    <section className="team-panel">
      <header className="team-panel__header">
        <h2>Team Performance</h2>
      </header>
      {performance.assigned === 0 ? (
        <p className="team-note">{filtered ? 'No tasks match these filters.' : 'No active tasks for this team.'}</p>
      ) : (
        <ul className="perf">
          {counts.map(([label, value]) => (
            <li key={label}>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="progress" aria-hidden="true">
                <div className="progress__bar" style={{ width: `${(value / max) * 100}%` }} />
              </div>
            </li>
          ))}
          <li>
            <div>
              <span>Average completion</span>
              <strong>{performance.average}%</strong>
            </div>
            <div className="progress" aria-hidden="true">
              <div className="progress__bar" style={{ width: `${performance.average}%` }} />
            </div>
          </li>
          <li>
            <div>
              <span>Projects supported</span>
              <strong>{performance.projects}</strong>
            </div>
            <div className="progress" aria-hidden="true">
              <div className="progress__bar" style={{ width: `${Math.min(100, (performance.projects / 8) * 100)}%` }} />
            </div>
          </li>
        </ul>
      )}
    </section>
  );
}
