import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { loadTeamDashboard } from '../data/teamDashboardData';
import { buildTeamDetail, listTeamCards } from '../data/teamDashboardModel';

const INITIAL_FILTERS = {
  projectId: 'all',
  status: 'all',
  priority: 'all',
  dateRange: 'all',
};

export function useTeamDashboard() {
  const [params, setParams] = useSearchParams();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState({ status: 'loading', data: null });
  const [filters, setFilters] = useState(INITIAL_FILTERS);

  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ status: 'loading', data: current.data }));
    loadTeamDashboard()
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

  const cards = state.data ? listTeamCards(state.data) : [];
  const requested = params.get('team');
  const teamId = cards.some((item) => item.id === requested)
    ? requested
    : cards.find((item) => item.id.toLowerCase() === String(requested || '').toLowerCase())?.id || cards[0]?.id;

  useEffect(() => {
    if (!state.data || !teamId || requested === teamId) return;
    setParams({ team: teamId }, { replace: true });
  }, [requested, setParams, state.data, teamId]);

  const selectTeam = (id) => {
    setParams({ team: id }, { replace: true });
    setFilters((current) => ({ ...current, projectId: 'all' }));
  };

  const detail = state.data && teamId ? buildTeamDetail(state.data, teamId, filters) : null;

  return {
    status: state.status,
    updatedAt: state.data?.updatedAt || '',
    cards,
    detail,
    filters: detail ? { ...filters, projectId: detail.appliedProjectId } : filters,
    setFilters,
    selectTeam,
    reload: () => setAttempt((value) => value + 1),
  };
}
