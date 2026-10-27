import { useEffect, useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePageMeta } from '../../hooks/usePageMeta';
import {
  deleteEmailReport, downloadEmailRun, downloadPreview, duplicateEmailReport, emailRun,
  getEmailReport, loadEmailReports, previewEmailReport, retryEmailRun, saveEmailReport,
  sendEmailReport, setEmailReportStatus, testEmailReport,
} from '../../services/emailReports.service';
import '../../styles/lead.css';
import '../../styles/email-reports.css';

const TABS = [
  ['reports', 'Reports'],
  ['schedules', 'Schedules'],
  ['templates', 'Templates'],
  ['history', 'Email History'],
];
const DAYS = [['1', 'Monday'], ['2', 'Tuesday'], ['3', 'Wednesday'], ['4', 'Thursday'], ['5', 'Friday'], ['6', 'Saturday'], ['0', 'Sunday']];
const ZONES = ['Asia/Kolkata', 'UTC', 'Europe/London', 'America/New_York'];
const RECIPIENT_TYPES = [
  ['EMAIL', 'Email address'],
  ['USER', 'Internal user'],
  ['TEAM', 'Team'],
  ['PROJECT_MANAGER', 'Project manager'],
  ['TEAM_LEAD', 'Team lead'],
  ['TEAM_MEMBERS', 'Team members'],
  ['TASK_ASSIGNEES', 'Task assignees'],
  ['SALES_OWNER', 'Sales owner'],
  ['MANAGEMENT', 'Management'],
];

function blankForm(type = 'DAILY_WORK', name = '') {
  return {
    name,
    type,
    description: '',
    scope: 'ORGANIZATION',
    frequency: 'WEEKLY',
    sendTime: '09:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: 'Asia/Kolkata',
    attachment: 'PDF',
    subject: '[CareYu] {{reportName}} - {{period}}',
    configuration: { teamId: '', projectId: '', employeeId: '', customer: '', dateFrom: '', dateTo: '', priority: '', overdueOnly: false, includeCompleted: true, sections: ['kpis', 'projects', 'tasks', 'delays', 'workload', 'activity'] },
    recipients: [{ kind: 'TO', recipientType: 'EMAIL', email: '', userId: '', teamId: '', name: '' }],
  };
}

function stamp(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value));
}

function tone(status) {
  if (status === 'ACTIVE' || status === 'SENT') return 'success';
  if (status === 'FAILED' || status === 'PARTIAL') return 'danger';
  if (status === 'QUEUED') return 'warning';
  return 'neutral';
}

function kolkataToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function statusLabel(status) {
  if (status === 'SENT') return 'Sent';
  if (status === 'FAILED' || status === 'PARTIAL') return 'Failed';
  if (status === 'QUEUED') return 'Generated';
  if (status === 'DRAFT') return 'Draft';
  return status || '—';
}

function RecipientField({ people, selected, disabled, onChange }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const chosen = people.filter((person) => selected.includes(person.id));
  const needle = query.trim().toLowerCase();
  const matches = people.filter((person) => !selected.includes(person.id) && person.name.toLowerCase().includes(needle)).slice(0, 8);
  return (
    <div className="recipient-field">
      <div className="recipient-field__box">
        {chosen.map((person) => (
          <button key={person.id} type="button" className="recipient-chip" disabled={disabled} onClick={() => onChange(selected.filter((id) => id !== person.id))}>
            {person.name}<span aria-hidden="true">×</span>
          </button>
        ))}
        <input
          className="recipient-field__input"
          aria-label="Search recipients"
          placeholder={chosen.length ? 'Add recipient' : 'Search recipients'}
          value={query}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 160)}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        />
      </div>
      {open && !disabled ? (
        <ul className="recipient-field__menu">
          {matches.length ? matches.map((person) => (
            <li key={person.id}>
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange([...selected, person.id]); setQuery(''); }}>{person.name}</button>
            </li>
          )) : <li className="recipient-field__empty">No matching people</li>}
        </ul>
      ) : null}
    </div>
  );
}

