const { query, pool } = require('../db');

async function main() {
  const counts = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.projects) AS public_projects,
      (SELECT COUNT(*)::int FROM public.tasks) AS public_tasks,
      (SELECT COUNT(*)::int FROM pms_app.projects) AS view_projects
  `);
  const columns = await query(`
    SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE (table_schema = 'public' AND table_name IN ('projects', 'tasks'))
       OR (table_schema = 'pms_app' AND table_name = 'projects')
    ORDER BY 1, 2, ordinal_position
  `);
  const refs = await query(`
    SELECT n.nspname, c.relname, a.attname
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN unnest(con.conkey) WITH ORDINALITY AS cols(attnum, ord) ON TRUE
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = cols.attnum
    JOIN pg_class f ON f.oid = con.confrelid
    WHERE con.contype = 'f' AND f.relname IN ('tasks', 'projects')
    ORDER BY 1, 2
  `);
  console.log(JSON.stringify({ counts: counts.rows[0], refs: refs.rows, columns: columns.rows }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
