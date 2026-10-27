import { TYPE_LABEL } from './model';

function Bars({ title, items, range, onRange }) {
  const max = Math.max(1, ...items.map((item) => item.value || item.created || 0), ...items.map((item) => item.resolved || 0));
  return (
    <section className="esc-panel">
      <header>
        <h2>{title}</h2>
        {onRange ? (
          <div className="esc-range">
            {[['7', '7 Days'], ['30', '30 Days'], ['90', '90 Days']].map(([id, label]) => (
              <button key={id} type="button" className={range === id ? 'is-active' : ''} onClick={() => onRange(id)}>{label}</button>
            ))}
          </div>
        ) : null}
      </header>
      {items.length ? (
        <div className="esc-bars">
          {items.map((item) => (
            <div key={item.label || item.date}>
              <i style={{ height: `${Math.max(4, ((item.value ?? item.created) / max) * 100)}%` }} />
              {item.resolved != null ? <b style={{ height: `${Math.max(item.resolved ? 4 : 0, (item.resolved / max) * 100)}%` }} /> : null}
              <span>{item.label || item.date.slice(5)}</span>
            </div>
          ))}
        </div>
      ) : <p className="esc-muted">No escalations in this view.</p>}
    </section>
  );
}

export function EscalationCharts({ byType, byTeam, trend, range, onRange }) {
  return (
    <div className="esc-charts">
      <Bars title="Escalations by Type" items={(byType || []).map((item) => ({ ...item, label: TYPE_LABEL[item.label] || String(item.label || '').replace(/_/g, ' ') }))} />
      <Bars title="Escalations by Team" items={byTeam || []} />
      <Bars title="Escalations Created and Resolved" items={trend || []} range={range} onRange={onRange} />
    </div>
  );
}
