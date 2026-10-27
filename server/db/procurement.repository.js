const { query } = require('./index');

const SELECT = `
  SELECT r.*,
    p.title AS project_title,
    t.name AS team_name,
    u.full_name AS requested_by_name,
    COALESCE(items.amount, 0)::numeric AS amount
  FROM procurement_requests r
  LEFT JOIN projects p ON p.id = r.project_id
  LEFT JOIN teams t ON t.id = r.team_id
  JOIN users u ON u.id = r.requested_by
  LEFT JOIN LATERAL (
    SELECT SUM(quantity * estimated_cost) AS amount
    FROM procurement_request_items i WHERE i.request_id = r.id
  ) items ON TRUE
`;

function isoDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  return '';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    number: `PR-${String(row.request_number).padStart(5, '0')}`,
    title: row.title,
    description: row.description || '',
    priority: row.priority,
    status: row.status,
    projectId: row.project_id,
    projectTitle: row.project_title || '',
    teamId: row.team_id,
    teamName: row.team_name || '',
    vendorName: row.vendor_name || '',
    neededBy: isoDate(row.needed_by),
    justification: row.justification || '',
    requestedById: row.requested_by,
    requestedByName: row.requested_by_name || '',
    amount: Number(row.amount || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function list(where, params) {
  const result = await query(`${SELECT} ${where} ORDER BY r.created_at DESC`, params);
  return result.rows.map(mapRow);
}

async function find(id) {
  const result = await query(`${SELECT} WHERE r.id = $1`, [id]);
  return mapRow(result.rows[0]);
}

async function insert(input) {
  const result = await query(
    `INSERT INTO procurement_requests (title, description, priority, status, project_id, team_id, vendor_name, needed_by, justification, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [input.title, input.description, input.priority, input.status, input.projectId, input.teamId, input.vendorName, input.neededBy, input.justification, input.requestedBy],
  );
  return result.rows[0].id;
}

async function update(id, input) {
  await query(
    `UPDATE procurement_requests SET title=$2, description=$3, priority=$4, status=$5, project_id=$6, team_id=$7, vendor_name=$8, needed_by=$9, justification=$10 WHERE id=$1`,
    [id, input.title, input.description, input.priority, input.status, input.projectId, input.teamId, input.vendorName, input.neededBy, input.justification],
  );
}

async function remove(id) {
  await query('DELETE FROM procurement_requests WHERE id = $1', [id]);
}

async function items(requestId) {
  const result = await query(
    'SELECT id, description, quantity, unit, estimated_cost FROM procurement_request_items WHERE request_id = $1 ORDER BY created_at',
    [requestId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    description: row.description,
    quantity: Number(row.quantity),
    unit: row.unit || '',
    estimatedCost: Number(row.estimated_cost),
  }));
}

async function setItems(requestId, lines) {
  await query('DELETE FROM procurement_request_items WHERE request_id = $1', [requestId]);
  for (const line of lines) {
    await query(
      'INSERT INTO procurement_request_items (request_id, description, quantity, unit, estimated_cost) VALUES ($1,$2,$3,$4,$5)',
      [requestId, line.description, line.quantity, line.unit, line.estimatedCost],
    );
  }
}

async function counts(where, params) {
  const result = await query(
    `SELECT
      COUNT(*) FILTER (WHERE r.status NOT IN ('RECEIVED','CANCELLED','REJECTED'))::int AS open,
      COUNT(*) FILTER (WHERE r.status IN ('SUBMITTED','UNDER_REVIEW'))::int AS pending,
      COUNT(*) FILTER (WHERE r.status IN ('APPROVED','ORDERED'))::int AS approved,
      COUNT(*) FILTER (WHERE r.status = 'RECEIVED' AND r.updated_at >= date_trunc('month', NOW()))::int AS received_month
     FROM procurement_requests r ${where}`,
    params,
  );
  const row = result.rows[0];
  return { open: row.open, pending: row.pending, approved: row.approved, receivedThisMonth: row.received_month };
}

async function options() {
  const [projects, teams] = await Promise.all([
    query(`SELECT id, title FROM projects WHERE status <> 'CANCELLED' ORDER BY title LIMIT 200`),
    query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
  ]);
  return {
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title })),
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name })),
  };
}

module.exports = { list, find, insert, update, remove, items, setItems, counts, options };
