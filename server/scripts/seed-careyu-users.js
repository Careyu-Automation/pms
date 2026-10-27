const bcrypt = require('bcryptjs');
const { query, pool } = require('../db');

const USERS = [
  { email: 'ceo@careyu.ai', name: 'Bernard Hamilton P', phone: '9941014234', designation: 'CEO', department: 'Executive', role: 'admin', scope: 'ORGANIZATION', code: 'CY-CEO' },
  { email: 'cto@careyu.ai', name: 'Raja', phone: '', designation: 'CTO', department: 'Engineering', role: 'management', scope: 'ENGINEERING', code: 'CY-CTO', manager: 'ceo@careyu.ai' },
  { email: 'businesshead@careyu.ai', name: 'Shradha Patil', phone: '8925991742', designation: 'Business Head', department: 'Business', role: 'management', scope: 'BUSINESS', code: 'CY-BH', manager: 'ceo@careyu.ai' },
  { email: 'engg.director@careyu.ai', name: 'Sabarigiri T', phone: '8925940385', designation: 'Engineering Director', department: 'Engineering', role: 'management', scope: 'ALL_TEAMS', code: 'CY-ED', manager: 'ceo@careyu.ai' },
  { email: 'robotlead1@careyu.ai', name: 'Arivan A', phone: '8925940389', designation: 'Project Manager', department: 'Projects', role: 'project_manager', scope: 'PROJECTS', code: 'CY-PM', manager: 'engg.director@careyu.ai', coManager: 'businesshead@careyu.ai' },
  { email: 'projects@careyu.ai', name: 'Vanippriya', phone: '9003245169', designation: 'Vision Team Lead', department: 'Vision', role: 'team_lead', scope: 'TEAM_ONLY', code: 'CY-VIS', manager: 'engg.director@careyu.ai' },
  { email: 'fsdlead1@careyu.ai', name: 'Arun Kumar S', phone: '9092973115', designation: 'Software Team Lead', department: 'Software', role: 'team_lead', scope: 'TEAM_ONLY', code: 'CY-SWL', manager: 'robotlead1@careyu.ai' },
  { email: 'fsdengg1@careyu.ai', name: 'Kabitha', phone: '9629244559', designation: 'Software Engineer', department: 'Software', role: 'employee', scope: 'TEAM_ONLY', code: 'CY-SWE', manager: 'fsdlead1@careyu.ai' },
  { email: 'robottech@careyu.ai', name: 'Aakash S', phone: '9600064603', designation: 'Robotics Technician', department: 'Robotics', role: 'employee', scope: 'TEAM_ONLY', code: 'CY-RBT', manager: 'robotlead1@careyu.ai' },
];

const MEMBERSHIPS = [
  ['fsdlead1@careyu.ai', 'software', 'TEAM_LEAD', true],
  ['fsdengg1@careyu.ai', 'software', 'MEMBER', true],
  ['robotlead1@careyu.ai', 'robotics', 'TEAM_LEAD', true],
  ['robottech@careyu.ai', 'robotics', 'MEMBER', true],
  ['projects@careyu.ai', 'vision', 'TEAM_LEAD', true],
];

