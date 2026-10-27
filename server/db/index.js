const pool = require('./pool');

function query(text, params = []) {
  return pool.query(text, params);
}

async function checkConnection() {
  await query('SELECT 1 AS ok');
}

async function schemaCompatible() {
  const result = await query(
    `SELECT data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'id'`,
  );
  return result.rows[0]?.data_type === 'uuid';
}

async function usersAreView() {
  const result = await query(
    `SELECT c.relkind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'users' AND n.nspname = ANY (current_schemas(false))
     ORDER BY array_position(current_schemas(false), n.nspname)
     LIMIT 1`,
  );
  return result.rows[0]?.relkind === 'v';
}

module.exports = {
  pool,
  query,
  checkConnection,
  schemaCompatible,
  usersAreView,
};
