function Bone({ className }) {
  return <span className={`skeleton ${className || ''}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard" aria-hidden="true">
      <div className="kpi-row">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="kpi-card">
            <Bone className="skeleton--label" />
            <Bone className="skeleton--value" />
            <Bone className="skeleton--note" />
          </div>
        ))}
      </div>
      <div className="dash-grid">
        <div className="dash-card skeleton-card" />
        <div className="dash-card skeleton-card" />
      </div>
      <div className="dash-card skeleton-card skeleton-card--wide" />
      <div className="dash-grid">
        <div className="dash-card skeleton-card" />
        <div className="dash-card skeleton-card" />
      </div>
    </div>
  );
}
