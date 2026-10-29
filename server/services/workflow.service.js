const ApiError = require('../utils/ApiError');
const { query } = require('../db');
const leaveRepository = require('../db/leave.repository');
const leads = require('../db/lead.repository');
const feasibilityRepository = require('../db/feasibility.repository');
const { isPm, isBusinessHead, isTeamLead, actorKind } = require('./workflow.roles');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NEGOTIATION = new Set(['ONGOING', 'CUSTOMER_REVIEW', 'PRICE_NEGOTIATION', 'SCOPE_NEGOTIATION', 'FINAL_DISCUSSION', 'WON', 'LOST', 'ON_HOLD']);
const TEAM_REVIEW = new Set(['ACCEPT', 'REQUEST_CLARIFICATION', 'REQUEST_RESOURCE', 'RAISE_RISK', 'REJECT_ASSIGNMENT']);

function clean(value, max = 2000) {
  return String(value ?? '').trim().slice(0, max);
}

async function notify(userIds, title, body, link) {
  await leaveRepository.notify(userIds, title, body, link);
}

async function record(entityType, entityId, event, actorId, note = '') {
  await query(
    `INSERT INTO workflow_events (entity_type, entity_id, event, actor_id, note) VALUES ($1,$2,$3,$4,$5)`,
    [entityType, entityId, event, actorId || null, clean(note, 1000)],
  );
}

async function markLead(leadId, status, stage, actorId, action) {
  if (!leadId) return;
  await query(
    `UPDATE leads SET status = $2, stage = $3 WHERE id = $1`,
    [leadId, status, stage],
  );
  await query(
    `INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1,$2,$3)`,
    [leadId, actorId || null, action],
  );
  await record('lead', leadId, action.replace(/\s+/g, '_').toUpperCase(), actorId, action);
}

async function usersByKind(kinds) {
  const rows = await query(
    `SELECT u.id, u.designation, r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = TRUE AND u.account_status = 'ACTIVE'`,
  );
  return rows.rows.filter((row) => kinds.includes(actorKind({ designation: row.designation, role: { code: row.role_code, name: row.role_name } }))).map((row) => row.id);
}

let assignmentTablesReady = null;

