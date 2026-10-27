import { CircleAlert } from 'lucide-react';

export function ErrorState({ title = 'Something went wrong', description, action }) {
  return (
    <div className="error-state" role="alert">
      <span className="empty-state__icon">
        <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h2 className="empty-state__title">{title}</h2>
      {description ? <p className="empty-state__text">{description}</p> : null}
      {action ? <div className="error-state__action">{action}</div> : null}
    </div>
  );
}
