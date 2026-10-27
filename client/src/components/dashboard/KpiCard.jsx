import { cx } from '../../utils/cx';

export function KpiCard({ label, value, note, tone, icon: Icon, highlighted = false }) {
  return (
    <article className={cx('kpi-card', highlighted && 'is-highlight')}>
      <div className="kpi-card__top">
        <p className="kpi-card__label">{label}</p>
        <span className="kpi-card__icon" aria-hidden="true">
          <Icon size={16} strokeWidth={1.75} />
        </span>
      </div>
      <p className="kpi-card__value">{value}</p>
      <p className={cx('kpi-card__note', tone && `kpi-card__note--${tone}`)}>{note}</p>
    </article>
  );
}
