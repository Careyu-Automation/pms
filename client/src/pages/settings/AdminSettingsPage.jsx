import { useEffect, useState } from 'react';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { loadAdminSettings, saveAdminSettings } from '../../services/settings.service';
import { sendSmtpTestEmail, testEmailConnection } from '../../services/emailReports.service';
import { CheckInput, DAYS, Field, LANDING, SelectInput, setPath, SettingsFrame, TextInput, visible } from './settingsFields';
import '../../styles/settings.css';

const TABS = [
  ['general', 'General'],
  ['access', 'User & Access'],
  ['notifications', 'Notifications'],
  ['workflow', 'Workflow'],
  ['data', 'Data Management'],
  ['integrations', 'Integrations'],
  ['system', 'System Information'],
].map(([id, label]) => ({ id, label }));

const EMPTY_SMTP = {
  host: '',
  port: 587,
  username: '',
  fromName: 'CareYu Automation',
  fromEmail: 'aicareyuautomation@gmail.com',
  replyTo: '',
  secure: false,
  password: '',
  hasPassword: false,
  configured: false,
  status: 'Not configured',
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export default function AdminSettingsPage() {
  useDocumentTitle('Admin Settings');
  const { push } = useToast();
  const [status, setStatus] = useState('loading');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [smtp, setSmtp] = useState(EMPTY_SMTP);
  const [savedSmtp, setSavedSmtp] = useState(EMPTY_SMTP);
  const [meta, setMeta] = useState(null);
  const [tab, setTab] = useState('general');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [smtpBusy, setSmtpBusy] = useState('');

  const load = () => {
    setStatus('loading');
    loadAdminSettings().then((payload) => {
      setSaved(clone(payload.data.settings));
      setForm(clone(payload.data.settings));
      const nextSmtp = { ...EMPTY_SMTP, ...payload.data.integrations.smtp, password: '' };
      if (!nextSmtp.fromEmail) nextSmtp.fromEmail = EMPTY_SMTP.fromEmail;
      setSmtp(nextSmtp);
      setSavedSmtp({ ...nextSmtp, password: '' });
      setMeta(payload.data);
      setErrors({});
      setStatus('ready');
    }).catch((error) => {
      setStatus(error.status === 403 ? 'denied' : 'error');
    });
  };

  useEffect(() => { load(); }, []);

  const dirty = Boolean(form && saved) && (JSON.stringify(form) !== JSON.stringify(saved) || JSON.stringify({ ...smtp, password: smtp.password || '' }) !== JSON.stringify({ ...savedSmtp, password: '' }));
  const set = (path, value) => {
    setForm((current) => setPath(current, path, value));
    setErrors((current) => ({ ...current, [path]: '' }));
  };
  const show = (...parts) => visible(query, ...parts);

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload = await saveAdminSettings({ ...form, smtp: { ...smtp, password: smtp.password } });
      setSaved(clone(payload.data.settings));
      setForm(clone(payload.data.settings));
      const nextSmtp = { ...EMPTY_SMTP, ...payload.data.integrations.smtp, password: '' };
      if (!nextSmtp.fromEmail) nextSmtp.fromEmail = EMPTY_SMTP.fromEmail;
      setSmtp(nextSmtp);
      setSavedSmtp({ ...nextSmtp, password: '' });
      setMeta(payload.data);
      push({ tone: 'success', message: 'Admin settings saved.' });
    } catch (error) {
      setErrors(error.details?.fields || {});
      push({ tone: 'danger', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const general = form?.general;
  const access = form?.access;
  const notes = form?.notifications;
  const flow = form?.workflow;
  const data = form?.data;

  return (
    <PageContainer>
      <PageHeader title="Admin Settings" description="Configure system-wide policies, workflow defaults, and application behavior." />
      {status === 'loading' ? <p className="settings-note">Loading settings…</p> : null}
      {status === 'denied' ? <ErrorState title="Administrator access is required." description="Your account cannot change organization settings." /> : null}
      {status === 'error' ? <ErrorState title="Unable to load admin settings." description="The settings could not be loaded." action={<Button onClick={load}>Try Again</Button>} /> : null}
      {status === 'ready' && form ? (
        <SettingsFrame
          title="Admin Settings"
          subtitle="Changes apply to the organization. Existing records are not rewritten."
          updatedAt={meta?.updatedAt}
          dirty={dirty}
          saving={saving}
          query={query}
          onQuery={setQuery}
          onSave={save}
          onReset={() => { setForm(clone(saved)); setSmtp({ ...savedSmtp, password: '' }); setErrors({}); }}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
        >
          {tab === 'general' ? (
            <div className="settings-grid">
              {show('organization name') ? <Field label="Organization name" error={errors['general.organizationName']} hint="Shown across the workspace."><TextInput value={general.organizationName} onChange={(value) => set('general.organizationName', value)} /></Field> : null}
              {show('organization email') ? <Field label="Organization email" error={errors['general.organizationEmail']}><TextInput type="email" value={general.organizationEmail} onChange={(value) => set('general.organizationEmail', value)} /></Field> : null}
              {show('contact phone') ? <Field label="Contact phone" error={errors['general.contactPhone']}><TextInput value={general.contactPhone} onChange={(value) => set('general.contactPhone', value)} /></Field> : null}
              {show('time zone') ? <Field label="Time zone" hint="Default is Asia/Kolkata."><TextInput value={general.timeZone} onChange={(value) => set('general.timeZone', value)} /></Field> : null}
              {show('date format') ? <Field label="Date format"><SelectInput value={general.dateFormat} onChange={(value) => set('general.dateFormat', value)} options={[['DD MMM YYYY', 'DD MMM YYYY'], ['DD/MM/YYYY', 'DD/MM/YYYY'], ['YYYY-MM-DD', 'YYYY-MM-DD']].map(([value, label]) => ({ value, label }))} /></Field> : null}
              {show('time format') ? <Field label="Time format"><SelectInput value={general.timeFormat} onChange={(value) => set('general.timeFormat', value)} options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} /></Field> : null}
              {show('currency') ? <Field label="Default currency" hint="INR is the currency used by CareYu. Existing amounts are not recalculated."><SelectInput value={general.currency} onChange={(value) => set('general.currency', value)} options={[{ value: 'INR', label: 'INR' }]} /></Field> : null}
              {show('language') ? <Field label="Default language" hint="The application is available in English."><SelectInput value={general.language} onChange={() => {}} options={[{ value: 'en', label: 'English' }]} /></Field> : null}
              {show('working hours') ? <Field label="Working hours start"><TextInput type="time" value={general.workStart} onChange={(value) => set('general.workStart', value)} /></Field> : null}
              {show('working hours') ? <Field label="Working hours end" error={errors['general.workEnd']}><TextInput type="time" value={general.workEnd} onChange={(value) => set('general.workEnd', value)} /></Field> : null}
              {show('holiday') ? <Field label="Weekly holiday"><SelectInput value={general.weeklyHoliday} onChange={(value) => set('general.weeklyHoliday', value)} options={DAYS.map(([value, label]) => ({ value, label }))} /></Field> : null}
              {show('landing') ? <Field label="Default dashboard landing page"><SelectInput value={general.landingPage} onChange={(value) => set('general.landingPage', value)} options={LANDING.map(([value, label]) => ({ value, label }))} /></Field> : null}
              {show('working days') ? (
                <Field wide label="Working days" error={errors['general.workingDays']} hint="People are expected to work on the selected days.">
                  <div className="settings-check-grid">
                    {DAYS.map(([value, label]) => (
                      <CheckInput key={value} label={label} checked={general.workingDays.includes(value)} onChange={(checked) => set('general.workingDays', checked ? [...general.workingDays, value] : general.workingDays.filter((day) => day !== value))} />
                    ))}
                  </div>
                </Field>
              ) : null}
              {show('maintenance') ? <Field wide label="Maintenance mode" hint="When on, only administrators can sign in and use CareYu."><CheckInput label="Enable maintenance mode" checked={general.maintenanceMode} onChange={(value) => set('general.maintenanceMode', value)} /></Field> : null}
            </div>
          ) : null}
          {tab === 'access' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">Multi-factor authentication is not available in this application.</p>
              {show('default role') ? <Field label="Default role for new accounts" error={errors['access.defaultRole']} hint="Used when someone registers or an administrator does not choose a role."><SelectInput value={access.defaultRole} onChange={(value) => set('access.defaultRole', value)} options={(meta?.roles || []).map((role) => ({ value: role.code, label: role.name }))} /></Field> : null}
              {show('session timeout') ? <Field label="Session timeout (minutes)" hint="Applies the next time someone signs in. Remembered sessions keep their longer duration."><TextInput type="number" min="15" max="10080" value={access.sessionTimeoutMinutes} onChange={(value) => set('access.sessionTimeoutMinutes', Number(value))} /></Field> : null}
              {show('password length') ? <Field label="Minimum password length"><TextInput type="number" min="8" max="64" value={access.minPasswordLength} onChange={(value) => set('access.minPasswordLength', Number(value))} /></Field> : null}
              {show('lockout threshold') ? <Field label="Account lockout threshold" hint="Failed sign-in attempts before the account is locked. Use 0 to leave lockout off."><TextInput type="number" min="0" max="20" value={access.lockoutThreshold} onChange={(value) => set('access.lockoutThreshold', Number(value))} /></Field> : null}
              {show('lockout duration') ? <Field label="Lockout duration (minutes)" hint="This lock is enforced on the next failed sign-ins."><TextInput type="number" min="1" max="1440" value={access.lockoutMinutes} onChange={(value) => set('access.lockoutMinutes', Number(value))} /></Field> : null}
              {show('inactive') ? <Field label="Inactive account policy (days)" hint="Sign-in is refused after this many days without a login. Use 0 to leave it off. Accounts are not deleted."><TextInput type="number" min="0" value={access.inactiveAfterDays} onChange={(value) => set('access.inactiveAfterDays', Number(value))} /></Field> : null}
              {show('self-registration registration') ? <Field label="Self-registration"><CheckInput label="Allow people to create their own account" checked={access.allowSelfRegistration} onChange={(value) => set('access.allowSelfRegistration', value)} /></Field> : null}
              {show('approval') ? <Field label="New account approval"><CheckInput label="Require an administrator to approve self-registered accounts" checked={access.requireApproval} onChange={(value) => set('access.requireApproval', value)} /></Field> : null}
              {show('password uppercase lowercase number special') ? (
                <Field wide label="Password policy" hint="Checked rules are required for new passwords and self-registration.">
                  <div className="settings-check-grid">
                    <CheckInput label="Require uppercase" checked={access.requireUppercase} onChange={(value) => set('access.requireUppercase', value)} />
                    <CheckInput label="Require lowercase" checked={access.requireLowercase} onChange={(value) => set('access.requireLowercase', value)} />
                    <CheckInput label="Require a number" checked={access.requireNumber} onChange={(value) => set('access.requireNumber', value)} />
                    <CheckInput label="Require a special character" checked={access.requireSpecial} onChange={(value) => set('access.requireSpecial', value)} />
                  </div>
                </Field>
              ) : null}
            </div>
          ) : null}
          {tab === 'notifications' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">{meta?.integrations?.smtp?.configured ? 'SMTP is configured, so email defaults can be delivered by the existing mail service.' : 'SMTP is not configured. Email defaults are saved, but messages are not sent until an administrator saves SMTP settings.'}</p>
              {show('email notifications') ? <CheckInput label="Email notifications" checked={notes.emailEnabled} onChange={(value) => set('notifications.emailEnabled', value)} /> : null}
              {show('in-app') ? <CheckInput label="In-app notifications" checked={notes.inAppEnabled} onChange={(value) => set('notifications.inAppEnabled', value)} /> : null}
              {show('task assignment') ? <CheckInput label="Task assignment" checked={notes.taskAssignment} onChange={(value) => set('notifications.taskAssignment', value)} /> : null}
              {show('due date reminder') ? <CheckInput label="Task due-date reminders" checked={notes.taskDue} onChange={(value) => set('notifications.taskDue', value)} /> : null}
              {show('due hours') ? <Field label="Due reminder lead time (hours)"><TextInput type="number" min="1" value={notes.taskDueHours} onChange={(value) => set('notifications.taskDueHours', Number(value))} /></Field> : null}
              {show('overdue') ? <CheckInput label="Overdue task alerts" checked={notes.overdue} onChange={(value) => set('notifications.overdue', value)} /> : null}
              {show('daily work') ? <CheckInput label="Daily Work Update reminders" checked={notes.dailyWork} onChange={(value) => set('notifications.dailyWork', value)} /> : null}
              {show('daily work time') ? <Field label="Daily reminder time"><TextInput type="time" value={notes.dailyWorkTime} onChange={(value) => set('notifications.dailyWorkTime', value)} /></Field> : null}
              {show('escalation') ? <CheckInput label="Escalation notifications" checked={notes.escalation} onChange={(value) => set('notifications.escalation', value)} /> : null}
              {show('lead') ? <CheckInput label="Lead lifecycle" checked={notes.leadLifecycle} onChange={(value) => set('notifications.leadLifecycle', value)} /> : null}
              {show('feasibility') ? <CheckInput label="Feasibility approval" checked={notes.feasibility} onChange={(value) => set('notifications.feasibility', value)} /> : null}
              {show('costing') ? <CheckInput label="Solution and costing approval" checked={notes.costing} onChange={(value) => set('notifications.costing', value)} /> : null}
              {show('milestone') ? <CheckInput label="Project milestones" checked={notes.milestones} onChange={(value) => set('notifications.milestones', value)} /> : null}
              {show('leave') ? <CheckInput label="Leave and permission" checked={notes.leave} onChange={(value) => set('notifications.leave', value)} /> : null}
              {show('mandatory') ? <CheckInput label="Escalation alerts are mandatory for users" checked={notes.mandatoryEscalation} onChange={(value) => set('notifications.mandatoryEscalation', value)} /> : null}
              {show('mandatory overdue') ? <CheckInput label="Overdue alerts are mandatory for users" checked={notes.mandatoryOverdue} onChange={(value) => set('notifications.mandatoryOverdue', value)} /> : null}
              {show('email report') ? <Field label="Email report schedule default"><SelectInput value={notes.emailReportDefault} onChange={(value) => set('notifications.emailReportDefault', value)} options={[{ value: 'NONE', label: 'None' }, { value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }]} /></Field> : null}
              {show('recipient') ? <Field label="Default notification recipient"><SelectInput value={notes.recipientMode} onChange={(value) => set('notifications.recipientMode', value)} options={[{ value: 'ASSIGNEE', label: 'Assignee' }, { value: 'TEAM_LEAD', label: 'Team lead' }, { value: 'MANAGER', label: 'Reporting manager' }]} /></Field> : null}
            </div>
          ) : null}
          {tab === 'workflow' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">These defaults are for new work. Saving them does not change existing leads, projects, or approvals.</p>
              {show('lead priority') ? <Field label="Default lead priority"><SelectInput value={flow.leadPriority} onChange={(value) => set('workflow.leadPriority', value)} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} /></Field> : null}
              {show('lead stage') ? <Field label="Default initial lead stage" hint="New leads still start as drafts so the existing review path is unchanged."><SelectInput value={flow.leadStage} onChange={(value) => set('workflow.leadStage', value)} options={[{ value: 'DRAFT', label: 'Draft' }]} /></Field> : null}
              {show('pm review') ? <CheckInput label="PM review required" checked={flow.pmReviewRequired} onChange={(value) => set('workflow.pmReviewRequired', value)} /> : null}
              {show('feasibility approval') ? <CheckInput label="Feasibility approval required" checked={flow.feasibilityRequired} onChange={(value) => set('workflow.feasibilityRequired', value)} /> : null}
              {show('costing approval') ? <CheckInput label="Costing approval required" checked={flow.costingRequired} onChange={(value) => set('workflow.costingRequired', value)} /> : null}
              {show('quotation') ? <Field label="Quotation approval"><SelectInput value={flow.quotationApproval} onChange={(value) => set('workflow.quotationApproval', value)} options={[{ value: 'BUSINESS_HEAD', label: 'Business Head' }, { value: 'PROJECT_MANAGER', label: 'Project Manager' }]} /></Field> : null}
              {show('order conversion') ? <Field label="Order conversion"><SelectInput value={flow.orderConversion} onChange={(value) => set('workflow.orderConversion', value)} options={[{ value: 'BUSINESS_HEAD', label: 'Business Head' }, { value: 'PROJECT_MANAGER', label: 'Project Manager' }]} /></Field> : null}
              {show('project priority') ? <Field label="Default project priority"><SelectInput value={flow.projectPriority} onChange={(value) => set('workflow.projectPriority', value)} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} /></Field> : null}
              {show('task priority') ? <Field label="Default task priority"><SelectInput value={flow.taskPriority} onChange={(value) => set('workflow.taskPriority', value)} options={[{ value: 'LOW', label: 'Low' }, { value: 'MEDIUM', label: 'Medium' }, { value: 'HIGH', label: 'High' }]} /></Field> : null}
              {show('task status') ? <Field label="Default task status"><SelectInput value={flow.taskStatus} onChange={(value) => set('workflow.taskStatus', value)} options={[{ value: 'PENDING', label: 'Pending' }, { value: 'IN_PROGRESS', label: 'In progress' }]} /></Field> : null}
              {show('team lead review') ? <CheckInput label="Require team lead review" checked={flow.teamLeadReview} onChange={(value) => set('workflow.teamLeadReview', value)} /> : null}
              {show('require daily') ? <CheckInput label="Require daily work updates" checked={flow.requireDailyWork} onChange={(value) => set('workflow.requireDailyWork', value)} /> : null}
              {show('escalation threshold') ? <Field label="Escalation after (days)"><TextInput type="number" min="1" value={flow.escalationAfterDays} onChange={(value) => set('workflow.escalationAfterDays', Number(value))} /></Field> : null}
              {show('completion') ? <Field label="Project completion approval"><SelectInput value={flow.completionApproval} onChange={(value) => set('workflow.completionApproval', value)} options={[{ value: 'PROJECT_MANAGER', label: 'Project Manager' }, { value: 'ENGINEERING_DIRECTOR', label: 'Engineering Director' }]} /></Field> : null}
              {show('reminder time') ? <Field label="Daily update reminder time"><TextInput type="time" value={flow.dailyReminderTime} onChange={(value) => set('workflow.dailyReminderTime', value)} /></Field> : null}
              {show('work description') ? <CheckInput label="Work description is mandatory" checked={flow.workDescriptionRequired} onChange={(value) => set('workflow.workDescriptionRequired', value)} /> : null}
              {show('next action') ? <CheckInput label="Next action is mandatory" checked={flow.nextActionRequired} onChange={(value) => set('workflow.nextActionRequired', value)} /> : null}
              {show('blocker') ? <CheckInput label="Blockers require an explanation" checked={flow.blockerExplanationRequired} onChange={(value) => set('workflow.blockerExplanationRequired', value)} /> : null}
              {show('work status') ? <Field label="Default work status"><SelectInput value={flow.defaultWorkStatus} onChange={(value) => set('workflow.defaultWorkStatus', value)} options={[{ value: 'IN_PROGRESS', label: 'In progress' }, { value: 'PENDING', label: 'Pending' }]} /></Field> : null}
            </div>
          ) : null}
          {tab === 'data' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">Retention values are stored as policy. CareYu does not delete files or audit history from this page, and it does not run backups.</p>
              {show('database') ? <Field label="Database"><TextInput value={meta?.system?.database === 'connected' ? 'Connected' : 'Unavailable'} onChange={() => {}} readOnly /></Field> : null}
              {show('backup') ? <Field label="Last backup" hint={meta?.system?.backup?.note || 'No backup has been recorded.'}><TextInput value="Not recorded" onChange={() => {}} readOnly /></Field> : null}
              {show('backup schedule') ? <Field label="Backup schedule" hint="This records the intended schedule only."><SelectInput value={data.backupSchedule} onChange={(value) => set('data.backupSchedule', value)} options={[{ value: 'NONE', label: 'None' }, { value: 'DAILY', label: 'Daily' }, { value: 'WEEKLY', label: 'Weekly' }]} /></Field> : null}
              {show('document retention') ? <Field label="Document retention (days)" hint="Use 0 when no automatic retention limit is set."><TextInput type="number" min="0" value={data.documentRetentionDays} onChange={(value) => set('data.documentRetentionDays', Number(value))} /></Field> : null}
              {show('audit retention') ? <Field label="Audit log retention (days)"><TextInput type="number" min="0" value={data.auditRetentionDays} onChange={(value) => set('data.auditRetentionDays', Number(value))} /></Field> : null}
              {show('storage') ? <Field label="Attachment storage" hint={`${meta?.integrations?.storage?.files || 0} files in local server storage.`}><TextInput value={meta?.integrations?.storage?.status || 'Unavailable'} onChange={() => {}} readOnly /></Field> : null}
              {show('export') ? <Field label="Export format" hint="Modules that already export files can use this preference. This page does not create a file."><SelectInput value={data.exportFormat} onChange={(value) => set('data.exportFormat', value)} options={[{ value: 'XLSX', label: 'Excel' }, { value: 'CSV', label: 'CSV' }]} /></Field> : null}
            </div>
          ) : null}
          {tab === 'integrations' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">SMTP status: {smtp.status}. Leave the password blank to keep the saved secret. The password is never shown again. Suggested sender: aicareyuautomation@gmail.com</p>
              {show('smtp host') ? <Field label="SMTP host" hint="Example: smtp.gmail.com"><TextInput value={smtp.host} onChange={(value) => setSmtp({ ...smtp, host: value })} placeholder="smtp.gmail.com" /></Field> : null}
              {show('smtp port') ? <Field label="SMTP port"><TextInput type="number" value={smtp.port} onChange={(value) => setSmtp({ ...smtp, port: Number(value) })} /></Field> : null}
              {show('smtp username') ? <Field label="SMTP username"><TextInput value={smtp.username} onChange={(value) => setSmtp({ ...smtp, username: value })} /></Field> : null}
              {show('smtp password') ? <Field label="SMTP password" hint={smtp.hasPassword ? 'A password is already saved.' : 'Not configured.'} error={errors['smtp.password']}><TextInput type="password" value={smtp.password} autoComplete="new-password" onChange={(value) => setSmtp({ ...smtp, password: value })} /></Field> : null}
              {show('from email') ? <Field label="From email" error={errors['smtp.fromEmail']}><TextInput type="email" value={smtp.fromEmail} onChange={(value) => setSmtp({ ...smtp, fromEmail: value })} /></Field> : null}
              {show('from name') ? <Field label="From name"><TextInput value={smtp.fromName} onChange={(value) => setSmtp({ ...smtp, fromName: value })} /></Field> : null}
              {show('reply') ? <Field label="Reply-to" error={errors['smtp.replyTo']}><TextInput type="email" value={smtp.replyTo} onChange={(value) => setSmtp({ ...smtp, replyTo: value })} /></Field> : null}
              {show('secure') ? <CheckInput label="Use a secure SMTP connection" checked={smtp.secure} onChange={(value) => setSmtp({ ...smtp, secure: value })} /> : null}
              <div className="settings-field settings-field--wide settings-smtp-actions">
                <Button
                  variant="secondary"
                  loading={smtpBusy === 'connection'}
                  disabled={smtpBusy !== '' || dirty}
                  onClick={async () => {
                    setSmtpBusy('connection');
                    try {
                      await testEmailConnection();
                      push({ tone: 'success', message: 'SMTP connection verified.' });
                    } catch (error) {
                      push({ tone: 'danger', message: error.message });
                    } finally {
                      setSmtpBusy('');
                    }
                  }}
                >
                  Test SMTP Connection
                </Button>
                <Button
                  variant="secondary"
                  loading={smtpBusy === 'email'}
                  disabled={smtpBusy !== '' || dirty || !smtp.configured}
                  onClick={async () => {
                    setSmtpBusy('email');
                    try {
                      await sendSmtpTestEmail({});
                      push({ tone: 'success', message: 'Test email sent to your account.' });
                    } catch (error) {
                      push({ tone: 'danger', message: error.message });
                    } finally {
                      setSmtpBusy('');
                    }
                  }}
                >
                  Send Test Email
                </Button>
                {dirty ? <small>Save configuration before testing.</small> : null}
              </div>
              {show('database') ? <Field label="Database"><TextInput value={meta?.integrations?.database?.status || 'Unavailable'} onChange={() => {}} readOnly /></Field> : null}
              {show('file storage') ? <Field label="File storage"><TextInput value={`${meta?.integrations?.storage?.kind || 'Local server storage'} · ${meta?.integrations?.storage?.status || 'Empty'}`} onChange={() => {}} readOnly /></Field> : null}
              {show('notification service') ? <Field label="Notification service"><TextInput value={meta?.integrations?.notifications?.status || 'Available'} onChange={() => {}} readOnly /></Field> : null}
              {show('external') ? <Field label="External integrations"><TextInput value={meta?.integrations?.external?.status || 'Not configured'} onChange={() => {}} readOnly /></Field> : null}
            </div>
          ) : null}
          {tab === 'system' ? (
            <dl className="settings-status">
              <div><dt>Application version</dt><dd>{meta?.system?.version || '1.0.0'}</dd></div>
              <div><dt>Environment</dt><dd>{meta?.system?.environment || 'development'}</dd></div>
              <div><dt>API health</dt><dd>{meta?.system?.api === 'ok' ? 'Healthy' : 'Unavailable'}</dd></div>
              <div><dt>Database health</dt><dd>{meta?.system?.database === 'connected' ? 'Connected' : 'Unavailable'}</dd></div>
              <div><dt>Maintenance</dt><dd>{meta?.system?.maintenanceMode ? 'On' : 'Off'}</dd></div>
              <div><dt>SMTP</dt><dd>{meta?.integrations?.smtp?.status || 'Not configured'}</dd></div>
              <div><dt>Last configuration update</dt><dd>{meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString() : 'Not saved yet'}{meta?.updatedBy ? ` · ${meta.updatedBy}` : ''}</dd></div>
            </dl>
          ) : null}
        </SettingsFrame>
      ) : null}
    </PageContainer>
  );
}