async function ensureAssignmentTables() {
  if (!assignmentTablesReady) {
    assignmentTablesReady = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS lead_team_assignments (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          lead_id uuid NOT NULL,
          team_id uuid NOT NULL,
          team_code varchar(40) NOT NULL,
          team_lead_id uuid,
          status varchar(20) NOT NULL DEFAULT 'PENDING',
          rejection_reason text NOT NULL DEFAULT '',
          responded_by uuid,
          responded_at timestamptz,
          notes text NOT NULL DEFAULT '',
          assigned_by uuid,
          created_at timestamptz NOT NULL DEFAULT NOW(),
          UNIQUE (lead_id, team_id)
        )
      `);
      await query(`
        CREATE TABLE IF NOT EXISTS lead_team_assignment_members (
          assignment_id uuid NOT NULL REFERENCES lead_team_assignments(id) ON DELETE CASCADE,
          user_id uuid NOT NULL,
          PRIMARY KEY (assignment_id, user_id)
        )
      `);
    })().catch((error) => {
      assignmentTablesReady = null;
      throw error;
    });
  }
  await assignmentTablesReady;
}

function assignmentRequests(body) {
  if (Array.isArray(body.teams) && body.teams.length) return body.teams;
  if (body.teamId) return [{ teamId: body.teamId, teamLeadId: body.teamLeadId, memberIds: body.memberIds || [] }];
  return [];
}

async function assignLead(id, body, user) {
  if (!isPm(user)) throw new ApiError(403, 'Only the project manager can assign a team.');
  const lead = await leads.findById(id);
  if (!lead) throw new ApiError(404, 'Lead not found.');
  if (!['READY_FOR_TEAM_ASSIGNMENT', 'PM_APPROVED', 'FEASIBILITY'].includes(lead.status)) {
    throw new ApiError(409, 'Assign a team after the project manager approves the lead.');
  }
  const requests = assignmentRequests(body);
  if (!requests.length) throw new ApiError(400, 'Choose at least one team.');
  await ensureAssignmentTables();
  const notes = clean(body.notes, 1000);
  const assignedNames = [];
  for (const request of requests) {
    const teamId = String(request.teamId || '');
    if (!UUID.test(teamId)) throw new ApiError(400, 'Choose a team.');
    const team = await query(`SELECT id, code, name FROM teams WHERE id = $1 AND status = 'ACTIVE'`, [teamId]);
    if (!team.rows[0]) throw new ApiError(400, 'Choose one of the CareYu functional teams.');
    let leadUserId = String(request.teamLeadId || '');
    if (leadUserId && !UUID.test(leadUserId)) throw new ApiError(400, 'Choose a team lead.');
    if (!leadUserId) {
      const found = await query(
        `SELECT user_id FROM team_members WHERE team_id = $1 AND role = 'TEAM_LEAD' AND status = 'ACTIVE' ORDER BY is_primary DESC LIMIT 1`,
        [teamId],
      );
      leadUserId = found.rows[0]?.user_id || '';
    }
    const memberIds = [...new Set((request.memberIds || []).map((value) => String(value || '')).filter((value) => UUID.test(value)))];
    const saved = await query(
      `INSERT INTO lead_team_assignments (lead_id, team_id, team_code, team_lead_id, status, rejection_reason, notes, assigned_by)
       VALUES ($1,$2,$3,NULLIF($4,'')::uuid,'PENDING','',$5,$6)
       ON CONFLICT (lead_id, team_id) DO UPDATE SET
         team_lead_id = EXCLUDED.team_lead_id,
         notes = EXCLUDED.notes,
         assigned_by = EXCLUDED.assigned_by,
         status = CASE WHEN lead_team_assignments.status = 'ACCEPTED' THEN 'ACCEPTED' ELSE 'PENDING' END,
         rejection_reason = CASE WHEN lead_team_assignments.status = 'ACCEPTED' THEN lead_team_assignments.rejection_reason ELSE '' END,
         responded_by = CASE WHEN lead_team_assignments.status = 'ACCEPTED' THEN lead_team_assignments.responded_by ELSE NULL END,
         responded_at = CASE WHEN lead_team_assignments.status = 'ACCEPTED' THEN lead_team_assignments.responded_at ELSE NULL END
       RETURNING id, status`,
      [id, teamId, team.rows[0].code, leadUserId, notes, user.id],
    );
    if (saved.rows[0].status !== 'ACCEPTED') {
      await query('DELETE FROM lead_team_assignment_members WHERE assignment_id = $1', [saved.rows[0].id]);
      for (const memberId of memberIds) {
        await query(
          'INSERT INTO lead_team_assignment_members (assignment_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [saved.rows[0].id, memberId],
        );
      }
      const notifyIds = [...new Set([leadUserId, ...memberIds].filter(Boolean))];
      const audience = notifyIds.length ? notifyIds : (await query(
        `SELECT user_id FROM team_members WHERE team_id = $1 AND status = 'ACTIVE' AND role IN ('TEAM_LEAD','SENIOR_MEMBER','MEMBER')`,
        [teamId],
      )).rows.map((row) => row.user_id);
      if (audience.length) {
        await notify(audience, `New assignment: ${lead.title || lead.leadCode}`, `${team.rows[0].name} was assigned. Accept or reject it from your dashboard.`, `/lead-pipeline/${id}`);
      }
      assignedNames.push(team.rows[0].name);
    }
    await query(
      `UPDATE leads
       SET assigned_team_id = $2, assigned_lead_id = NULLIF($3,'')::uuid, assigned_by = $4, assigned_at = NOW(), assignment_notes = $5
       WHERE id = $1`,
      [id, teamId, leadUserId, user.id, notes],
    );
  }
  if (assignedNames.length) {
    await query(
      `INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1,$2,$3)`,
      [id, user.id, `Assigned ${assignedNames.join(', ')}`],
    );
    await record('lead', id, 'TEAM_ASSIGNED', user.id, assignedNames.join(', '));
  }
  return leads.findById(id);
}

async function listLeadAssignments(leadId, user) {
  await ensureAssignmentTables();
  const rows = await query(
    `SELECT a.id, a.lead_id, a.team_id, a.team_code, a.team_lead_id, a.status, a.rejection_reason,
            a.responded_at, a.notes, a.created_at, t.name AS team_name,
            responder.full_name AS responded_by_name, lead_user.full_name AS team_lead_name,
            COALESCE((
              SELECT json_agg(json_build_object('id', u.id, 'name', u.full_name) ORDER BY u.full_name)
              FROM lead_team_assignment_members m
              JOIN users u ON u.id = m.user_id
              WHERE m.assignment_id = a.id
            ), '[]'::json) AS members
     FROM lead_team_assignments a
     JOIN teams t ON t.id = a.team_id
     LEFT JOIN users responder ON responder.id = a.responded_by
     LEFT JOIN users lead_user ON lead_user.id = a.team_lead_id
     WHERE a.lead_id = $1
     ORDER BY t.name`,
    [leadId],
  );
  const mapped = [];
  for (const row of rows.rows) {
    mapped.push({
      id: row.id,
      leadId: row.lead_id,
      teamId: row.team_id,
      teamCode: row.team_code,
      teamName: row.team_name,
      teamLeadId: row.team_lead_id,
      teamLeadName: row.team_lead_name || '',
      status: row.status,
      rejectionReason: row.rejection_reason || '',
      respondedBy: row.responded_by_name || '',
      respondedAt: row.responded_at,
      notes: row.notes || '',
      members: Array.isArray(row.members) ? row.members : [],
      canRespond: user ? await canRespondTo(row, user.id) : false,
    });
  }
  return mapped;
}

async function canRespondTo(assignment, userId) {
  if (!assignment || assignment.status !== 'PENDING') return false;
  if (assignment.team_lead_id === userId) return true;
  const member = await query(
    'SELECT 1 FROM lead_team_assignment_members WHERE assignment_id = $1 AND user_id = $2',
    [assignment.id, userId],
  );
  if (member.rows[0]) return true;
  const anyMember = await query('SELECT 1 FROM lead_team_assignment_members WHERE assignment_id = $1 LIMIT 1', [assignment.id]);
  if (anyMember.rows[0]) return false;
  const onTeam = await query(
    `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'ACTIVE'
       AND role IN ('TEAM_LEAD','SENIOR_MEMBER','MEMBER')`,
    [assignment.team_id, userId],
  );
  return Boolean(onTeam.rows[0]);
}

async function myAssignments(user) {
  await ensureAssignmentTables();
  const rows = await query(
    `SELECT a.*, t.name AS team_name, l.title, l.lead_code, l.customer_name
     FROM lead_team_assignments a
     JOIN teams t ON t.id = a.team_id
     JOIN leads l ON l.id = a.lead_id
     WHERE a.status = 'PENDING'
     ORDER BY a.created_at DESC`,
  );
  const visible = [];
  for (const row of rows.rows) {
    if (await canRespondTo(row, user.id)) visible.push(row);
  }
  return visible.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    leadCode: row.lead_code,
    title: row.title,
    customerName: row.customer_name || '',
    teamId: row.team_id,
    teamName: row.team_name,
    status: row.status,
  }));
}

async function respondToAssignment(assignmentId, body, user) {
  await ensureAssignmentTables();
  const found = await query('SELECT * FROM lead_team_assignments WHERE id = $1', [assignmentId]);
  const assignment = found.rows[0];
  if (!assignment) throw new ApiError(404, 'Assignment not found.');
  if (!(await canRespondTo(assignment, user.id)) && !isPm(user)) {
    throw new ApiError(403, 'This assignment is not waiting for you.');
  }
  if (assignment.status !== 'PENDING' && !isPm(user)) {
    throw new ApiError(409, 'This assignment has already been answered.');
  }
  const action = String(body.action || '').toUpperCase();
  if (!['ACCEPT', 'REJECT'].includes(action)) throw new ApiError(400, 'Choose accept or reject.');
  const reason = clean(body.reason, 1000);
  if (action === 'REJECT' && reason.length < 3) throw new ApiError(400, 'A rejection reason is required.');
  const lead = await leads.findById(assignment.lead_id);
  if (action === 'ACCEPT') {
    await query(
      `UPDATE lead_team_assignments
       SET status = 'ACCEPTED', rejection_reason = '', responded_by = $2, responded_at = NOW()
       WHERE id = $1`,
      [assignmentId, user.id],
    );
    await query(
      `UPDATE leads SET status = 'FEASIBILITY', stage = 'Feasibility' WHERE id = $1 AND status IN ('READY_FOR_TEAM_ASSIGNMENT','PM_APPROVED')`,
      [assignment.lead_id],
    );
    const studyId = await feasibilityRepository.ensureForLead(assignment.lead_id, user.id);
    if (studyId) {
      await query(
        `INSERT INTO feasibility_team_assignments (feasibility_id, team_code, team_lead_id, status, completion_percent)
         VALUES ($1,$2,$3,'NOT_STARTED',0)
         ON CONFLICT (feasibility_id, team_code) DO UPDATE SET team_lead_id = COALESCE(EXCLUDED.team_lead_id, feasibility_team_assignments.team_lead_id)`,
        [studyId, String(assignment.team_code || '').toLowerCase(), assignment.team_lead_id],
      );
    }
    await query(
      `INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1,$2,$3)`,
      [assignment.lead_id, user.id, `Accepted assignment`],
    );
    await record('lead', assignment.lead_id, 'ASSIGNMENT_ACCEPTED', user.id, assignment.team_code);
    await notify(await usersByKind(['PM']), `Assignment accepted: ${lead?.title || lead?.leadCode || 'Lead'}`, 'A team accepted the assignment. Feasibility is now open for that team.', `/lead-pipeline/${assignment.lead_id}`);
    return { id: assignmentId, status: 'ACCEPTED', feasibilityId: studyId || '' };
  }
  await query(
    `UPDATE lead_team_assignments
     SET status = 'REJECTED', rejection_reason = $2, responded_by = $3, responded_at = NOW()
     WHERE id = $1`,
    [assignmentId, reason, user.id],
  );
  await query(
    `INSERT INTO lead_activity (lead_id, actor_id, action) VALUES ($1,$2,$3)`,
    [assignment.lead_id, user.id, `Rejected assignment: ${reason}`],
  );
  await record('lead', assignment.lead_id, 'ASSIGNMENT_REJECTED', user.id, reason);
  await notify(await usersByKind(['PM']), `Assignment rejected: ${lead?.title || lead?.leadCode || 'Lead'}`, reason, `/lead-pipeline/${assignment.lead_id}`);
  return { id: assignmentId, status: 'REJECTED' };
}

async function prepareQuotation(leadId, body, user) {
  const kind = actorKind(user);
  if (!isBusinessHead(user) && kind !== 'ADMIN' && kind !== 'CEO') {
    throw new ApiError(403, 'Only the Business Head can prepare a quotation.');
  }
  const lead = await leads.findById(leadId);
  if (!lead) throw new ApiError(404, 'Lead not found.');
  if (!['COSTING_APPROVED', 'QUOTATION', 'QUOTATION_SENT', 'NEGOTIATION'].includes(lead.status)) {
    throw new ApiError(409, 'A quotation starts after the project manager approves costing.');
  }
  const version = await query(`SELECT COALESCE(MAX(version_no), 0)::int AS version FROM quotations WHERE lead_id = $1`, [leadId]);
  const costing = await query(`SELECT id FROM solution_costings WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1`, [leadId]);
  const inserted = await query(
    `INSERT INTO quotations (
       lead_id, costing_id, version_no, status, prepared_by, scope, price, validity,
       delivery_timeline, payment_terms, warranty, exclusions, assumptions, taxes, commercial_terms
     ) VALUES ($1,$2,$3,'DRAFT',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING id, version_no`,
    [
      leadId, costing.rows[0]?.id || null, version.rows[0].version + 1, user.id,
      clean(body.scope, 4000), body.price === '' || body.price == null ? null : Number(body.price),
      clean(body.validity, 200), clean(body.deliveryTimeline, 200), clean(body.paymentTerms, 500),
      clean(body.warranty, 500), clean(body.exclusions, 1000), clean(body.assumptions, 1000),
      clean(body.taxes, 200), clean(body.commercialTerms, 1000),
    ],
  );
  await markLead(leadId, 'QUOTATION', 'Quotation', user.id, `Quotation V${inserted.rows[0].version_no} created`);
  await notify(await usersByKind(['BH']), `Quotation V${inserted.rows[0].version_no} is ready`, lead.title || lead.leadCode, `/lead-pipeline/${leadId}`);
  return { id: inserted.rows[0].id, versionNo: inserted.rows[0].version_no };
}

async function sendQuotation(quotationId, user) {
  const kind = actorKind(user);
  if (!isBusinessHead(user) && kind !== 'ADMIN' && kind !== 'CEO') {
    throw new ApiError(403, 'Only the Business Head can send a quotation.');
  }
  const row = await query(`SELECT * FROM quotations WHERE id = $1`, [quotationId]);
  if (!row.rows[0]) throw new ApiError(404, 'Quotation not found.');
  if (!['DRAFT', 'READY_TO_SEND', 'INTERNAL_REVIEW'].includes(row.rows[0].status)) {
    throw new ApiError(409, 'This quotation has already been sent.');
  }
  await query(`UPDATE quotations SET status = 'SENT', sent_by = $2, sent_at = NOW() WHERE id = $1`, [quotationId, user.id]);
  await markLead(row.rows[0].lead_id, 'QUOTATION_SENT', 'Quotation Sent to Customer', user.id, `Quotation V${row.rows[0].version_no} sent to customer`);
  return { id: quotationId, status: 'SENT' };
}

async function negotiate(quotationId, body, user) {
  const kind = actorKind(user);
  if (!isBusinessHead(user) && kind !== 'ADMIN' && kind !== 'CEO') {
    throw new ApiError(403, 'Only the Business Head can record negotiation.');
  }
  const row = await query(`SELECT * FROM quotations WHERE id = $1`, [quotationId]);
  if (!row.rows[0]) throw new ApiError(404, 'Quotation not found.');
  const status = NEGOTIATION.has(body.status) ? body.status : 'ONGOING';
  await query(
    `INSERT INTO negotiation_events (
       quotation_id, lead_id, actor_id, status, discussion, price_change, scope_change, timeline_change, payment_terms, remarks
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      quotationId, row.rows[0].lead_id, user.id, status,
      clean(body.discussion, 4000), clean(body.priceChange, 500), clean(body.scopeChange, 1000),
      clean(body.timelineChange, 500), clean(body.paymentTerms, 500), clean(body.remarks, 1000),
    ],
  );
  const leadStatus = status === 'WON' ? 'WON' : status === 'LOST' ? 'LOST' : 'NEGOTIATION';
  await markLead(row.rows[0].lead_id, leadStatus, status === 'WON' ? 'Won' : 'Negotiation', user.id, `Negotiation ${status.replaceAll('_', ' ').toLowerCase()}`);
  if (status === 'WON') await query(`UPDATE quotations SET status = 'ACCEPTED', customer_response = $2 WHERE id = $1`, [quotationId, clean(body.discussion, 500)]);
  if (status === 'LOST') await query(`UPDATE quotations SET status = 'REJECTED' WHERE id = $1`, [quotationId]);
  return { id: quotationId, status };
}

