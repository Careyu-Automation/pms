const { pool, query } = require('./index');
const { TEAM_LABELS } = require('../services/feasibility.rules');

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

async function addActivity(feasibilityId, actorId, action, client = null) {
  const runner = client ? client.query.bind(client) : query;
  await runner(
    'INSERT INTO feasibility_activity (feasibility_id, actor_id, action) VALUES ($1, $2, $3)',
    [feasibilityId, actorId, action],
  );
}

function mapLead(row) {
  return {
    id: row.lead_id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name,
    customerType: row.customer_type,
    businessVertical: row.business_vertical,
    priority: row.priority,
    useCase: row.use_case,
    createdBy: row.created_by_name,
    createdById: row.created_by,
    contactPerson: row.contact_person,
    designation: row.designation,
    email: row.email,
    phone: row.phone,
    officeLocation: row.office_location,
    siteLocation: row.site_location,
    customerRequirement: row.customer_requirement,
    technicalRequirements: row.technical_requirements,
    commercialRequirements: row.commercial_requirements,
    requiredSolution: row.required_solution,
    productionQuantity: row.production_quantity,
    estimatedValue: row.estimated_value,
    customerChallenge: row.customer_challenge,
    description: row.description,
    details: row.details || {},
    assignedPm: row.pm_name || '',
    assignedPmId: row.pm_reviewed_by,
    status: row.lead_status,
    stage: row.stage,
    createdAt: row.lead_created_at,
  };
}

function mapValidation(row) {
  if (!row) {
    return {
      sampleAvailable: 'No',
      sampleReceivedDate: '',
      sampleQuantity: '',
      testRequired: '',
      testStatus: 'NOT_REQUIRED',
      testMethod: '',
      testResult: '',
      requiredAccuracy: '',
      achievedAccuracy: '',
      requiredCycleTime: '',
      achievedCycleTime: '',
      validationRemarks: '',
      sampleStatus: 'NOT_RECEIVED',
      sampleType: '',
      sampleCondition: '',
      sampleLocation: '',
      sampleOwner: '',
      sampleRemarks: '',
      tests: [],
    };
  }
  return {
    sampleAvailable: row.sample_available,
    sampleReceivedDate: isoDate(row.sample_received_date),
    sampleQuantity: row.sample_quantity,
    testRequired: row.test_required,
    testStatus: row.test_status,
    testMethod: row.test_method,
    testResult: row.test_result,
    requiredAccuracy: row.required_accuracy,
    achievedAccuracy: row.achieved_accuracy,
    requiredCycleTime: row.required_cycle_time,
    achievedCycleTime: row.achieved_cycle_time,
    validationRemarks: row.validation_remarks,
    sampleStatus: row.sample_status,
    sampleType: row.sample_type,
    sampleCondition: row.sample_condition,
    sampleLocation: row.sample_location,
    sampleOwner: row.sample_owner,
    sampleRemarks: row.sample_remarks,
    tests: Array.isArray(row.tests) && row.tests.length
      ? row.tests
      : (row.test_method || row.test_result ? [{
        name: row.test_method || 'Validation',
        testDate: '',
        environment: '',
        procedure: '',
        expectedResult: '',
        actualResult: row.test_result || '',
        accuracy: row.achieved_accuracy || '',
        cycleTime: row.achieved_cycle_time || '',
        status: row.test_status || 'PLANNED',
        observations: row.validation_remarks || '',
      }] : []),
  };
}

function mapStudy(row, extras) {
  return {
    id: row.id,
    leadId: row.lead_id,
    status: row.status,
    ownerId: row.owner_id,
    ownerName: row.owner_name || '',
    startedById: row.started_by,
    startedByName: row.started_by_name || '',
    startedAt: row.started_at,
    targetCompletionDate: isoDate(row.target_completion_date),
    technicalFeasibility: row.technical_feasibility,
    requiredResources: row.required_resources,
    proposedSolution: row.proposed_solution,
    majorConstraints: row.major_constraints,
    estimatedTimeline: row.estimated_timeline,
    requiredEquipment: row.required_equipment,
    technicalAssumptions: row.technical_assumptions,
    teamRemarks: row.team_remarks,
    commercialNotes: row.commercial_notes,
    commercialEstimate: row.commercial_estimate,
    decision: row.decision,
    overallConclusion: row.overall_conclusion,
    conditions: row.conditions,
    majorRisks: row.major_risks,
    recommendedNextStep: row.recommended_next_step,
    pmRemarks: row.pm_remarks,
    completionDate: isoDate(row.completion_date),
    preparedById: row.prepared_by,
    preparedByName: row.prepared_by_name || '',
    preparedAt: row.prepared_at,
    reviewedById: row.reviewed_by,
    reviewedByName: row.reviewed_by_name || '',
    reviewedAt: row.reviewed_at,
    approvedById: row.approved_by,
    approvedByName: row.approved_by_name || '',
    approvedAt: row.approved_at,
    submittedById: row.submitted_by,
    submittedByName: row.submitted_by_name || '',
    submittedAt: row.submitted_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    solutionCostingId: row.solution_costing_id || null,
    lead: mapLead(row),
    ...extras,
  };
}