async function main() {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS co_manager_id UUID REFERENCES users (id) ON DELETE SET NULL`);
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_not_own_co_manager`);
  await query(`ALTER TABLE users ADD CONSTRAINT users_not_own_co_manager CHECK (co_manager_id IS NULL OR co_manager_id <> id)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS access_scope VARCHAR(30) NOT NULL DEFAULT 'TEAM_ONLY'`);
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_scope_check`);
  await query(`ALTER TABLE users ADD CONSTRAINT users_access_scope_check CHECK (access_scope IN ('ORGANIZATION', 'ALL_TEAMS', 'ENGINEERING', 'BUSINESS', 'PROJECTS', 'TEAM_ONLY'))`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE'`);
  await query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_status_check`);
  await query(`ALTER TABLE users ADD CONSTRAINT users_account_status_check CHECK (account_status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_INVITATION'))`);
  await query(`ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check`);
  await query(`ALTER TABLE team_members ADD CONSTRAINT team_members_role_check CHECK (role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER', 'OVERSIGHT', 'PROJECT_COORDINATION'))`);

  const demo = await query(`SELECT id FROM users WHERE email LIKE '%@careyu.local'`);
  const demoIds = demo.rows.map((row) => row.id);
  if (demoIds.length) {
    await query(`DELETE FROM team_members WHERE user_id = ANY($1::uuid[])`, [demoIds]);
    await query(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::uuid[])`, [demoIds]);
    await query(`DELETE FROM organization_activity WHERE target_user_id = ANY($1::uuid[]) OR actor_id = ANY($1::uuid[])`, [demoIds]);
    await query(`UPDATE teams SET lead_id = NULL WHERE lead_id = ANY($1::uuid[])`, [demoIds]);
    await query(`UPDATE users SET reporting_manager_id = NULL WHERE reporting_manager_id = ANY($1::uuid[]) OR id = ANY($1::uuid[])`, [demoIds]);
    await query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [demoIds]);
  }

  const passwordHash = await bcrypt.hash(`careyu-directory-${Date.now()}`, 10);
  const roles = await query('SELECT id, code FROM roles');
  const roleId = Object.fromEntries(roles.rows.map((row) => [row.code, row.id]));
  const ids = {};

  for (const person of USERS) {
    const existing = await query('SELECT id FROM users WHERE email = $1', [person.email]);
    if (existing.rows[0]) {
      ids[person.email] = existing.rows[0].id;
      await query(
        `UPDATE users
         SET full_name=$2, phone=$3, designation=$4, department=$5, role_id=$6, access_scope=$7,
             employee_code=$8, employment_status='ACTIVE', account_status='ACTIVE', is_active=TRUE
         WHERE id=$1`,
        [ids[person.email], person.name, person.phone, person.designation, person.department, roleId[person.role], person.scope, person.code],
      );
    } else {
      const inserted = await query(
        `INSERT INTO users (
           full_name, email, password_hash, phone, department, designation, role_id, employee_code,
           employment_status, account_status, is_active, access_scope
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ACTIVE','ACTIVE',TRUE,$9)
         RETURNING id`,
        [person.name, person.email, passwordHash, person.phone, person.department, person.designation, roleId[person.role], person.code, person.scope],
      );
      ids[person.email] = inserted.rows[0].id;
    }
  }

  for (const person of USERS) {
    await query(
      'UPDATE users SET reporting_manager_id=$2, co_manager_id=$3 WHERE id=$1',
      [ids[person.email], person.manager ? ids[person.manager] : null, person.coManager ? ids[person.coManager] : null],
    );
  }

  await query(`UPDATE teams SET name = 'Robotics & Solutions Team' WHERE code = 'robotics'`);
  await query(`UPDATE teams SET name = 'Procurement / Costing Team' WHERE code = 'procurement'`);

  const realIds = USERS.map((person) => ids[person.email]);
  await query(`DELETE FROM team_members WHERE user_id = ANY($1::uuid[])`, [realIds]);
  for (const [email, code, role, primary] of MEMBERSHIPS) {
    const team = await query('SELECT id FROM teams WHERE code=$1', [code]);
    await query(
      `INSERT INTO team_members (team_id, user_id, role, status, is_primary)
       VALUES ($1,$2,$3,'ACTIVE',$4)
       ON CONFLICT (team_id, user_id) DO UPDATE SET role=EXCLUDED.role, status='ACTIVE', is_primary=EXCLUDED.is_primary`,
      [team.rows[0].id, ids[email], role, primary],
    );
    if (role === 'TEAM_LEAD') await query('UPDATE teams SET lead_id=$2 WHERE id=$1', [team.rows[0].id, ids[email]]);
  }

  const check = await query(
    `SELECT u.full_name, u.email, t.code, m.role
     FROM users u
     LEFT JOIN team_members m ON m.user_id = u.id AND m.status = 'ACTIVE' AND m.role IN ('TEAM_LEAD','MEMBER')
     LEFT JOIN teams t ON t.id = m.team_id
     WHERE u.email = ANY($1::text[])
     ORDER BY u.full_name`,
    [USERS.map((person) => person.email)],
  );
  console.log(check.rows.map((row) => `${row.full_name}|${row.email}|${row.code || '-'}|${row.role || '-'}`).join('\n'));
  console.log('careyu_users_ready');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => pool.end());
