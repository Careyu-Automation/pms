import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
  getEmailReport, loadEmailReports, loadEmailSettings, previewEmailReport, retryEmailRun,
  saveEmailReport, saveEmailSettings, sendEmailReport, sendSmtpTestEmail, setEmailReportStatus,
  testEmailConnection, testEmailReport,
} from '../../services/emailReports.service';
import '../../styles/lead.css';
import '../../styles/email-reports.css';

const EMPTY_SMTP = {
  host: '',
  port: 587,
  username: '',
  password: '',
  fromEmail: 'aicareyuautomation@gmail.com',
  fromName: 'CareYu Automation',
  replyTo: '',
  secure: false,
  hasPassword: false,
  configured: false,
  source: 'none',
};
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

const SmtpSettingsPanel = forwardRef(function SmtpSettingsPanel({ push, onSaved, sendLabel }, ref) {
  const [form, setForm] = useState(EMPTY_SMTP);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState('');
  const [testTo, setTestTo] = useState('');
  const [passwordError, setPasswordError] = useState('');

  async function load() {
    setStatus('loading');
    try {
      const result = await loadEmailSettings();
      const next = { ...EMPTY_SMTP, ...result.data, password: '' };
      if (!next.fromEmail) next.fromEmail = EMPTY_SMTP.fromEmail;
      setForm(next);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      push({ tone: 'danger', message: error.message });
    }
  }

  useEffect(() => { load(); }, []);

  async function save({ quiet } = {}) {
    if (!String(form.host || '').trim()) {
      push({ tone: 'danger', message: 'Enter the SMTP host (for example smtp.gmail.com).' });
      return null;
    }
    if (!String(form.fromEmail || '').trim()) {
      push({ tone: 'danger', message: 'Enter the sender email address.' });
      return null;
    }
    if (!String(form.password || '').trim() && !form.hasPassword) {
      setPasswordError('Required: paste the Gmail app password here, then save.');
      push({ tone: 'danger', message: 'SMTP password is empty. Paste the Gmail app password, click Save Configuration, then Send Report.' });
      return null;
    }
    setPasswordError('');
    setBusy('save');
    try {
      const result = await saveEmailSettings({
        host: form.host,
        port: Number(form.port) || 587,
        username: form.username || form.fromEmail,
        password: form.password,
        fromEmail: form.fromEmail,
        fromName: form.fromName,
        replyTo: form.replyTo,
        secure: Boolean(form.secure),
      });
      const next = { ...EMPTY_SMTP, ...result.data, password: '' };
      setForm(next);
      if (!quiet) push({ tone: 'success', message: 'SMTP configuration saved.' });
      await onSaved?.(next);
      return next;
    } catch (error) {
      push({ tone: 'danger', message: error.message });
      return null;
    } finally {
      setBusy('');
    }
  }

  useImperativeHandle(ref, () => ({
    save: (options) => save(options),
    isConfigured: () => Boolean(form.configured || form.hasPassword),
  }));

  async function testConnection() {
    setBusy('connection');
    try {
      await testEmailConnection();
      push({ tone: 'success', message: 'SMTP connection verified.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function sendTest() {
    setBusy('email');
    try {
      await sendSmtpTestEmail(testTo ? { to: testTo } : {});
      push({ tone: 'success', message: 'Test email sent.' });
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  if (status === 'loading') return <p className="reports-note">Loading SMTP settings…</p>;
  if (status === 'error') return <ErrorState title="Unable to load SMTP settings." action={<Button onClick={load}>Retry</Button>} />;

  return (
    <section className="report-composer smtp-settings">
      <h2>Email Configuration</h2>
      <p className="reports-note">
        Status: {form.configured ? 'Configured' : 'Not configured'}
        {form.source && form.source !== 'none' ? ` · source: ${form.source}` : ''}.
        Host must be smtp.gmail.com. Password must be a Google App Password (16 characters), not your normal Gmail password.
      </p>
      <div className="report-composer__controls smtp-settings__grid">
        <label>SMTP host<input className="input" value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="smtp.gmail.com" /></label>
        <label>SMTP port<input className="input" type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: Number(event.target.value) })} /></label>
        <label>SMTP username<input className="input" value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="aicareyuautomation@gmail.com" /></label>
        <label className={passwordError ? 'is-invalid' : undefined}>
          SMTP password
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => {
              setPasswordError('');
              setForm({ ...form, password: event.target.value });
            }}
            placeholder={form.hasPassword ? 'Saved · enter to replace' : 'Paste Gmail app password'}
          />
          {passwordError ? <small className="reports-note reports-note--danger">{passwordError}</small> : null}
          {!form.hasPassword && !form.password ? <small className="reports-note">Required for first-time setup. Google Account → Security → App passwords.</small> : null}
        </label>
        <label>Sender email<input className="input" type="email" value={form.fromEmail} onChange={(event) => setForm({ ...form, fromEmail: event.target.value })} placeholder="aicareyuautomation@gmail.com" /></label>
        <label>Sender display name<input className="input" value={form.fromName} onChange={(event) => setForm({ ...form, fromName: event.target.value })} /></label>
        <label>Reply-to (optional)<input className="input" type="email" value={form.replyTo || ''} onChange={(event) => setForm({ ...form, replyTo: event.target.value })} /></label>
        <label className="smtp-settings__check">
          <input type="checkbox" checked={Boolean(form.secure)} onChange={(event) => setForm({ ...form, secure: event.target.checked })} />
          Secure connection (TLS/SSL)
        </label>
        <label>Test email recipient<input className="input" type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="Defaults to your account email" /></label>
      </div>
      <div className="report-composer__actions">
        <Button loading={busy === 'save'} onClick={() => save()}>{sendLabel || 'Save Configuration'}</Button>
        <Button variant="secondary" loading={busy === 'connection'} onClick={testConnection} disabled={!form.configured && !form.host}>Test SMTP Connection</Button>
        <Button variant="secondary" loading={busy === 'email'} onClick={sendTest} disabled={!form.configured}>Send Test Email</Button>
      </div>
    </section>
  );
});

function defaultReportPeriod() {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
  return hour < 14 ? 'MORNING' : 'EVENING';
}

function periodLabel(value) {
  if (value === 'MORNING') return 'Morning';
  if (value === 'EVENING') return 'Evening';
  return 'Full day';
}

function dailyReportName(periodValue) {
  if (periodValue === 'MORNING') return 'Morning Daily Work Updates Report';
  if (periodValue === 'EVENING') return 'Evening Daily Work Updates Report';
  return 'Daily Work Updates Report';
}

function DailyComposer({ data, push, onSent, onNeedSmtp }) {
  const [date, setDate] = useState(kolkataToday());
  const [period, setPeriod] = useState(defaultReportPeriod());
  const [type, setType] = useState('DAILY_WORK');
  const [toRecipients, setToRecipients] = useState(data.defaultToRecipientIds || data.defaultRecipientIds || []);
  const [ccRecipients, setCcRecipients] = useState(data.defaultCcRecipientIds || []);
  const [reportIds, setReportIds] = useState({});
  const [preview, setPreview] = useState(null);
  const [match, setMatch] = useState(null);
  const [busy, setBusy] = useState('');
  const [sendingLock, setSendingLock] = useState(false);
  const [showSmtp, setShowSmtp] = useState(!data.mail?.configured);
  const [mailConfigured, setMailConfigured] = useState(Boolean(data.mail?.configured));
  const smtpRef = useRef(null);
  const people = data.options?.people || [];
  const canConfigure = Boolean(data.access?.canSettings);
  const canSend = Boolean(data.access?.canSend);
  const mailReady = mailConfigured || Boolean(data.mail?.configured);

  useEffect(() => {
    setMailConfigured(Boolean(data.mail?.configured));
    if (!data.mail?.configured) setShowSmtp(true);
  }, [data.mail?.configured]);

  useEffect(() => {
    setToRecipients(data.defaultToRecipientIds || data.defaultRecipientIds || []);
    setCcRecipients(data.defaultCcRecipientIds || []);
  }, [data.defaultToRecipientIds, data.defaultCcRecipientIds, data.defaultRecipientIds]);

  function payloadFor(periodValue = period) {
    const to = toRecipients.map((userId) => ({ kind: 'TO', recipientType: 'USER', userId, email: '', teamId: '', name: '' }));
    const cc = ccRecipients
      .filter((userId) => !toRecipients.includes(userId))
      .map((userId) => ({ kind: 'CC', recipientType: 'USER', userId, email: '', teamId: '', name: '' }));
    const name = type === 'DAILY_WORK' ? dailyReportName(periodValue) : (data.types?.[type] || 'Report');
    return {
      name,
      type,
      description: type === 'DAILY_WORK' ? `${periodLabel(periodValue)} report for ${date}` : '',
      scope: 'ORGANIZATION',
      frequency: 'MANUAL',
      sendTime: periodValue === 'EVENING' ? '19:15' : periodValue === 'MORNING' ? '11:15' : '18:00',
      dayOfWeek: 1,
      dayOfMonth: 1,
      timezone: 'Asia/Kolkata',
      attachment: 'NONE',
      subject: type === 'DAILY_WORK'
        ? `Daily Work Updates Report — ${periodLabel(periodValue)} — ${date}`
        : 'CareYu Automation Report',
      configuration: { dateFrom: date, dateTo: date, period: periodValue, sections: [] },
      recipients: [...to, ...cc],
    };
  }

  function choosePeriod(next) {
    setPeriod(next);
    setPreview(null);
    setMatch(null);
  }

  useEffect(() => {
    if (type !== 'DAILY_WORK') {
      setMatch(null);
      return undefined;
    }
    let cancel = false;
    setMatch(null);
    previewEmailReport(payloadFor(period))
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
      const result = await previewEmailReport(payloadFor(period));
      setPreview(result.data);
      setMatch({ count: Number(result.data.recordCount || 0), date, period });
      if (type === 'DAILY_WORK' && Number(result.data.recordCount || 0) === 0) {
        push({ tone: 'warning', message: `No ${periodLabel(period).toLowerCase()} updates found for ${date}. Try the other period or Full day.` });
      }
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function runDownload(format) {
    setBusy(format);
    try {
      await downloadPreview(payloadFor(period), format);
    } catch (error) {
      push({ tone: 'danger', message: error.message });
    } finally {
      setBusy('');
    }
  }

  async function ensureMailReady() {
    if (mailConfigured || data.mail?.configured) return true;
    try {
      const latest = await loadEmailSettings();
      if (latest.data?.configured) {
        setMailConfigured(true);
        return true;
      }
    } catch {
      /* fall through and try saving the form */
    }
    if (canConfigure && smtpRef.current?.save) {
      const saved = await smtpRef.current.save({ quiet: true });
      if (saved?.configured) {
        setMailConfigured(true);
        setShowSmtp(false);
        await onSent();
        return true;
      }
      return false;
    }
    return false;
  }

  async function sendOne(periodValue, { test = false, quiet = false } = {}) {
    const body = payloadFor(periodValue);
    let count = null;
    if (type === 'DAILY_WORK') {
      const check = await previewEmailReport(body);
      count = Number(check.data.recordCount || 0);
      if (count === 0) {
        if (!quiet) {
          push({
            tone: 'warning',
            message: `No ${periodLabel(periodValue).toLowerCase()} updates for ${date}. Skipped ${periodLabel(periodValue)} send.`,
          });
        }
        return { ok: false, skipped: true, period: periodValue, count: 0 };
      }
    }
    const existing = reportIds[periodValue]
      || (data.reports || []).find((item) => item.type === type && item.name === body.name && item.frequency === 'MANUAL')?.id;
    const saved = await saveEmailReport(body, existing || undefined);
    const id = saved.data.report.id;
    setReportIds((current) => ({ ...current, [periodValue]: id }));
    if (test) await testEmailReport(id);
    else await sendEmailReport(id);
    return { ok: true, period: periodValue, id, count };
  }

  async function runSend(test, periodValue = period) {
    if (sendingLock) return;
    setShowSmtp(true);
    onNeedSmtp?.();
    const ready = await ensureMailReady();
    if (!ready) {
      push({
        tone: 'danger',
        message: canConfigure
          ? 'Mail was not sent. Paste the Gmail app password in SMTP password, click Save Configuration, then Send Report.'
          : 'Email is not configured. An administrator needs to save the SMTP settings.',
      });
      return;
    }
    if (!toRecipients.length) {
      push({ tone: 'danger', message: 'Choose at least one To recipient.' });
      return;
    }
    setSendingLock(true);
    setBusy(test ? 'test' : `send-${periodValue}`);
    try {
      const result = await sendOne(periodValue, { test });
      if (result.ok) {
        push({
          tone: 'success',
          message: test
            ? `${periodLabel(periodValue)} test email sent.`
            : `${periodLabel(periodValue)} report sent for ${date}.`,
        });
        await onSent();
      }
    } catch (error) {
      push({ tone: 'danger', message: error.message || 'The email could not be delivered.' });
    } finally {
      setBusy('');
      setSendingLock(false);
    }
  }

  return (
    <section className="report-composer">
      <div className="report-composer__controls">
        <label>Report Date<input className="input" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPreview(null); }} /></label>
        <label>Report Type
          <select className="select" value={type} onChange={(event) => { setType(event.target.value); setReportIds({}); setPreview(null); }}>
            {Object.entries(data.types || {}).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>To
          <RecipientField people={people} selected={toRecipients} disabled={!canConfigure} onChange={setToRecipients} />
        </label>
        <label>CC
          <RecipientField people={people} selected={ccRecipients} disabled={!canConfigure} onChange={setCcRecipients} />
        </label>
      </div>
      {type === 'DAILY_WORK' ? (
        <div className="report-period-toggle" role="group" aria-label="Report period">
          {[
            ['MORNING', 'Morning'],
            ['EVENING', 'Evening'],
            ['FULL', 'Full day'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={period === value ? 'is-active' : ''}
              onClick={() => choosePeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {type === 'DAILY_WORK' && match?.count != null ? (
        <p className="reports-note">
          {match.count === 0
            ? `No saved ${periodLabel(period).toLowerCase()} updates for ${date}. Switch period above to try Morning, Evening, or Full day.`
            : `${match.count} saved ${periodLabel(period).toLowerCase()} update${match.count === 1 ? '' : 's'} found for ${date}.`}
        </p>
      ) : null}
      <div className="report-composer__actions">
        <Button variant="secondary" loading={busy === 'preview'} onClick={runPreview}>Preview Report</Button>
        <Button variant="secondary" loading={busy === 'excel'} onClick={() => runDownload('excel')}>Download Excel</Button>
        <Button variant="secondary" loading={busy === 'pdf'} onClick={() => runDownload('pdf')}>Download PDF</Button>
        <Button variant="secondary" loading={busy === 'send-MORNING'} onClick={() => runSend(false, 'MORNING')} disabled={!canSend || sendingLock}>Send Morning</Button>
        <Button variant="primary" loading={busy === 'send-EVENING'} onClick={() => runSend(false, 'EVENING')} disabled={!canSend || sendingLock}>Send Evening</Button>
      </div>
      {!mailReady && canConfigure && showSmtp ? (
        <div id="email-smtp-setup" className="report-composer__smtp">
          <p className="reports-note">
            SMTP host must be <strong>smtp.gmail.com</strong> (server name). Password must be a Google <strong>App Password</strong>, not the normal Gmail login password.
          </p>
          <SmtpSettingsPanel
            ref={smtpRef}
            push={push}
            sendLabel="Save Configuration"
            onSaved={async (settings) => {
              if (!settings?.configured) return;
              setMailConfigured(true);
              setShowSmtp(false);
              await onSent();
              if (preview) {
                push({ tone: 'success', message: 'SMTP saved. Sending the report…' });
                await runSend(false);
              }
            }}
          />
        </div>
      ) : null}
      {!mailReady && !canConfigure ? (
        <p className="reports-note">Email is not configured. An administrator needs to save the SMTP settings.</p>
      ) : null}
      {preview ? (
        <div className="report-composer__preview">
          <div className="report-composer__preview-head">
            <p className="reports-note">{preview.subject}</p>
          </div>
          <div className="report-frame">
            <iframe title="Report preview" sandbox="" srcDoc={preview.html || ''} />
          </div>
        </div>
      ) : null}
      <div className="report-composer__history">
        <h2>Report History</h2>
        {(data.recent || []).length ? (
          <div className="reports-scroll">
            <table className="data-table">
              <thead><tr><th>Report ID</th><th>Report Date</th><th>Report Type</th><th>Period</th><th>Recipients</th><th>Entries</th><th>Generated At</th><th>Sent At</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {data.recent.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.reportDate ? stamp(item.reportDate).replace(/,.*/, '') : '—'}</td>
                    <td>{data.types?.[item.reportType] || item.reportName}</td>
                    <td>{item.period || '—'}</td>
                    <td>{item.recipientCount}</td>
                    <td>{item.recordCount || '—'}</td>
                    <td>{stamp(item.startedAt)}</td>
                    <td>{item.status === 'SENT' ? stamp(item.completedAt || item.startedAt) : '—'}</td>
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
  const [wizard, setWizard] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);

  function load(next = {}) {
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

  const mailNote = data && !data.mail.configured;
  const canSettings = Boolean(data?.access?.canSettings);

  return (
    <PageContainer>
      <PageHeader
        title="Email Reports"
        description="Preview, generate, and distribute daily work reports."
      />
      {status === 'loading' ? <div className="reports-skeleton" /> : null}
      {status === 'error' ? <ErrorState title="Unable to load email reports." action={<Button onClick={() => load()}>Retry</Button>} /> : null}
      {status === 'ready' ? (
        <>
          {mailNote ? (
            <p className="reports-note">
              Email is not configured. Preview and download still work.
              {canSettings
                ? ' Save SMTP in the form on this page, then send Morning or Evening.'
                : ' An administrator needs to save the SMTP settings.'}
            </p>
          ) : null}
          <DailyComposer
            data={data}
            push={push}
            onSent={() => load()}
            onNeedSmtp={() => {
              if (canSettings) {
                document.getElementById('email-smtp-setup')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }}
          />
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
    const configuration = form.type === 'DAILY_WORK'
      ? {
        ...form.configuration,
        teamId: '',
        projectId: '',
        employeeId: '',
        workType: '',
        productId: '',
        status: '',
        priority: '',
        overdueOnly: false,
        includeCompleted: true,
      }
      : form.configuration;
    return {
      ...form,
      scope: form.type === 'DAILY_WORK' ? 'ORGANIZATION' : form.scope,
      configuration,
      recipients: form.recipients.filter((row) => row.recipientType !== 'EMAIL' || row.email.trim()),
    };
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
          {form.type === 'DAILY_WORK' ? (
            <p className="reports-note">Daily Work reports include all saved updates for the selected date and period. On the Send tab, choose Morning, Evening, or Full day — or use Send Morning & Evening to deliver both.</p>
          ) : (
            <>
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
            </>
          )}
        </div>
      ) : null}
      {step === 2 ? (
        <div className="reports-form">
          {form.type === 'DAILY_WORK' ? (
            <p className="reports-note">Date and period are chosen when you preview or send the report. No extra filters are applied to Daily Work emails.</p>
          ) : (
            <>
              <label className="field"><span className="field__label">Date from</span><input className="input" type="date" value={form.configuration.dateFrom} onChange={(event) => config({ dateFrom: event.target.value })} /></label>
              <label className="field"><span className="field__label">Date to</span><input className="input" type="date" value={form.configuration.dateTo} onChange={(event) => config({ dateTo: event.target.value })} /></label>
              <label className="field"><span className="field__label">Priority</span>
                <select className="select" value={form.configuration.priority} onChange={(event) => config({ priority: event.target.value })}><option value="">Any</option>{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => <option key={value}>{value}</option>)}</select>
              </label>
              <label className="field"><span className="field__label">Overdue only</span>
                <select className="select" value={form.configuration.overdueOnly ? 'yes' : 'no'} onChange={(event) => config({ overdueOnly: event.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select>
              </label>
            </>
          )}
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
            <tbody>
              {(section.rows || []).slice(0, daily ? section.rows.length : 8).map((row, index) => (
                <tr key={index} className={daily && index % 2 ? 'is-alt' : ''}>
                  {row.map((cell, cellIndex) => {
                    if (daily && section.columns?.[cellIndex] === 'Status') {
                      const label = String(cell || '—');
                      const tone = /completed/i.test(label) ? 'is-completed' : /blocked/i.test(label) ? 'is-blocked' : '';
                      return <td key={cellIndex}><span className={`status-badge ${tone}`.trim()}>{label}</span></td>;
                    }
                    return <td key={cellIndex}>{cell}</td>;
                  })}
                </tr>
              ))}
            </tbody>
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
