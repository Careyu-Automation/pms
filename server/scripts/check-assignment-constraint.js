const { query, pool } = require('../db');

async function main() {
  const result = await query(`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'feasibility_team_assignments'::regclass
      AND contype IN ('u', 'p')
  `);
  console.log(JSON.stringify(result.rows, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
