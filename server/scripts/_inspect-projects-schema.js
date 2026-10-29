require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('../db');

async function cols(name) {
  const result = await query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
       AND table_name = $1
     ORDER BY ordinal_position`,
    [name],
  );
  return result.rows.map((row) => row.column_name);
}

async function main() {
  for (const name of ['users', 'projects', 'project_orders', 'project_profiles', 'project_registry']) {
    const list = await cols(name);
    console.log(name, list.length ? list.join(', ') : '(missing)');
  }
  const views = await query(
    `SELECT table_name, table_type FROM information_schema.tables
     WHERE table_schema NOT IN ('pg_catalog','information_schema')
       AND table_name ILIKE '%project%'
     ORDER BY 1`,
  );
  console.log('project relations', views.rows);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (pool?.end) await pool.end();
});