async function acceptedQuotation(leadId) {
  const quote = await query(
    `SELECT q.status, n.status AS negotiation
     FROM quotations q
     LEFT JOIN LATERAL (
       SELECT status FROM negotiation_events WHERE quotation_id = q.id ORDER BY created_at DESC LIMIT 1
     ) n ON TRUE
     WHERE q.lead_id = $1
     ORDER BY q.version_no DESC
     LIMIT 1`,
    [leadId],
  );
  const row = quote.rows[0];
  return Boolean(row && (row.status === 'ACCEPTED' || row.negotiation === 'WON'));
}

async function assignProject(projectId, body, user) {
  if (!isPm(user)) throw new ApiError(403, 'Only the project manager can assign a project.');
  const project = await query(`SELECT id, title, status FROM projects WHERE id = $1`, [projectId]);
  if (!project.rows[0]) throw new ApiError(404, 'Project not found.');
  const assignee = String(body.assignedToId || '');
  if (!UUID.test(assignee)) throw new ApiError(400, 'Choose a person from User Management.');
  const person = await query(
    `SELECT u.id, r.code FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = $1 AND u.is_active = TRUE AND u.account_status = 'ACTIVE'`,
    [assignee],
  );
  if (!person.rows[0]) throw new ApiError(400, 'Inactive users cannot receive a new assignment.');
  const type = body.assignmentType === 'TEAM_MEMBER' || person.rows[0].code !== 'team_lead' ? 'TEAM_MEMBER' : 'TEAM_LEAD';
  const teamId = UUID.test(body.teamId || '') ? body.teamId : null;
  const next = type === 'TEAM_LEAD' ? 'TEAM_REVIEW' : 'TASK_BREAKDOWN';
  await query(
    `UPDATE projects
     SET status = $2, assignment_type = $3, assigned_to_id = $4, assigned_team_id = $5, team_review_status = $6
     WHERE id = $1`,
    [projectId, next, type, assignee, teamId, type === 'TEAM_LEAD' ? 'PENDING' : 'SKIPPED'],
  );
  await record('project', projectId, 'PROJECT_ASSIGNED', user.id, type);
  await notify([assignee], `Project assigned: ${project.rows[0].title}`, 'You have a new project assignment.', `/projects/${projectId}`);
  return { id: projectId, status: next, assignmentType: type };
}

