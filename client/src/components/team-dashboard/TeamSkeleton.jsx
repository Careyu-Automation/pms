function Bone({ className }) {
  return <span className={`skeleton ${className || ''}`} />;
}

export function TeamSkeleton() {
  return (
    <div className="team-dashboard" aria-hidden="true">
      <div className="team-board">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="team-card team-card--skeleton">
            <Bone className="skeleton--label" />
            <Bone className="skeleton--value" />
            <Bone className="skeleton--note" />
          </div>
        ))}
      </div>
      <div className="team-kpis">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="team-kpi">
            <Bone className="skeleton--label" />
            <Bone className="skeleton--value" />
          </div>
        ))}
      </div>
      <div className="team-panel skeleton-card" />
      <div className="team-split">
        <div className="team-panel skeleton-card" />
        <div className="team-panel skeleton-card" />
      </div>
    </div>
  );
}
