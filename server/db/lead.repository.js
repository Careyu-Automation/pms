const { pool, query } = require('./index');

const LEAD_SELECT = `
  SELECT
    l.*,
    creator.full_name AS created_by_name,
    submitter.full_name AS submitted_by_name,
    reviewer.full_name AS reviewed_by_name,
    assignee.full_name AS assigned_lead_name,
    assigner.full_name AS assigned_by_name,
    team.name AS assigned_team_name
  FROM leads l
  JOIN users creator ON creator.id = l.created_by
  LEFT JOIN users submitter ON submitter.id = l.submitted_by
  LEFT JOIN users reviewer ON reviewer.id = l.pm_reviewed_by
  LEFT JOIN users assignee ON assignee.id = l.assigned_lead_id
  LEFT JOIN users assigner ON assigner.id = l.assigned_by
  LEFT JOIN teams team ON team.id = l.assigned_team_id
`;

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

function mapLead(row, documents = [], activity = []) {
  if (!row) return null;
  return {
    id: row.id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name,
    customerType: row.customer_type,
    businessVertical: row.business_vertical,
    createdBy: row.created_by_name,
    createdById: row.created_by,
    priority: row.priority,
    expectedDecisionDate: isoDate(row.expected_decision_date),
    status: row.status,
    stage: row.stage,
    contactPerson: row.contact_person,
    designation: row.designation,
    email: row.email,
    phone: row.phone,
    officeLocation: row.office_location,
    siteLocation: row.site_location,
    description: row.description,
    customerRequirement: row.customer_requirement,
    useCase: row.use_case,
    productionQuantity: row.production_quantity,
    estimatedValue: row.estimated_value,
    requiredSolution: row.required_solution,
    technicalRequirements: row.technical_requirements,
    commercialRequirements: row.commercial_requirements,
    competitorInfo: row.competitor_info,
    customerChallenge: row.customer_challenge,
    remarks: row.remarks,
    details: row.details || {},
    customFields: row.custom_fields || [],
    visitRequirement: row.visit_requirement,
    submittedToPmAt: row.submitted_to_pm_at,
    submittedBy: row.submitted_by_name,
    pmReviewedAt: row.pm_reviewed_at,
    reviewedBy: row.reviewed_by_name,
    pmNote: row.pm_note,
    source: row.source || 'BUSINESS',
    assignedTeamId: row.assigned_team_id || '',
    assignedTeam: row.assigned_team_name || '',
    assignedLeadId: row.assigned_lead_id || '',
    assignedLead: row.assigned_lead_name || '',
    assignedById: row.assigned_by || '',
    assignedBy: row.assigned_by_name || '',
    assignedAt: row.assigned_at,
    assignmentNotes: row.assignment_notes || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    documents,
    activity,
  };
}