async function reviewProject(projectId, body, user) {
  if (!isTeamLead(user) && !isPm(user)) throw new ApiError(403, 'Only the assigned team lead can review this project.');
  const project = await query(`SELECT id, assigned_to_id, status FROM projects WHERE id = $1`, [projectId]);
  if (!project.rows[0]) throw new ApiError(404, 'Project not found.');
  if (project.rows[0].assigned_to_id && project.rows[0].assigned_to_id !== user.id && !isPm(user)) {
    throw new ApiError(403, 'This project is assigned to another team lead.');
  }
  const action = TEAM_REVIEW.has(body.action) ? body.action : '';
  if (!action) throw new ApiError(400, 'Choose accept, clarification, resource, risk, or reject.');
  const reason = clean(body.reason, 1000);
  if (action === 'REJECT_ASSIGNMENT' && reason.length < 3) throw new ApiError(400, 'A rejection reason is required.');
  const status = action === 'ACCEPT' ? 'TASK_BREAKDOWN' : project.rows[0].status;
  await query(
    `UPDATE projects SET team_review_status = $2, team_reviewed_by = $3, status = $4 WHERE id = $1`,
    [projectId, action, user.id, status],
  );
  await record('project', projectId, 'TEAM_REVIEWED', user.id, reason || action);
  if (action === 'REJECT_ASSIGNMENT') {
    await notify(await usersByKind(['PM']), 'Project assignment rejected', reason, `/projects/${projectId}`);
  }
  return { id: projectId, status, review: action };
}

