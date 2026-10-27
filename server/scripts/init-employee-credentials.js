const bcrypt = require('bcryptjs');
const { query, pool } = require('../db');
const userRepository = require('../db/user.repository');

const REQUESTED = [
  ['Aakash S', 'robottech@careyu.ai'],
  ['Arivan A', 'robotlead1@careyu.ai'],
  ['Arun Kumar S', 'fsdlead1@careyu.ai'],
  ['Bernard Hamilton P', 'ceo@careyu.ai'],
  ['CareYu Admin', 'admin@careyu.com'],
  ['Kabitha', 'fsdengg1@careyu.ai'],
  ['Raja', 'cto@careyu.ai'],
  ['Sabarigiri T', 'engg.director@careyu.ai'],
  ['Shradha Patil', 'businesshead@careyu.ai'],
  ['Vanippriya', 'projects@careyu.ai'],
];

async function main() {
  const password = process.env.EMPLOYEE_INITIAL_PASSWORD;
  if (!password) {
    console.error('Set EMPLOYEE_INITIAL_PASSWORD for this one-time run.');
    process.exitCode = 1;
    return;
  }
  await userRepository.ensureCredentialColumns();
  const hash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO credential_policy (id, initial_password_hash)
     VALUES (1, $1)
     ON CONFLICT (id) DO NOTHING`,
    [hash],
  );
  const report = [];
  for (const [name, email] of REQUESTED) {
    const byEmail = await query(
      `SELECT id, full_name, email, credentials_initialized_at FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    let row = byEmail.rows[0];
    if (!row) {
      const byName = await query(
        `SELECT id, full_name, email, credentials_initialized_at FROM users WHERE lower(full_name) = lower($1)`,
        [name],
      );
      row = byName.rows[0];
      if (!row) {
        report.push(`${name}|missing|${email}`);
        continue;
      }
      report.push(`${name}|email differs|registered ${row.email}|requested ${email}`);
    } else if (row.full_name !== name) {
      report.push(`${row.email}|name differs|registered ${row.full_name}|requested ${name}`);
    }
    if (row.credentials_initialized_at) {
      report.push(`${row.email}|skipped|already initialized`);
      continue;
    }
    await query(
      `UPDATE users
       SET password_hash = $2, must_change_password = TRUE, credentials_initialized_at = NOW()
       WHERE id = $1 AND credentials_initialized_at IS NULL`,
      [row.id, hash],
    );
    report.push(`${row.email}|initialized|${row.full_name}`);
  }
  console.log(report.join('\n'));
  console.log('credential_init_done');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
