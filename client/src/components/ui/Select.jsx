import { cx } from '../../utils/cx';

export function Select({
  id,
  label,
  error,
  helper,
  required = false,
  children,
  ...props
}) {
  const errorId = error ? `${id}-error` : undefined;
  const helperId = !error && helper ? `${id}-helper` : undefined;

  return (
    <div className={cx('field', error && 'field--error')}>
      {label ? (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span className="field__required" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      <select
        id={id}
        className="select"
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId || helperId}
        aria-required={required || undefined}
        {...props}
      >
        {children}
      </select>
      {error ? <p className="field__error" id={errorId}>{error}</p> : null}
      {!error && helper ? <p className="field__helper" id={helperId}>{helper}</p> : null}
    </div>
  );
}