const STUDY_FROM = `
  FROM feasibility_studies f
  JOIN leads l ON l.id = f.lead_id
  JOIN users creator ON creator.id = l.created_by
  LEFT JOIN users owner ON owner.id = f.owner_id
  LEFT JOIN users starter ON starter.id = f.started_by
  LEFT JOIN users pm ON pm.id = l.pm_reviewed_by
  LEFT JOIN users preparer ON preparer.id = f.prepared_by
  LEFT JOIN users reviewer ON reviewer.id = f.reviewed_by
  LEFT JOIN users approver ON approver.id = f.approved_by
  LEFT JOIN users submitter ON submitter.id = f.submitted_by
  LEFT JOIN solution_costings sc ON sc.feasibility_id = f.id
`;

const STUDY_COLUMNS = `
  f.*,
  l.lead_code, l.title, l.customer_name, l.customer_type, l.business_vertical, l.priority,
  l.use_case, l.created_by, l.contact_person, l.designation, l.email, l.phone,
  l.office_location, l.site_location, l.customer_requirement, l.technical_requirements,
  l.commercial_requirements, l.required_solution, l.production_quantity, l.estimated_value,
  l.customer_challenge, l.description, l.details, l.pm_reviewed_by, l.status AS lead_status,
  l.stage, l.created_at AS lead_created_at,
  creator.full_name AS created_by_name,
  owner.full_name AS owner_name,
  starter.full_name AS started_by_name,
  pm.full_name AS pm_name,
  preparer.full_name AS prepared_by_name,
  reviewer.full_name AS reviewed_by_name,
  approver.full_name AS approved_by_name,
  submitter.full_name AS submitted_by_name,
  sc.id AS solution_costing_id
`;

