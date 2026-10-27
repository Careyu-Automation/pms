import { Link } from 'react-router-dom';
import { Bot, Code, ScanEye, ShoppingCart, Wrench } from 'lucide-react';
import { cx } from '../../utils/cx';

const ICONS = {
  software: Code,
  robotics: Bot,
  procurement: ShoppingCart,
  execution: Wrench,
  vision: ScanEye,
};

export function TeamCard({ team, selected, onSelect }) {
  const Icon = ICONS[team.tone] || Code;

  return (
    <div
      className={cx('team-card', selected && 'is-selected')}
      data-tone={team.tone}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={() => onSelect(team.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onSelect(team.id);
      }}
    >
      <span className="team-card__icon" aria-hidden="true">
        <Icon size={16} strokeWidth={1.75} />
      </span>
      <Link className="team-card__name" to={`/teams/${team.id}`} onClick={(event) => event.stopPropagation()}>{team.name}</Link>
      <span className="team-card__members">{team.members} Members</span>
      <span className="team-card__stats">
        <span>{team.projects} Projects</span>
        <span>{team.activeTasks} Active Tasks</span>
      </span>
      <span className="team-card__progress">
        <span>Progress</span>
        <strong>{team.completion}%</strong>
      </span>
      <span className="progress" aria-hidden="true">
        <span className="progress__bar" style={{ width: `${team.completion}%` }} />
      </span>
      <span className={cx('team-card__overdue', team.overdue > 0 && 'is-due')}>
        {team.overdue} Overdue
      </span>
    </div>
  );
}
