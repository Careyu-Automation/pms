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
  const max = numberValue('DB_MAX_CONNECTIONS', 10);
  const idleTimeoutMillis = numberValue('DB_IDLE_TIMEOUT_MS', 10000);
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
};

module.exports = env;