async function submitCompletion(projectId, user) {
  if (!isTeamLead(user) && !isPm(user)) throw new ApiError(403, 'Only a team lead can submit project completion.');
  const open = await query(
    `SELECT COUNT(*)::int AS total FROM project_tasks WHERE project_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
    [projectId],
  );
  if (open.rows[0].total) throw new ApiError(409, 'Complete the remaining tasks before submitting the project.');
  await query(`UPDATE projects SET status = 'COMPLETION_SUBMITTED' WHERE id = $1`, [projectId]);
  await record('project', projectId, 'PROJECT_COMPLETION_SUBMITTED', user.id, '');
  await notify(await usersByKind(['PM']), 'Project completion submitted', 'A team lead submitted a project for final review.', `/projects/${projectId}`);
  return { id: projectId, status: 'COMPLETION_SUBMITTED' };
}

async function handover(projectId, body, user) {
  if (!isPm(user)) throw new ApiError(403, 'Only the project manager can complete handover.');
  const project = await query(`SELECT status FROM projects WHERE id = $1`, [projectId]);
  if (!project.rows[0]) throw new ApiError(404, 'Project not found.');
  if (body.action === 'correction') {
    if (project.rows[0].status !== 'COMPLETION_SUBMITTED') throw new ApiError(409, 'Corrections are requested after completion is submitted.');
    await query(`UPDATE projects SET status = 'IN_PROGRESS' WHERE id = $1`, [projectId]);
    await record('project', projectId, 'COMPLETION_CORRECTION', user.id, clean(body.notes, 1000));
    return { id: projectId, status: 'IN_PROGRESS' };
  }
  if (!['COMPLETION_SUBMITTED', 'HANDOVER'].includes(project.rows[0].status)) {
    throw new ApiError(409, 'Handover starts after the project manager accepts completion.');
  }
  const open = await query(
    `SELECT COUNT(*)::int AS total FROM project_tasks WHERE project_id = $1 AND status NOT IN ('COMPLETED', 'CANCELLED')`,
    [projectId],
  );
  if (open.rows[0].total) throw new ApiError(409, 'Open tasks must be completed before the project is closed.');
  const notes = clean(body.notes, 4000);
  if (!notes) throw new ApiError(400, 'Record the handover documents and customer sign-off.');
  await query(
    `UPDATE projects SET status = 'COMPLETED', handover_notes = $2, handover_at = NOW(), completion_date = CURRENT_DATE, completion_remarks = $2 WHERE id = $1`,
    [projectId, notes],
  );
  await record('project', projectId, 'HANDOVER_COMPLETED', user.id, notes);
  return { id: projectId, status: 'COMPLETED' };
}

async function summary() {
  const leads = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('SUBMITTED_TO_PM','PM_REVIEW'))::int AS pm_review,
       COUNT(*) FILTER (WHERE status = 'FEASIBILITY_SUBMITTED')::int AS feasibility,
       COUNT(*) FILTER (WHERE status = 'COSTING_SUBMITTED')::int AS costing,
       COUNT(*) FILTER (WHERE status = 'QUOTATION')::int AS quotation,
       COUNT(*) FILTER (WHERE status = 'NEGOTIATION')::int AS negotiation
     FROM leads`,
  );
  const projects = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELLED'))::int AS active,
       COUNT(*) FILTER (WHERE status = 'COMPLETION_SUBMITTED')::int AS completion
     FROM projects`,
  );
  const tasks = await query(
    `SELECT COUNT(*)::int AS overdue FROM project_tasks
     WHERE end_date < CURRENT_DATE AND status NOT IN ('COMPLETED','CANCELLED')`,
  );
  const escalations = await query(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','REJECTED','CANCELLED'))::int AS open,
       COUNT(*) FILTER (WHERE priority = 'CRITICAL' AND status NOT IN ('RESOLVED','CLOSED','REJECTED','CANCELLED'))::int AS critical
     FROM escalations`,
  );
  const row = leads.rows[0];
  return {
    queues: [
      { id: 'pm-review', label: 'Leads awaiting PM review', value: row.pm_review, href: '/lead-pipeline' },
      { id: 'feasibility', label: 'Feasibility awaiting PM approval', value: row.feasibility, href: '/feasibility-studies' },
      { id: 'costing', label: 'Costing awaiting PM approval', value: row.costing, href: '/solution-costing' },
      { id: 'quotation', label: 'Quotations pending', value: row.quotation, href: '/lead-pipeline' },
      { id: 'negotiation', label: 'Negotiations', value: row.negotiation, href: '/lead-pipeline' },
      { id: 'projects', label: 'Active projects', value: projects.rows[0].active, href: '/projects' },
      { id: 'overdue', label: 'Overdue tasks', value: tasks.rows[0].overdue, href: '/tasks' },
      { id: 'escalations', label: 'Open escalations', value: escalations.rows[0].open, href: '/escalations' },
      { id: 'critical', label: 'Critical escalations', value: escalations.rows[0].critical, href: '/escalations' },
      { id: 'completion', label: 'Projects nearing completion', value: projects.rows[0].completion, href: '/projects' },
    ],
  };
}

