import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkLog } from '../../components/daily-work/WorkLog';
import { PageContainer } from '../../components/layout/PageContainer';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import { createDailyWork, deleteDailyWork, exportDailyExcel, exportDailyPdf, listDailyWork, updateDailyWork } from '../../services/dailyWork.service';
import { isoToday } from './dailyWorkModel';
import '../../styles/daily-work.css';

export default function DailyWorkPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { user } = useAuth();
  const { push } = useToast();
  const [date, setDate] = useState(isoToday());
  const [status, setStatus] = useState('loading');
  const [payload, setPayload] = useState(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);

  const load = useCallback((quiet) => {
    if (!quiet) setStatus('loading');
    return listDailyWork({ range: 'today', date, from: date, to: date })
      .then((result) => {
        setPayload(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!quiet) setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [date, push]);

  useEffect(() => { load(Boolean(payload)); }, [load]);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!dirtyCount) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirtyCount]);

  const lookups = payload?.lookups || { people: [], teams: [], projects: [], products: [], workTypes: [], memberships: [] };
  const updates = payload?.updates || [];

  async function saveUpdate(body) {
    if (body.id) return (await updateDailyWork(body.id, body)).data.update;
    return (await createDailyWork(body)).data.update;
  }

  async function saveSheet() {
    setSaving(true);
    try {
      const result = await sheetRef.current?.saveAll();
      if (result?.saved) {
        push({
          tone: 'success',
          message: result.failed?.length
            ? 'Some rows were saved. Check the rows that still show an error.'
            : 'Daily work updates saved.',
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeUpdate(id) {
    await deleteDailyWork(id);
    push({ tone: 'success', message: 'Daily work update deleted.' });
    await load(true);
  }

  function exportFile(kind) {
    const query = { range: 'today', date, from: date, to: date };
    const run = kind === 'pdf' ? exportDailyPdf : exportDailyExcel;
    run(query).catch((error) => push({ tone: 'danger', message: error.message }));
  }

  return (
    <PageContainer>
      <div className="daily-page daily-page--sheet">
        <header className="daily-head daily-head--sheet">
          <div>
            <h1>Daily Work Updates</h1>
            <p>Record your daily activities and progress.</p>
          </div>
          <div className="daily-head__actions">
            {dirtyCount ? <span className="daily-unsaved" aria-live="polite">Unsaved changes · {dirtyCount}</span> : null}
            <Button onClick={saveSheet} disabled={!dirtyCount || saving || status !== 'ready'}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
            <button type="button" className="daily-export-link" onClick={() => exportFile('excel')}>Excel</button>
            <button type="button" className="daily-export-link" onClick={() => exportFile('pdf')}>PDF</button>
          </div>
        </header>

        <div className="daily-meta-bar">
          <label className="daily-meta-field">
            <span>Report date</span>
            <input
              className="input"
              type="date"
              aria-label="Report date"
              value={date}
              onChange={(event) => setDate(event.target.value || isoToday())}
            />
          </label>
          <div className="daily-meta-field">
            <span>Employee</span>
            <strong>{user?.fullName || 'You'}</strong>
          </div>
        </div>

        {status === 'error' ? (
          <ErrorState title="Unable to load daily work updates." action={<Button onClick={() => load(false)}>Retry</Button>} />
        ) : (
          <WorkLog
            ref={sheetRef}
            rows={status === 'ready' ? updates : []}
            lookups={lookups}
            user={user}
            canAssign={Boolean(payload?.access?.canAssignEmployee)}
            today={date || payload?.today || isoToday()}
            onSave={saveUpdate}
            onDelete={removeUpdate}
            onDirty={setDirtyCount}
            onReload={() => load(true)}
            emptyLabel={status === 'ready' ? 'No updates for this date yet.' : 'Loading daily work updates...'}
          />
        )}
      </div>
    </PageContainer>
  );
}
