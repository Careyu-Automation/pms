const { query } = require('./index');

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS system_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES users (id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT system_settings_singleton CHECK (id = 1)
  )`,
  'INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING',
  `CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ',
];

async function ensureSchema() {
  const { usersAreView } = require('./index');
  if (await usersAreView()) {
    await query(`CREATE TABLE IF NOT EXISTS system_settings (
      id SMALLINT PRIMARY KEY DEFAULT 1,
      settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT system_settings_singleton CHECK (id = 1)
    )`);
    await query('INSERT INTO system_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id UUID PRIMARY KEY,
      preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    return;
  }
  for (const statement of SCHEMA) await query(statement);
}

async function systemRow() {
  const result = await query(
    `SELECT s.settings, s.updated_at, u.full_name AS updated_by_name
     FROM system_settings s
     LEFT JOIN users u ON u.id = s.updated_by
     WHERE s.id = 1`,
  );
  return result.rows[0] || { settings: {}, updated_at: null, updated_by_name: '' };
}

async function saveSystem(settings, userId) {
  await query(
    `INSERT INTO system_settings (id, settings, updated_by)
     VALUES (1, $1::jsonb, $2)
     ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [JSON.stringify(settings), userId],
  );
  return systemRow();
}

async function preferenceRow(userId) {
  const result = await query('SELECT preferences, updated_at FROM user_preferences WHERE user_id = $1', [userId]);
  return result.rows[0] || { preferences: {}, updated_at: null };
}

async function savePreferences(userId, preferences) {
  await query(
    `INSERT INTO user_preferences (user_id, preferences)
     VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()`,
    [userId, JSON.stringify(preferences)],
  );
  return preferenceRow(userId);
}

async function profile(userId) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.designation, u.department, u.employee_code,
            mgr.full_name AS manager_name, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN users mgr ON mgr.id = u.reporting_manager_id
     WHERE u.id = $1`,
    [userId],
  );
  const teams = await query(
    `SELECT t.name, m.role
     FROM team_members m
     JOIN teams t ON t.id = m.team_id
     WHERE m.user_id = $1 AND m.status = 'ACTIVE'
     ORDER BY m.is_primary DESC, t.name`,
    [userId],
  );
  return { user: result.rows[0] || null, teams: teams.rows };
}

async function roles() {
  const result = await query('SELECT code, name FROM roles ORDER BY name');
  return result.rows;
}

async function emailSettings() {
  const result = await query('SELECT * FROM email_settings WHERE id = 1');
  return result.rows[0] || null;
}

async function saveEmailSettings(input) {
  await query(
    `INSERT INTO email_settings (
       id, provider, host, port, username, password_enc, from_name, from_email, reply_to, secure, updated_by, updated_at
     ) VALUES (
       1, 'SMTP', $1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, NOW()
     )
     ON CONFLICT (id) DO UPDATE SET
       provider = 'SMTP',
       host = EXCLUDED.host,
       port = EXCLUDED.port,
       username = EXCLUDED.username,
       password_enc = CASE WHEN EXCLUDED.password_enc IS NULL OR EXCLUDED.password_enc = '' THEN email_settings.password_enc ELSE EXCLUDED.password_enc END,
       from_name = EXCLUDED.from_name,
       from_email = EXCLUDED.from_email,
       reply_to = EXCLUDED.reply_to,
       secure = EXCLUDED.secure,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [input.host, input.port, input.username, input.passwordEnc || '', input.fromName, input.fromEmail, input.replyTo, input.secure, input.updatedBy],
  );
}

module.exports = {
  ensureSchema,
  systemRow,
  saveSystem,
  preferenceRow,
  savePreferences,
  profile,
  roles,
  emailSettings,
  saveEmailSettings,
};