async function quotationsFor(leadId) {
  const rows = await query(
    `SELECT q.*, u.full_name AS prepared_by_name
     FROM quotations q
     LEFT JOIN users u ON u.id = q.prepared_by
     WHERE q.lead_id = $1
     ORDER BY q.version_no`,
    [leadId],
  );
  const events = await query(
    `SELECT * FROM negotiation_events WHERE lead_id = $1 ORDER BY created_at`,
    [leadId],
  );
  return {
    quotations: rows.rows.map((row) => ({
      id: row.id,
      versionNo: row.version_no,
      status: row.status,
      price: row.price,
      scope: row.scope,
      validity: row.validity,
      preparedBy: row.prepared_by_name || '',
      preparedById: row.prepared_by,
      sentAt: row.sent_at,
    })),
    negotiations: events.rows.map((row) => ({
      id: row.id,
      quotationId: row.quotation_id,
      status: row.status,
      discussion: row.discussion,
      createdAt: row.created_at,
    })),
  };
}

module.exports = {
  notify,
  record,
  markLead,
  usersByKind,
  assignLead,
  listLeadAssignments,
  myAssignments,
  respondToAssignment,
  prepareQuotation,
  sendQuotation,
  negotiate,
  acceptedQuotation,
  assignProject,
  reviewProject,
  submitCompletion,
  handover,
  summary,
  quotationsFor,
};
