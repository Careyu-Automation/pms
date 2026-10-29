import { useCallback, useEffect, useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { ProjectWorkspace } from '../../components/projects/ProjectWorkspace';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listProjects } from '../../services/costing.service';
import '../../styles/lead.css';
import '../../styles/feasibility.css';
import '../../styles/projects.css';

export default function ActiveProjectsPage() {
  useDocumentTitle('Active Projects');
  const { push } = useToast();
  const [rows, setRows] = useState([]);
  const [managers, setManagers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    return listProjects('active')
      .then((payload) => {
        setRows(payload.data.projects || []);
        setManagers(payload.data.managers || []);
        setSummary(payload.data.summary || null);
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
      {status === 'ready' ? (
        <ProjectWorkspace
          projects={rows}
          managers={managers}
          summary={summary}
          mode="active"
          onChanged={load}
          onError={(message) => push({ tone: 'danger', message })}
        />
      ) : null}
    </PageContainer>
  );
}
