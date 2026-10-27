const TILES = [
  ['projects', 'Projects Contributed'],
  ['activeProjects', 'Active Projects'],
  ['completedProjects', 'Completed Projects'],
  ['activeTasks', 'Active Tasks'],
  ['completedTasks', 'Completed Tasks'],
  ['overdue', 'Overdue Tasks'],
  ['members', 'Team Members'],
];

export function TeamKpis({ snapshot }) {
  return (
    <section className="team-kpis" aria-label="Selected team summary">
      {TILES.map(([key, label]) => (
        <article key={key} className="team-kpi">
          <p>{label}</p>
          <strong>{snapshot[key]}</strong>
        </article>
      ))}
    </section>
  );
}
