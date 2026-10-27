export function Tooltip({ content, children }) {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip__bubble" role="tooltip">{content}</span>
    </span>
  );
}
