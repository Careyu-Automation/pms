require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('../db');

async function main() {
  const users = await query(`
    SELECT DISTINCT ON (u.id) u.id, u.full_name, u.email, u.designation
    FROM users u
    ORDER BY u.id, u.full_name
  `);
  // Distinct on might not work well with duplicate schemas - try simple
  const rows = await query(`SELECT id, full_name, email, designation FROM users ORDER BY full_name NULLS LAST LIMIT 80`);
  const seen = new Set();
  for (const row of rows.rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    console.log(`${row.full_name}|${row.email}|${row.designation}|${row.id}`);
  }
  const teams = await query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_name IN ('project_teams','project_dependencies','project_members','project_assignees')
  `);
  console.log('tables', teams.rows);
  const reports = await query(`
    SELECT id, name, type, frequency, send_time, timezone, status
    FROM email_reports WHERE type = 'DAILY_WORK' ORDER BY created_at DESC LIMIT 10
  `).catch((error) => ({ rows: [], error: error.message }));
  console.log('daily reports', reports.rows || reports);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { if (pool?.end) await pool.end(); });
