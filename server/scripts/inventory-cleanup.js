/**
 * Read-only inventory before operational data cleanup.
 * Prints host, database, and table counts only. Never prints credentials.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { query, pool } = require('../db');

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const identity = await query(`
    SELECT current_database() AS database,
           current_user AS db_user,
           current_schemas(false) AS search_path
  `);

  const relations = await query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind,
           pg_get_userbyid(c.relowner) AS owner
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'pms_app')
      AND c.relkind IN ('r', 'v', 'p', 'm')
    ORDER BY n.nspname, c.relname
  `);

  const counts = [];
  for (const row of relations.rows) {
    const qualified = `"${row.schema}"."${row.name}"`;
    try {
      const result = await query(`SELECT COUNT(*)::int AS total FROM ${qualified}`);
      counts.push({ ...row, total: result.rows[0].total });
    } catch (error) {
      counts.push({ ...row, total: null, error: error.message });
    }
  }

  const fks = await query(`
    SELECT
      nsp.nspname AS schema,
      src.relname AS table_name,
      att.attname AS column_name,
      fnsp.nspname AS foreign_schema,
      dst.relname AS foreign_table,
      fatt.attname AS foreign_column,
      con.confdeltype AS delete_rule
    FROM pg_constraint con
    JOIN pg_class src ON src.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = con.confrelid
    JOIN pg_namespace fnsp ON fnsp.oid = dst.relnamespace
    JOIN LATERAL unnest(con.conkey, con.confkey) AS cols(src_att, dst_att) ON TRUE
    JOIN pg_attribute att ON att.attrelid = src.oid AND att.attnum = cols.src_att
    JOIN pg_attribute fatt ON fatt.attrelid = dst.oid AND fatt.attnum = cols.dst_att
    WHERE con.contype = 'f'
      AND nsp.nspname IN ('public', 'pms_app')
    ORDER BY 1, 2, 3
  `);

  const columns = await query(`
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN ('public', 'pms_app')
      AND (
        column_name ILIKE '%lead%'
        OR column_name ILIKE '%feasib%'
        OR column_name ILIKE '%cost%'
        OR column_name ILIKE '%project%'
        OR column_name ILIKE '%task%'
      )
    ORDER BY 1, 2, 3
  `);

  const payload = {
    createdAt: new Date().toISOString(),
    host: env.db.host,
    port: env.db.port,
    database: identity.rows[0].database,
    dbUser: identity.rows[0].db_user,
    searchPath: identity.rows[0].search_path,
    relations: counts,
    foreignKeys: fks.rows,
    linkColumns: columns.rows,
  };
  const file = path.join(dir, `cleanup-inventory-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));

  const summary = counts
    .filter((row) => row.total)
    .map((row) => `${row.schema}.${row.name} [${row.relkind}] ${row.total}`);
  console.log(JSON.stringify({
    file,
    host: env.db.host,
    port: env.db.port,
    database: identity.rows[0].database,
    searchPath: identity.rows[0].search_path,
    nonempty: summary,
    emptyTables: counts.filter((row) => row.total === 0 && row.relkind === 'r').map((row) => `${row.schema}.${row.name}`),
    fkCount: fks.rows.length,
  }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
