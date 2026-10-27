const { query, pool } = require('../db');

async function main() {
  const rows = await query(`
    SELECT n.nspname, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname LIKE 'project%'
      AND n.nspname = ANY (current_schemas(false))
    ORDER BY 1, 2
  `);
  console.log(rows.rows.map((row) => `${row.nspname} ${row.relname} ${row.relkind}`).join('\n'));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
