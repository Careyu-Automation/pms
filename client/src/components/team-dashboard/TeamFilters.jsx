import { DATE_RANGES, PRIORITIES, TASK_STATUSES } from '../../data/teamDashboardModel';

export function TeamFilters({
  teams,
  teamId,
  projects,
  filters,
  onTeam,
  onChange,
}) {
  return (
    <div className="team-filters" aria-label="Team filters">
      <label>
        Team
        <select value={teamId} onChange={(event) => onTeam(event.target.value)}>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>{team.name}</option>
          ))}
        </select>
      </label>
      <label>
        Project
        <select value={filters.projectId} onChange={(event) => onChange({ projectId: event.target.value })}>
          <option value="all">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </label>
      <label>
        Status
        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value })}>
          {TASK_STATUSES.map((status) => (
            <option key={status} value={status === 'All' ? 'all' : status}>{status === 'All' ? 'All status' : status}</option>
          ))}
        </select>
      </label>
      <label>
        Priority
        <select value={filters.priority} onChange={(event) => onChange({ priority: event.target.value })}>
          {PRIORITIES.map((priority) => (
            <option key={priority} value={priority === 'All' ? 'all' : priority}>{priority === 'All' ? 'All priority' : priority}</option>
          ))}
        </select>
      </label>
      <label>
        Date range
        <select value={filters.dateRange} onChange={(event) => onChange({ dateRange: event.target.value })}>
          {DATE_RANGES.map((range) => (
            <option key={range.id} value={range.id}>{range.label}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