async function loadChildren(id) {
  // One pooled client for all child reads. Parallel pool.query() calls each take a
  // slot and routinely exhaust shared Aiven plans (Postgres 53300) on detail pages.
  const client = await pool.connect();
  let validation;
  let assignments;
  let members;
  let assessments;
  let requirements;
  let risks;
  let inputs;
  let documents;
  let leadDocuments;
  let communications;
  let activity;
  try {
    validation = await client.query('SELECT * FROM feasibility_validations WHERE feasibility_id = $1', [id]);
    assignments = await client.query(`
      SELECT a.*, team_lead_user.full_name AS team_lead_name
      FROM feasibility_team_assignments a
      LEFT JOIN users team_lead_user ON team_lead_user.id = a.team_lead_id
      WHERE a.feasibility_id = $1
      ORDER BY a.created_at
    `, [id]);
    members = await client.query(`
      SELECT m.assignment_id, m.user_id, u.full_name
      FROM feasibility_team_members m
      JOIN feasibility_team_assignments a ON a.id = m.assignment_id
      JOIN users u ON u.id = m.user_id
      WHERE a.feasibility_id = $1
      ORDER BY u.full_name
    `, [id]);
    assessments = await client.query(`
      SELECT s.*, reviewer.full_name AS reviewed_by_name
      FROM feasibility_assessments s
      JOIN feasibility_team_assignments a ON a.id = s.assignment_id
      LEFT JOIN users reviewer ON reviewer.id = s.reviewed_by
      WHERE a.feasibility_id = $1
    `, [id]);
    requirements = await client.query('SELECT * FROM feasibility_requirements WHERE feasibility_id = $1 ORDER BY sort_order, parameter', [id]);
    risks = await client.query(`
      SELECT r.*, u.full_name AS owner_name
      FROM feasibility_risks r
      LEFT JOIN users u ON u.id = r.owner_id
      WHERE r.feasibility_id = $1
      ORDER BY r.sort_order
    `, [id]);
    inputs = await client.query('SELECT * FROM feasibility_customer_inputs WHERE feasibility_id = $1 ORDER BY sort_order', [id]);
    documents = await client.query(`
      SELECT d.*, u.full_name AS uploaded_by_name, a.team_code
      FROM feasibility_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      LEFT JOIN feasibility_team_assignments a ON a.id = d.assignment_id
      WHERE d.feasibility_id = $1
      ORDER BY d.created_at DESC
    `, [id]);
    leadDocuments = await client.query(`
      SELECT d.*, f.lead_id, creator.full_name AS uploaded_by_name
      FROM lead_documents d
      JOIN feasibility_studies f ON f.lead_id = d.lead_id
      LEFT JOIN leads l ON l.id = d.lead_id
      LEFT JOIN users creator ON creator.id = l.created_by
      WHERE f.id = $1
      ORDER BY d.created_at DESC
    `, [id]);
    communications = await client.query(`
      SELECT c.*, u.full_name AS created_by_name
      FROM feasibility_communications c
      LEFT JOIN users u ON u.id = c.created_by
      WHERE c.feasibility_id = $1
      ORDER BY c.occurred_on DESC NULLS LAST, c.created_at DESC
    `, [id]);
    activity = await client.query(`
      SELECT a.*, u.full_name AS actor_name
      FROM feasibility_activity a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.feasibility_id = $1
      ORDER BY a.created_at
    `, [id]);
  } finally {
    client.release();
  }

  const membersByAssignment = new Map();
  for (const row of members.rows) {
    const list = membersByAssignment.get(row.assignment_id) || [];
    list.push({ id: row.user_id, name: row.full_name });
    membersByAssignment.set(row.assignment_id, list);
  }
  const assessmentByAssignment = new Map(assessments.rows.map((row) => [row.assignment_id, row]));

  return {
    validation: mapValidation(validation.rows[0]),
    teams: assignments.rows.map((row) => {
      const people = membersByAssignment.get(row.id) || [];
      const assessment = assessmentByAssignment.get(row.id);
      return {
        id: row.id,
        teamCode: row.team_code,
        teamName: TEAM_LABELS[row.team_code] || row.team_code,
        teamLeadId: row.team_lead_id,
        teamLeadName: row.team_lead_name || '',
        memberIds: people.map((person) => person.id),
        members: people,
        assignmentDate: isoDate(row.assignment_date),
        dueDate: isoDate(row.due_date),
        status: row.status,
        completionPercent: row.completion_percent,
        assessment: {
          technicalAssessment: assessment?.technical_assessment || '',
          requiredResources: assessment?.required_resources || '',
          proposedApproach: assessment?.proposed_approach || '',
          constraints: assessment?.constraints || '',
          requiredComponents: assessment?.required_components || '',
          technicalAssumptions: assessment?.technical_assumptions || '',
          risks: assessment?.risks || '',
          remarks: assessment?.remarks || '',
          specialty: assessment?.specialty || {},
          reviewedById: assessment?.reviewed_by || null,
          reviewedByName: assessment?.reviewed_by_name || '',
          reviewedAt: assessment?.reviewed_at || null,
          updatedAt: assessment?.updated_at || null,
        },
      };
    }),
    requirements: requirements.rows.map((row) => ({
      id: row.id,
      parameter: row.parameter,
      customerRequirement: row.customer_requirement,
      proposed: row.proposed,
      unit: row.unit,
      status: row.status,
      remarks: row.remarks,
    })),
    risks: risks.rows.map((row) => ({
      id: row.id,
      risk: row.risk,
      category: row.category,
      impact: row.impact,
      probability: row.probability,
      riskLevel: row.risk_level,
      mitigation: row.mitigation,
      ownerId: row.owner_id,
      ownerName: row.owner_name || '',
      targetDate: isoDate(row.target_date),
      status: row.status,
    })),
    customerInputs: inputs.rows.map((row) => ({
      id: row.id,
      informationRequired: row.information_required,
      requestedFrom: row.requested_from,
      requestedDate: isoDate(row.requested_date),
      expectedDate: isoDate(row.expected_date),
      status: row.status,
      remarks: row.remarks,
      critical: row.critical,
    })),
    documents: [
      ...leadDocuments.rows.map((row) => ({
        id: `lead:${row.id}`,
        sourceId: row.id,
        leadId: row.lead_id,
        name: row.original_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        documentType: 'Customer Requirement',
        source: 'LEAD',
        sourceLabel: 'Lead Creation',
        version: 1,
        uploadedBy: row.uploaded_by_name || 'Lead owner',
        uploadedById: null,
        assignmentId: null,
        teamCode: '',
        createdAt: row.created_at,
        canDelete: false,
      })),
      ...documents.rows.map((row) => ({
        id: row.id,
        sourceId: row.id,
        leadId: null,
        name: row.original_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        documentType: row.document_type,
        source: 'FEASIBILITY',
        sourceLabel: 'Feasibility Study',
        version: 1,
        uploadedBy: row.uploaded_by_name || 'Workspace',
        uploadedById: row.uploaded_by,
        assignmentId: row.assignment_id,
        teamCode: row.team_code || '',
        createdAt: row.created_at,
        canDelete: true,
      })),
    ].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    communications: communications.rows.map((row) => ({
      id: row.id,
      occurredOn: isoDate(row.occurred_on),
      communicationType: row.communication_type,
      person: row.person,
      subject: row.subject,
      summary: row.summary,
      actionRequired: row.action_required,
      nextFollowUp: isoDate(row.next_follow_up),
      remarks: row.remarks,
      createdBy: row.created_by_name || '',
      createdAt: row.created_at,
    })),
    activity: activity.rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor_name || 'Workspace',
      createdAt: row.created_at,
    })),
  };
}

async function findById(id) {
  const result = await query(`SELECT ${STUDY_COLUMNS} ${STUDY_FROM} WHERE f.id = $1`, [id]);
  if (!result.rows[0]) return null;
  const children = await loadChildren(id);
  return mapStudy(result.rows[0], children);
}

