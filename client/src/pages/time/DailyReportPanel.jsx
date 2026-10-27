import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/format';
import {
  exportDailyReports,
  getDailyReport,
  getTeamReports,
  listDailyReports,
  reopenDailyReport,
  saveDailyReport,
  submitDailyReport,
} from '../../services/time.service';
import { formatMinutes, formatSlash, isoToday, longDate, timeZone, weekdayName } from './timeModel';

export function DailyReportPanel() {
  const { push } = useToast();
  const [date, setDate] = useState(isoToday());
  const [from, setFrom] = useState(isoToday());
  const [to, setTo] = useState(isoToday());
  const [search, setSearch] = useState('');
  const [report, setReport] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ whatIDid: '', whatToImprove: '', notes: '' });
  const [reports, setReports] = useState([]);
  const [teams, setTeams] = useState(null);
  const [members, setMembers] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState(false);

  const loadReport = useCallback(() => {
    setStatus('loading');
    return getDailyReport(date, { timeZone: timeZone() })
      .then((result) => {
        setReport(result.data);
        setDraft({
          whatIDid: result.data.whatIDid || '',
          whatToImprove: result.data.whatToImprove || '',
          notes: result.data.notes || '',
        });
        setEditing(result.data.status === 'DRAFT');
        setStatus('ready');
      })
      .catch((error) => {
        setStatus('error');
        push({ tone: 'danger', message: error.message });
      });
  }, [date, push]);

  const loadHistory = useCallback(() => {
    listDailyReports({ from, to, q: search, status: 'SUBMITTED', timeZone: timeZone() })
      .then((result) => setReports(result.data.reports || []))
      .catch((error) => push({ tone: 'danger', message: error.message }));
  }, [from, push, search, to]);

  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  useEffect(() => {
    if (!report?.access?.canViewTeam) {
      setTeams(null);
      return undefined;
    }
    let active = true;
    getTeamReports({ date, teamId, timeZone: timeZone() })
      .then((result) => {
        if (!active) return;
        setTeams(result.data.teams || []);
        setMembers(result.data.members || []);
      })
      .catch((error) => {
        if (error.status !== 403) push({ tone: 'danger', message: error.message });
      });
    return () => { active = false; };
  }, [date, push, report?.access?.canViewTeam, teamId]);

  function submit() {
    if (draft.notes.trim().length < 2) {
      push({ tone: 'danger', message: 'Notes are required before submitting the report.' });
      return;
    }
    setBusy(true);
    const body = { ...draft, date, submit: true, timeZone: timeZone() };
    const request = report?.report?.id && report.status === 'DRAFT'
      ? submitDailyReport(report.report.id, body)
      : saveDailyReport(body);
    request
      .then((result) => {
        setReport(result.data);
        setEditing(false);
        push({ tone: 'success', message: 'Daily report submitted.' });
        loadHistory();
      })
      .catch((error) => push({ tone: 'danger', message: error.message }))
      .finally(() => setBusy(false));
  }

  function reopen() {
    if (!report?.report?.id) return;
    setBusy(true);
    reopenDailyReport(report.report.id)
      .then((result) => {
        setReport(result.data);
        setDraft({
          whatIDid: result.data.whatIDid || '',
          whatToImprove: result.data.whatToImprove || '',
          notes: result.data.notes || '',
        });
        setEditing(true);
        push({ tone: 'success', message: 'Report reopened.' });
        loadHistory();
      })
      .catch((error) => push({ tone: 'danger', message: error.message }))
      .finally(() => setBusy(false));
  }

  const submitted = report?.status === 'SUBMITTED';
  const showForm = editing && !submitted;

  return (
    <div className="time-report">
      <header className="time-report__head">
        <div>
          <h2>Daily Report</h2>
          <p>{weekdayName(date)} {longDate(date)}</p>
        </div>
        <label className="time-nav__date">
          <span>{formatSlash(date)}</span>
          <input type="date" aria-label="Report date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
        </label>
        <div className="time-range">
          <input className="input" type="date" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} />
          <span>to</span>
          <input className="input" type="date" aria-label="To" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <strong className={submitted ? 'is-submitted' : ''}>{submitted ? 'Submitted' : 'Not submitted'}</strong>
        {submitted ? <Button variant="secondary" disabled>Submitted</Button> : null}
        {submitted && report?.access?.canReopen ? <Button variant="secondary" onClick={reopen} disabled={busy}>Reopen</Button> : null}
        {report?.access?.canExport ? (
          <>
            <Button variant="secondary" onClick={() => exportDailyReports({ from, to, timeZone: timeZone() }, 'excel').catch((error) => push({ tone: 'danger', message: error.message }))}>Export Excel</Button>
            <Button variant="secondary" onClick={() => exportDailyReports({ from, to, timeZone: timeZone() }, 'pdf').catch((error) => push({ tone: 'danger', message: error.message }))}>Export PDF</Button>
          </>
        ) : null}
      </header>

      {status === 'error' ? <ErrorState title="Unable to load the daily report." action={<Button onClick={loadReport}>Retry</Button>} /> : null}

      {status === 'ready' && !showForm && !submitted ? (
        <div className="time-empty">
          <p>No daily report for this date.</p>
          <Button onClick={() => setEditing(true)}>Complete Report</Button>
        </div>
      ) : null}

      {status === 'ready' && (showForm || submitted) ? (
        <section className="time-report__body">
          <label className="field">
            <span className="field__label">What I did</span>
            <textarea className="input" rows={6} value={draft.whatIDid} disabled={!showForm} onChange={(event) => setDraft({ ...draft, whatIDid: event.target.value })} />
            {showForm ? <small>Generated from today’s time entries, tasks, and daily work updates. Edit it if you need to adjust the wording.</small> : null}
          </label>
          <label className="field">
            <span className="field__label">What to improve</span>
            <textarea className="input" rows={4} value={draft.whatToImprove} disabled={!showForm} onChange={(event) => setDraft({ ...draft, whatToImprove: event.target.value })} />
          </label>
          <label className="field">
            <span className="field__label">Notes *</span>
            <textarea className="input" rows={3} placeholder="Anything your lead should know" value={draft.notes} disabled={!showForm} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </label>
          {showForm ? <Button onClick={submit} loading={busy}>Submit Report</Button> : null}
          {submitted && report?.submittedAt ? <p className="time-muted">Submitted {formatDateTime(report.submittedAt)}</p> : null}
        </section>
      ) : null}

      {teams ? (
        <section className="time-teams">
          <h2>Teams · {weekdayName(date)} {longDate(date)}</h2>
          <div className="time-team-grid">
            {teams.map((team) => (
              <button key={team.id} type="button" className={teamId === team.id ? 'is-active' : ''} onClick={() => setTeamId(teamId === team.id ? '' : team.id)}>
                <strong>{team.name}</strong>
                <span>Submitted: {team.submitted}</span>
                <span>Not Submitted: {team.notSubmitted}</span>
              </button>
            ))}
          </div>
          {teamId && members.length ? (
            <ul className="time-members">
              {members.map((member) => (
                <li key={member.id}>
                  <span>{member.fullName}</span>
                  <span>{member.status === 'SUBMITTED' ? 'Submitted' : 'Not submitted'}</span>
                  <span>{formatMinutes(member.loggedMinutes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="time-history">
        <header>
          <h2>Your Submitted Reports</h2>
          <input className="input" placeholder="Search reports..." value={search} onChange={(event) => setSearch(event.target.value)} />
        </header>
        {reports.length ? (
          <div className="time-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th><th>Status</th><th>Hours Logged</th><th>Tasks Completed</th><th>Projects Worked</th><th>Submitted At</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((item) => (
                  <tr key={item.id}>
                    <td>{longDate(item.date)}</td>
                    <td>{item.status === 'SUBMITTED' ? 'Submitted' : 'Not submitted'}</td>
                    <td>{formatMinutes(item.loggedMinutes)}</td>
                    <td>{item.tasksCompleted}</td>
                    <td>{item.projectCount}</td>
                    <td>{item.submittedAt ? formatDateTime(item.submittedAt) : '—'}</td>
                    <td><button type="button" className="time-link" onClick={() => setDate(item.date)}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="time-muted">No reports in this range.</p>}
      </section>
    </div>
  );
}
