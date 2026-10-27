import { cx } from '../../utils/cx';

export function Badge({ tone = 'info', children }) {
  return <span className={cx('badge', `badge--${tone}`)}>{children}</span>;
}
