const path = require('path');
const fs = require('fs');
const { query } = require('./index');

const SELECT = `
  SELECT r.*,
    p.title AS project_title,
    t.name AS team_name,
    u.full_name AS requested_by_name,
    l.lead_code,
    l.title AS lead_title,
    COALESCE(items.amount, 0)::numeric AS amount
  FROM procurement_requests r
  LEFT JOIN projects p ON p.id = r.project_id
  LEFT JOIN teams t ON t.id = r.team_id
  LEFT JOIN leads l ON l.id = r.lead_id
  JOIN users u ON u.id = r.requested_by
  LEFT JOIN LATERAL (
    SELECT SUM(quantity * estimated_cost) AS amount
    FROM procurement_request_items i WHERE i.request_id = r.id
  ) items ON TRUE
`;

let schemaReady = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(`ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS lead_id UUID`);
      await query(`ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS feasibility_id UUID`);
      await query(`ALTER TABLE procurement_requests ADD COLUMN IF NOT EXISTS no_purchase_required BOOLEAN NOT NULL DEFAULT FALSE`);
      await query(`CREATE INDEX IF NOT EXISTS procurement_requests_lead_idx ON procurement_requests (lead_id)`);
      await query(`
        CREATE TABLE IF NOT EXISTS procurement_request_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          request_id UUID NOT NULL REFERENCES procurement_requests (id) ON DELETE CASCADE,
          original_name VARCHAR(260) NOT NULL,
          stored_name VARCHAR(260) NOT NULL,
          mime_type VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
          size_bytes INTEGER NOT NULL DEFAULT 0,
          document_type VARCHAR(80) NOT NULL DEFAULT 'Supporting',
          uploaded_by UUID,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  await schemaReady;
}

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
    leadId: row.lead_id || null,
    leadCode: row.lead_code || '',
    leadTitle: row.lead_title || '',
    feasibilityId: row.feasibility_id || null,
    noPurchaseRequired: Boolean(row.no_purchase_required),
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
  await ensureSchema();
  const result = await query(`${SELECT} ${where} ORDER BY r.created_at DESC`, params);
  return result.rows.map(mapRow);
}

async function find(id) {
  await ensureSchema();
  const result = await query(`${SELECT} WHERE r.id = $1`, [id]);
  return mapRow(result.rows[0]);
}

async function findByLead(leadId) {
  await ensureSchema();
  const result = await query(
    `${SELECT} WHERE r.lead_id = $1 AND r.status <> 'CANCELLED' ORDER BY r.created_at DESC`,
    [leadId],
  );
  return result.rows.map(mapRow);
}

async function insert(input) {
  await ensureSchema();
  const result = await query(
    `INSERT INTO procurement_requests (
       title, description, priority, status, project_id, team_id, vendor_name, needed_by,
       justification, requested_by, lead_id, feasibility_id, no_purchase_required
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
    [
      input.title, input.description, input.priority, input.status, input.projectId, input.teamId,
      input.vendorName, input.neededBy, input.justification, input.requestedBy,
      input.leadId || null, input.feasibilityId || null, Boolean(input.noPurchaseRequired),
    ],
  );
  return result.rows[0].id;
}

async function update(id, input) {
  await ensureSchema();
  await query(
    `UPDATE procurement_requests SET
       title=$2, description=$3, priority=$4, status=$5, project_id=$6, team_id=$7,
       vendor_name=$8, needed_by=$9, justification=$10, lead_id=$11, feasibility_id=$12,
       no_purchase_required=$13, updated_at=NOW()
     WHERE id=$1`,
    [
      id, input.title, input.description, input.priority, input.status, input.projectId, input.teamId,
      input.vendorName, input.neededBy, input.justification, input.leadId || null,
      input.feasibilityId || null, Boolean(input.noPurchaseRequired),
    ],
  );
}

async function remove(id) {
  await ensureSchema();
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

async function documents(requestId) {
  await ensureSchema();
  const result = await query(
    `SELECT d.*, u.full_name AS uploaded_by_name
     FROM procurement_request_documents d
     LEFT JOIN users u ON u.id = d.uploaded_by
     WHERE d.request_id = $1
     ORDER BY d.created_at DESC`,
    [requestId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes || 0),
    documentType: row.document_type || 'Supporting',
    uploadedBy: row.uploaded_by_name || '',
    createdAt: row.created_at,
  }));
}

async function addDocument(requestId, file, uploadedBy, documentType = 'Supporting') {
  await ensureSchema();
  const result = await query(
    `INSERT INTO procurement_request_documents (
       request_id, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [
      requestId, file.originalname, file.filename, file.mimetype || 'application/octet-stream',
      file.size || 0, documentType, uploadedBy,
    ],
  );
  return result.rows[0].id;
}

async function findDocument(requestId, documentId) {
  await ensureSchema();
  const result = await query(
    'SELECT * FROM procurement_request_documents WHERE request_id = $1 AND id = $2',
    [requestId, documentId],
  );
  return result.rows[0] || null;
}

async function removeDocument(requestId, documentId) {
  await ensureSchema();
  const row = await findDocument(requestId, documentId);
  if (!row) return null;
  await query('DELETE FROM procurement_request_documents WHERE id = $1', [documentId]);
  return row;
}

function uploadDir(requestId) {
  return path.join(__dirname, '..', 'uploads', 'procurement', requestId);
}

function ensureUploadDir(requestId) {
  const dir = uploadDir(requestId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function counts(where, params) {
  await ensureSchema();
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
  await ensureSchema();
  const [projects, teams, leads] = await Promise.all([
    query(`SELECT id, title FROM projects WHERE status <> 'CANCELLED' ORDER BY title LIMIT 200`),
    query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
    query(
      `SELECT id, lead_code, title FROM leads
       WHERE status IN ('FEASIBILITY_APPROVED','PROCUREMENT_SUBMITTED','PROCUREMENT_APPROVED','COSTING','COSTING_SUBMITTED','COSTING_CHANGES_REQUESTED')
       ORDER BY created_at DESC LIMIT 200`,
    ),
  ]);
  return {
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title })),
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name })),
    leads: leads.rows.map((row) => ({ id: row.id, name: `${row.lead_code || ''} ${row.title || ''}`.trim() })),
  };
}

async function leadApproved(leadId) {
  if (!leadId) return false;
  await ensureSchema();
  const result = await query(
    `SELECT 1 FROM procurement_requests
     WHERE lead_id = $1 AND status IN ('APPROVED','ORDERED','RECEIVED')
     LIMIT 1`,
    [leadId],
  );
  return Boolean(result.rows[0]);
}

module.exports = {
  ensureSchema,
  list,
  find,
  findByLead,
  insert,
  update,
  remove,
  items,
  setItems,
  documents,
  addDocument,
  findDocument,
  removeDocument,
  uploadDir,
  ensureUploadDir,
  counts,
  options,
  leadApproved,
};
