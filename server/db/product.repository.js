const { pool, query } = require('./index');

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  return '';
}

const PRODUCT_FROM = `
  FROM products p
  LEFT JOIN leads l ON l.id = p.lead_id
  LEFT JOIN users creator ON creator.id = p.created_by
`;

function mapProduct(row) {
  return {
    id: row.id,
    productCode: row.product_code,
    name: row.name,
    description: row.description || '',
    teamCode: row.team_code,
    department: row.department || '',
    leadId: row.lead_id,
    leadCode: row.lead_code || '',
    leadTitle: row.lead_title || '',
    customerName: row.customer_name || '',
    status: row.status,
    priority: row.priority,
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    createdById: row.created_by,
    createdBy: row.created_by_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function list() {
  const result = await query(`
    SELECT p.*, l.lead_code, l.title AS lead_title, l.customer_name, creator.full_name AS created_by_name
    ${PRODUCT_FROM}
    ORDER BY p.updated_at DESC
  `);
  return result.rows.map(mapProduct);
}

async function findById(id) {
  const result = await query(`
    SELECT p.*, l.lead_code, l.title AS lead_title, l.customer_name, creator.full_name AS created_by_name
    ${PRODUCT_FROM}
    WHERE p.id = $1
  `, [id]);
  return result.rows[0] ? mapProduct(result.rows[0]) : null;
}

async function listStoredTeamCodes() {
  const result = await query(`
    SELECT DISTINCT code FROM (
      SELECT team_code AS code FROM project_tasks WHERE btrim(team_code) <> ''
      UNION
      SELECT team_code FROM solution_costing_teams WHERE btrim(team_code) <> ''
      UNION
      SELECT team_code FROM projects WHERE btrim(team_code) <> ''
      UNION
      SELECT team_code FROM products WHERE btrim(team_code) <> ''
    ) teams
    WHERE code IS NOT NULL
    ORDER BY code
  `);
  return result.rows.map((row) => row.code);
}

async function listDepartments() {
  const result = await query(`
    SELECT DISTINCT department
    FROM users
    WHERE department IS NOT NULL AND btrim(department) <> ''
    ORDER BY department
  `);
  return result.rows.map((row) => row.department);
}

async function listLeadOptions() {
  const result = await query(`
    SELECT id, lead_code, title, customer_name
    FROM leads
    ORDER BY updated_at DESC
    LIMIT 250
  `);
  return result.rows.map((row) => ({
    id: row.id,
    leadCode: row.lead_code,
    title: row.title || '',
    customerName: row.customer_name || '',
  }));
}

async function leadExists(id) {
  const result = await query('SELECT id FROM leads WHERE id = $1', [id]);
  return Boolean(result.rows[0]);
}

async function insert(input, actorId) {
  return withTransaction(async (client) => {
    let code = input.productCode;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (!input.productCode) {
        const next = await client.query(`SELECT 'PRD-' || lpad(nextval('product_code_seq')::text, 3, '0') AS code`);
        code = next.rows[0].code;
      }
      try {
        const result = await client.query(
          `INSERT INTO products (
            product_code, name, description, team_code, department, lead_id, status, priority, start_date, end_date, created_by
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [code, input.name, input.description, input.teamCode, input.department, input.leadId, input.status, input.priority, input.startDate, input.endDate, actorId],
        );
        return result.rows[0].id;
      } catch (error) {
        if (error.code === '23505' && !input.productCode) continue;
        throw error;
      }
    }
    const error = new Error('Product code could not be generated.');
    error.code = '23505';
    throw error;
  });
}

async function update(id, input) {
  const result = await query(
    `UPDATE products SET
      product_code = $2,
      name = $3,
      description = $4,
      team_code = $5,
      department = $6,
      lead_id = $7,
      status = $8,
      priority = $9,
      start_date = $10,
      end_date = $11
     WHERE id = $1
     RETURNING id`,
    [id, input.productCode, input.name, input.description, input.teamCode, input.department, input.leadId, input.status, input.priority, input.startDate, input.endDate],
  );
  return result.rows[0] || null;
}

async function remove(id) {
  const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

module.exports = {
  list,
  findById,
  listStoredTeamCodes,
  listDepartments,
  listLeadOptions,
  leadExists,
  insert,
  update,
  remove,
};
