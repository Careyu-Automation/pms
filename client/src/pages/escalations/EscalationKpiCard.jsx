export function EscalationKpiCard({ label, value, active, onClick }) {
  return (
    <button type="button" className={`esc-kpi${active ? ' is-active' : ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </button>
  );
}
