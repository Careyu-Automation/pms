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

export default function ProjectListPage() {
  useDocumentTitle('Internal Projects');
  const { push } = useToast();
  const [rows, setRows] = useState([]);
  const [managers, setManagers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dependencyOptions, setDependencyOptions] = useState([]);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    return listProjects()
      .then((payload) => {
        setRows(payload.data.projects || []);
        setManagers(payload.data.managers || []);
        setSummary(payload.data.summary || null);
        setDependencyOptions(payload.data.dependencyOptions || []);
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
      {status === 'error' ? <ErrorState title="Internal Projects could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' ? (
        <ProjectWorkspace
          projects={rows}
          managers={managers}
          summary={summary}
          dependencyOptions={dependencyOptions}
          mode="all"
          allowCreate
          onChanged={load}
          onError={(message) => push({ tone: 'danger', message })}
          onSuccess={(message) => push({ tone: 'success', message })}
        />
      ) : null}
    </PageContainer>
  );
}
