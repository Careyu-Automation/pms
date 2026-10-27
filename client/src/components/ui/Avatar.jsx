import { initials } from '../../utils/initials';
import { cx } from '../../utils/cx';

export function Avatar({ name, size = 'md' }) {
  return (
    <span className={cx('avatar', `avatar--${size}`)} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