function DailyComposer({ data, push, onSent }) {
  const [date, setDate] = useState(kolkataToday());
  const [period, setPeriod] = useState('FULL');
  const [type, setType] = useState('DAILY_WORK');
  const [recipients, setRecipients] = useState(data.defaultRecipientIds || []);
  const [reportId, setReportId] = useState('');
  const [preview, setPreview] = useState(null);
  const [match, setMatch] = useState(null);
  const [frame, setFrame] = useState('desktop');
  const [busy, setBusy] = useState('');
  const people = data.options?.people || [];
  const canConfigure = Boolean(data.access?.canSettings);

  function payload() {
    return {
      name: type === 'DAILY_WORK' ? 'Daily Work Update Report' : (data.types?.[type] || 'Report'),
      type,
      description: '',
      scope: 'ORGANIZATION',
      frequency: 'MANUAL',
      sendTime: period === 'EVENING' ? '18:00' : '09:00',
      dayOfWeek: 1,
      dayOfMonth: 1,
      timezone: 'Asia/Kolkata',
      attachment: 'NONE',
      subject: 'CareYu Automation — Daily Work Update Report',
      configuration: { dateFrom: date, dateTo: date, period, sections: [] },
      recipients: recipients.map((userId) => ({ kind: 'TO', recipientType: 'USER', userId, email: '', teamId: '', name: '' })),
    };
  }

  useEffect(() => {
    if (type !== 'DAILY_WORK') {
      setMatch(null);
      return undefined;
    }
    let cancel = false;
    setMatch(null);
    previewEmailReport(payload())
      .then((result) => {
        if (!cancel) setMatch({ count: Number(result.data.recordCount || 0), date, period });
      })
      .catch(() => {
        if (!cancel) setMatch({ count: null, date, period });
      });
    return () => { cancel = true; };
  }, [date, period, type]);

  async function runPreview() {
    setBusy('preview');
    try {
      const result = await previewEmailReport(payload());
      setPreview(result.data);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function runDownload(format) {
    setBusy(format);
    try {
      await downloadPreview(payload(), format);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function runSend(test) {
    if (!recipients.length) {
      push({ tone: 'danger', message: 'Choose at least one recipient.' });
      return;
    }
    if (type === 'DAILY_WORK' && match && match.count === 0) {
      push({ tone: 'danger', message: 'No daily work updates found for the selected date.' });
      return;
    }
    setBusy(test ? 'test' : 'send');
    try {
      const name = payload().name;
      const existing = reportId || (data.reports || []).find((item) => item.type === type && item.name === name && item.frequency === 'MANUAL')?.id;
      const saved = await saveEmailReport(payload(), existing || undefined);
      const id = saved.data.report.id;
      setReportId(id);
      if (test) await testEmailReport(id);
      else await sendEmailReport(id);
      push({ tone: 'success', message: test ? 'Test email sent.' : 'Report sent.' });
      await onSent();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="report-composer">
      <div className="report-composer__controls">
        <label>Report Date<input className="input" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(null); }} /></label>
        <label>Period
          <select className="select" value={period} onChange={(event) => { setPeriod(event.target.value); setPreview(null); }}>
            <option value="FULL">Full day</option>
            <option value="MORNING">Morning</option>
            <option value="EVENING">Evening</option>
          </select>
        </label>
        <label>Report Type
          <select className="select" value={type} onChange={(event) => { setType(event.target.value); setReportId(''); setPreview(null); }}>
            {Object.entries(data.types || {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>Recipients
          <RecipientField people={people} selected={recipients} disabled={!canConfigure} onChange={setRecipients} />
        </label>
      </div>
      <div className="report-composer__actions">
        <Button variant="secondary" loading={busy === 'preview'} onClick={runPreview}>Preview Report</Button>
        <Button variant="secondary" onClick={() => setFrame('desktop')} disabled={!preview}>Desktop Preview</Button>
        <Button variant="secondary" onClick={() => setFrame('mobile')} disabled={!preview}>Mobile Preview</Button>
        <Button variant="secondary" loading={busy === 'excel'} onClick={() => runDownload('excel')}>Download Excel</Button>
        <Button variant="secondary" loading={busy === 'pdf'} onClick={() => runDownload('pdf')}>Download PDF</Button>
        <Button variant="secondary" loading={busy === 'test'} onClick={() => runSend(true)} disabled={!canConfigure}>Send Test Email</Button>
        <Button loading={busy === 'send'} onClick={() => runSend(false)} disabled={!canConfigure || (type === 'DAILY_WORK' && match?.count === 0)}>Send Report</Button>
      </div>
      {type === 'DAILY_WORK' && match?.count === 0 ? (
        <p className="reports-note">No daily work updates found for the selected date.</p>
      ) : null}
      {preview ? (
        <div className="report-composer__preview">
          <p className="reports-note">{preview.subject}</p>
          <div className={frame === 'mobile' ? 'report-frame is-mobile' : 'report-frame'}>
            <iframe title="Report preview" sandbox="" srcDoc={preview.html || ''} />
          </div>
        </div>
      ) : null}
      <div className="report-composer__history">
        <h2>Report History</h2>
        {(data.recent || []).length ? (
          <div className="reports-scroll">
            <table className="data-table">
              <thead><tr><th>Report Date</th><th>Report Type</th><th>Period</th><th>Recipients</th><th>Entries</th><th>Generated/Sent At</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.recent.map((item) => (
                  <tr key={item.id}>
                    <td>{item.reportDate ? stamp(item.reportDate).replace(/,.*/, '') : '—'}</td>
                    <td>{data.types?.[item.reportType] || item.reportName}</td>
                    <td>{item.period || '—'}</td>
                    <td>{item.recipientCount}</td>
                    <td>{item.recordCount || '—'}</td>
                    <td>{stamp(item.startedAt)}</td>
                    <td><Badge tone={tone(item.status)}>{statusLabel(item.status)}</Badge>{item.error ? <small className="reports-note">{item.error}</small> : null}</td>
                    <td className="reports-row-actions">
                      {item.status === 'FAILED' ? <button type="button" onClick={() => retryEmailRun(item.id).then(onSent).catch((error) => push({ tone: 'danger', message: error.message }))}>Retry</button> : null}
                      <button type="button" onClick={() => downloadEmailRun(item.id, `${item.reportName}.pdf`).catch((error) => push({ tone: 'danger', message: error.message }))}>Download</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="reports-note">No report history yet. History is recorded when a test or report is sent.</p>}
      </div>
    </section>
  );
}

export default function EmailReportsPage() {
  const meta = usePageMeta();
  useDocumentTitle(meta.title);
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('reports');
  const [filters, setFilters] = useState({ q: '', type: '', status: '', frequency: '' });
  const [wizard, setWizard] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  function load(next = filters) {
    return loadEmailReports(next).then((payload) => {
      setData(payload.data);
      setStatus('ready');
    }).catch((error) => {
      setStatus('error');
      push({ tone: 'danger', message: error.message });
    });
  }

  useEffect(() => { load(); }, []);

  function openCreate(seed) {
    setWizard({ step: seed ? 1 : 0, id: '', form: seed ? { ...blankForm(seed.type, seed.name), description: seed.description || '', configuration: { ...blankForm().configuration, ...(seed.configuration || {}) } } : blankForm() });
  }

  async function openEdit(id, step = 1) {
    try {
    const payload = await getEmailReport(id);
    const report = payload.data.report;
    setWizard({
      step,
      id,
      form: {
        ...blankForm(report.type, report.name),
        ...report,
        dayOfWeek: report.dayOfWeek ?? 1,
        configuration: { ...blankForm().configuration, ...(report.configuration || {}) },
        recipients: payload.data.recipients.length ? payload.data.recipients : blankForm().recipients,
      },
    });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    }
  }

  async function act(work, message) {
    setBusy(true);
    try {
      await work();
      if (message) push({ tone: 'success', message });
      await load();
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy(false);
    }
  }

  const reports = data?.reports || [];
  const mailNote = data && !data.mail.configured;

  return (
    <PageContainer>
      <PageHeader
        title="Email Reports"
        description="Preview, generate, and distribute daily work reports."
        actions={(
          <div className="reports-actions">
            <Button variant="secondary" onClick={() => setTab('templates')}>Templates</Button>
            <Button variant="secondary" onClick={() => setTab('history')}>Email History</Button>
            <Button onClick={() => openCreate()}>Create Report</Button>
          </div>
        )}
      />
      {status === 'loading' ? <div className="reports-skeleton" /> : null}
      {status === 'error' ? <ErrorState title="Unable to load email reports." action={<Button onClick={() => load()}>Retry</Button>} /> : null}
      {status === 'ready' ? (
        <>
          {mailNote ? <p className="reports-note">Email delivery is not configured yet. Preview and download still work. An administrator can add SMTP settings before sending.</p> : null}
          <div className="reports-tabs" role="tablist">
            {TABS.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}</button>)}
          </div>
          {tab === 'reports' ? <DailyComposer data={data} push={push} onSent={() => load()} /> : null}
          {tab === 'reports' && data.configured ? (
            <>
              <div className="reports-toolbar">
                <input className="input" placeholder="Search reports..." value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} />
                <select className="select" value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">Report type</option>{Object.entries(data.types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                <select className="select" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">Status</option><option>ACTIVE</option><option>PAUSED</option><option>DRAFT</option><option>FAILED</option></select>
                <select className="select" value={filters.frequency} onChange={(event) => setFilters({ ...filters, frequency: event.target.value })}><option value="">Frequency</option><option>MANUAL</option><option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option><option>CUSTOM</option></select>
                <Button variant="secondary" onClick={() => load(filters)}>Apply</Button>
              </div>
              {reports.length ? (
                <div className="reports-scroll">
                  <table className="data-table">
                    <thead><tr><th>Report</th><th>Type</th><th>Scope</th><th>Recipients</th><th>Frequency</th><th>Next run</th><th>Last sent</th><th>Status</th><th>Owner</th><th></th></tr></thead>
                    <tbody>
                      {reports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.name}</td>
                          <td>{data.types[report.type] || report.type}</td>
                          <td>{report.scope}</td>
                          <td>{report.recipientCount}</td>
                          <td>{report.frequency}</td>
                          <td>{stamp(report.nextRunAt)}</td>
                          <td>{stamp(report.lastSentAt)}</td>
                          <td><Badge tone={tone(report.status)}>{report.status}</Badge></td>
                          <td>{report.ownerName}</td>
                          <td className="reports-row-actions">
                            <button type="button" onClick={() => openEdit(report.id, 6)}>Preview</button>
                            <button type="button" onClick={() => setConfirm(report)}>Send now</button>
                            <button type="button" onClick={() => openEdit(report.id, 1)}>Edit</button>
                            <button type="button" onClick={() => act(() => duplicateEmailReport(report.id), 'Report duplicated.')}>Duplicate</button>
                            <button type="button" onClick={() => act(() => setEmailReportStatus(report.id, report.status === 'PAUSED' ? 'ACTIVE' : 'PAUSED'), report.status === 'PAUSED' ? 'Report resumed.' : 'Report paused.')}>{report.status === 'PAUSED' ? 'Resume' : 'Pause'}</button>
                            <button type="button" onClick={() => act(() => deleteEmailReport(report.id), 'Report deleted.')}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="reports-note">No saved reports match these filters.</p>}
              {data.upcoming.length ? (
                <section className="report-composer__history">
                  <h2>Upcoming scheduled reports</h2>
                  {data.upcoming.map((item) => <p key={item.id}><strong>{item.name}</strong> · {stamp(item.nextRunAt)} · {item.recipientCount} recipients</p>)}
                </section>
              ) : null}
            </>
          ) : null}
          {tab === 'schedules' ? (
            <div className="reports-scroll">
              <table className="data-table">
                <thead><tr><th>Report</th><th>Frequency</th><th>Time</th><th>Timezone</th><th>Next run</th><th>Status</th></tr></thead>
                <tbody>
                  {reports.filter((item) => item.frequency !== 'MANUAL').map((item) => (
                    <tr key={item.id}><td>{item.name}</td><td>{item.frequency}</td><td>{item.sendTime}</td><td>{item.timezone}</td><td>{stamp(item.nextRunAt)}</td><td><Badge tone={tone(item.status)}>{item.status}</Badge></td></tr>
                  ))}
                </tbody>
              </table>
              {!reports.some((item) => item.frequency !== 'MANUAL') ? <p className="reports-muted">No schedules yet. Create a report and choose Save & Schedule.</p> : null}
            </div>
          ) : null}
          {tab === 'templates' ? (
            <div className="reports-templates">
              {data.templates.map((template) => (
                <article key={template.id}>
                  <strong>{template.name}</strong>
                  <span>{data.types[template.type]}</span>
                  <p>{template.description}</p>
                  <Button size="sm" onClick={() => openCreate(template)}>Use template</Button>
                </article>
              ))}
            </div>
          ) : null}
          {tab === 'history' ? (
            <div className="reports-scroll">
              <table className="data-table">
                <thead><tr><th>Sent at</th><th>Report</th><th>Type</th><th>Status</th><th>Recipients</th><th>Attachment</th><th>Sent by</th><th></th></tr></thead>
                <tbody>
                  {data.recent.map((item) => (
                    <tr key={item.id}>
                      <td>{stamp(item.startedAt)}</td>
                      <td>{item.reportName}{item.isTest ? ' (test)' : ''}</td>
                      <td>{data.types[item.reportType] || item.reportType}</td>
                      <td><Badge tone={tone(item.status)}>{item.status}</Badge></td>
                      <td>{item.recipientCount}</td>
                      <td>{item.attachment || '—'}</td>
                      <td>{item.sentByName || '—'}</td>
                      <td className="reports-row-actions">
                        <button type="button" onClick={() => emailRun(item.id).then((payload) => setRun(payload.data)).catch((error) => push({ tone: 'danger', message: error.message }))}>View</button>
                        {item.status === 'FAILED' ? <button type="button" onClick={() => act(() => retryEmailRun(item.id), 'Retry queued.')}>Retry</button> : null}
                        <button type="button" onClick={() => downloadEmailRun(item.id, `${item.reportName}.pdf`).catch((error) => push({ tone: 'danger', message: error.message }))}>Download</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.recent.length ? <p className="reports-muted">No email history yet.</p> : null}
            </div>
          ) : null}
        </>
      ) : null}
      <Wizard open={Boolean(wizard)} state={wizard} setState={setWizard} options={data?.options} types={data?.types || {}} sections={data?.sections || []} busy={busy} onClose={() => { if (!busy) setWizard(null); }} onSaved={() => { setWizard(null); load(); }} push={push} />
      <Modal open={Boolean(confirm)} title="Send report now" onClose={() => setConfirm(null)}>
        {confirm ? (
          <div className="reports-form">
            <p>Send “{confirm.name}” now?</p>
            <p>Recipients: {confirm.recipientCount}</p>
            <p>Attachment: {confirm.attachment}</p>
            <div className="reports-form__actions">
              <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
              <Button loading={busy} onClick={() => act(() => sendEmailReport(confirm.id).then(() => setConfirm(null)), 'Report queued. Delivery will show in Email History.')}>Send now</Button>
            </div>
          </div>
        ) : null}
      </Modal>
      <Modal open={Boolean(run)} title="Email delivery" onClose={() => setRun(null)}>
        {run ? (
          <div className="reports-form">
            <p><strong>{run.run.reportName}</strong></p>
            <p>{stamp(run.run.startedAt)} · {run.run.sentByName || 'Scheduler'}</p>
            <p>Subject: {run.run.subject || '—'}</p>
            <p>Status: {run.run.status}</p>
            {run.run.error ? <p>Error: {run.run.error}</p> : null}
            {run.deliveries.map((item) => <p key={`${item.kind}-${item.email}`}>{item.kind}: {item.email} · {item.status}</p>)}
            {!run.deliveries.length ? <p className="reports-muted">No deliveries recorded.</p> : null}
          </div>
        ) : null}
      </Modal>
    </PageContainer>
  );
}

function Wizard({ open, state, setState, options, types, sections, busy, onClose, onSaved, push }) {
  const [preview, setPreview] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);
  useEffect(() => { if (!open) setPreview(null); }, [open]);
  if (!state) return null;
  const { step, form, id } = state;
  function patch(next) { setState({ ...state, form: { ...form, ...next } }); }
  function config(next) { patch({ configuration: { ...form.configuration, ...next } }); }
  function recipient(index, next) {
    const recipients = form.recipients.map((row, rowIndex) => (rowIndex === index ? { ...row, ...next } : row));
    patch({ recipients });
  }

  function readyForm() {
    return { ...form, recipients: form.recipients.filter((row) => row.recipientType !== 'EMAIL' || row.email.trim()) };
  }

  async function showPreview() {
    setLocalBusy(true);
    try {
      const payload = await previewEmailReport(readyForm());
      setPreview(payload.data);
      setState({ ...state, step: 6 });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setLocalBusy(false);
    }
  }

  async function persist(schedule) {
    setLocalBusy(true);
    try {
      const payload = await saveEmailReport({ ...readyForm(), schedule }, id || undefined);
      push({ tone: 'success', message: schedule ? 'Report scheduled.' : 'Report saved.' });
      onSaved(payload.data);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setLocalBusy(false);
    }
  }

  async function sendTest() {
    setLocalBusy(true);
    try {
      const payload = await saveEmailReport({ ...readyForm(), status: 'DRAFT', schedule: false }, id || undefined);
      await testEmailReport(payload.data.report.id);
      setState({ ...state, id: payload.data.report.id });
      push({ tone: 'success', message: 'Test email queued to your address.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setLocalBusy(false);
    }
  }

  const working = busy || localBusy;
  return (
    <Modal open={open} className={`reports-wizard${form.type === 'DAILY_WORK' && step >= 5 ? ' is-wide' : ''}`} title={id ? 'Edit report' : 'Create report'} onClose={onClose}>
      <p className="reports-steps">Step {step + 1} of 7</p>
      {step === 0 ? (
        <div className="reports-types">
          {Object.entries(types).map(([value, label]) => (
            <button key={value} type="button" className={form.type === value ? 'is-active' : ''} onClick={() => patch({ type: value, name: form.name || label })}>{label}</button>
          ))}
        </div>
      ) : null}
      {step === 1 ? (
        <div className="reports-form">
          <label className="field is-wide"><span className="field__label">Report name *</span><input className="input" value={form.name} onChange={(event) => patch({ name: event.target.value })} /></label>
          <label className="field is-wide"><span className="field__label">Description</span><textarea className="textarea" rows={2} value={form.description} onChange={(event) => patch({ description: event.target.value })} /></label>
          <label className="field"><span className="field__label">Scope</span>
            <select className="select" value={form.scope} onChange={(event) => patch({ scope: event.target.value })}>
              {['ORGANIZATION', 'TEAM', 'PROJECT', 'EMPLOYEE', 'CUSTOMER'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="field"><span className="field__label">Team</span>
            <select className="select" value={form.configuration.teamId} onChange={(event) => config({ teamId: event.target.value })}><option value="">All visible teams</option>{(options?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select>
          </label>
          <label className="field"><span className="field__label">Project</span>
            <select className="select" value={form.configuration.projectId} onChange={(event) => config({ projectId: event.target.value })}><option value="">All visible projects</option>{(options?.projects || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          </label>
          <label className="field"><span className="field__label">Employee</span>
            <select className="select" value={form.configuration.employeeId} onChange={(event) => config({ employeeId: event.target.value })}><option value="">All visible people</option>{(options?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
          </label>
        </div>
      ) : null}
      {step === 2 ? (
        <div className="reports-form">
          <label className="field"><span className="field__label">Date from</span><input className="input" type="date" value={form.configuration.dateFrom} onChange={(event) => config({ dateFrom: event.target.value })} /></label>
          <label className="field"><span className="field__label">Date to</span><input className="input" type="date" value={form.configuration.dateTo} onChange={(event) => config({ dateTo: event.target.value })} /></label>
          {form.type === 'DAILY_WORK' ? (
            <>
              <label className="field"><span className="field__label">Work type</span>
                <select className="select" value={form.configuration.workType || ''} onChange={(event) => config({ workType: event.target.value })}><option value="">Any work type</option>{(options?.workTypes || []).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select>
              </label>
              <label className="field"><span className="field__label">Product</span>
                <select className="select" value={form.configuration.productId || ''} onChange={(event) => config({ productId: event.target.value })}><option value="">Any product</option>{(options?.products || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              </label>
              <label className="field"><span className="field__label">Status</span>
                <select className="select" value={form.configuration.status || ''} onChange={(event) => config({ status: event.target.value })}><option value="">Any status</option>{['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED'].map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select>
              </label>
            </>
          ) : null}
          <label className="field"><span className="field__label">Priority</span>
            <select className="select" value={form.configuration.priority} onChange={(event) => config({ priority: event.target.value })}><option value="">Any</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="field"><span className="field__label">Overdue only</span>
            <select className="select" value={form.configuration.overdueOnly ? 'yes' : 'no'} onChange={(event) => config({ overdueOnly: event.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select>
          </label>
          {form.type === 'CUSTOM' ? (
            <div className="field is-wide">
              <span className="field__label">Sections</span>
              <div className="reports-types">
                {sections.map((section) => (
                  <button key={section} type="button" className={form.configuration.sections.includes(section) ? 'is-active' : ''} onClick={() => {
                    const has = form.configuration.sections.includes(section);
                    config({ sections: has ? form.configuration.sections.filter((item) => item !== section) : [...form.configuration.sections, section] });
                  }}>{section}</button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {step === 3 ? (
        <div className="reports-form">
          {form.recipients.map((row, index) => (
            <div key={index} className="reports-recipient">
              <select className="select" value={row.kind} onChange={(event) => recipient(index, { kind: event.target.value })}>{['TO', 'CC', 'BCC'].map((value) => <option key={value}>{value}</option>)}</select>
              <select className="select" value={row.recipientType} onChange={(event) => recipient(index, { recipientType: event.target.value })}>{RECIPIENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              {row.recipientType === 'EMAIL' ? <input className="input" type="email" placeholder="name@company.com" value={row.email} onChange={(event) => recipient(index, { email: event.target.value })} /> : null}
              {row.recipientType === 'USER' ? <select className="select" value={row.userId || ''} onChange={(event) => recipient(index, { userId: event.target.value })}><option value="">Choose person</option>{(options?.people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select> : null}
              {row.recipientType === 'TEAM' ? <select className="select" value={row.teamId || ''} onChange={(event) => recipient(index, { teamId: event.target.value })}><option value="">Choose team</option>{(options?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : null}
              <button type="button" onClick={() => patch({ recipients: form.recipients.filter((_, rowIndex) => rowIndex !== index) })}>Remove</button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => patch({ recipients: [...form.recipients, { kind: 'CC', recipientType: 'EMAIL', email: '', userId: '', teamId: '', name: '' }] })}>Add recipient</Button>
        </div>
      ) : null}
      {step === 4 ? (
        <div className="reports-form">
          <label className="field"><span className="field__label">Schedule</span>
            <select className="select" value={form.frequency} onChange={(event) => patch({ frequency: event.target.value })}>{['MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'].map((value) => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="field"><span className="field__label">Time</span><input className="input" type="time" value={form.sendTime} onChange={(event) => patch({ sendTime: event.target.value })} /></label>
          {form.frequency === 'WEEKLY' || form.frequency === 'CUSTOM' ? (
            <label className="field"><span className="field__label">Day</span><select className="select" value={form.dayOfWeek} onChange={(event) => patch({ dayOfWeek: Number(event.target.value) })}>{DAYS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          ) : null}
          {form.frequency === 'MONTHLY' ? (
            <label className="field"><span className="field__label">Date of month</span><input className="input" type="number" min="1" max="28" value={form.dayOfMonth} onChange={(event) => patch({ dayOfMonth: Number(event.target.value) })} /></label>
          ) : null}
          <label className="field"><span className="field__label">Timezone</span><select className="select" value={form.timezone} onChange={(event) => patch({ timezone: event.target.value })}>{ZONES.map((zone) => <option key={zone}>{zone}</option>)}</select></label>
          <label className="field"><span className="field__label">Attachment</span><select className="select" value={form.attachment} onChange={(event) => patch({ attachment: event.target.value })}><option>PDF</option><option>EXCEL</option><option>NONE</option></select></label>
          <label className="field is-wide"><span className="field__label">Subject</span><input className="input" value={form.subject} onChange={(event) => patch({ subject: event.target.value })} /></label>
        </div>
      ) : null}
      {step === 5 || step === 6 ? (
        <Preview preview={preview} onDownload={(format) => downloadPreview(form, format).catch((error) => push({ tone: 'danger', message: error.message }))} />
      ) : null}
      <div className="reports-form__actions">
        {step > 0 ? <Button variant="secondary" onClick={() => setState({ ...state, step: step >= 5 ? 4 : step - 1 })}>Back</Button> : null}
        {step < 5 ? <Button onClick={() => (step === 4 ? showPreview() : setState({ ...state, step: step + 1 }))} loading={working}>{step === 4 ? 'Preview' : 'Next'}</Button> : null}
        {step >= 5 ? <Button variant="secondary" onClick={sendTest} loading={working}>Send test email</Button> : null}
        {step >= 5 ? <Button variant="secondary" onClick={() => persist(false)} loading={working}>Save report</Button> : null}
        {step >= 5 ? <Button onClick={() => persist(true)} loading={working}>Save & schedule</Button> : null}
      </div>
    </Modal>
  );
}

function prettyDate(iso) {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return iso || '';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function Preview({ preview, onDownload }) {
  if (!preview) return <p className="reports-muted">Generate the preview to see the report.</p>;
  const snapshot = preview.snapshot;
  const daily = snapshot.type === 'DAILY_WORK';
  const max = Math.max(1, ...(snapshot.bars || []).map((bar) => bar.value));
  const period = snapshot.period.from === snapshot.period.to
    ? prettyDate(snapshot.period.from)
    : `${prettyDate(snapshot.period.from)} to ${prettyDate(snapshot.period.to)}`;
  return (
    <article className={`reports-preview${daily ? ' reports-preview--daily' : ''}`}>
      <header>
        <span>{daily ? 'CareYu Automation' : 'Care Yu Automation · Project Hub'}</span>
        <h3>{snapshot.title}</h3>
        <p>{period}</p>
        <p>Subject: {preview.subject}</p>
      </header>
      <div className="reports-kpis">
        {(snapshot.kpis || []).map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}
      </div>
      {(snapshot.bars || []).length ? (
        <div className="reports-bars">
          {snapshot.bars.map((bar) => (
            <div key={bar.label}><span>{bar.label}</span><i><b style={{ width: `${Math.round((bar.value / max) * 100)}%` }} /></i><em>{bar.value}</em></div>
          ))}
        </div>
      ) : null}
      {(snapshot.sections || []).map((section) => (
        <div key={section.title} className="reports-scroll">
          <h4>{section.title}</h4>
          <table className="data-table">
            <thead><tr>{(section.columns || []).map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>{(section.rows || []).slice(0, daily ? section.rows.length : 8).map((row, index) => <tr key={index} className={daily && index % 2 ? 'is-alt' : ''}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
          </table>
          {!(section.rows || []).length ? <p className="reports-muted">No records for this period.</p> : null}
        </div>
      ))}
      <div className="reports-actions">
        <Button variant="secondary" onClick={() => onDownload('pdf')}>Download PDF</Button>
        <Button variant="secondary" onClick={() => onDownload('excel')}>Download Excel</Button>
      </div>
      <p className="reports-muted">Generated by {daily ? 'CareYu Automation Project Hub' : 'Care Yu Automation Project Hub'}</p>
    </article>
  );
}
