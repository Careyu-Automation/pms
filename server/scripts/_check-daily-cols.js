require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('../db');

async function main() {
  const cols = await query(`
    SELECT table_schema, column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'daily_work_updates'
    ORDER BY table_schema, ordinal_position
  `);
  console.log(cols.rows.map((r) => `${r.table_schema}.${r.column_name}:${r.data_type}`).join('\n'));

  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const rows = await query(`
    SELECT id, employee_id, update_date, status,
           left(COALESCE(description,''), 120) AS description,
           project_id, created_at, updated_at
    FROM daily_work_updates
    WHERE update_date = $1::date
    ORDER BY created_at DESC
    LIMIT 40
  `, [today]);
  console.log('today', today, 'count', rows.rows.length);
  console.log(JSON.stringify(rows.rows, null, 2));
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { if (pool?.end) await pool.end(); });
