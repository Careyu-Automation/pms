const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const bin = 'C:\\Program Files\\PostgreSQL\\18\\bin';
const dataDir = path.join(__dirname, '..', 'data', 'pg');
const port = String(process.env.DB_PORT || '55432');
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const database = process.env.DB_NAME;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    const detail = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
    throw new Error(`${path.basename(command)} failed\n${detail}`);
  }
  return result.stdout || '';
}

function applySql(env) {
  const root = path.join(__dirname, '..', '..', 'database');
  for (const file of ['schema.sql', 'seed.sql']) {
    run(path.join(bin, 'psql.exe'), [
      '-h', 'localhost',
      '-p', port,
      '-U', user,
      '-d', database,
      '-v', 'ON_ERROR_STOP=1',
      '-f', path.join(root, file),
    ], { env });
  }
}

function ensureRunning({ applySchema = false } = {}) {
  if (!user || !password || !database) {
    throw new Error('DB_USER, DB_PASSWORD, and DB_NAME must be set.');
  }
  if (!fs.existsSync(path.join(bin, 'pg_ctl.exe'))) {
    throw new Error('PostgreSQL 18 was not found. Install it, then start the API again.');
  }
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    const passwordFile = path.join(path.dirname(dataDir), 'pg-password.txt');
    fs.writeFileSync(passwordFile, password, { mode: 0o600 });
    try {
      run(path.join(bin, 'initdb.exe'), [
        '-D', dataDir,
        '-U', user,
        '--pwfile', passwordFile,
        '-E', 'UTF8',
        '--locale=C',
        '--auth-local=scram-sha-256',
        '--auth-host=scram-sha-256',
      ]);
    } finally {
      fs.rmSync(passwordFile, { force: true });
    }
  }

  const status = spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', dataDir, 'status'], { encoding: 'utf8', timeout: 10000 });
  if (status.status !== 0) {
    run(path.join(bin, 'pg_ctl.exe'), [
      '-D', dataDir,
      '-l', path.join(path.dirname(dataDir), 'pg.log'),
      '-w',
      '-t', '20',
      '-o', `-p ${port}`,
      'start',
    ], { timeout: 30000 });
  }

  const env = { ...process.env, PGPASSWORD: password };
  const exists = spawnSync(path.join(bin, 'psql.exe'), [
    '-h', 'localhost',
    '-p', port,
    '-U', user,
    '-d', 'postgres',
    '-tAc', `SELECT 1 FROM pg_database WHERE datname = '${database.replace(/'/g, '')}'`,
  ], { encoding: 'utf8', env, timeout: 15000 });
  if (exists.status !== 0) {
    throw new Error((exists.stderr || exists.stdout || 'database check failed').trim());
  }
  const missing = !String(exists.stdout).includes('1');
  if (missing) {
    run(path.join(bin, 'createdb.exe'), ['-h', 'localhost', '-p', port, '-U', user, database], { env });
  }
  if (applySchema || missing) applySql(env);
  return { port, database, started: status.status !== 0 };
}

function main() {
  ensureRunning({ applySchema: true });
  console.log(`project_database_ready port=${port} database=${database}`);
}

if (require.main === module) {
  main();
}

module.exports = { ensureRunning };
