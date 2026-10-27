import { useEffect, useState } from 'react';
import { loadDashboard } from '../data/dashboardData';

export function useDashboardData() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    if (attempt > 0) setState({ status: 'loading', data: null });

    loadDashboard()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', data: null });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return {
    ...state,
    reload: () => setAttempt((value) => value + 1),
  };
}
