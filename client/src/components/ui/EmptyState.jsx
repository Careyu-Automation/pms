export function EmptyState({ icon: Icon, title, description, compact = false }) {
  return (
    <div className={compact ? 'empty-state empty-state--compact' : 'empty-state'}>
      {Icon ? (
        <span className="empty-state__icon">
          <Icon size={compact ? 18 : 20} strokeWidth={1.75} aria-hidden="true" />
        </span>
      ) : null}
      {title ? <h2 className="empty-state__title">{title}</h2> : null}
      {description ? <p className="empty-state__text">{description}</p> : null}
    </div>
  );
}
