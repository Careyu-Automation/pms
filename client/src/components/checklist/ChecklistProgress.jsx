export function ChecklistProgress({ completed, total, dateLabel }) {
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const done = total > 0 && completed === total;
  const date = dateLabel ? ` · ${dateLabel}` : '';
  const score = done ? ` · ${percent}%` : '';
  return (
    <div className="checklist-progress">
      <span>Progress: {completed} / {total}{date}{score}</span>
      <i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i>
    </div>
  );
}
