import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { ErrorState } from '../../components/ui/ErrorState';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getWorkHistory } from '../../services/dailyWork.service';
import { STATUS_TONE, WORK_STATUS, formatWorkDate } from './dailyWorkModel';
import '../../styles/daily-work.css';

export default function DailyWorkDetailPage() {
  const { workItemId } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  useDocumentTitle(data?.update?.workTitle || 'Daily Work Update');

  useEffect(() => {
    getWorkHistory(workItemId)
      .then((result) => { setData(result.data); setStatus('ready'); })
      .catch(() => setStatus('missing'));
  }, [workItemId]);

  if (status === 'loading') return <PageContainer><div className="daily-skeleton" /></PageContainer>;
  if (status === 'missing') {
    return (
      <PageContainer>
        <ErrorState title="Daily work update not found." action={<Link to="/daily-work-updates">Back to the table</Link>} />
      </PageContainer>
    );
  }

  const row = data.update;
  return (
    <PageContainer>
      <Link className="daily-back" to="/daily-work-updates">← Back to the table</Link>
      <header className="daily-head">
        <div>
          <h1>{row.workTitle}</h1>
          <p>{row.employeeName} · {formatWorkDate(row.currentDate)} · {row.workTypeName}</p>
        </div>
        <Badge tone={STATUS_TONE[row.status] || 'neutral'}>{WORK_STATUS[row.status] || row.status}</Badge>
      </header>
      <p>{row.description}</p>
      <p>{row.projectName || 'No project'}{row.productName ? ` · ${row.productName}` : ''}</p>
      <ol className="daily-history">
        {(data.updates || []).map((item) => (
          <li key={item.id}>
            <strong>{formatWorkDate(item.currentDate)}</strong>
            <span>{item.description}</span>
          </li>
        ))}
      </ol>
    </PageContainer>
  );
}
