const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const jwtSecret = required('JWT_SECRET');

if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}

function databaseConfig() {
  // Keep pool small on shared Aiven plans — orphaned local API processes exhaust slots quickly.
  const max = numberValue('DB_MAX_CONNECTIONS', 5);
  const idleTimeoutMillis = numberValue('DB_IDLE_TIMEOUT_MS', 8000);
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (connectionString) {
    const url = new URL(connectionString);
    const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    if (!url.hostname || !database) throw new Error('DATABASE_URL must include a host and database name');
    return {
      connectionString,
      host: url.hostname,
      port: Number(url.port) || 5432,
      database,
      ssl: true,
      max,
      idleTimeoutMillis,
    };
  }
  return {
    host: required('DB_HOST'),
    port: numberValue('DB_PORT', 5432),
    database: required('DB_NAME'),
    user: required('DB_USER'),
    password: required('DB_PASSWORD'),
    max,
    idleTimeoutMillis,
  };
}

function booleanValue(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function smtpConfig() {
  const portRaw = String(process.env.SMTP_PORT || '').trim();
  const port = portRaw ? Number(portRaw) : 587;
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : 587,
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || ''),
    fromEmail: String(process.env.SMTP_FROM_EMAIL || '').trim(),
    fromName: String(process.env.SMTP_FROM_NAME || 'CareYu Automation').trim() || 'CareYu Automation',
    secure: booleanValue('SMTP_SECURE', Number(portRaw) === 465),
  };
}

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: numberValue('PORT', 5000),
  clientOrigins: (process.env.CLIENT_ORIGIN || 'http://localhost:5176')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  db: databaseConfig(),
  jwtSecret,
  sessionTtl: '12h',
  rememberTtl: '7d',
  cookieName: '__session',
  realtimePublicUrl: String(process.env.REALTIME_PUBLIC_URL || '').trim(),
  defaultRoleCode: 'employee',
  smtp: smtpConfig(),
};

module.exports = env;
