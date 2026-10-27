import { cx } from '../../utils/cx';

export function Input({
  id,
  label,
  error,
  helper,
  required = false,
  endAdornment,
  className,
  ...props
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helperId = !error && helper ? `${id}-helper` : undefined;
  const control = (
    <input
      id={id}
      className={cx('input', className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={errorId || helperId}
      aria-required={required || undefined}
      {...props}
    />
  );

  return (
    <div className={cx('field', error && 'field--error')}>
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span className="field__required" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {endAdornment ? (
        <div className="field__adorned">
          {control}
          {endAdornment}
        </div>
      ) : control}
      {error ? <p className="field__error" id={errorId}>{error}</p> : null}
      {!error && helper ? <p className="field__helper" id={helperId}>{helper}</p> : null}
    </div>
  );
}
