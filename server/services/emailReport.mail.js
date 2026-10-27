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
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const body = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

function publicSettings(row) {
  if (!row) {
    return { configured: false, provider: 'SMTP', host: '', port: 587, username: '', fromName: 'CareYu Automation', fromEmail: '', replyTo: '', secure: false, hasPassword: false };
  }
  return {
    configured: Boolean(row.host && row.from_email && row.password_enc),
    provider: row.provider,
    host: row.host,
    port: row.port,
    username: row.username,
    fromName: row.from_name,
    fromEmail: row.from_email,
    replyTo: row.reply_to,
    secure: row.secure,
    hasPassword: Boolean(row.password_enc),
  };
}

async function sendMail(settings, message) {
  if (!settings?.host || !settings?.from_email || !settings?.password_enc) {
    const error = new Error('Email is not configured. An administrator needs to save the SMTP settings.');
    error.statusCode = 400;
    throw error;
  }
  const transport = nodemailer.createTransport({
    host: settings.host,
    port: Number(settings.port) || 587,
    secure: Boolean(settings.secure),
    auth: settings.username ? { user: settings.username, pass: decrypt(settings.password_enc) } : undefined,
  });
  await transport.sendMail({
    from: `"${settings.from_name || 'CareYu Automation'}" <${settings.from_email}>`,
    to: message.to.join(', '),
    cc: message.cc.length ? message.cc.join(', ') : undefined,
    bcc: message.bcc.length ? message.bcc.join(', ') : undefined,
    replyTo: settings.reply_to || undefined,
    subject: message.subject,
    html: message.html,
    attachments: message.attachment,
  });
}

module.exports = { encrypt, decrypt, publicSettings, sendMail };
