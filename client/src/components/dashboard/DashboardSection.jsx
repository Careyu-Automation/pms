import { cx } from '../../utils/cx';

export function DashboardSection({ title, action, children, className }) {
  return (
    <section className={cx('dash-card', className)}>
      <header className="dash-card__header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
