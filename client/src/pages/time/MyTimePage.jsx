import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { DailyReportPanel } from './DailyReportPanel';
import { TimesheetPanel } from './TimesheetPanel';
import '../../styles/my-time.css';

export default function MyTimePage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'daily-report' ? 'daily-report' : 'timesheet';
  const [userId, setUserId] = useState(() => params.get('userId') || '');

  useEffect(() => {
    if (!params.get('tab')) {
      const next = { tab: 'timesheet' };
      if (params.get('userId')) next.userId = params.get('userId');
      setParams(next, { replace: true });
    }
  }, [params, setParams]);

  function selectTab(next) {
    const query = next === 'timesheet' ? { tab: 'timesheet' } : { tab: 'daily-report' };
    setParams(query, { replace: true });
  }

  return (
    <PageContainer>
      <header className="time-head">
        <div>
          <h1>My Time</h1>
          <p>Attendance, time tracking, and the end-of-day report.</p>
        </div>
        <div className="time-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'timesheet'} className={tab === 'timesheet' ? 'is-active' : ''} onClick={() => selectTab('timesheet')}>Timesheet</button>
          <button type="button" role="tab" aria-selected={tab === 'daily-report'} className={tab === 'daily-report' ? 'is-active' : ''} onClick={() => selectTab('daily-report')}>Daily Report</button>
        </div>
      </header>
      {tab === 'daily-report' ? <DailyReportPanel /> : <TimesheetPanel userId={userId} onUserChange={setUserId} />}
    </PageContainer>
  );
}
