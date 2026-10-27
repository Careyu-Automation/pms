const { query } = require('./index');

async function findByCode(code) {
  const result = await query(
    `SELECT id, code, name, description
     FROM roles
     WHERE code = $1`,
    [code],
  );
  return result.rows[0] || null;
}

module.exports = { findByCode };
