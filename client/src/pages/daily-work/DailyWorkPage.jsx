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
  const [teamId, setTeamId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [workStatus, setWorkStatus] = useState('');
  const [status, setStatus] = useState('loading');
  const [payload, setPayload] = useState(null);
  const [dirtyCount, setDirtyCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const sheetRef = useRef(null);

  const load = useCallback((quiet) => {
    if (!quiet) setStatus('loading');
    return listDailyWork({
      range: 'today',
      date,
      from: date,
      to: date,
      teamId: teamId || undefined,
      employeeId: employeeId || undefined,
      projectId: projectId || undefined,
      status: workStatus || undefined,
    })
      .then((result) => {
        setPayload(result.data);
        setStatus('ready');
      })
      .catch((error) => {
        if (!quiet) setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [date, employeeId, projectId, push, teamId, workStatus]);

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
    const query = {
      range: 'today',
      date,
      from: date,
      to: date,
      teamId: teamId || undefined,
      employeeId: employeeId || undefined,
      projectId: projectId || undefined,
      status: workStatus || undefined,
    };
    const run = kind === 'pdf' ? exportDailyPdf : exportDailyExcel;
    run(query).catch((error) => push({ tone: 'danger', message: error.message }));
  }

  const canFilterPeople = Boolean(payload?.access?.canAssignEmployee);

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

        <div className="daily-meta-bar daily-filters">
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
          {canFilterPeople ? (
            <label className="daily-meta-field">
              <span>Team</span>
              <select className="select" aria-label="Team" value={teamId} onChange={(event) => setTeamId(event.target.value)}>
                <option value="">All teams</option>
                {(lookups.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          ) : null}
          {canFilterPeople ? (
            <label className="daily-meta-field">
              <span>Employee</span>
              <select className="select" aria-label="Employee" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
                <option value="">All employees</option>
                {(lookups.people || []).map((person) => <option key={person.id} value={person.id}>{person.fullName}</option>)}
              </select>
            </label>
          ) : (
            <div className="daily-meta-field">
              <span>Employee</span>
              <strong>{user?.fullName || 'You'}</strong>
            </div>
          )}
          <label className="daily-meta-field">
            <span>Project</span>
            <select className="select" aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">All projects</option>
              {(lookups.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name || project.title}</option>)}
            </select>
          </label>
          <label className="daily-meta-field">
            <span>Status</span>
            <select className="select" aria-label="Status" value={workStatus} onChange={(event) => setWorkStatus(event.target.value)}>
              <option value="">All statuses</option>
              <option value="NOT_STARTED">Not started</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="COMPLETED">Completed</option>
              <option value="ON_HOLD">On hold</option>
            </select>
          </label>
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