async function findIdByLead(leadId) {
  const result = await query('SELECT id FROM feasibility_studies WHERE lead_id = $1', [leadId]);
  return result.rows[0]?.id || null;
}

async function ensureForLead(leadId, actorId) {
  return withTransaction(async (client) => {
    const existing = await client.query('SELECT id FROM feasibility_studies WHERE lead_id = $1', [leadId]);
    if (existing.rows[0]) return existing.rows[0].id;
    const lead = await client.query(
      'SELECT id, status, production_quantity, details FROM leads WHERE id = $1',
      [leadId],
    );
    if (!lead.rows[0] || !STUDY_READY.has(lead.rows[0].status)) return null;
    const inserted = await client.query(
      'INSERT INTO feasibility_studies (lead_id) VALUES ($1) RETURNING id',
      [leadId],
    );
    const id = inserted.rows[0].id;
    await client.query('INSERT INTO feasibility_validations (feasibility_id) VALUES ($1)', [id]);
    const details = lead.rows[0].details || {};
    const seeds = [
      ['Cycle Time', details.cycleTime || '', 'sec'],
      ['Accuracy', details.accuracy || '', 'mm'],
      ['Payload', details.payload || '', 'kg'],
      ['Production Quantity', lead.rows[0].production_quantity || '', 'units/day'],
    ];
    let order = 0;
    for (const [parameter, requirement, unit] of seeds) {
      if (!String(requirement).trim()) continue;
      await client.query(`
        INSERT INTO feasibility_requirements (
          feasibility_id, parameter, customer_requirement, unit, status, sort_order
        ) VALUES ($1, $2, $3, $4, 'PENDING_VALIDATION', $5)
      `, [id, parameter, requirement, unit, order]);
      order += 1;
    }
    await addActivity(id, actorId, 'Feasibility Created', client);
    return id;
  });
}

const STUDY_READY = new Set([
  'PM_APPROVED', 'READY_FOR_TEAM_ASSIGNMENT', 'FEASIBILITY',
  'FEASIBILITY_SUBMITTED', 'FEASIBILITY_CHANGES_REQUESTED', 'FEASIBILITY_APPROVED',
  'COSTING', 'COSTING_SUBMITTED', 'COSTING_CHANGES_REQUESTED', 'COSTING_APPROVED',
  'QUOTATION', 'NEGOTIATION', 'WON', 'CONVERTED',
]);

async function syncApproved(actorId) {
  const missing = await query(`
    SELECT id FROM leads
    WHERE status = ANY($1::text[])
      AND id NOT IN (SELECT lead_id FROM feasibility_studies)
  `, [Array.from(STUDY_READY)]);
  for (const row of missing.rows) {
    await ensureForLead(row.id, actorId);
  }
}

async function list() {
  const result = await query(`
    SELECT
      f.id, f.lead_id, f.status, f.target_completion_date, f.updated_at, f.started_at,
      f.technical_feasibility, f.required_resources, f.proposed_solution, f.major_constraints,
      f.estimated_timeline, f.required_equipment, f.technical_assumptions, f.team_remarks,
      f.commercial_notes, f.commercial_estimate,
      l.lead_code, l.title, l.customer_name, l.priority, l.estimated_value, l.commercial_requirements, l.details,
      owner.full_name AS owner_name,
      pm.full_name AS pm_name,
      v.test_status,
      sc.id AS solution_costing_id
    FROM feasibility_studies f
    JOIN leads l ON l.id = f.lead_id
    LEFT JOIN users owner ON owner.id = f.owner_id
    LEFT JOIN users pm ON pm.id = l.pm_reviewed_by
    LEFT JOIN feasibility_validations v ON v.feasibility_id = f.id
    LEFT JOIN solution_costings sc ON sc.feasibility_id = f.id
    ORDER BY f.updated_at DESC
  `);
  const ids = result.rows.map((row) => row.id);
  if (!ids.length) return [];
  const [teams, risks, inputs, docs] = await Promise.all([
    query('SELECT feasibility_id, status, completion_percent FROM feasibility_team_assignments WHERE feasibility_id = ANY($1::uuid[])', [ids]),
    query('SELECT feasibility_id, status, risk_level FROM feasibility_risks WHERE feasibility_id = ANY($1::uuid[])', [ids]),
    query('SELECT feasibility_id, status, critical FROM feasibility_customer_inputs WHERE feasibility_id = ANY($1::uuid[])', [ids]),
    query(`
      SELECT f.id AS feasibility_id,
        (
          (SELECT COUNT(*)::int FROM feasibility_documents d WHERE d.feasibility_id = f.id)
          + (SELECT COUNT(*)::int FROM lead_documents ld WHERE ld.lead_id = f.lead_id)
        ) AS total
      FROM feasibility_studies f
      WHERE f.id = ANY($1::uuid[])
    `, [ids]),
  ]);
  const grouped = (rows, key) => {
    const map = new Map();
    for (const row of rows) {
      const list = map.get(row[key]) || [];
      list.push(row);
      map.set(row[key], list);
    }
    return map;
  };
  const teamMap = grouped(teams.rows, 'feasibility_id');
  const riskMap = grouped(risks.rows, 'feasibility_id');
  const inputMap = grouped(inputs.rows, 'feasibility_id');
  const docMap = new Map(docs.rows.map((row) => [row.feasibility_id, row.total]));

  return result.rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name,
    priority: row.priority,
    status: row.status,
    ownerName: row.owner_name || '',
    assignedPm: row.pm_name || '',
    targetCompletionDate: isoDate(row.target_completion_date),
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    solutionCostingId: row.solution_costing_id,
    technicalFeasibility: row.technical_feasibility,
    requiredResources: row.required_resources,
    proposedSolution: row.proposed_solution,
    majorConstraints: row.major_constraints,
    estimatedTimeline: row.estimated_timeline,
    requiredEquipment: row.required_equipment,
    technicalAssumptions: row.technical_assumptions,
    teamRemarks: row.team_remarks,
    commercialNotes: row.commercial_notes,
    commercialEstimate: row.commercial_estimate,
    lead: {
      estimatedValue: row.estimated_value,
      commercialRequirements: row.commercial_requirements,
      details: row.details || {},
    },
    validation: { testStatus: row.test_status || 'NOT_REQUIRED' },
    teams: (teamMap.get(row.id) || []).map((team) => ({
      status: team.status,
      completionPercent: team.completion_percent,
    })),
    risks: riskMap.get(row.id) || [],
    customerInputs: (inputMap.get(row.id) || []).map((item) => ({
      status: item.status,
      critical: item.critical,
    })),
    documents: Array.from({ length: docMap.get(row.id) || 0 }),
  }));
}

