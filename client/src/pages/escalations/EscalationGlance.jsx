import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadEscalations } from '../../services/escalations.service';
import '../../styles/escalations.css';

export function EscalationGlance({ teamId, projectId }) {
  const [kpis, setKpis] = useState(null);
  useEffect(() => {
    const params = {};
    if (teamId) params.teamId = teamId;
    if (projectId) params.projectId = projectId;
    loadEscalations(params)
      .then((payload) => setKpis((teamId || projectId) ? payload.data.viewKpis : payload.data.kpis))
      .catch(() => setKpis(null));
  }, [teamId, projectId]);
  if (!kpis) return null;
  const scope = [teamId ? `team=${teamId}` : '', projectId ? `project=${projectId}` : ''].filter(Boolean).join('&');
  const href = (extra) => {
    const query = [extra, scope].filter(Boolean).join('&');
    return query ? `/escalations?${query}` : '/escalations';
  };
  return (
    <section className="esc-glance" aria-label="Escalations">
      <Link to={href('')}>Open escalations {kpis.open}</Link>
      <Link to={href('priority=CRITICAL')}>Critical {kpis.critical}</Link>
      <Link to={href('overdue=true')}>Overdue {kpis.overdue}</Link>
      <Link to={href('quick=resolved')}>Resolved this month {kpis.resolvedThisMonth}</Link>
      <Link to={href('')}>View escalations</Link>
    </section>
  );
}
