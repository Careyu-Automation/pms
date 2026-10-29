const crypto = require('crypto');
const nodemailer = require('nodemailer');
const env = require('../config/env');

function key() {
  return crypto.createHash('sha256').update(env.jwtSecret).digest();
}

function encrypt(value) {
  const text = String(value || '');
  if (!text) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}

function decrypt(payload) {
  if (!payload) return '';
  try {
    const buffer = Buffer.from(payload, 'base64');
    const iv = buffer.subarray(0, 12);
    const tag = buffer.subarray(12, 28);
    const body = buffer.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function text(value) {
  return String(value ?? '').trim();
}

function pick(dbValue, envValue) {
  const fromDb = text(dbValue);
  return fromDb || text(envValue) || '';
}

function resolveSettings(row) {
  const smtp = env.smtp || {};
  const host = pick(row?.host, smtp.host);
  const fromEmail = pick(row?.from_email, smtp.fromEmail).toLowerCase();
  const username = pick(row?.username, smtp.user);
  const fromName = pick(row?.from_name, smtp.fromName) || 'CareYu Automation';
  const replyTo = text(row?.reply_to);
  const portSource = row?.port != null && row?.port !== '' ? Number(row.port) : Number(smtp.port || 587);
  const port = Number.isInteger(portSource) && portSource > 0 && portSource <= 65535 ? portSource : 587;
  const secure = row?.secure == null ? Boolean(smtp.secure) : Boolean(row.secure);
  const dbPassword = decrypt(row?.password_enc);
  const password = dbPassword || String(smtp.pass || '');
  const source = text(row?.host) ? 'database' : (text(smtp.host) ? 'environment' : 'none');
  return {
    provider: 'SMTP',
    host,
    port,
    username,
    password,
    fromName,
    fromEmail,
    replyTo,
    secure,
    source,
    hasPassword: Boolean(password),
    configured: Boolean(host && fromEmail && password),
  };
}

function publicSettings(row) {
  const resolved = resolveSettings(row);
  return {
    configured: resolved.configured,
    provider: 'SMTP',
    host: resolved.host,
    port: resolved.port,
    username: resolved.username,
    fromName: resolved.fromName,
    fromEmail: resolved.fromEmail,
    replyTo: resolved.replyTo,
    secure: resolved.secure,
    hasPassword: resolved.hasPassword,
    source: resolved.source,
  };
}

function mailError(message, statusCode = 400, code = 'SMTP_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function classifySmtpError(error) {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);
  const raw = String(error?.message || '').toLowerCase();
  if (code === 'EAUTH' || responseCode === 535 || raw.includes('invalid login') || raw.includes('authentication failed')) {
    return mailError('SMTP authentication failed. Check the username and password (or app password).', 400, 'SMTP_AUTH');
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT' || raw.includes('timeout')) {
    return mailError('The SMTP server timed out. Check the host, port, and network access.', 400, 'SMTP_TIMEOUT');
  }
  if (code === 'ECONNECTION' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EDNS') {
    return mailError('Could not connect to the SMTP server. Check the host and port.', 400, 'SMTP_CONNECTION');
  }
  if (code === 'ESOCKET' || raw.includes('ssl') || raw.includes('tls') || raw.includes('certificate')) {
    return mailError('TLS/SSL negotiation failed. Check the secure setting and port (465 secure, 587 STARTTLS).', 400, 'SMTP_TLS');
  }
  if (responseCode === 550 || responseCode === 553 || raw.includes('sender address rejected')) {
    return mailError('The sender address was rejected by the SMTP provider.', 400, 'SMTP_SENDER');
  }
  return mailError('The email could not be delivered. Check the SMTP configuration and try again.', 400, 'SMTP_ERROR');
}

function createTransport(resolved) {
  const host = String(resolved.host || '').trim();
  let port = Number(resolved.port) || 587;
  let secure = Boolean(resolved.secure);
  if (host.toLowerCase() === 'smtp.gmail.com') {
    if (port === 465) secure = true;
    if (port === 587) secure = false;
  }
  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure && port === 587,
    auth: resolved.username || resolved.password
      ? { user: resolved.username || resolved.fromEmail, pass: resolved.password }
      : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    tls: { minVersion: 'TLSv1.2', servername: host },
  });
}

function requireConfigured(resolved) {
  if (!resolved.host || !resolved.fromEmail || !resolved.password) {
    throw mailError('Email is not configured. An administrator needs to save the SMTP settings.', 400, 'SMTP_NOT_CONFIGURED');
  }
}

async function verifyConnection(row) {
  const resolved = resolveSettings(row);
  requireConfigured(resolved);
  const transport = createTransport(resolved);
  try {
    await transport.verify();
    return {
      ok: true,
      host: resolved.host,
      port: resolved.port,
      secure: resolved.secure,
      fromEmail: resolved.fromEmail,
      source: resolved.source,
    };
  } catch (error) {
    throw classifySmtpError(error);
  } finally {
    transport.close();
  }
}

async function sendMail(settingsOrRow, message) {
  const resolved = settingsOrRow && settingsOrRow.password != null && settingsOrRow.host != null && settingsOrRow.configured != null
    ? settingsOrRow
    : resolveSettings(settingsOrRow);
  requireConfigured(resolved);
  const to = (message.to || []).filter(Boolean);
  if (!to.length) throw mailError('Add at least one recipient before sending.', 400, 'SMTP_RECIPIENTS');
  const transport = createTransport(resolved);
  try {
    const info = await transport.sendMail({
      from: `"${resolved.fromName || 'CareYu Automation'}" <${resolved.fromEmail}>`,
      to: to.join(', '),
      cc: (message.cc || []).length ? message.cc.join(', ') : undefined,
      bcc: (message.bcc || []).length ? message.bcc.join(', ') : undefined,
      replyTo: resolved.replyTo || undefined,
      subject: message.subject,
      html: message.html,
      text: message.text,
      attachments: message.attachment,
    });
    if (!info || (!info.messageId && !info.accepted?.length && info.rejected?.length)) {
      throw mailError('The SMTP provider did not accept the message.', 400, 'SMTP_REJECTED');
    }
    return {
      messageId: info.messageId || '',
      accepted: info.accepted || [],
      rejected: info.rejected || [],
    };
  } catch (error) {
    if (error.statusCode) throw error;
    throw classifySmtpError(error);
  } finally {
    transport.close();
  }
}

module.exports = {
  encrypt,
  decrypt,
  publicSettings,
  resolveSettings,
  verifyConnection,
  sendMail,
  classifySmtpError,
};
