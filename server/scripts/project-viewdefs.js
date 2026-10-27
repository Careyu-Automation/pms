const { query, pool } = require('../db');

async function main() {
  const names = ['projects', 'project_tasks', 'project_phases', 'project_teams'];
  for (const name of names) {
    const result = await query('SELECT pg_get_viewdef($1::regclass, true) AS def', [`pms_app.${name}`]);
    console.log(`\n===== ${name} =====\n`);
    console.log(result.rows[0].def);
  }
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