async function touch(client, id) {
  await client.query('UPDATE feasibility_studies SET status = status WHERE id = $1', [id]);
}

async function saveDraft(id, input, actorId, scope) {
  return withTransaction(async (client) => {
    const current = await client.query('SELECT id, status FROM feasibility_studies WHERE id = $1 FOR UPDATE', [id]);
    if (!current.rows[0]) return null;

    if (scope === 'full') {
      await client.query(`
        UPDATE feasibility_studies SET
          owner_id = $2,
          target_completion_date = $3,
          technical_feasibility = $4,
          required_resources = $5,
          proposed_solution = $6,
          major_constraints = $7,
          estimated_timeline = $8,
          required_equipment = $9,
          technical_assumptions = $10,
          team_remarks = $11,
          commercial_notes = $12,
          commercial_estimate = $13,
          decision = $14,
          overall_conclusion = $15,
          conditions = $16,
          major_risks = $17,
          recommended_next_step = $18,
          pm_remarks = $19,
          completion_date = $20
        WHERE id = $1
      `, [
        id,
        input.ownerId,
        input.targetCompletionDate,
        input.technicalFeasibility,
        input.requiredResources,
        input.proposedSolution,
        input.majorConstraints,
        input.estimatedTimeline,
        input.requiredEquipment,
        input.technicalAssumptions,
        input.teamRemarks,
        input.commercialNotes,
        input.commercialEstimate,
        input.decision,
        input.overallConclusion,
        input.conditions,
        input.majorRisks,
        input.recommendedNextStep,
        input.pmRemarks,
        input.completionDate,
      ]);
      await upsertValidation(client, id, input.validation);
      await syncTeams(client, id, input.teams, actorId, true);
      await replaceRequirements(client, id, input.requirements);
      await replaceRisks(client, id, input.risks);
      await replaceInputs(client, id, input.customerInputs);
      await replaceCommunications(client, id, input.communications, actorId);
    } else if (scope === 'assessment') {
      await syncTeamAssessments(client, id, input.teams, actorId);
    } else if (scope === 'sales') {
      await saveSalesCommunications(client, id, input.communications, actorId);
      for (const item of input.customerInputs) {
        if (!item.id) continue;
        await client.query(`
          UPDATE feasibility_customer_inputs
          SET status = $1, remarks = $2
          WHERE id = $3 AND feasibility_id = $4
        `, [item.status, item.remarks, item.id, id]);
      }
    }

    await touch(client, id);
    return id;
  });
}

