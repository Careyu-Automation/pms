const { pool, query } = require('./index');
const { calculateQuote, money } = require('../services/costing.rules');

let projectOrdersReady = false;

async function ensureProjectOrders() {
  if (projectOrdersReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS project_orders (
      project_id UUID PRIMARY KEY,
      order_code VARCHAR(40) NOT NULL,
      order_date DATE,
      payment_status VARCHAR(40) NOT NULL DEFAULT 'AWAITING_PAYMENT',
      payment_confirmed_at TIMESTAMPTZ,
      payment_confirmed_by UUID,
      payment_reference TEXT NOT NULL DEFAULT '',
      payment_notes TEXT NOT NULL DEFAULT '',
      activated_at TIMESTAMPTZ,
      activated_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE UNIQUE INDEX IF NOT EXISTS project_orders_code_uidx ON project_orders (order_code)');
  await query('CREATE INDEX IF NOT EXISTS project_orders_activated_idx ON project_orders (activated_at)');
  await query('CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1');
  // Preserve existing converted projects in Active Projects (legacy rows treated as already activated).
  await query(`
    INSERT INTO project_orders (
      project_id, order_code, order_date, payment_status, payment_confirmed_at, activated_at, created_at, updated_at
    )
    SELECT p.id,
      COALESCE(NULLIF(p.project_code, ''), 'ORD-' || to_char(COALESCE(p.created_at, NOW()), 'YYYY') || '-' || lpad(nextval('order_code_seq')::text, 4, '0')),
      COALESCE(p.start_date, p.created_at::date, CURRENT_DATE),
      'PAYMENT_CONFIRMED',
      COALESCE(p.created_at, NOW()),
      COALESCE(p.created_at, NOW()),
      COALESCE(p.created_at, NOW()),
      NOW()
    FROM projects p
    WHERE p.lead_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM project_orders o WHERE o.project_id = p.id)
    ON CONFLICT (project_id) DO NOTHING
  `);
  projectOrdersReady = true;
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

function num(value) {
  return money(value);
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

async function nextCode(client) {
  const result = await client.query(`SELECT 'COST-' || lpad(nextval('costing_code_seq')::text, 3, '0') AS code`);
  return result.rows[0].code;
}

async function replaceChildren(client, versionId, fields) {
  await client.query('DELETE FROM solution_costing_components WHERE version_id = $1', [versionId]);
  await client.query('DELETE FROM solution_bom_items WHERE version_id = $1', [versionId]);
  await client.query('DELETE FROM solution_cost_entries WHERE version_id = $1', [versionId]);
  await client.query('DELETE FROM solution_costing_risks WHERE version_id = $1', [versionId]);
  await client.query('DELETE FROM solution_costing_teams WHERE version_id = $1', [versionId]);
  for (const row of fields.components || []) {
    await client.query(
      `INSERT INTO solution_costing_components (version_id, category, name, description, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [versionId, row.category, row.name, row.description, row.sortOrder],
    );
  }
  for (const row of fields.bom || []) {
    await client.query(
      `INSERT INTO solution_bom_items (
        version_id, item_no, category, component, description, specification, manufacturer, part_number,
        supplier, quantity, unit, unit_cost, lead_time, remarks, quotation_reference, quoted_price,
        quote_date, quote_validity, purchase_status, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        versionId, row.itemNo, row.category, row.component, row.description, row.specification, row.manufacturer,
        row.partNumber, row.supplier, row.quantity, row.unit, row.unitCost, row.leadTime, row.remarks,
        row.quotationReference, row.quotedPrice, row.quoteDate, row.quoteValidity, row.purchaseStatus, row.sortOrder,
      ],
    );
  }
  for (const row of fields.entries || []) {
    await client.query(
      `INSERT INTO solution_cost_entries (version_id, section, line_key, label, mode, hours, rate, amount, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [versionId, row.section, row.lineKey, row.label, row.mode, row.hours, row.rate, row.amount, row.sortOrder],
    );
  }
  for (const row of fields.risks || []) {
    await client.query(
      `INSERT INTO solution_costing_risks (version_id, risk, impact, probability, mitigation, cost_impact, owner_id, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [versionId, row.risk, row.impact, row.probability, row.mitigation, row.costImpact, row.ownerId, row.sortOrder],
    );
  }
  for (const row of fields.teams || []) {
    await client.query(
      `INSERT INTO solution_costing_teams (version_id, team_code, contribution, estimated_cost, members, status)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (version_id, team_code) DO UPDATE SET
         contribution = EXCLUDED.contribution,
         estimated_cost = EXCLUDED.estimated_cost,
         members = EXCLUDED.members,
         status = EXCLUDED.status`,
      [versionId, row.teamCode, row.contribution, row.estimatedCost, row.members, row.status],
    );
  }
}

async function insertVersion(client, costingId, versionNo, fields) {
  const totals = calculateQuote(fields, fields.bom, fields.entries);
  const inserted = await client.query(
    `INSERT INTO solution_costing_versions (
      costing_id, version_no, status, is_current, solution_name, solution_description, automation_concept,
      process_flow, system_architecture, key_assumptions, scope_of_supply, customer_scope, careyu_scope,
      third_party_scope, exclusions, commercial_assumptions, technical_assumptions, customer_dependencies,
      architecture_input, architecture_process, architecture_inspection, architecture_decision, architecture_output,
      contingency_percent, overhead_percent, overhead_base, margin_percent, tax_percent, currency,
      component_lead_time, engineering_duration, fabrication_duration, assembly_duration, testing_duration,
      installation_duration, commissioning_duration, estimated_duration, payment_terms, delivery_terms,
      warranty, validity, installation_terms, totals
    ) VALUES (
      $1,$2,'DRAFT',TRUE,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
      $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41::jsonb
    ) RETURNING id`,
    [
      costingId, versionNo, fields.solutionName, fields.solutionDescription, fields.automationConcept,
      fields.processFlow, fields.systemArchitecture, fields.keyAssumptions, fields.scopeOfSupply,
      fields.customerScope, fields.careyuScope, fields.thirdPartyScope, fields.exclusions,
      fields.commercialAssumptions, fields.technicalAssumptions, fields.customerDependencies,
      fields.architectureInput, fields.architectureProcess, fields.architectureInspection,
      fields.architectureDecision, fields.architectureOutput, fields.contingencyPercent, fields.overheadPercent,
      fields.overheadBase, fields.marginPercent, fields.taxPercent, fields.currency, fields.componentLeadTime,
      fields.engineeringDuration, fields.fabricationDuration, fields.assemblyDuration, fields.testingDuration,
      fields.installationDuration, fields.commissioningDuration, fields.estimatedDuration, fields.paymentTerms,
      fields.deliveryTerms, fields.warranty, fields.validity, fields.installationTerms, JSON.stringify(totals),
    ],
  );
  const versionId = inserted.rows[0].id;
  await replaceChildren(client, versionId, fields);
  return versionId;
}

async function addActivity(costingId, versionId, actorId, action, client = null) {
  const runner = client ? client.query.bind(client) : query;
  await runner(
    'INSERT INTO solution_costing_activity (costing_id, version_id, actor_id, action) VALUES ($1,$2,$3,$4)',
    [costingId, versionId, actorId, action],
  );
}

async function createFromStudy(study, fields, actorId) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id, costing_code FROM solution_costings WHERE feasibility_id = $1', [study.id]);
    if (existing.rows[0]) {
      const costingId = existing.rows[0].id;
      if (!existing.rows[0].costing_code) {
        await client.query('UPDATE solution_costings SET costing_code = $2, owner_id = COALESCE(owner_id, $3), currency = $4 WHERE id = $1', [costingId, await nextCode(client), study.ownerId || actorId, fields.currency]);
      }
      const versions = await client.query('SELECT id FROM solution_costing_versions WHERE costing_id = $1', [costingId]);
      if (!versions.rows[0]) {
        const versionId = await insertVersion(client, costingId, 1, fields);
        await addActivity(costingId, versionId, actorId, 'Costing Created', client);
      }
      return costingId;
    }
    const code = await nextCode(client);
    const inserted = await client.query(
      `INSERT INTO solution_costings (costing_code, feasibility_id, lead_id, status, owner_id, currency, created_by)
       VALUES ($1,$2,$3,'DRAFT',$4,$5,$6)
       RETURNING id`,
      [code, study.id, study.leadId, study.ownerId || actorId, fields.currency, actorId],
    );
    const costingId = inserted.rows[0].id;
    const versionId = await insertVersion(client, costingId, 1, fields);
    for (const document of study.documents || []) {
      const source = await client.query('SELECT * FROM feasibility_documents WHERE id = $1', [document.id]);
      const row = source.rows[0];
      if (!row) continue;
      await client.query(
        `INSERT INTO solution_costing_documents (
          version_id, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by,
          source_feasibility_id, source_document_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [versionId, row.original_name, row.stored_name, row.mime_type, row.size_bytes, row.document_type || 'Other', row.uploaded_by, study.id, row.id],
      );
    }
    await client.query(`UPDATE leads SET stage = 'Solution & Costing', status = 'COSTING' WHERE id = $1`, [study.leadId]);
    await client.query(
      'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1,$2,$3)',
      [study.leadId, actorId, 'Moved to Solution & Costing'],
    );
    await addActivity(costingId, versionId, actorId, 'Costing Created', client);
    return costingId;
  });
}

function mapVersionRow(row, children) {
  return {
    id: row.id,
    versionNo: row.version_no,
    status: row.status,
    isCurrent: row.is_current,
    solutionName: row.solution_name,
    solutionDescription: row.solution_description,
    automationConcept: row.automation_concept,
    processFlow: row.process_flow,
    systemArchitecture: row.system_architecture,
    keyAssumptions: row.key_assumptions,
    scopeOfSupply: row.scope_of_supply,
    customerScope: row.customer_scope,
    careyuScope: row.careyu_scope,
    thirdPartyScope: row.third_party_scope,
    exclusions: row.exclusions,
    commercialAssumptions: row.commercial_assumptions,
    technicalAssumptions: row.technical_assumptions,
    customerDependencies: row.customer_dependencies,
    architectureInput: row.architecture_input,
    architectureProcess: row.architecture_process,
    architectureInspection: row.architecture_inspection,
    architectureDecision: row.architecture_decision,
    architectureOutput: row.architecture_output,
    contingencyPercent: num(row.contingency_percent),
    overheadPercent: num(row.overhead_percent),
    overheadBase: row.overhead_base,
    marginPercent: num(row.margin_percent),
    taxPercent: num(row.tax_percent),
    currency: row.currency,
    componentLeadTime: row.component_lead_time,
    engineeringDuration: row.engineering_duration,
    fabricationDuration: row.fabrication_duration,
    assemblyDuration: row.assembly_duration,
    testingDuration: row.testing_duration,
    installationDuration: row.installation_duration,
    commissioningDuration: row.commissioning_duration,
    estimatedDuration: row.estimated_duration,
    paymentTerms: row.payment_terms,
    deliveryTerms: row.delivery_terms,
    warranty: row.warranty,
    validity: row.validity,
    installationTerms: row.installation_terms,
    rejectionReason: row.rejection_reason,
    totals: row.totals || {},
    submittedBy: row.submitted_by_name || '',
    submittedAt: row.submitted_at,
    reviewedBy: row.reviewed_by_name || '',
    reviewedAt: row.reviewed_at,
    updatedAt: row.updated_at,
    ...children,
  };
}

async function loadVersion(versionId) {
  const version = await query(`
    SELECT v.*, submitter.full_name AS submitted_by_name, reviewer.full_name AS reviewed_by_name
    FROM solution_costing_versions v
    LEFT JOIN users submitter ON submitter.id = v.submitted_by
    LEFT JOIN users reviewer ON reviewer.id = v.reviewed_by
    WHERE v.id = $1
  `, [versionId]);
  if (!version.rows[0]) return null;
  const [components, bom, entries, risks, teams, documents, approvals] = await Promise.all([
    query('SELECT * FROM solution_costing_components WHERE version_id = $1 ORDER BY sort_order', [versionId]),
    query('SELECT * FROM solution_bom_items WHERE version_id = $1 ORDER BY sort_order, item_no', [versionId]),
    query('SELECT * FROM solution_cost_entries WHERE version_id = $1 ORDER BY sort_order', [versionId]),
    query(`
      SELECT r.*, u.full_name AS owner_name
      FROM solution_costing_risks r
      LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.version_id = $1 ORDER BY r.sort_order
    `, [versionId]),
    query('SELECT * FROM solution_costing_teams WHERE version_id = $1 ORDER BY team_code', [versionId]),
    query(`
      SELECT d.*, u.full_name AS uploaded_by_name
      FROM solution_costing_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.version_id = $1 ORDER BY d.created_at DESC
    `, [versionId]),
    query(`
      SELECT a.*, u.full_name AS actor_name
      FROM solution_costing_approvals a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.version_id = $1 ORDER BY a.created_at
    `, [versionId]),
  ]);
  const mappedBom = bom.rows.map((row) => ({
    id: row.id,
    itemNo: row.item_no,
    category: row.category,
    component: row.component,
    description: row.description,
    specification: row.specification,
    manufacturer: row.manufacturer,
    partNumber: row.part_number,
    supplier: row.supplier,
    quantity: num(row.quantity),
    unit: row.unit,
    unitCost: num(row.unit_cost),
    leadTime: row.lead_time,
    remarks: row.remarks,
    quotationReference: row.quotation_reference,
    quotedPrice: row.quoted_price === null ? '' : num(row.quoted_price),
    quoteDate: isoDate(row.quote_date),
    quoteValidity: isoDate(row.quote_validity),
    purchaseStatus: row.purchase_status,
  }));
  const mappedEntries = entries.rows.map((row) => ({
    id: row.id,
    section: row.section,
    lineKey: row.line_key,
    label: row.label,
    mode: row.mode,
    hours: num(row.hours),
    rate: num(row.rate),
    amount: num(row.amount),
  }));
  const mappedRisks = risks.rows.map((row) => ({
    id: row.id,
    risk: row.risk,
    impact: row.impact,
    probability: row.probability,
    mitigation: row.mitigation,
    costImpact: num(row.cost_impact),
    ownerId: row.owner_id,
    ownerName: row.owner_name || '',
  }));
  const header = mapVersionRow(version.rows[0], {});
  const quote = calculateQuote({ ...header, risks: mappedRisks }, mappedBom, mappedEntries);
  return mapVersionRow(version.rows[0], {
    components: components.rows.map((row) => ({
      id: row.id, category: row.category, name: row.name, description: row.description,
    })),
    bom: mappedBom,
    entries: mappedEntries,
    risks: mappedRisks,
    teams: teams.rows.map((row) => ({
      id: row.id,
      teamCode: row.team_code,
      contribution: row.contribution,
      estimatedCost: num(row.estimated_cost),
      members: row.members,
      status: row.status,
    })),
    documents: documents.rows.map((row) => ({
      id: row.id,
      name: row.original_name,
      documentType: row.document_type,
      sizeBytes: row.size_bytes,
      uploadedBy: row.uploaded_by_name || 'Workspace',
      uploadedById: row.uploaded_by,
      createdAt: row.created_at,
      linked: Boolean(row.source_document_id),
    })),
    approvals: approvals.rows.map((row) => ({
      id: row.id,
      decision: row.decision,
      comments: row.comments,
      actor: row.actor_name || 'Workspace',
      createdAt: row.created_at,
    })),
    quote,
  });
}

async function findById(id) {
  const header = await query(`
    SELECT sc.*, owner.full_name AS owner_name,
           l.lead_code, l.title AS lead_title, l.customer_name, l.business_vertical, l.use_case,
           l.customer_requirement, l.technical_requirements, l.priority, l.contact_person, l.email AS contact_email,
           l.phone AS contact_phone, l.office_location, l.site_location, l.required_solution, l.description AS lead_description,
           f.id AS study_id, f.status AS feasibility_status, f.decision, f.overall_conclusion,
           f.conditions, f.proposed_solution, f.estimated_timeline, f.required_equipment,
           fo.full_name AS feasibility_owner_name,
           pm.full_name AS project_manager_name, l.expected_decision_date
    FROM solution_costings sc
    JOIN leads l ON l.id = sc.lead_id
    JOIN feasibility_studies f ON f.id = sc.feasibility_id
    LEFT JOIN users owner ON owner.id = sc.owner_id
    LEFT JOIN users fo ON fo.id = f.owner_id
    LEFT JOIN users pm ON pm.id = l.pm_reviewed_by
    WHERE sc.id = $1
  `, [id]);
  if (!header.rows[0]) return null;
  const row = header.rows[0];
  const versions = await query(`
    SELECT id, version_no, status, is_current, totals, updated_at
    FROM solution_costing_versions
    WHERE costing_id = $1
    ORDER BY version_no
  `, [id]);
  const current = versions.rows.find((item) => item.is_current) || versions.rows[versions.rows.length - 1];
  const version = current ? await loadVersion(current.id) : null;
  const activity = await query(`
    SELECT a.*, u.full_name AS actor_name
    FROM solution_costing_activity a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.costing_id = $1
    ORDER BY a.created_at
  `, [id]);
  const project = await query('SELECT id, project_code FROM projects WHERE costing_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
  return {
    id: row.id,
    costingCode: row.costing_code,
    currency: row.currency,
    ownerId: row.owner_id,
    ownerName: row.owner_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    feasibilityId: row.feasibility_id,
    lead: {
      id: row.lead_id,
      leadCode: row.lead_code,
      title: row.lead_title,
      customerName: row.customer_name,
      businessVertical: row.business_vertical,
      useCase: row.use_case,
      customerRequirement: row.customer_requirement,
      technicalRequirements: row.technical_requirements,
      requiredSolution: row.required_solution,
      description: row.lead_description,
      contactPerson: row.contact_person || '',
      email: row.contact_email || '',
      phone: row.contact_phone || '',
      officeLocation: row.office_location || '',
      siteLocation: row.site_location || '',
      priority: row.priority,
      targetDate: isoDate(row.expected_decision_date),
      projectManager: row.project_manager_name || '',
    },
    feasibility: {
      id: row.feasibility_id,
      status: row.feasibility_status,
      decision: row.decision,
      conclusion: row.overall_conclusion,
      conditions: row.conditions,
      proposedSolution: row.proposed_solution,
      estimatedTimeline: row.estimated_timeline,
      requiredEquipment: row.required_equipment,
      ownerName: row.feasibility_owner_name || '',
    },
    version,
    versions: versions.rows.map((item) => ({
      id: item.id,
      versionNo: item.version_no,
      status: item.status,
      isCurrent: item.is_current,
      totals: item.totals || {},
      updatedAt: item.updated_at,
    })),
    activity: activity.rows.map((item) => ({
      id: item.id,
      action: item.action,
      actor: item.actor_name || 'Workspace',
      createdAt: item.created_at,
    })),
    projectId: project.rows[0]?.id || null,
    projectCode: project.rows[0]?.project_code || '',
  };
}

async function list() {
  const result = await query(`
    SELECT sc.id, sc.costing_code, sc.updated_at, sc.currency,
           l.lead_code, l.title, l.customer_name,
           owner.full_name AS owner_name,
           v.version_no, v.status, v.totals, v.margin_percent, v.updated_at AS version_updated
    FROM solution_costings sc
    JOIN leads l ON l.id = sc.lead_id
    LEFT JOIN users owner ON owner.id = sc.owner_id
    LEFT JOIN solution_costing_versions v ON v.costing_id = sc.id AND v.is_current = TRUE
    ORDER BY sc.updated_at DESC
  `);
  return result.rows.map((row) => {
    const totals = row.totals || {};
    return {
      id: row.id,
      costingCode: row.costing_code || 'COST',
      leadCode: row.lead_code,
      customerName: row.customer_name,
      title: row.title,
      versionNo: row.version_no || 1,
      ownerName: row.owner_name || '',
      totalInternalCost: num(totals.totalInternal),
      sellingPrice: num(totals.selling),
      marginPercent: num(row.margin_percent),
      status: row.status || 'DRAFT',
      currency: row.currency || 'INR',
      updatedAt: row.version_updated || row.updated_at,
    };
  });
}

async function summary() {
  const result = await query(`
    SELECT v.status, COUNT(*)::int AS total
    FROM solution_costing_versions v
    WHERE v.is_current = TRUE
    GROUP BY v.status
  `);
  const counts = Object.fromEntries(result.rows.map((row) => [row.status, row.total]));
  const total = result.rows.reduce((sum, row) => sum + row.total, 0);
  return {
    total,
    draft: (counts.DRAFT || 0) + (counts.IN_PROGRESS || 0),
    underReview: counts.INTERNAL_REVIEW || 0,
    pendingApproval: counts.SUBMITTED_FOR_APPROVAL || 0,
    approved: counts.APPROVED || 0,
    quotationReady: counts.APPROVED || 0,
  };
}

async function sources() {
  const result = await query(`
    SELECT f.id, l.lead_code, l.title, l.customer_name, f.status
    FROM feasibility_studies f
    JOIN leads l ON l.id = f.lead_id
    WHERE f.status IN ('FEASIBLE', 'FEASIBLE_WITH_CONDITIONS')
      AND NOT EXISTS (SELECT 1 FROM solution_costings sc WHERE sc.feasibility_id = f.id)
    ORDER BY f.updated_at DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name,
    status: row.status,
  }));
}

async function saveVersion(versionId, fields) {
  const totals = calculateQuote({ ...fields, risks: fields.risks }, fields.bom, fields.entries);
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE solution_costing_versions SET
        solution_name=$2, solution_description=$3, automation_concept=$4, process_flow=$5, system_architecture=$6,
        key_assumptions=$7, scope_of_supply=$8, customer_scope=$9, careyu_scope=$10, third_party_scope=$11,
        exclusions=$12, commercial_assumptions=$13, technical_assumptions=$14, customer_dependencies=$15,
        architecture_input=$16, architecture_process=$17, architecture_inspection=$18, architecture_decision=$19,
        architecture_output=$20, contingency_percent=$21, overhead_percent=$22, overhead_base=$23, margin_percent=$24,
        tax_percent=$25, currency=$26, component_lead_time=$27, engineering_duration=$28, fabrication_duration=$29,
        assembly_duration=$30, testing_duration=$31, installation_duration=$32, commissioning_duration=$33,
        estimated_duration=$34, payment_terms=$35, delivery_terms=$36, warranty=$37, validity=$38,
        installation_terms=$39, totals=$40::jsonb,
        status = CASE WHEN status = 'DRAFT' THEN 'IN_PROGRESS' ELSE status END
      WHERE id = $1`,
      [
        versionId, fields.solutionName, fields.solutionDescription, fields.automationConcept, fields.processFlow,
        fields.systemArchitecture, fields.keyAssumptions, fields.scopeOfSupply, fields.customerScope, fields.careyuScope,
        fields.thirdPartyScope, fields.exclusions, fields.commercialAssumptions, fields.technicalAssumptions,
        fields.customerDependencies, fields.architectureInput, fields.architectureProcess, fields.architectureInspection,
        fields.architectureDecision, fields.architectureOutput, fields.contingencyPercent, fields.overheadPercent,
        fields.overheadBase, fields.marginPercent, fields.taxPercent, fields.currency, fields.componentLeadTime,
        fields.engineeringDuration, fields.fabricationDuration, fields.assemblyDuration, fields.testingDuration,
        fields.installationDuration, fields.commissioningDuration, fields.estimatedDuration, fields.paymentTerms,
        fields.deliveryTerms, fields.warranty, fields.validity, fields.installationTerms, JSON.stringify(totals),
      ],
    );
    await replaceChildren(client, versionId, fields);
    await client.query(
      `UPDATE solution_costings SET currency = $2, status = (
        SELECT status FROM solution_costing_versions WHERE id = $1
      ) WHERE id = (SELECT costing_id FROM solution_costing_versions WHERE id = $1)`,
      [versionId, fields.currency],
    );
  });
  return totals;
}

async function setStatus(versionId, status, patch = {}) {
  const allowed = ['submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at', 'rejection_reason'];
  const fields = ['status = $2'];
  const values = [versionId, status];
  for (const [column, value] of Object.entries(patch)) {
    if (!allowed.includes(column)) continue;
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }
  await query(`UPDATE solution_costing_versions SET ${fields.join(', ')} WHERE id = $1`, values);
  await query(
    `UPDATE solution_costings SET status = $2
     WHERE id = (SELECT costing_id FROM solution_costing_versions WHERE id = $1)`,
    [versionId, status],
  );
}

async function copyVersion(costingId, sourceVersionId, actorId) {
  return withTransaction(async (client) => {
    const source = await client.query('SELECT id FROM solution_costing_versions WHERE id = $1 AND costing_id = $2', [sourceVersionId, costingId]);
    if (!source.rows[0]) return null;
    const next = await client.query('SELECT COALESCE(MAX(version_no), 0) + 1 AS version_no FROM solution_costing_versions WHERE costing_id = $1', [costingId]);
    await client.query('UPDATE solution_costing_versions SET is_current = FALSE WHERE costing_id = $1', [costingId]);
    const versionNo = next.rows[0].version_no;
    const inserted = await client.query(
      `INSERT INTO solution_costing_versions (
        costing_id, version_no, status, is_current, solution_name, solution_description, automation_concept,
        process_flow, system_architecture, key_assumptions, scope_of_supply, customer_scope, careyu_scope,
        third_party_scope, exclusions, commercial_assumptions, technical_assumptions, customer_dependencies,
        architecture_input, architecture_process, architecture_inspection, architecture_decision, architecture_output,
        contingency_percent, overhead_percent, overhead_base, margin_percent, tax_percent, currency,
        component_lead_time, engineering_duration, fabrication_duration, assembly_duration, testing_duration,
        installation_duration, commissioning_duration, estimated_duration, payment_terms, delivery_terms,
        warranty, validity, installation_terms, totals
      )
      SELECT costing_id, $2, 'DRAFT', TRUE, solution_name, solution_description, automation_concept,
        process_flow, system_architecture, key_assumptions, scope_of_supply, customer_scope, careyu_scope,
        third_party_scope, exclusions, commercial_assumptions, technical_assumptions, customer_dependencies,
        architecture_input, architecture_process, architecture_inspection, architecture_decision, architecture_output,
        contingency_percent, overhead_percent, overhead_base, margin_percent, tax_percent, currency,
        component_lead_time, engineering_duration, fabrication_duration, assembly_duration, testing_duration,
        installation_duration, commissioning_duration, estimated_duration, payment_terms, delivery_terms,
        warranty, validity, installation_terms, totals
      FROM solution_costing_versions WHERE id = $1
      RETURNING id`,
      [sourceVersionId, versionNo],
    );
    const versionId = inserted.rows[0].id;
    await client.query(
      `INSERT INTO solution_costing_components (version_id, category, name, description, sort_order)
       SELECT $2, category, name, description, sort_order FROM solution_costing_components WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(
      `INSERT INTO solution_bom_items (
        version_id, item_no, category, component, description, specification, manufacturer, part_number, supplier,
        quantity, unit, unit_cost, lead_time, remarks, quotation_reference, quoted_price, quote_date, quote_validity,
        purchase_status, sort_order
      )
      SELECT $2, item_no, category, component, description, specification, manufacturer, part_number, supplier,
        quantity, unit, unit_cost, lead_time, remarks, quotation_reference, quoted_price, quote_date, quote_validity,
        purchase_status, sort_order
      FROM solution_bom_items WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(
      `INSERT INTO solution_cost_entries (version_id, section, line_key, label, mode, hours, rate, amount, sort_order)
       SELECT $2, section, line_key, label, mode, hours, rate, amount, sort_order
       FROM solution_cost_entries WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(
      `INSERT INTO solution_costing_risks (version_id, risk, impact, probability, mitigation, cost_impact, owner_id, sort_order)
       SELECT $2, risk, impact, probability, mitigation, cost_impact, owner_id, sort_order
       FROM solution_costing_risks WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(
      `INSERT INTO solution_costing_teams (version_id, team_code, contribution, estimated_cost, members, status)
       SELECT $2, team_code, contribution, estimated_cost, members, status
       FROM solution_costing_teams WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(
      `INSERT INTO solution_costing_documents (
        version_id, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by,
        source_feasibility_id, source_document_id
      )
      SELECT $2, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by,
        source_feasibility_id, source_document_id
      FROM solution_costing_documents WHERE version_id = $1`,
      [sourceVersionId, versionId],
    );
    await client.query(`UPDATE solution_costings SET status = 'DRAFT' WHERE id = $1`, [costingId]);
    await addActivity(costingId, versionId, actorId, `Version ${versionNo} Created`, client);
    return versionId;
  });
}

async function addApproval(versionId, actorId, decision, comments) {
  await query(
    'INSERT INTO solution_costing_approvals (version_id, actor_id, decision, comments) VALUES ($1,$2,$3,$4)',
    [versionId, actorId, decision, comments || ''],
  );
}

async function addAudit(costingId, versionId, actorId, fieldName, previousValue, newValue) {
  if (String(previousValue ?? '') === String(newValue ?? '')) return;
  await query(
    `INSERT INTO solution_costing_audit (costing_id, version_id, actor_id, field_name, previous_value, new_value)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [costingId, versionId, actorId, fieldName, String(previousValue ?? '').slice(0, 2000), String(newValue ?? '').slice(0, 2000)],
  );
}

async function removeCosting(id) {
  await query('DELETE FROM solution_costings WHERE id = $1', [id]);
}

async function addDocument(versionId, file) {
  const result = await query(
    `INSERT INTO solution_costing_documents (version_id, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [versionId, file.originalName, file.storedName, file.mimeType, file.sizeBytes, file.documentType, file.uploadedBy],
  );
  return result.rows[0].id;
}

async function findDocument(costingId, documentId) {
  const result = await query(`
    SELECT d.*, v.costing_id
    FROM solution_costing_documents d
    JOIN solution_costing_versions v ON v.id = d.version_id
    WHERE v.costing_id = $1 AND d.id = $2
  `, [costingId, documentId]);
  return result.rows[0] || null;
}

async function storedNameCount(storedName) {
  if (!storedName) return 0;
  const result = await query('SELECT COUNT(*)::int AS total FROM solution_costing_documents WHERE stored_name = $1', [storedName]);
  return result.rows[0].total;
}

async function removeDocument(costingId, documentId) {
  const result = await query(`
    DELETE FROM solution_costing_documents d
    USING solution_costing_versions v
    WHERE d.version_id = v.id AND v.costing_id = $1 AND d.id = $2
    RETURNING d.stored_name, d.source_document_id
  `, [costingId, documentId]);
  return result.rows[0] || null;
}

async function convertProject(costing, actorId, input) {
  await ensureProjectOrders();
  return withTransaction(async (client) => {
    const existing = await client.query(
      'SELECT id, project_code FROM projects WHERE lead_id = $1 OR costing_id = $2 ORDER BY created_at LIMIT 1',
      [costing.lead.id, costing.id],
    );
    if (existing.rows[0]) {
      return { id: existing.rows[0].id, projectCode: existing.rows[0].project_code, alreadyExisted: true };
    }
    const code = await client.query(`SELECT 'PRJ-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('project_code_seq')::text, 4, '0') AS code`);
    const orderCode = await client.query(`SELECT 'ORD-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('order_code_seq')::text, 4, '0') AS code`);
    const inserted = await client.query(
      `INSERT INTO projects (
        project_code, title, customer_name, lead_id, feasibility_id, costing_id, costing_version_id,
        status, priority, project_manager_id, start_date, target_date, description, site_location,
        customer_contact, approved_value, project_type, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,'PLANNING',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id, project_code`,
      [
        code.rows[0].code,
        input.title,
        costing.lead.customerName,
        costing.lead.id,
        costing.feasibilityId,
        costing.id,
        costing.version.id,
        input.priority,
        input.projectManagerId,
        input.startDate,
        input.targetDate,
        input.description,
        input.siteLocation,
        input.customerContact,
        input.approvedValue,
        input.projectType || '',
        actorId,
      ],
    );
    const project = inserted.rows[0];
    await client.query(`
      INSERT INTO project_orders (
        project_id, order_code, order_date, payment_status, created_at, updated_at
      ) VALUES ($1, $2, CURRENT_DATE, 'AWAITING_PAYMENT', NOW(), NOW())
    `, [project.id, orderCode.rows[0].code]);
    await client.query(`UPDATE leads SET stage = 'Project' WHERE id = $1`, [costing.lead.id]);
    await client.query(
      `INSERT INTO project_activity (project_id, actor_id, action, comment) VALUES ($1,$2,$3,$4)`,
      [project.id, actorId, 'Order converted', `Order ${orderCode.rows[0].code} created from ${costing.costingCode || 'approved costing'} for lead ${costing.lead.leadCode || ''}. Awaiting payment confirmation before activation.`],
    );
    return {
      id: project.id,
      projectCode: project.project_code,
      orderCode: orderCode.rows[0].code,
      alreadyExisted: false,
    };
  });
}

const PROJECT_FROM = `
  FROM projects p
  LEFT JOIN leads l ON l.id = p.lead_id
  LEFT JOIN solution_costings sc ON sc.id = p.costing_id
  LEFT JOIN users manager ON manager.id = p.project_manager_id
  LEFT JOIN users creator ON creator.id = p.created_by
  LEFT JOIN project_orders po ON po.project_id = p.id
  LEFT JOIN users payer ON payer.id = po.payment_confirmed_by
  LEFT JOIN users activator ON activator.id = po.activated_by
`;

const PROJECT_COLUMNS = `
  SELECT p.*, l.lead_code, sc.costing_code,
    manager.full_name AS manager_name,
    manager.department AS manager_department,
    creator.full_name AS creator_name,
    po.order_code, po.order_date, po.payment_status, po.payment_confirmed_at, po.payment_reference,
    po.payment_notes, po.activated_at, po.activated_by, po.payment_confirmed_by,
    payer.full_name AS payment_confirmed_by_name,
    activator.full_name AS activated_by_name,
    (SELECT string_agg(t.team_code, ', ' ORDER BY t.team_code) FROM solution_costing_teams t WHERE t.version_id = p.costing_version_id) AS teams,
    (SELECT COUNT(*)::int FROM project_tasks t WHERE t.project_id = p.id AND t.status <> 'CANCELLED') AS task_total,
    (SELECT COUNT(*)::int FROM project_tasks t WHERE t.project_id = p.id AND t.status = 'COMPLETED') AS task_completed,
    (
      SELECT CASE
        WHEN COUNT(*) FILTER (WHERE t.status <> 'CANCELLED') = 0 THEN NULL
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.status = 'COMPLETED')
          / NULLIF(COUNT(*) FILTER (WHERE t.status <> 'CANCELLED'), 0)
        )::int
      END
      FROM project_tasks t WHERE t.project_id = p.id
    ) AS task_progress,
    (
      SELECT ROUND(AVG(t.progress))::int
      FROM project_tasks t
      WHERE t.project_id = p.id AND t.status <> 'CANCELLED'
    ) AS task_progress_weighted
`;

function stageFor(status) {
  if (status === 'PLANNING' || status === 'READY_FOR_EXECUTION') return 'Planning';
  if (status === 'NOT_STARTED') return 'Not Started';
  if (status === 'IN_PROGRESS' || status === 'ASSIGNED' || status === 'TEAM_REVIEW' || status === 'TASK_BREAKDOWN') return 'In Progress';
  if (status === 'AT_RISK') return 'At Risk';
  if (status === 'ON_HOLD') return 'On Hold';
  if (status === 'COMPLETION_SUBMITTED' || status === 'HANDOVER') return 'Closing';
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'CANCELLED') return 'Cancelled';
  return status || 'Not set';
}

function mapProject(row) {
  const taskTotal = Number(row.task_total) || 0;
  const taskCompleted = Number(row.task_completed) || 0;
  const completionProgress = row.task_progress == null ? null : Number(row.task_progress);
  const weighted = row.task_progress_weighted == null ? null : Number(row.task_progress_weighted);
  const overdue = Boolean(
    row.target_date
    && row.status !== 'COMPLETED'
    && row.status !== 'CANCELLED'
    && isoDate(row.target_date) < new Date().toISOString().slice(0, 10),
  );
  return {
    id: row.id,
    projectCode: row.project_code,
    title: row.title,
    customerName: row.customer_name,
    leadId: row.lead_id,
    leadCode: row.lead_code || '',
    orderCode: row.order_code || '',
    orderDate: isoDate(row.order_date),
    paymentStatus: row.payment_status || '',
    paymentConfirmedAt: row.payment_confirmed_at || null,
    paymentConfirmedBy: row.payment_confirmed_by_name || '',
    paymentReference: row.payment_reference || '',
    paymentNotes: row.payment_notes || '',
    activatedAt: row.activated_at || null,
    activatedBy: row.activated_by_name || '',
    isActivated: Boolean(row.activated_at),
    feasibilityId: row.feasibility_id,
    costingId: row.costing_id,
    status: row.status,
    currentStage: stageFor(row.status),
    priority: row.priority,
    projectManagerId: row.project_manager_id,
    projectManager: row.manager_name || '',
    department: row.department || row.manager_department || '',
    teamCode: row.team_code || '',
    startDate: isoDate(row.start_date),
    targetDate: isoDate(row.target_date),
    completionDate: isoDate(row.completion_date),
    description: row.description || '',
    siteLocation: row.site_location || '',
    customerContact: row.customer_contact || '',
    holdReason: row.hold_reason || '',
    riskReason: row.risk_reason || '',
    completionRemarks: row.completion_remarks || '',
    approvedValue: row.approved_value,
    projectType: row.project_type || '',
    costingCode: row.costing_code || '',
    teams: row.teams || '',
    taskTotal,
    taskCompleted,
    progress: completionProgress,
    progressWeighted: weighted,
    overdue,
    createdBy: row.creator_name || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProjects() {
  await ensureProjectOrders();
  const result = await query(`${PROJECT_COLUMNS} ${PROJECT_FROM} ORDER BY p.updated_at DESC`);
  return result.rows.map(mapProject);
}

async function projectDirectory() {
  const [teamRows, memberRows, taskRows] = await Promise.all([
    query(`
      SELECT t.id, t.code, t.name,
        lead.user_id AS lead_id, lead.full_name AS lead_name
      FROM teams t
      LEFT JOIN LATERAL (
        SELECT m.user_id, u.full_name
        FROM team_members m
        JOIN users u ON u.id = m.user_id
        WHERE m.team_id = t.id AND m.status = 'ACTIVE' AND m.role = 'TEAM_LEAD'
        ORDER BY m.is_primary DESC, u.full_name
        LIMIT 1
      ) lead ON TRUE
      WHERE t.status <> 'ARCHIVED'
      ORDER BY t.name
    `),
    query(`
      SELECT m.team_id, m.user_id, m.role, u.full_name
      FROM team_members m
      JOIN users u ON u.id = m.user_id
      WHERE m.status = 'ACTIVE' AND u.is_active = TRUE AND u.account_status = 'ACTIVE'
        AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
      ORDER BY u.full_name
    `),
    query(`
      SELECT project_id, lower(team_code) AS team_code, status, progress, end_date
      FROM project_tasks
      WHERE status <> 'CANCELLED'
    `),
  ]);
  return {
    teams: teamRows.rows,
    members: memberRows.rows,
    tasks: taskRows.rows,
  };
}

async function findProject(id) {
  await ensureProjectOrders();
  const result = await query(`${PROJECT_COLUMNS} ${PROJECT_FROM} WHERE p.id = $1`, [id]);
  return result.rows[0] ? mapProject(result.rows[0]) : null;
}

const ACTIVATION_PAYMENT = new Set(['PAYMENT_CONFIRMED', 'CREDIT_APPROVED', 'WAIVED', 'PARTIALLY_PAID']);

async function confirmPayment(projectId, actorId, input = {}) {
  await ensureProjectOrders();
  const status = String(input.paymentStatus || 'PAYMENT_CONFIRMED');
  const result = await query(`
    INSERT INTO project_orders (
      project_id, order_code, order_date, payment_status, payment_confirmed_at, payment_confirmed_by,
      payment_reference, payment_notes, updated_at
    ) VALUES (
      $1,
      COALESCE((SELECT order_code FROM project_orders WHERE project_id = $1), $2),
      COALESCE((SELECT order_date FROM project_orders WHERE project_id = $1), CURRENT_DATE),
      $3, NOW(), $4, $5, $6, NOW()
    )
    ON CONFLICT (project_id) DO UPDATE SET
      payment_status = EXCLUDED.payment_status,
      payment_confirmed_at = CASE
        WHEN EXCLUDED.payment_status IN ('PAYMENT_CONFIRMED', 'CREDIT_APPROVED', 'WAIVED', 'PARTIALLY_PAID') THEN NOW()
        ELSE project_orders.payment_confirmed_at
      END,
      payment_confirmed_by = CASE
        WHEN EXCLUDED.payment_status IN ('PAYMENT_CONFIRMED', 'CREDIT_APPROVED', 'WAIVED', 'PARTIALLY_PAID') THEN EXCLUDED.payment_confirmed_by
        ELSE project_orders.payment_confirmed_by
      END,
      payment_reference = EXCLUDED.payment_reference,
      payment_notes = EXCLUDED.payment_notes,
      updated_at = NOW()
    RETURNING project_id, order_code, payment_status
  `, [
    projectId,
    input.orderCode || `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    status,
    actorId,
    String(input.paymentReference || '').slice(0, 200),
    String(input.paymentNotes || '').slice(0, 2000),
  ]);
  await query(
    `INSERT INTO project_activity (project_id, actor_id, action, comment) VALUES ($1,$2,$3,$4)`,
    [projectId, actorId, 'Payment updated', `Payment status set to ${status}${input.paymentReference ? ` · Ref ${input.paymentReference}` : ''}.`],
  );
  return result.rows[0];
}

async function activateProject(projectId, actorId) {
  await ensureProjectOrders();
  const current = await query('SELECT * FROM project_orders WHERE project_id = $1', [projectId]);
  const order = current.rows[0];
  if (!order) return { ok: false, reason: 'Convert the lead to an order before activating this project.' };
  if (order.activated_at) return { ok: true, alreadyActivated: true, orderCode: order.order_code };
  if (!ACTIVATION_PAYMENT.has(order.payment_status)) {
    return { ok: false, reason: 'Confirm payment (or credit / waiver) before activating this project.', paymentStatus: order.payment_status };
  }
  await query(`
    UPDATE project_orders
    SET activated_at = NOW(), activated_by = $2, updated_at = NOW()
    WHERE project_id = $1 AND activated_at IS NULL
  `, [projectId, actorId]);
  await query(
    `UPDATE projects SET status = CASE WHEN status IN ('PLANNING', 'READY_FOR_EXECUTION', 'NOT_STARTED') THEN 'NOT_STARTED' ELSE status END WHERE id = $1`,
    [projectId],
  );
  await query(
    `INSERT INTO project_activity (project_id, actor_id, action, comment) VALUES ($1,$2,$3,$4)`,
    [projectId, actorId, 'Project activated', `Order ${order.order_code} activated for execution.`],
  );
  return { ok: true, alreadyActivated: false, orderCode: order.order_code };
}

async function listRecentActivity(limit = 8) {
  const result = await query(`
    SELECT a.id, a.action, a.comment, a.created_at, p.project_code, u.full_name AS actor
    FROM project_activity a
    JOIN projects p ON p.id = a.project_id
    LEFT JOIN users u ON u.id = a.actor_id
    ORDER BY a.created_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    comment: row.comment || '',
    actor: row.actor || 'Workspace',
    projectCode: row.project_code,
    createdAt: row.created_at,
  }));
}

async function listProjectActivity(projectId) {
  const result = await query(`
    SELECT a.id, a.action, a.comment, a.created_at, u.full_name AS actor
    FROM project_activity a
    LEFT JOIN users u ON u.id = a.actor_id
    WHERE a.project_id = $1
    ORDER BY a.created_at DESC
  `, [projectId]);
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    comment: row.comment,
    actor: row.actor || 'Workspace',
    createdAt: row.created_at,
  }));
}

async function eligibleOpportunities() {
  const result = await query(`
    SELECT sc.id, sc.costing_code, sc.feasibility_id, l.id AS lead_id, l.lead_code, l.customer_name, l.title,
      v.solution_name, v.status, v.totals, f.status AS feasibility_status
    FROM solution_costings sc
    JOIN solution_costing_versions v ON v.costing_id = sc.id AND v.is_current = TRUE
    JOIN leads l ON l.id = sc.lead_id
    JOIN feasibility_studies f ON f.id = sc.feasibility_id
    WHERE v.status = 'APPROVED'
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.lead_id = sc.lead_id OR p.costing_id = sc.id)
    ORDER BY sc.updated_at DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    costingCode: row.costing_code || '',
    feasibilityId: row.feasibility_id,
    leadId: row.lead_id,
    leadCode: row.lead_code,
    customerName: row.customer_name,
    title: row.title,
    solutionName: row.solution_name,
    status: row.status,
    feasibilityStatus: row.feasibility_status || '',
    approvedValue: row.totals?.finalQuote ?? null,
  }));
}

async function updateProject(id, patch, actorId) {
  const result = await query(
    `UPDATE projects SET
      title = $2,
      description = $3,
      project_manager_id = $4,
      priority = $5,
      start_date = $6,
      target_date = $7,
      project_type = $8,
      customer_name = $9,
      department = $10,
      team_code = $11,
      project_code = $12
     WHERE id = $1
     RETURNING id`,
    [
      id, patch.title, patch.description, patch.projectManagerId, patch.priority, patch.startDate, patch.targetDate, patch.projectType,
      patch.customerName, patch.department, patch.teamCode, patch.projectCode,
    ],
  );
  if (!result.rows[0]) return null;
  await query(
    `INSERT INTO project_activity (project_id, actor_id, action, comment) VALUES ($1,$2,$3,$4)`,
    [id, actorId, 'Project updated', patch.title],
  );
  return findProject(id);
}

async function deleteProject(id) {
  const result = await query(`DELETE FROM projects WHERE id = $1 RETURNING id`, [id]);
  return result.rows[0] || null;
}

async function updateProjectStatus(id, patch, actorId) {
  const result = await query(
    `UPDATE projects SET
      status = $2,
      hold_reason = $3,
      risk_reason = $4,
      completion_date = $5,
      completion_remarks = $6
     WHERE id = $1
     RETURNING id`,
    [id, patch.status, patch.holdReason, patch.riskReason, patch.completionDate, patch.completionRemarks],
  );
  if (!result.rows[0]) return null;
  await query(
    `INSERT INTO project_activity (project_id, actor_id, action, comment) VALUES ($1,$2,$3,$4)`,
    [id, actorId, patch.action || `Status changed to ${patch.status}`, patch.comment || ''],
  );
  return findProject(id);
}

module.exports = {
  createFromStudy,
  findById,
  loadVersion,
  list,
  summary,
  sources,
  saveVersion,
  setStatus,
  copyVersion,
  addApproval,
  addAudit,
  addActivity,
  removeCosting,
  addDocument,
  findDocument,
  storedNameCount,
  removeDocument,
  convertProject,
  listProjects,
  projectDirectory,
  findProject,
  listProjectActivity,
  eligibleOpportunities,
  updateProject,
  deleteProject,
  updateProjectStatus,
  listRecentActivity,
  ensureProjectOrders,
  confirmPayment,
  activateProject,
  ACTIVATION_PAYMENT,
};