function mapDocument(row) {
  return {
    id: row.id,
    name: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

function mapActivity(row) {
  return {
    id: row.id,
    action: row.action,
    actor: row.actor_name || 'Workspace',
    createdAt: row.created_at,
  };
}

async function list() {
  const result = await query(`
    ${LEAD_SELECT}
    ORDER BY l.updated_at DESC
  `);
  const counts = await query(`
    SELECT lead_id, COUNT(*)::int AS total
    FROM lead_documents
    GROUP BY lead_id
  `);
  const byLead = new Map(counts.rows.map((row) => [row.lead_id, row.total]));
  return result.rows.map((row) => ({
    ...mapLead(row),
    documentCount: byLead.get(row.id) || 0,
    documents: undefined,
    activity: undefined,
  }));
}

async function findById(id) {
  const result = await query(`${LEAD_SELECT} WHERE l.id = $1`, [id]);
  if (!result.rows[0]) return null;
  const documents = await query(
    'SELECT * FROM lead_documents WHERE lead_id = $1 ORDER BY created_at',
    [id],
  );
  const activity = await query(`
    SELECT a.*, u.full_name AS actor_name
    FROM lead_activity a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.lead_id = $1
    ORDER BY a.created_at
  `, [id]);
  return mapLead(
    result.rows[0],
    documents.rows.map(mapDocument),
    activity.rows.map(mapActivity),
  );
}

async function insert(input, actorId) {
  return withTransaction(async (client) => {
    const code = await client.query(`SELECT 'LEAD-' || lpad(nextval('lead_code_seq')::text, 3, '0') AS code`);
    const inserted = await client.query(`
      INSERT INTO leads (
        lead_code, title, customer_name, customer_type, business_vertical, created_by,
        priority, expected_decision_date, contact_person, designation, email, phone,
        office_location, site_location, description, customer_requirement, use_case,
        production_quantity, estimated_value, required_solution, technical_requirements,
        commercial_requirements, competitor_info, customer_challenge, remarks,
        details, custom_fields, visit_requirement, source
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27::jsonb,$28,$29
      ) RETURNING id
    `, [
      code.rows[0].code,
      input.title, input.customerName, input.customerType, input.businessVertical, actorId,
      input.priority, input.expectedDecisionDate, input.contactPerson, input.designation, input.email, input.phone,
      input.officeLocation, input.siteLocation, input.description, input.customerRequirement, input.useCase,
      input.productionQuantity, input.estimatedValue, input.requiredSolution, input.technicalRequirements,
      input.commercialRequirements, input.competitorInfo, input.customerChallenge, input.remarks,
      JSON.stringify(input.details), JSON.stringify(input.customFields), input.visitRequirement, input.source || 'BUSINESS',
    ]);
    await client.query(
      'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
      [inserted.rows[0].id, actorId, 'Lead Created'],
    );
    return inserted.rows[0].id;
  });
}

async function update(id, input, actorId, action) {
  await query(`
    UPDATE leads SET
      title = $2, customer_name = $3, customer_type = $4, business_vertical = $5,
      priority = $6, expected_decision_date = $7, contact_person = $8, designation = $9,
      email = $10, phone = $11, office_location = $12, site_location = $13,
      description = $14, customer_requirement = $15, use_case = $16, production_quantity = $17,
      estimated_value = $18, required_solution = $19, technical_requirements = $20,
      commercial_requirements = $21, competitor_info = $22, customer_challenge = $23,
      remarks = $24, details = $25::jsonb, custom_fields = $26::jsonb, visit_requirement = $27
    WHERE id = $1
  `, [
    id,
    input.title, input.customerName, input.customerType, input.businessVertical,
    input.priority, input.expectedDecisionDate, input.contactPerson, input.designation,
    input.email, input.phone, input.officeLocation, input.siteLocation,
    input.description, input.customerRequirement, input.useCase, input.productionQuantity,
    input.estimatedValue, input.requiredSolution, input.technicalRequirements,
    input.commercialRequirements, input.competitorInfo, input.customerChallenge,
    input.remarks, JSON.stringify(input.details), JSON.stringify(input.customFields), input.visitRequirement,
  ]);
  await query(
    'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
    [id, actorId, action],
  );
}

async function submit(id, actorId) {
  await query(`
    UPDATE leads
    SET status = 'SUBMITTED_TO_PM', stage = 'PM Review', submitted_to_pm_at = NOW(), submitted_by = $2, pm_note = ''
    WHERE id = $1
  `, [id, actorId]);
  await query(
    'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
    [id, actorId, 'Submitted to PM'],
  );
}

async function review(id, actorId, { status, stage, action, note }) {
  await query(`
    UPDATE leads
    SET status = $2, stage = $3, pm_reviewed_at = NOW(), pm_reviewed_by = $4, pm_note = $5
    WHERE id = $1
  `, [id, status, stage, actorId, note]);
  await query(
    'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
    [id, actorId, note ? `${action}: ${note}` : action],
  );
}

async function remove(id) {
  const documents = await query('SELECT stored_name FROM lead_documents WHERE lead_id = $1', [id]);
  await query('DELETE FROM leads WHERE id = $1', [id]);
  return documents.rows.map((row) => row.stored_name);
}

async function addDocument(leadId, file) {
  const result = await query(`
    INSERT INTO lead_documents (lead_id, original_name, stored_name, mime_type, size_bytes)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [leadId, file.originalName, file.storedName, file.mimeType, file.sizeBytes]);
  return mapDocument(result.rows[0]);
}

async function findDocument(leadId, documentId) {
  const result = await query(
    'SELECT * FROM lead_documents WHERE lead_id = $1 AND id = $2',
    [leadId, documentId],
  );
  return result.rows[0] || null;
}

module.exports = {
  list,
  findById,
  insert,
  update,
  submit,
  review,
  remove,
  addDocument,
  findDocument,
};
