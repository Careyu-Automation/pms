import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageContainer } from '../../components/layout/PageContainer';
import { PageHeader } from '../../components/ui/PageHeader';
import { ErrorState } from '../../components/ui/ErrorState';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../context/AuthContext';
import { useSidebar } from '../../context/SidebarContext';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { applyWorkspacePreferences, changePassword, loadMySettings, saveMySettings } from '../../services/settings.service';
import { CheckInput, Field, LANDING, SelectInput, setPath, SettingsFrame, TextInput, visible } from './settingsFields';
import '../../styles/settings.css';

const TABS = [
  ['profile', 'My Profile'],
  ['appearance', 'Appearance'],
  ['notifications', 'Notifications'],
  ['work', 'Work Preferences'],
  ['security', 'Security'],
].map(([id, label]) => ({ id, label }));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function initials(name) {
  return String(name || '').trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || 'CY';
}

export default function PersonalSettingsPage() {
  useDocumentTitle('Settings');
  const { push } = useToast();
  const { logout } = useAuth();
  const { setThemeMode } = useTheme();
  const { setCollapsed } = useSidebar();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [profile, setProfile] = useState(null);
  const [savedProfile, setSavedProfile] = useState(null);
  const [org, setOrg] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tab, setTab] = useState('profile');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);

  const load = () => {
    setStatus('loading');
    loadMySettings().then((payload) => {
      const preferences = clone(payload.data.preferences);
      const nextProfile = { fullName: payload.data.profile.fullName, phone: payload.data.profile.phone, avatar: payload.data.profile.avatar || '' };
      setSaved(preferences);
      setForm(preferences);
      setSavedProfile(nextProfile);
      setProfile({ ...payload.data.profile, ...nextProfile });
      setOrg(payload.data.organization);
      setPolicy(payload.data.passwordPolicy);
      setUpdatedAt(payload.data.updatedAt);
      applyWorkspacePreferences(preferences);
      setErrors({});
      setStatus('ready');
    }).catch(() => setStatus('error'));
  };

  useEffect(() => { load(); }, []);

  const dirty = Boolean(form && saved && profile && savedProfile) && (
    JSON.stringify(form) !== JSON.stringify(saved)
    || profile.fullName !== savedProfile.fullName
    || profile.phone !== savedProfile.phone
    || profile.avatar !== savedProfile.avatar
  );
  const setPref = (path, value) => setForm((current) => setPath(current, path, value));
  const show = (...parts) => visible(query, ...parts);

  const chooseTheme = (value) => {
    setPref('appearance.theme', value);
    setThemeMode(value);
  };

  const chooseSidebar = (value) => {
    setPref('appearance.sidebarCollapsed', value);
    setCollapsed(value);
  };

  const chooseDensity = (value) => {
    setPref('appearance.density', value);
    document.documentElement.dataset.density = value === 'compact' ? 'compact' : 'comfortable';
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const payload = await saveMySettings({ preferences: form, profile: { fullName: profile.fullName, phone: profile.phone, avatar: profile.avatar } });
      const preferences = clone(payload.data.preferences);
      const nextProfile = { fullName: payload.data.profile.fullName, phone: payload.data.profile.phone, avatar: payload.data.profile.avatar || '' };
      setSaved(preferences);
      setForm(preferences);
      setSavedProfile(nextProfile);
      setProfile({ ...payload.data.profile, ...nextProfile });
      setUpdatedAt(payload.data.updatedAt);
      applyWorkspacePreferences(preferences);
      setThemeMode(preferences.appearance.theme);
      setCollapsed(preferences.appearance.sidebarCollapsed);
      push({ tone: 'success', message: 'Settings saved.' });
    } catch (error) {
      setErrors(error.details?.fields || {});
      push({ tone: 'danger', message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setForm(clone(saved));
    setProfile((current) => ({ ...current, ...savedProfile }));
    setThemeMode(saved.appearance.theme);
    setCollapsed(saved.appearance.sidebarCollapsed);
    applyWorkspacePreferences(saved);
    setErrors({});
  };

  const readAvatar = (file) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setErrors((current) => ({ ...current, 'profile.avatar': 'Use a PNG or JPEG image.' }));
      return;
    }
    if (file.size > 120000) {
      setErrors((current) => ({ ...current, 'profile.avatar': 'Use an image smaller than 120 KB.' }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setProfile((current) => ({ ...current, avatar: String(reader.result || '') }));
    reader.readAsDataURL(file);
  };

  const updatePassword = async () => {
    setPasswordBusy(true);
    setErrors({});
    try {
      await changePassword(password);
      setPassword({ currentPassword: '', newPassword: '', confirmPassword: '' });
      push({ tone: 'success', message: 'Password updated.' });
    } catch (error) {
      setErrors(error.details?.fields || {});
      push({ tone: 'danger', message: error.message });
    } finally {
      setPasswordBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const notes = form?.notifications;
  const emailLocked = org && !org.emailEnabled;
  const inAppLocked = org && !org.inAppEnabled;

  return (
    <PageContainer>
      <PageHeader title="Settings" description="Manage your profile, preferences, and notification behavior." />
      {status === 'loading' ? <p className="settings-note">Loading settings…</p> : null}
      {status === 'error' ? <ErrorState title="Unable to load your settings." description="Your preferences could not be loaded." action={<Button onClick={load}>Try Again</Button>} /> : null}
      {status === 'ready' && form && profile ? (
        <SettingsFrame
          title="Settings"
          subtitle="These choices apply to your account only."
          updatedAt={updatedAt}
          dirty={dirty}
          saving={saving}
          query={query}
          onQuery={setQuery}
          onSave={save}
          onReset={reset}
          tabs={TABS}
          tab={tab}
          onTab={setTab}
        >
          {tab === 'profile' ? (
            <div className="settings-grid">
              {show('photo avatar') ? (
                <div className="settings-avatar settings-field--wide">
                  {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{initials(profile.fullName)}</span>}
                  <Field label="Profile photo" error={errors['profile.avatar']} hint="PNG or JPEG, up to 120 KB. Leave it empty to keep your initials.">
                    <input className="input" type="file" accept="image/png,image/jpeg" onChange={(event) => readAvatar(event.target.files?.[0])} />
                  </Field>
                </div>
              ) : null}
              {show('name') ? <Field label="Full name" error={errors['profile.fullName']}><TextInput value={profile.fullName} onChange={(value) => setProfile({ ...profile, fullName: value })} /></Field> : null}
              {show('email') ? <Field label="Work email" hint="An administrator manages the sign-in email."><TextInput value={profile.email} readOnly /></Field> : null}
              {show('phone') ? <Field label="Phone" error={errors['profile.phone']}><TextInput value={profile.phone} onChange={(value) => setProfile({ ...profile, phone: value })} /></Field> : null}
              {show('designation') ? <Field label="Designation" hint="Managed by an administrator."><TextInput value={profile.designation || 'Not set'} readOnly /></Field> : null}
              {show('department') ? <Field label="Department" hint="Managed by an administrator."><TextInput value={profile.department || 'Not set'} readOnly /></Field> : null}
              {show('team') ? <Field label="Team membership" hint="Taken from Organization Management."><TextInput value={profile.teams?.map((team) => team.name).join(', ') || 'None'} readOnly /></Field> : null}
              {show('manager') ? <Field label="Reporting manager"><TextInput value={profile.managerName || 'Not assigned'} readOnly /></Field> : null}
              {show('role') ? <Field label="Role" hint="You cannot change your own role here."><TextInput value={profile.role} readOnly /></Field> : null}
            </div>
          ) : null}
          {tab === 'appearance' ? (
            <div className="settings-grid">
              {show('theme') ? <Field label="Theme" hint="The choice updates the workspace immediately and is kept after you save."><SelectInput value={form.appearance.theme} onChange={chooseTheme} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></Field> : null}
              {show('density') ? <Field label="Density"><SelectInput value={form.appearance.density} onChange={chooseDensity} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Field> : null}
              {show('sidebar') ? <CheckInput label="Keep the sidebar collapsed" checked={form.appearance.sidebarCollapsed} onChange={chooseSidebar} /> : null}
              {show('landing') ? <Field label="Default landing page" hint="Used the next time you sign in, unless you were sent to a specific page."><SelectInput value={form.appearance.landingPage} onChange={(value) => setPref('appearance.landingPage', value)} options={LANDING.map(([value, label]) => ({ value, label }))} /></Field> : null}
              {show('date') ? <Field label="Date format"><SelectInput value={form.appearance.dateFormat} onChange={(value) => setPref('appearance.dateFormat', value)} options={[{ value: 'DD MMM YYYY', label: 'DD MMM YYYY' }, { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }]} /></Field> : null}
              {show('time format') ? <Field label="Time format"><SelectInput value={form.appearance.timeFormat} onChange={(value) => setPref('appearance.timeFormat', value)} options={[{ value: '12', label: '12-hour' }, { value: '24', label: '24-hour' }]} /></Field> : null}
              {show('time zone') ? <Field label="Time zone"><TextInput value={form.appearance.timeZone} onChange={(value) => setPref('appearance.timeZone', value)} /></Field> : null}
            </div>
          ) : null}
          {tab === 'notifications' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">Organization defaults still apply. You cannot turn off alerts your administrator marked as mandatory. {org?.smtpConfigured ? '' : 'Email delivery is not configured, so email choices are saved for when SMTP is available.'}</p>
              {show('in-app') ? <CheckInput label="In-app notifications" checked={notes.inApp} disabled={inAppLocked} onChange={(value) => setPref('notifications.inApp', value)} /> : null}
              {show('email') ? <CheckInput label="Email notifications" checked={notes.email} disabled={emailLocked} onChange={(value) => setPref('notifications.email', value)} /> : null}
              {show('assignment') ? <CheckInput label="Task assignments" checked={notes.taskAssignment} onChange={(value) => setPref('notifications.taskAssignment', value)} /> : null}
              {show('due') ? <CheckInput label="Task due dates" checked={notes.taskDue} onChange={(value) => setPref('notifications.taskDue', value)} /> : null}
              {show('overdue') ? <CheckInput label={org?.mandatoryOverdue ? 'Overdue tasks (required by the organization)' : 'Overdue tasks'} checked={notes.overdue} disabled={org?.mandatoryOverdue} onChange={(value) => setPref('notifications.overdue', value)} /> : null}
              {show('daily') ? <CheckInput label="Daily Work Update reminders" checked={notes.dailyWork} onChange={(value) => setPref('notifications.dailyWork', value)} /> : null}
              {show('escalation') ? <CheckInput label={org?.mandatoryEscalation ? 'Escalations (required by the organization)' : 'Escalations'} checked={notes.escalation} disabled={org?.mandatoryEscalation} onChange={(value) => setPref('notifications.escalation', value)} /> : null}
              {show('lead feasibility') ? <CheckInput label="Lead and feasibility updates" checked={notes.lead} onChange={(value) => setPref('notifications.lead', value)} /> : null}
              {show('milestone') ? <CheckInput label="Project milestones" checked={notes.milestone} onChange={(value) => setPref('notifications.milestone', value)} /> : null}
              {show('leave') ? <CheckInput label="Leave and permission" checked={notes.leave} onChange={(value) => setPref('notifications.leave', value)} /> : null}
              {show('meeting') ? <CheckInput label="Meeting reminders" checked={notes.meetings} onChange={(value) => setPref('notifications.meetings', value)} /> : null}
            </div>
          ) : null}
          {tab === 'work' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">The assigned-work view and due filter are used the next time you open My Assigned Work.</p>
              {show('task view list board') ? <Field label="Default assigned-work view"><SelectInput value={form.work.taskView} onChange={(value) => setPref('work.taskView', value)} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Board' }]} /></Field> : null}
              {show('due filter') ? <Field label="Default due-date filter"><SelectInput value={form.work.dueFilter} onChange={(value) => setPref('work.dueFilter', value)} options={[{ value: '', label: 'Any date' }, { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'week', label: 'Due this week' }, { value: 'none', label: 'No due date' }]} /></Field> : null}
              {show('dashboard') ? <Field label="Preferred dashboard"><SelectInput value={form.work.landingPage} onChange={(value) => setPref('work.landingPage', value)} options={LANDING.map(([value, label]) => ({ value, label }))} /></Field> : null}
              {show('daily reminder') ? <CheckInput label="Remind me about daily work updates" checked={form.work.dailyReminder} onChange={(value) => setPref('work.dailyReminder', value)} /> : null}
              {show('table density') ? <Field label="Table density" hint="Compact tables use less vertical space."><SelectInput value={form.work.tableDensity} onChange={(value) => { setPref('work.tableDensity', value); document.documentElement.dataset.tableDensity = value; }} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></Field> : null}
            </div>
          ) : null}
          {tab === 'security' ? (
            <div className="settings-grid">
              <p className="settings-note settings-field--wide">Password changes use your current sign-in. The new password is stored only as a hash. Signing out of other browsers is not available because sessions expire on their own.</p>
              {show('current password') ? <Field label="Current password" error={errors.currentPassword}><TextInput type="password" autoComplete="current-password" value={password.currentPassword} onChange={(value) => setPassword({ ...password, currentPassword: value })} /></Field> : null}
              {show('new password') ? <Field label="New password" error={errors.newPassword} hint={policy ? `At least ${policy.minPasswordLength} characters.` : ''}><TextInput type="password" autoComplete="new-password" value={password.newPassword} onChange={(value) => setPassword({ ...password, newPassword: value })} /></Field> : null}
              {show('confirm password') ? <Field label="Confirm new password" error={errors.confirmPassword}><TextInput type="password" autoComplete="new-password" value={password.confirmPassword} onChange={(value) => setPassword({ ...password, confirmPassword: value })} /></Field> : null}
              <div className="settings-field--wide">
                <Button onClick={updatePassword} loading={passwordBusy} disabled={!password.currentPassword || !password.newPassword || !password.confirmPassword}>Update password</Button>
              </div>
              {show('sign out') ? <div className="settings-field--wide"><Button variant="secondary" onClick={signOut}>Sign out</Button></div> : null}
            </div>
          ) : null}
        </SettingsFrame>
      ) : null}
    </PageContainer>
  );
}
