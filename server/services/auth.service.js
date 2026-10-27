const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { toPublicUser } = require('../utils/publicUser');
const roleRepository = require('../db/role.repository');
const userRepository = require('../db/user.repository');

const BCRYPT_COST = 12;
let dummyHashPromise;

function getDummyHash() {
  if (!dummyHashPromise) {
    dummyHashPromise = bcrypt.hash('not-a-real-password', BCRYPT_COST);
  }
  return dummyHashPromise;
}

function signToken(userId, remember, sessionMinutes) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: remember ? env.rememberTtl : `${sessionMinutes}m`,
    issuer: 'careyu-pms',
    audience: 'careyu-pms-client',
  });
}

function signRealtimeTicket(userId) {
  return jwt.sign({ sub: userId }, env.jwtSecret, {
    expiresIn: '60s',
    issuer: 'careyu-pms',
    audience: 'careyu-pms-ws',
  });
}

function emptyToNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function signup({ fullName, email, password, department, designation }) {
  const settings = require('./settings.service');
  const policy = await settings.accessPolicy();
  if (!policy.allowSelfRegistration) {
    throw new ApiError(403, 'Self-registration is turned off. Ask an administrator for an account.');
  }
  const problems = settings.passwordProblems(password, policy);
  if (problems.length) {
    throw new ApiError(400, problems.join(' '), { fields: { password: problems.join(' ') } });
  }
  const role = await roleRepository.findByCode(policy.defaultRole) || await roleRepository.findByCode(env.defaultRoleCode);
  if (!role) {
    logger.error('default_role_missing', { roleCode: policy.defaultRole });
    throw new ApiError(500, 'Unable to create an account right now.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  try {
    const user = await userRepository.createUser({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      passwordHash,
      department: emptyToNull(department),
      designation: emptyToNull(designation),
      roleId: role.id,
    });
    if (policy.requireApproval) await userRepository.setAccountStatus(user.id, 'PENDING_INVITATION');
    return toPublicUser(await userRepository.findById(user.id));
  } catch (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'An account with this email already exists.', {
        fields: { email: 'An account with this email already exists.' },
      });
    }
    throw error;
  }
}

async function login({ email, password, rememberMe }) {
  const settings = require('./settings.service');
  const user = await userRepository.findAuthByEmail(email.trim().toLowerCase());
  if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    throw new ApiError(403, 'This account is temporarily locked. Try again later.');
  }
  const hash = user?.password_hash || await getDummyHash();
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !passwordMatches) {
    if (user) {
      const policy = await settings.accessPolicy();
      const count = Number(user.failed_login_count || 0) + 1;
      const lockedUntil = policy.lockoutThreshold > 0 && count >= policy.lockoutThreshold
        ? new Date(Date.now() + policy.lockoutMinutes * 60000)
        : null;
      await userRepository.recordFailedLogin(user.id, { count: lockedUntil ? 0 : count, lockedUntil });
    }
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (user.account_status === 'SUSPENDED') {
    throw new ApiError(403, 'This account is suspended. Contact your administrator.');
  }
  if (user.account_status === 'PENDING_INVITATION') {
    const policy = await settings.accessPolicy();
    throw new ApiError(403, policy.requireApproval
      ? 'An administrator must approve this account before you can sign in.'
      : 'Accept your invitation before signing in.');
  }
  if (user.account_status === 'INACTIVE' || !user.is_active) {
    throw new ApiError(403, 'This account is inactive. Contact your administrator.');
  }
  const policy = await settings.accessPolicy();
  if (policy.inactiveAfterDays > 0 && user.last_login_at) {
    const idle = Date.now() - new Date(user.last_login_at).getTime();
    if (idle > policy.inactiveAfterDays * 24 * 60 * 60 * 1000) {
      throw new ApiError(403, 'This account has been inactive longer than the organization allows. Contact an administrator.');
    }
  }
  if (await settings.maintenanceEnabled() && !['admin', 'super_admin'].includes(user.role_code)) {
    throw new ApiError(403, 'CareYu is in maintenance. Only an administrator can sign in.');
  }

  await userRepository.updateLastLogin(user.id);
  const freshUser = await userRepository.findById(user.id);
  const token = signToken(user.id, Boolean(rememberMe), policy.sessionTimeoutMinutes);

  return {
    token,
    remember: Boolean(rememberMe),
    user: toPublicUser(freshUser),
  };
}

const GENERIC_RESET = 'If an account exists for that email, password reset instructions have been sent.';

async function forgotPassword({ email }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return { message: GENERIC_RESET };
  }
  const user = await userRepository.findAuthByEmail(normalized);
  if (!user || !user.is_active || user.account_status !== 'ACTIVE') {
    return { message: GENERIC_RESET };
  }
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await userRepository.ensureCredentialColumns();
  await require('../db').query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
    [user.id, tokenHash],
  );
  try {
    const mail = require('./emailReport.mail');
    const repository = require('../db/emailReport.repository');
    const settings = await repository.settings();
    const origin = env.clientOrigins[0] || 'http://localhost:5176';
    await mail.sendMail(settings, {
      to: [user.email],
      cc: [],
      bcc: [],
      subject: 'Reset your CareYu password',
      html: `<p>Use this link within 30 minutes to choose a new password.</p><p><a href="${origin}/reset-password?token=${token}">Reset password</a></p>`,
    });
  } catch (error) {
    logger.error('password_reset_mail', { message: error.message });
  }
  return { message: GENERIC_RESET };
}

async function resetWithToken({ token, newPassword, confirmPassword }) {
  const settings = require('./settings.service');
  const crypto = require('crypto');
  const raw = String(token || '');
  const nextPassword = String(newPassword || '');
  const confirm = String(confirmPassword || '');
  const fields = {};
  const problems = settings.passwordProblems(nextPassword, await settings.accessPolicy());
  if (!raw) fields.token = 'This reset link is invalid or has expired.';
  if (problems.length) fields.newPassword = problems.join(' ');
  if (nextPassword !== confirm) fields.confirmPassword = 'The new passwords do not match.';
  if (Object.keys(fields).length) throw new ApiError(400, 'Check the password reset form.', { fields });
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
  const found = await require('../db').query(
    `SELECT id, user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`,
    [tokenHash],
  );
  const row = found.rows[0];
  if (!row) throw new ApiError(400, 'This reset link is invalid or has expired.', { fields: { token: 'This reset link is invalid or has expired.' } });
  await userRepository.updatePassword(row.user_id, await bcrypt.hash(nextPassword, BCRYPT_COST), { mustChange: false });
  await require('../db').query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
  return { message: 'Password updated. Sign in with your new password.' };
}

module.exports = {
  signup,
  login,
  forgotPassword,
  resetWithToken,
  signRealtimeTicket,
};
