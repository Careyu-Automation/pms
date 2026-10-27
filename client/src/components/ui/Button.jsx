import { cx } from '../../utils/cx';

export function Button({
  variant = 'primary',
  size,
  block = false,
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'btn--block', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
