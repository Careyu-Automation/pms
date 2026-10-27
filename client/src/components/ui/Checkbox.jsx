export function Checkbox({ id, label, ...props }) {
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} className="checkbox__input" type="checkbox" {...props} />
      <span className="checkbox__box" aria-hidden="true" />
      <span className="checkbox__label">{label}</span>
    </label>
  );
}
