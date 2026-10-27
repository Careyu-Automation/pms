import { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadProjectHub } from '../../services/costing.service';
import { TeamProjectHub } from './TeamProjectHub';
import '../../styles/lead.css';
import '../../styles/projects.css';

export default function ActiveProjectsPage() {
  useDocumentTitle('Active Projects');
  const { push } = useToast();
  const [teams, setTeams] = useState([]);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    return loadProjectHub()
      .then((payload) => {
        setTeams(payload.data.teams || []);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [push]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageContainer>
      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Active projects could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' ? <TeamProjectHub teams={teams} /> : null}
    </PageContainer>
  );
}
