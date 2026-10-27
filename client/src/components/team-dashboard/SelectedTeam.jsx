import { Link } from 'react-router-dom';

export function SelectedTeam({ team, snapshot }) {
  const facts = [
    [`${snapshot.members}`, 'Members'],
    [`${snapshot.projects}`, 'Projects'],
    [`${snapshot.activeTasks}`, 'Active Tasks'],
    [`${snapshot.completion}%`, 'Completion'],
  ];

  return (
    <header className="team-selected" aria-live="polite">
      <h2><Link to={`/teams/${team.id}`}>{team.name}</Link></h2>
      <ul>
        {facts.map(([value, label]) => (
          <li key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </header>
  );
}