async function upsertValidation(client, id, validation) {
  await client.query(`
    INSERT INTO feasibility_validations (
      feasibility_id, sample_available, sample_received_date, sample_quantity, test_required,
      test_status, test_method, test_result, required_accuracy, achieved_accuracy,
      required_cycle_time, achieved_cycle_time, validation_remarks, sample_status, sample_type,
      sample_condition, sample_location, sample_owner, sample_remarks, tests
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb
    )
    ON CONFLICT (feasibility_id) DO UPDATE SET
      sample_available = EXCLUDED.sample_available,
      sample_received_date = EXCLUDED.sample_received_date,
      sample_quantity = EXCLUDED.sample_quantity,
      test_required = EXCLUDED.test_required,
      test_status = EXCLUDED.test_status,
      test_method = EXCLUDED.test_method,
      test_result = EXCLUDED.test_result,
      required_accuracy = EXCLUDED.required_accuracy,
      achieved_accuracy = EXCLUDED.achieved_accuracy,
      required_cycle_time = EXCLUDED.required_cycle_time,
      achieved_cycle_time = EXCLUDED.achieved_cycle_time,
      validation_remarks = EXCLUDED.validation_remarks,
      sample_status = EXCLUDED.sample_status,
      sample_type = EXCLUDED.sample_type,
      sample_condition = EXCLUDED.sample_condition,
      sample_location = EXCLUDED.sample_location,
      sample_owner = EXCLUDED.sample_owner,
      sample_remarks = EXCLUDED.sample_remarks,
      tests = EXCLUDED.tests
  `, [
    id,
    validation.sampleAvailable,
    validation.sampleReceivedDate,
    validation.sampleQuantity,
    validation.testRequired,
    validation.testStatus,
    validation.testMethod,
    validation.testResult,
    validation.requiredAccuracy,
    validation.achievedAccuracy,
    validation.requiredCycleTime,
    validation.achievedCycleTime,
    validation.validationRemarks,
    validation.sampleStatus,
    validation.sampleType,
    validation.sampleCondition,
    validation.sampleLocation,
    validation.sampleOwner,
    validation.sampleRemarks,
    JSON.stringify(validation.tests || []),
  ]);
}

async function upsertAssessment(client, assignmentId, assessment, actorId) {
  await client.query(`
    INSERT INTO feasibility_assessments (
      assignment_id, technical_assessment, required_resources, proposed_approach, constraints,
      required_components, technical_assumptions, risks, remarks, specialty, updated_by, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW())
    ON CONFLICT (assignment_id) DO UPDATE SET
      technical_assessment = EXCLUDED.technical_assessment,
      required_resources = EXCLUDED.required_resources,
      proposed_approach = EXCLUDED.proposed_approach,
      constraints = EXCLUDED.constraints,
      required_components = EXCLUDED.required_components,
      technical_assumptions = EXCLUDED.technical_assumptions,
      risks = EXCLUDED.risks,
      remarks = EXCLUDED.remarks,
      specialty = EXCLUDED.specialty,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
  `, [
    assignmentId,
    assessment.technicalAssessment,
    assessment.requiredResources,
    assessment.proposedApproach,
    assessment.constraints,
    assessment.requiredComponents,
    assessment.technicalAssumptions,
    assessment.risks,
    assessment.remarks,
    JSON.stringify(assessment.specialty || {}),
    actorId,
  ]);
}

async function syncTeams(client, feasibilityId, teams, actorId, replaceMissing) {
  const existing = await client.query(
    'SELECT id, team_code FROM feasibility_team_assignments WHERE feasibility_id = $1',
    [feasibilityId],
  );
  const byCode = new Map(existing.rows.map((row) => [row.team_code, row.id]));
  const keep = new Set();
  for (const team of teams) {
    keep.add(team.teamCode);
    let assignmentId = byCode.get(team.teamCode);
    if (!assignmentId) {
      const inserted = await client.query(`
        INSERT INTO feasibility_team_assignments (
          feasibility_id, team_code, team_lead_id, assignment_date, due_date, status, completion_percent
        ) VALUES ($1,$2,$3,COALESCE($4, CURRENT_DATE),$5,$6,$7)
        RETURNING id
      `, [
        feasibilityId, team.teamCode, team.teamLeadId, team.assignmentDate, team.dueDate, team.status, team.completionPercent,
      ]);
      assignmentId = inserted.rows[0].id;
    } else {
      await client.query(`
        UPDATE feasibility_team_assignments
        SET team_lead_id = $2, assignment_date = COALESCE($3, assignment_date), due_date = $4,
            status = $5, completion_percent = $6
        WHERE id = $1
      `, [assignmentId, team.teamLeadId, team.assignmentDate, team.dueDate, team.status, team.completionPercent]);
    }
    await client.query('DELETE FROM feasibility_team_members WHERE assignment_id = $1', [assignmentId]);
    for (const userId of team.memberIds) {
      await client.query(
        'INSERT INTO feasibility_team_members (assignment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [assignmentId, userId],
      );
    }
    if (!byCode.has(team.teamCode) || team.assessmentDirty) {
      await upsertAssessment(client, assignmentId, team.assessment, actorId);
    } else {
      const hasAssessment = await client.query('SELECT 1 FROM feasibility_assessments WHERE assignment_id = $1', [assignmentId]);
      if (!hasAssessment.rows[0]) await upsertAssessment(client, assignmentId, team.assessment, actorId);
    }
  }
  if (replaceMissing) {
    for (const row of existing.rows) {
      if (!keep.has(row.team_code)) {
        await client.query('DELETE FROM feasibility_team_assignments WHERE id = $1', [row.id]);
      }
    }
  }
}

