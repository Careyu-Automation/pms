import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { PageHeader } from '../../components/ui/PageHeader';
import { FEASIBILITY_STATUSES, statusMeta } from '../../components/feasibility/feasibilityModel';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { listStudies } from '../../services/feasibility.service';
import { formatDate, formatDateTime } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/feasibility.css';

export default function FeasibilityListPage() {
  useDocumentTitle('Feasibility Studies');
  const navigate = useNavigate();
  const { push } = useToast();
  const [studies, setStudies] = useState([]);
  const [status, setStatus] = useState('loading');

  const load = useCallback(() => {
    setStatus('loading');
    return listStudies()
      .then((payload) => {
        setStudies(payload.data.studies || []);
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [push]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PageContainer>
      <PageHeader
        title="Feasibility Studies"
        description="The technical gate between an approved lead and solution and costing."
      />
      {status === 'loading' ? <div className="lead-skeleton" aria-hidden="true" /> : null}
      {status === 'error' ? <ErrorState title="Feasibility studies could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && !studies.length ? (
        <div className="lead-section lead-empty">
          <EmptyState
            title="No feasibility studies yet"
            description="Approve a lead in the pipeline. The feasibility study is created at that moment and opens from this list."
          />
          <Button onClick={() => navigate('/lead-pipeline')}>Open lead pipeline</Button>
        </div>
      ) : null}
      {status === 'ready' && studies.length ? (
        <div className="lead-table-wrap">
          <table className="data-table lead-table">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Lead title</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Owner</th>
                <th>Assigned PM</th>
                <th>Team progress</th>
                <th>Open risks</th>
                <th>Pending inputs</th>
                <th>Target date</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {studies.map((item) => {
                const meta = statusMeta(FEASIBILITY_STATUSES, item.status);
                return (
                  <tr key={item.id}>
                    <td><Link className="lead-code" to={`/feasibility-studies/${item.id}`}>{item.leadCode}</Link></td>
                    <td>{item.title || 'Untitled lead'}</td>
                    <td>{item.customerName || '—'}</td>
                    <td><Badge tone={meta.tone}>{meta.label}</Badge></td>
                    <td>{item.ownerName || 'Not assigned'}</td>
                    <td>{item.assignedPm || 'Not assigned'}</td>
                    <td>{item.progress?.teamInputs || 0}%</td>
                    <td>{item.summary?.openRisks || 0}</td>
                    <td>{item.summary?.pendingInputs || 0}</td>
                    <td>{formatDate(item.targetCompletionDate)}</td>
                    <td>{formatDateTime(item.updatedAt)}</td>
                    <td>
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/feasibility-studies/${item.id}`)}>
                        <Eye size={16} aria-hidden="true" />
                        Open
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </PageContainer>
  );
}
