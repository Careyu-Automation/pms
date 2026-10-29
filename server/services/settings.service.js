const fs = require('fs');
const path = require('path');
const ApiError = require('../utils/ApiError');
const env = require('../config/env');
const { checkConnection } = require('../db');
const repository = require('../db/settings.repository');
const mail = require('./emailReport.mail');
const { ADMIN_DEFAULTS, PREFERENCE_DEFAULTS, DAYS, LANDING } = require('./settings.defaults');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const VERSION = '1.0.0';
let maintenanceCache = { at: 0, value: false };
let ready = null;

function ensureReady() {
  if (!ready) ready = repository.ensureSchema();
  return ready;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function merge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const next = Array.isArray(base) ? [...base] : { ...base };
  Object.keys(patch).forEach((key) => {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      next[key] = merge(base[key], value);
    } else if (value !== undefined) {
      next[key] = value;
    }
  });
  return next;
}

function text(value, max) {
  return String(value || '').trim().slice(0, max);
}

function bool(value) {
  return value === true;
}

function numberIn(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function oneOf(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function fieldsError(fields) {
  const first = Object.values(fields)[0];
  return new ApiError(400, first || 'Check the settings and try again.', { fields });
}

function normalizeAdmin(input) {
  const source = merge(clone(ADMIN_DEFAULTS), input || {});
  const fields = {};
  const general = source.general;
  general.organizationName = text(general.organizationName, 120);
  general.organizationEmail = text(general.organizationEmail, 200).toLowerCase();
  general.contactPhone = text(general.contactPhone, 40);
  general.timeZone = text(general.timeZone, 80) || 'Asia/Kolkata';
  general.dateFormat = oneOf(general.dateFormat, ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'], 'DD MMM YYYY');
  general.timeFormat = oneOf(general.timeFormat, ['12', '24'], '12');
  general.currency = oneOf(general.currency, ['INR'], 'INR');
  general.language = 'en';
  general.workingDays = [...new Set((Array.isArray(general.workingDays) ? general.workingDays : []).filter((day) => DAYS.includes(day)))];
  general.workStart = TIME.test(general.workStart) ? general.workStart : '09:00';
  general.workEnd = TIME.test(general.workEnd) ? general.workEnd : '18:00';
  general.weeklyHoliday = oneOf(general.weeklyHoliday, DAYS, 'sun');
  general.landingPage = oneOf(general.landingPage, LANDING, '/dashboard');
  general.maintenanceMode = bool(general.maintenanceMode);
  if (general.organizationName.length < 2) fields['general.organizationName'] = 'Organization name is required.';
  if (general.organizationEmail && !EMAIL.test(general.organizationEmail)) fields['general.organizationEmail'] = 'Enter a valid organization email.';
  if (general.contactPhone && !/^[0-9+\-\s()]{7,40}$/.test(general.contactPhone)) fields['general.contactPhone'] = 'Enter a valid contact phone.';
  if (!general.workingDays.length) fields['general.workingDays'] = 'Choose at least one working day.';
  if (general.workStart >= general.workEnd) fields['general.workEnd'] = 'Working hours must end after they start.';

  const access = source.access;
  access.defaultRole = text(access.defaultRole, 40) || 'employee';
  access.allowSelfRegistration = bool(access.allowSelfRegistration);
  access.requireApproval = bool(access.requireApproval);
  access.sessionTimeoutMinutes = numberIn(access.sessionTimeoutMinutes, 15, 10080, 720);
  access.minPasswordLength = numberIn(access.minPasswordLength, 8, 64, 8);
  access.requireUppercase = bool(access.requireUppercase);
  access.requireLowercase = bool(access.requireLowercase);
  access.requireNumber = bool(access.requireNumber);
  access.requireSpecial = bool(access.requireSpecial);
  access.lockoutThreshold = numberIn(access.lockoutThreshold, 0, 20, 5);
  access.lockoutMinutes = numberIn(access.lockoutMinutes, 1, 1440, 15);
  access.inactiveAfterDays = numberIn(access.inactiveAfterDays, 0, 3650, 0);

  const notes = source.notifications;
  notes.emailEnabled = bool(notes.emailEnabled);
  notes.inAppEnabled = bool(notes.inAppEnabled);
  ['taskAssignment', 'taskDue', 'overdue', 'dailyWork', 'escalation', 'leadLifecycle', 'feasibility', 'costing', 'milestones', 'leave', 'mandatoryEscalation', 'mandatoryOverdue'].forEach((key) => {
    notes[key] = bool(notes[key]);
  });
  notes.taskDueHours = numberIn(notes.taskDueHours, 1, 168, 24);
  notes.dailyWorkTime = TIME.test(notes.dailyWorkTime) ? notes.dailyWorkTime : '18:00';
  notes.emailReportDefault = oneOf(notes.emailReportDefault, ['NONE', 'DAILY', 'WEEKLY'], 'WEEKLY');
  notes.recipientMode = oneOf(notes.recipientMode, ['ASSIGNEE', 'TEAM_LEAD', 'MANAGER'], 'ASSIGNEE');

  const flow = source.workflow;
  flow.leadPriority = oneOf(flow.leadPriority, ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM');
  flow.leadStage = oneOf(flow.leadStage, ['DRAFT'], 'DRAFT');
  flow.pmReviewRequired = bool(flow.pmReviewRequired);
  flow.feasibilityRequired = bool(flow.feasibilityRequired);
  flow.costingRequired = bool(flow.costingRequired);
  flow.quotationApproval = oneOf(flow.quotationApproval, ['BUSINESS_HEAD', 'PROJECT_MANAGER'], 'BUSINESS_HEAD');
  flow.orderConversion = oneOf(flow.orderConversion, ['BUSINESS_HEAD', 'PROJECT_MANAGER'], 'BUSINESS_HEAD');
  flow.projectPriority = oneOf(flow.projectPriority, ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM');
  flow.taskPriority = oneOf(flow.taskPriority, ['LOW', 'MEDIUM', 'HIGH'], 'MEDIUM');
  flow.taskStatus = oneOf(flow.taskStatus, ['PENDING', 'IN_PROGRESS'], 'PENDING');
  flow.teamLeadReview = bool(flow.teamLeadReview);
  flow.requireDailyWork = bool(flow.requireDailyWork);
  flow.escalationAfterDays = numberIn(flow.escalationAfterDays, 1, 90, 2);
  flow.completionApproval = oneOf(flow.completionApproval, ['PROJECT_MANAGER', 'ENGINEERING_DIRECTOR'], 'PROJECT_MANAGER');
  flow.dailyReminderTime = TIME.test(flow.dailyReminderTime) ? flow.dailyReminderTime : '18:00';
  flow.workDescriptionRequired = bool(flow.workDescriptionRequired);
  flow.nextActionRequired = bool(flow.nextActionRequired);
  flow.blockerExplanationRequired = bool(flow.blockerExplanationRequired);
  flow.defaultWorkStatus = oneOf(flow.defaultWorkStatus, ['IN_PROGRESS', 'PENDING'], 'IN_PROGRESS');

  const data = source.data;
  data.backupSchedule = oneOf(data.backupSchedule, ['NONE', 'DAILY', 'WEEKLY'], 'NONE');
  data.documentRetentionDays = numberIn(data.documentRetentionDays, 0, 3650, 0);
  data.auditRetentionDays = numberIn(data.auditRetentionDays, 0, 3650, 0);
  data.exportFormat = oneOf(data.exportFormat, ['XLSX', 'CSV'], 'XLSX');

  if (Object.keys(fields).length) throw fieldsError(fields);
  return {
    general, access, notifications: notes, workflow: flow, data,
  };
}

function normalizePreferences(input, admin) {
  const source = merge(clone(PREFERENCE_DEFAULTS), input || {});
  const appearance = source.appearance;
  appearance.theme = oneOf(appearance.theme, ['light', 'dark', 'system'], 'light');
  appearance.density = oneOf(appearance.density, ['comfortable', 'compact'], 'comfortable');
  appearance.sidebarCollapsed = bool(appearance.sidebarCollapsed);
  appearance.landingPage = oneOf(appearance.landingPage, LANDING, '/dashboard');
  appearance.dateFormat = oneOf(appearance.dateFormat, ['DD MMM YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'], 'DD MMM YYYY');
  appearance.timeFormat = oneOf(appearance.timeFormat, ['12', '24'], '12');
  appearance.timeZone = text(appearance.timeZone, 80) || 'Asia/Kolkata';
  if (appearance.avatar) delete appearance.avatar;

  const notifications = source.notifications;
  Object.keys(PREFERENCE_DEFAULTS.notifications).forEach((key) => {
    notifications[key] = bool(notifications[key]);
  });
  if (!admin.notifications.emailEnabled) notifications.email = false;
  if (!admin.notifications.inAppEnabled) notifications.inApp = false;
  if (admin.notifications.mandatoryEscalation) notifications.escalation = true;
  if (admin.notifications.mandatoryOverdue) notifications.overdue = true;

  const work = source.work;
  work.taskView = oneOf(work.taskView, ['list', 'board'], 'list');
  work.dueFilter = oneOf(work.dueFilter, ['', 'overdue', 'today', 'week', 'none'], '');
  work.landingPage = oneOf(work.landingPage, LANDING, '/dashboard');
  work.dailyReminder = bool(work.dailyReminder);
  work.tableDensity = oneOf(work.tableDensity, ['comfortable', 'compact'], 'comfortable');
  return { appearance, notifications, work };
}

function passwordProblems(password, policy) {
  const value = String(password || '');
  const problems = [];
  const min = policy?.minPasswordLength || 8;
  if (value.length < min) problems.push(`Use at least ${min} characters.`);
  if (policy?.requireUppercase && !/[A-Z]/.test(value)) problems.push('Include an uppercase letter.');
  if (policy?.requireLowercase && !/[a-z]/.test(value)) problems.push('Include a lowercase letter.');
  if (policy?.requireNumber && !/\d/.test(value)) problems.push('Include a number.');
  if (policy?.requireSpecial && !/[^A-Za-z0-9]/.test(value)) problems.push('Include a special character.');
  return problems;
}

async function adminDocument() {
  await ensureReady();
  const row = await repository.systemRow();
  return {
    settings: normalizeAdmin(row.settings),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by_name || '',
  };
}

async function maintenanceEnabled() {
  if (Date.now() - maintenanceCache.at < 5000) return maintenanceCache.value;
  try {
    const document = await adminDocument();
    maintenanceCache = { at: Date.now(), value: Boolean(document.settings.general.maintenanceMode) };
  } catch {
    maintenanceCache = { at: Date.now(), value: false };
  }
  return maintenanceCache.value;
}

async function accessPolicy() {
  const document = await adminDocument();
  return document.settings.access;
}

async function sessionMinutes() {
  const policy = await accessPolicy();
  return policy.sessionTimeoutMinutes;
}

function isAdmin(user) {
  return ['admin', 'super_admin'].includes(user?.role?.code || '');
}

function assertAdmin(user) {
  if (!isAdmin(user)) throw new ApiError(403, 'Only an administrator can change these settings.');
}

async function folderUsage(dir) {
  let bytes = 0;
  let files = 0;
  async function walk(folder) {
    let entries = [];
    try {
      entries = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        try {
          const stat = await fs.promises.stat(full);
          bytes += stat.size;
          files += 1;
        } catch {
          /* skip a file that disappears while it is counted */
        }
      }
    }
  }
  await walk(dir);
  return { bytes, files };
}

async function integrationStatus() {
  const row = await repository.emailSettings();
  const smtp = mail.publicSettings(row);
  let database = 'unavailable';
  try {
    await checkConnection();
    database = 'connected';
  } catch {
    database = 'unavailable';
  }
  const uploads = path.join(__dirname, '..', 'uploads');
  const storage = await folderUsage(uploads);
  return {
    smtp: {
      ...smtp,
      status: smtp.configured ? 'Configured' : 'Not configured',
    },
    database: { status: database === 'connected' ? 'Connected' : 'Unavailable' },
    storage: {
      kind: 'Local server storage',
      path: 'server/uploads',
      bytes: storage.bytes,
      files: storage.files,
      status: storage.files ? 'In use' : 'Empty',
    },
    notifications: { status: 'In-app notifications are available' },
    external: { status: 'Not configured' },
  };
}

async function systemInfo(document) {
  let database = 'unavailable';
  try {
    await checkConnection();
    database = 'connected';
  } catch {
    database = 'unavailable';
  }
  return {
    version: VERSION,
    environment: env.nodeEnv,
    api: 'ok',
    database,
    maintenanceMode: Boolean(document.settings.general.maintenanceMode),
    updatedAt: document.updatedAt,
    updatedBy: document.updatedBy,
    backup: {
      lastCompletedAt: null,
      schedule: document.settings.data.backupSchedule,
      note: 'No backup has been recorded by this application.',
    },
  };
}

async function adminHome(user) {
  assertAdmin(user);
  const document = await adminDocument();
  const [roles, integrations, system] = await Promise.all([
    repository.roles(),
    integrationStatus(),
    systemInfo(document),
  ]);
  const known = roles.some((role) => role.code === document.settings.access.defaultRole);
  if (!known) document.settings.access.defaultRole = 'employee';
  return { ...document, roles, integrations, system, mfa: 'unavailable' };
}

async function saveAdmin(user, body) {
  assertAdmin(user);
  const current = await adminDocument();
  const smtp = body?.smtp;
  const patch = { ...(body || {}) };
  delete patch.smtp;
  delete patch.updatedAt;
  delete patch.updatedBy;
  const settings = normalizeAdmin(merge(current.settings, patch));
  const roles = await repository.roles();
  if (!roles.some((role) => role.code === settings.access.defaultRole)) {
    throw fieldsError({ 'access.defaultRole': 'Choose a role that exists in CareYu.' });
  }
  if (smtp) await saveSmtp(user, smtp);
  const saved = await repository.saveSystem(settings, user.id);
  maintenanceCache = { at: Date.now(), value: Boolean(settings.general.maintenanceMode) };
  const document = {
    settings: normalizeAdmin(saved.settings),
    updatedAt: saved.updated_at,
    updatedBy: saved.updated_by_name || user.fullName || '',
  };
  const [integrations, system] = await Promise.all([integrationStatus(), systemInfo(document)]);
  return { ...document, roles, integrations, system, mfa: 'unavailable' };
}

async function saveSmtp(user, smtp) {
  let host = text(smtp.host, 200);
  const fromEmail = text(smtp.fromEmail, 200).toLowerCase();
  let port = numberIn(smtp.port, 1, 65535, 587);
  let secure = bool(smtp.secure);
  const fields = {};
  if (host && EMAIL.test(host)) {
    fields['smtp.host'] = 'Use smtp.gmail.com here, not the email address.';
  }
  if (/gmail\.com$/i.test(host) && !/^smtp\./i.test(host)) host = 'smtp.gmail.com';
  if (host.toLowerCase() === 'smtp.gmail.com') {
    if (port === 465) secure = true;
    if (port === 587) secure = false;
  }
  if (host && !fromEmail) fields['smtp.fromEmail'] = 'A from address is required when SMTP host is set.';
  if (fromEmail && !EMAIL.test(fromEmail)) fields['smtp.fromEmail'] = 'Enter a valid from email.';
  const replyTo = text(smtp.replyTo, 200).toLowerCase();
  if (replyTo && !EMAIL.test(replyTo)) fields['smtp.replyTo'] = 'Enter a valid reply-to email.';
  const password = String(smtp.password || '');
  const current = await repository.emailSettings();
  if (host && !password && !current?.password_enc && !env.smtp?.pass) {
    fields['smtp.password'] = 'Enter the Gmail app password (not the normal login password).';
  }
  if (Object.keys(fields).length) throw fieldsError(fields);
  await repository.saveEmailSettings({
    host,
    port,
    username: text(smtp.username, 200) || fromEmail,
    passwordEnc: password ? mail.encrypt(password) : '',
    fromName: text(smtp.fromName, 120) || 'CareYu Automation',
    fromEmail,
    replyTo,
    secure,
    updatedBy: user.id,
  });
}

async function presentProfile(userId, preferences) {
  const row = await repository.profile(userId);
  if (!row.user) throw new ApiError(404, 'Account not found.');
  return {
    fullName: row.user.full_name,
    email: row.user.email,
    phone: row.user.phone || '',
    designation: row.user.designation || '',
    department: row.user.department || '',
    role: row.user.role_name,
    managerName: row.user.manager_name || '',
    teams: row.teams.map((team) => ({ name: team.name, role: team.role })),
    avatar: text(preferences.avatar, 200000),
  };
}

async function myHome(user) {
  await ensureReady();
  const admin = await adminDocument();
  const row = await repository.preferenceRow(user.id);
  const preferences = normalizePreferences(row.preferences, admin.settings);
  const profile = await presentProfile(user.id, row.preferences || {});
  return {
    profile,
    preferences,
    updatedAt: row.updated_at,
    organization: {
      emailEnabled: admin.settings.notifications.emailEnabled,
      inAppEnabled: admin.settings.notifications.inAppEnabled,
      mandatoryEscalation: admin.settings.notifications.mandatoryEscalation,
      mandatoryOverdue: admin.settings.notifications.mandatoryOverdue,
      smtpConfigured: (await integrationStatus()).smtp.configured,
    },
    passwordPolicy: admin.settings.access,
  };
}

async function saveMine(user, body) {
  const admin = await adminDocument();
  const current = await repository.preferenceRow(user.id);
  const preferences = normalizePreferences(merge(current.preferences || {}, body?.preferences || {}), admin.settings);
  preferences.avatar = text(current.preferences?.avatar, 200000);
  if (body && body.profile) {
    const profileInput = body.profile;
    const fullName = text(profileInput.fullName, 150);
    const phone = text(profileInput.phone, 40);
    const fields = {};
    if (fullName.length < 2) fields['profile.fullName'] = 'Enter your name.';
    if (phone && !/^[0-9+\-\s()]{7,40}$/.test(phone)) fields['profile.phone'] = 'Enter a valid phone number.';
    const avatar = text(profileInput.avatar, 200000);
    if (avatar && !avatar.startsWith('data:image/')) fields['profile.avatar'] = 'Use a PNG or JPEG image.';
    if (avatar.length > 180000) fields['profile.avatar'] = 'Use an image smaller than 120 KB.';
    if (Object.keys(fields).length) throw fieldsError(fields);
    preferences.avatar = avatar;
    const userRepository = require('../db/user.repository');
    await userRepository.updateProfile(user.id, { fullName, phone });
  }
  const saved = await repository.savePreferences(user.id, preferences);
  const stored = normalizePreferences(saved.preferences, admin.settings);
  stored.avatar = saved.preferences.avatar || '';
  return {
    profile: await presentProfile(user.id, saved.preferences),
    preferences: {
      appearance: stored.appearance,
      notifications: stored.notifications,
      work: stored.work,
    },
    updatedAt: saved.updated_at,
  };
}

async function changePassword(user, body) {
  const policy = await accessPolicy();
  const currentPassword = String(body?.currentPassword || '');
  const nextPassword = String(body?.newPassword || '');
  const confirm = String(body?.confirmPassword || '');
  const userRepository = require('../db/user.repository');
  const bcrypt = require('bcryptjs');
  const account = await userRepository.findAuthById(user.id);
  if (!account) throw new ApiError(404, 'Account not found.');
  const matches = await bcrypt.compare(currentPassword, account.password_hash);
  const fields = {};
  if (!matches) fields.currentPassword = 'Current password is incorrect.';
  const problems = passwordProblems(nextPassword, policy);
  if (problems.length) fields.newPassword = problems.join(' ');
  if (nextPassword !== confirm) fields.confirmPassword = 'The new passwords do not match.';
  if (Object.keys(fields).length) throw fieldsError(fields);
  await userRepository.updatePassword(user.id, await bcrypt.hash(nextPassword, 12), { mustChange: false });
}

module.exports = {
  ensureReady,
  maintenanceEnabled,
  accessPolicy,
  sessionMinutes,
  passwordProblems,
  isAdmin,
  adminHome,
  saveAdmin,
  myHome,
  saveMine,
  changePassword,
};
