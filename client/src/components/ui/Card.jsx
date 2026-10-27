import { cx } from '../../utils/cx';

export function Card({ children, className }) {
  return <section className={cx('card', className)}>{children}</section>;
}