async function syncTeamAssessments(client, feasibilityId, teams, actorId) {
  for (const team of teams) {
    const found = await client.query(
      'SELECT id FROM feasibility_team_assignments WHERE feasibility_id = $1 AND team_code = $2',
      [feasibilityId, team.teamCode],
    );
    if (!found.rows[0]) continue;
    const assignmentId = found.rows[0].id;
    await client.query(`
      UPDATE feasibility_team_assignments
      SET status = $2, completion_percent = $3
      WHERE id = $1
    `, [assignmentId, team.status, team.completionPercent]);
    if (team.assessmentDirty) await upsertAssessment(client, assignmentId, team.assessment, actorId);
  }
}

async function replaceRequirements(client, id, rows) {
  await client.query('DELETE FROM feasibility_requirements WHERE feasibility_id = $1', [id]);
  for (const row of rows) {
    await client.query(`
      INSERT INTO feasibility_requirements (
        feasibility_id, parameter, customer_requirement, proposed, unit, status, remarks, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [id, row.parameter, row.customerRequirement, row.proposed, row.unit, row.status, row.remarks, row.sortOrder]);
  }
}

async function replaceRisks(client, id, rows) {
  await client.query('DELETE FROM feasibility_risks WHERE feasibility_id = $1', [id]);
  for (const row of rows) {
    await client.query(`
      INSERT INTO feasibility_risks (
        feasibility_id, risk, category, impact, probability, risk_level, mitigation, owner_id, target_date, status, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [id, row.risk, row.category, row.impact, row.probability, row.riskLevel, row.mitigation, row.ownerId, row.targetDate, row.status, row.sortOrder]);
  }
}

async function replaceInputs(client, id, rows) {
  await client.query('DELETE FROM feasibility_customer_inputs WHERE feasibility_id = $1', [id]);
  for (const row of rows) {
    await client.query(`
      INSERT INTO feasibility_customer_inputs (
        feasibility_id, information_required, requested_from, requested_date, expected_date, status, remarks, critical, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    `, [id, row.informationRequired, row.requestedFrom, row.requestedDate, row.expectedDate, row.status, row.remarks, row.critical, row.sortOrder]);
  }
}

async function replaceCommunications(client, id, rows, actorId) {
  const existing = await client.query(
    'SELECT id FROM feasibility_communications WHERE feasibility_id = $1',
    [id],
  );
  const keep = new Set();
  for (const row of rows) {
    if (row.id && existing.rows.some((item) => item.id === row.id)) {
      keep.add(row.id);
      await client.query(`
        UPDATE feasibility_communications SET
          occurred_on = $2, communication_type = $3, person = $4, subject = $5, summary = $6,
          action_required = $7, next_follow_up = $8, remarks = $9
        WHERE id = $1 AND feasibility_id = $10
      `, [row.id, row.occurredOn, row.communicationType, row.person, row.subject, row.summary, row.actionRequired, row.nextFollowUp, row.remarks, id]);
    } else {
      const inserted = await client.query(`
        INSERT INTO feasibility_communications (
          feasibility_id, occurred_on, communication_type, person, subject, summary,
          action_required, next_follow_up, remarks, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `, [id, row.occurredOn, row.communicationType, row.person, row.subject, row.summary, row.actionRequired, row.nextFollowUp, row.remarks, actorId]);
      keep.add(inserted.rows[0].id);
    }
  }
  for (const row of existing.rows) {
    if (!keep.has(row.id)) {
      await client.query('DELETE FROM feasibility_communications WHERE id = $1', [row.id]);
    }
  }
}

async function saveSalesCommunications(client, id, rows, actorId) {
  const existing = await client.query(
    'SELECT id FROM feasibility_communications WHERE feasibility_id = $1',
    [id],
  );
  const known = new Set(existing.rows.map((row) => row.id));
  for (const row of rows) {
    if (row.id && known.has(row.id)) {
      await client.query(`
        UPDATE feasibility_communications SET
          occurred_on = $2, communication_type = $3, person = $4, subject = $5, summary = $6,
          action_required = $7, next_follow_up = $8, remarks = $9
        WHERE id = $1 AND feasibility_id = $10
      `, [row.id, row.occurredOn, row.communicationType, row.person, row.subject, row.summary, row.actionRequired, row.nextFollowUp, row.remarks, id]);
    } else if (!row.id) {
      await client.query(`
        INSERT INTO feasibility_communications (
          feasibility_id, occurred_on, communication_type, person, subject, summary,
          action_required, next_follow_up, remarks, created_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [id, row.occurredOn, row.communicationType, row.person, row.subject, row.summary, row.actionRequired, row.nextFollowUp, row.remarks, actorId]);
    }
  }
}

const STATUS_PATCH = new Set([
  'prepared_by', 'prepared_at', 'submitted_by', 'submitted_at', 'reviewed_by', 'reviewed_at',
  'approved_by', 'approved_at', 'completion_date', 'review_note', 'owner_id',
]);

async function setStatus(id, status, patch = {}) {
  const fields = ['status = $2'];
  const values = [id, status];
  for (const [column, value] of Object.entries(patch)) {
    if (!STATUS_PATCH.has(column)) continue;
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  }
  await query(`UPDATE feasibility_studies SET ${fields.join(', ')} WHERE id = $1`, values);
}

async function start(id, actorId, ownerId, targetDate) {
  const result = await query(`
    UPDATE feasibility_studies
    SET status = 'IN_PROGRESS',
        started_at = NOW(),
        started_by = $2,
        owner_id = COALESCE($3, owner_id, $2),
        target_completion_date = COALESCE($4, target_completion_date)
    WHERE id = $1 AND started_at IS NULL
    RETURNING id
  `, [id, actorId, ownerId, targetDate || null]);
  return Boolean(result.rows[0]);
}

async function markTeamReviewed(feasibilityId, teamCode, actorId) {
  const result = await query(`
    UPDATE feasibility_assessments s
    SET reviewed_by = $3, reviewed_at = NOW()
    FROM feasibility_team_assignments a
    WHERE s.assignment_id = a.id
      AND a.feasibility_id = $1
      AND a.team_code = $2
    RETURNING a.team_code
  `, [feasibilityId, teamCode, actorId]);
  if (!result.rows[0]) return false;
  await query(`
    UPDATE feasibility_studies
    SET reviewed_by = $2, reviewed_at = NOW()
    WHERE id = $1
  `, [feasibilityId, actorId]);
  return true;
}

async function addDocument(feasibilityId, file) {
  const result = await query(`
    INSERT INTO feasibility_documents (
      feasibility_id, assignment_id, original_name, stored_name, mime_type, size_bytes, document_type, uploaded_by
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING id
  `, [
    feasibilityId, file.assignmentId, file.originalName, file.storedName, file.mimeType, file.sizeBytes, file.documentType, file.uploadedBy,
  ]);
  return result.rows[0].id;
}

async function findDocument(feasibilityId, documentId) {
  const raw = String(documentId || '');
  if (raw.startsWith('lead:')) {
    const leadDocId = raw.slice(5);
    const result = await query(
      `SELECT d.*, f.lead_id, 'LEAD' AS document_source
       FROM lead_documents d
       JOIN feasibility_studies f ON f.lead_id = d.lead_id
       WHERE f.id = $1 AND d.id = $2`,
      [feasibilityId, leadDocId],
    );
    return result.rows[0] || null;
  }
  const result = await query(
    `SELECT *, 'FEASIBILITY' AS document_source
     FROM feasibility_documents WHERE feasibility_id = $1 AND id = $2`,
    [feasibilityId, documentId],
  );
  return result.rows[0] || null;
}

async function removeDocument(feasibilityId, documentId) {
  if (String(documentId || '').startsWith('lead:')) return null;
  const result = await query(
    'DELETE FROM feasibility_documents WHERE feasibility_id = $1 AND id = $2 RETURNING stored_name',
    [feasibilityId, documentId],
  );
  return result.rows[0] || null;
}

async function ensureCosting(feasibilityId, leadId, actorId) {
  const existing = await query('SELECT id FROM solution_costings WHERE feasibility_id = $1', [feasibilityId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const inserted = await query(`
    INSERT INTO solution_costings (feasibility_id, lead_id, created_by)
    VALUES ($1, $2, $3)
    RETURNING id
  `, [feasibilityId, leadId, actorId]);
  await query(`UPDATE leads SET stage = 'Solution & Costing', updated_at = NOW() WHERE id = $1`, [leadId]);
  await query(
    'INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1, $2, $3)',
    [leadId, actorId, 'Moved to Solution & Costing'],
  );
  return inserted.rows[0].id;
}

async function listCostings() {
  const result = await query(`
    SELECT sc.id, sc.status, sc.created_at, sc.feasibility_id,
           l.lead_code, l.title, l.customer_name,
           f.decision, f.status AS feasibility_status,
           creator.full_name AS created_by_name
    FROM solution_costings sc
    JOIN feasibility_studies f ON f.id = sc.feasibility_id
    JOIN leads l ON l.id = sc.lead_id
    LEFT JOIN users creator ON creator.id = sc.created_by
    ORDER BY sc.created_at DESC
  `);
  return result.rows.map((row) => ({
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    feasibilityId: row.feasibility_id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name,
    decision: row.decision,
    feasibilityStatus: row.feasibility_status,
    createdBy: row.created_by_name || '',
  }));
}

async function findCosting(id) {
  const result = await query('SELECT id, feasibility_id FROM solution_costings WHERE id = $1', [id]);
  return result.rows[0] || null;
}

module.exports = {
  addActivity,
  findById,
  findIdByLead,
  ensureForLead,
  syncApproved,
  list,
  saveDraft,
  setStatus,
  start,
  markTeamReviewed,
  addDocument,
  findDocument,
  removeDocument,
  ensureCosting,
  listCostings,
  findCosting,
};
