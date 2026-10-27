const { query } = require('./index');

const PUBLIC_COLUMNS = `
  u.id,
  u.full_name,
  u.email,
  u.department,
  u.designation,
  u.role_id,
  u.is_active,
  u.account_status,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  u.must_change_password,
  u.credentials_initialized_at,
  r.code AS role_code,
  r.name AS role_name
`;

const PUBLIC_FROM = `
  FROM users u
  INNER JOIN roles r ON r.id = u.role_id
`;

async function findById(id) {
  const result = await query(
    `SELECT ${PUBLIC_COLUMNS}
     ${PUBLIC_FROM}
     WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function ensureCredentialColumns() {
  const { usersAreView } = require('./index');
  if (await usersAreView()) {
    await query(`CREATE TABLE IF NOT EXISTS credential_policy (
      id SMALLINT PRIMARY KEY,
      initial_password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    return;
  }
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials_initialized_at TIMESTAMPTZ`);
  await query(`
    CREATE TABLE IF NOT EXISTS credential_policy (
      id SMALLINT PRIMARY KEY,
      initial_password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
}

async function findAuthByEmail(email) {
  const result = await query(
    `SELECT ${PUBLIC_COLUMNS}, u.password_hash, u.failed_login_count, u.locked_until
     ${PUBLIC_FROM}
     WHERE lower(u.email) = lower($1)`,
    [email],
  );
  return result.rows[0] || null;
}

async function findAuthById(id) {
  const result = await query(
    `SELECT ${PUBLIC_COLUMNS}, u.password_hash
     ${PUBLIC_FROM}
     WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function createUser({ fullName, email, passwordHash, department, designation, roleId }) {
  const result = await query(
    `INSERT INTO users (
       full_name,
       email,
       password_hash,
       department,
       designation,
       role_id
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [fullName, email, passwordHash, department, designation, roleId],
  );
  return findById(result.rows[0].id);
}

async function updateLastLogin(id) {
  await query(
    `UPDATE users
     SET last_login_at = NOW(), failed_login_count = 0, locked_until = NULL
     WHERE id = $1`,
    [id],
  );
}

async function recordFailedLogin(id, { count, lockedUntil }) {
  await query(
    `UPDATE users SET failed_login_count = $2, locked_until = $3 WHERE id = $1`,
    [id, count, lockedUntil],
  );
}

async function updatePassword(id, passwordHash, options = {}) {
  await query(
    `UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1`,
    [id, passwordHash, Boolean(options.mustChange)],
  );
}

async function updateProfile(id, { fullName, phone }) {
  await query('UPDATE users SET full_name = $2, phone = $3 WHERE id = $1', [id, fullName, phone]);
}

async function setAccountStatus(id, status) {
  await query(
    `UPDATE users SET account_status = $2, is_active = $3 WHERE id = $1`,
    [id, status, status === 'ACTIVE'],
  );
}

async function listActive() {
  const result = await query(
    `SELECT ${PUBLIC_COLUMNS}
     ${PUBLIC_FROM}
     WHERE u.is_active = TRUE AND u.account_status = 'ACTIVE'
     ORDER BY u.full_name`,
  );
  return result.rows;
}

module.exports = {
  ensureCredentialColumns,
  findById,
  findAuthByEmail,
  findAuthById,
  createUser,
  updateLastLogin,
  recordFailedLogin,
  updatePassword,
  updateProfile,
  setAccountStatus,
  listActive,
};
