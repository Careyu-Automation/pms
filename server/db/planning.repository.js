const { query } = require('./index');

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

function num(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapTask(row) {
  const end = isoDate(row.end_date);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const overdue = Boolean(end) && end < todayIso && !['COMPLETED', 'CANCELLED'].includes(row.status);
  return {
    id: row.id,
    projectId: row.project_id,
    projectCode: row.project_code || '',
    projectTitle: row.project_title || '',
    phaseId: row.phase_id,
    taskCode: row.task_code,
    title: row.title,
    description: row.description || '',
    assigneeId: row.assignee_id,
    assignee: row.assignee_name || '',
    assignedById: row.assigned_by || null,
    assignedBy: row.assigned_by_name || '',
    assignmentStatus: row.assignment_status || 'ACCEPTED',
    acceptedAt: row.accepted_at || null,
    rejectedAt: row.rejected_at || null,
    rejectionReason: row.rejection_reason || '',
    teamCode: row.team_code || '',
    priority: row.priority,
    status: row.status,
    startDate: isoDate(row.start_date),
    endDate: end,
    baselineStart: isoDate(row.baseline_start),
    baselineEnd: isoDate(row.baseline_end),
    estimatedHours: num(row.estimated_hours),
    tags: row.tags || '',
    progress: Number(row.progress) || 0,
    sortOrder: row.sort_order,
    overdue,
    productId: row.product_id || null,
    productCode: row.product_code || '',
    productName: row.product_name || '',
    actualHours: num(row.actual_hours) || 0,
    source: row.product_id ? 'product' : 'project',
    updatedAt: row.updated_at,
  };
}

let assignmentColumnsReady = false;

async function ensureAssignmentColumns() {
  if (assignmentColumnsReady) return;
  if (!(await projectTasksWritable())) {
    assignmentColumnsReady = true;
    return;
  }
  await query('ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS assigned_by UUID');
  await query(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS assignment_status VARCHAR(40) NOT NULL DEFAULT 'ACCEPTED'`);
  await query('ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ');
  await query('ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ');
  await query(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT ''`);
  await query('ALTER TABLE project_tasks DROP CONSTRAINT IF EXISTS project_tasks_assignment_status_check');
  await query(`ALTER TABLE project_tasks ADD CONSTRAINT project_tasks_assignment_status_check
    CHECK (assignment_status IN ('PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED'))`);
  assignmentColumnsReady = true;
}

function mapPhase(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description || '',
    startDate: isoDate(row.start_date),
    endDate: isoDate(row.end_date),
    sortOrder: row.sort_order,
  };
}

function mapMilestone(row) {
  const date = isoDate(row.milestone_date);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const missed = Boolean(date) && date < todayIso && row.status !== 'COMPLETED';
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    date,
    ownerId: row.owner_id,
    owner: row.owner_name || '',
    description: row.description || '',
    status: missed && row.status === 'PENDING' ? 'MISSED' : row.status,
    missed,
  };
}

const TASK_SELECT = `
  SELECT t.*,
    p.project_code,
    p.title AS project_title,
    pr.product_code,
    pr.name AS product_name,
    u.full_name AS assignee_name,
    assigner.full_name AS assigned_by_name,
    COALESCE(logged.actual_hours, 0) AS actual_hours
  FROM project_tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN products pr ON pr.id = t.product_id
  LEFT JOIN users u ON u.id = t.assignee_id
  LEFT JOIN users assigner ON assigner.id = t.assigned_by
  LEFT JOIN (
    SELECT task_id, SUM(hours) AS actual_hours
    FROM project_time_entries
    GROUP BY task_id
  ) logged ON logged.task_id = t.id
`;

async function projectUuid(title) {
  const result = await query(`SELECT pms_app.app_uuid('project', lower(btrim($1::text))) AS id`, [title]);
  return result.rows[0]?.id || null;
}

async function findProjectHeader(id) {
  const result = await query(`
    SELECT p.id, p.project_code, p.title, p.customer_name, p.status, p.priority,
      p.start_date, p.target_date, manager.full_name AS manager_name
    FROM projects p
    LEFT JOIN users manager ON manager.id = p.project_manager_id
    WHERE p.id = $1
  `, [id]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    projectCode: row.project_code,
    title: row.title,
    customerName: row.customer_name,
    status: row.status,
    priority: row.priority,
    startDate: isoDate(row.start_date),
    targetDate: isoDate(row.target_date),
    projectManager: row.manager_name || '',
  };
}

async function listPhases(projectId) {
  const result = await query(
    'SELECT * FROM project_phases WHERE project_id = $1 ORDER BY sort_order, created_at',
    [projectId],
  );
  return result.rows.map(mapPhase);
}

async function listTasks(filters = {}) {
  await ensureAssignmentColumns();
  const clauses = [];
  const params = [];
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`t.project_id = $${params.length}`);
  }
  if (filters.assigneeId) {
    params.push(filters.assigneeId);
    clauses.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    clauses.push(`t.product_id = $${params.length}`);
  }
  if (filters.teamCode) {
    params.push(filters.teamCode);
    clauses.push(`t.team_code = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(`${TASK_SELECT} ${where} ORDER BY t.start_date, t.sort_order, t.created_at`, params);
  return result.rows.map(mapTask);
}

async function findTask(id) {
  await ensureAssignmentColumns();
  const result = await query(`${TASK_SELECT} WHERE t.id = $1`, [id]);
  return result.rows[0] ? mapTask(result.rows[0]) : null;
}

async function listDependencies(projectId) {
  const result = await query(
    'SELECT id, project_id, predecessor_id, successor_id FROM task_dependencies WHERE project_id = $1',
    [projectId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    predecessorId: row.predecessor_id,
    successorId: row.successor_id,
  }));
}

async function listMilestones(projectId) {
  const result = await query(`
    SELECT m.*, u.full_name AS owner_name
    FROM project_milestones m
    LEFT JOIN users u ON u.id = m.owner_id
    WHERE m.project_id = $1
    ORDER BY m.milestone_date
  `, [projectId]);
  return result.rows.map(mapMilestone);
}

async function latestBaseline(projectId) {
  const result = await query(
    'SELECT * FROM project_baselines WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
    [projectId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    plannedStart: isoDate(row.planned_start),
    plannedEnd: isoDate(row.planned_end),
    createdAt: row.created_at,
  };
}

async function nextTaskCode() {
  const result = await query(`SELECT 'TSK-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('task_code_seq')::text, 4, '0') AS code`);
  return result.rows[0].code;
}

async function insertPhase(projectId, input) {
  const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM project_phases WHERE project_id = $1', [projectId]);
  const result = await query(
    `INSERT INTO project_phases (project_id, name, description, start_date, end_date, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [projectId, input.name, input.description, input.startDate, input.endDate, order.rows[0].next],
  );
  return result.rows[0].id;
}

async function updatePhase(id, projectId, input) {
  const result = await query(
    `UPDATE project_phases SET name = $3, description = $4, start_date = $5, end_date = $6, updated_at = NOW()
     WHERE id = $1 AND project_id = $2 RETURNING id`,
    [id, projectId, input.name, input.description, input.startDate, input.endDate],
  );
  return result.rows[0] || null;
}

async function deletePhase(id, projectId) {
  const result = await query('DELETE FROM project_phases WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
  return result.rows[0] || null;
}

async function insertSourceTask(projectId, input, actorId) {
  const named = await query('SELECT title FROM projects WHERE id = $1', [projectId]);
  const projectName = named.rows[0]?.title || input.projectTitle || '';
  if (!projectName) return null;
  const recordKey = `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const result = await query(
    `INSERT INTO public.tasks (
       id, record_key, title, description, status, priority, start_date, due_date,
       progress_percent, assigned_to_id, assigned_to, project_name, team_id,
       created_by_id, created_by, created_at, updated_at
     )
     SELECT
       COALESCE((SELECT MAX(id) FROM public.tasks), 0) + 1,
       $1, $2, $3, $4, $5, $6, $7, $8,
       assignee.user_key, assignee.name, $9, team.record_key,
       actor.user_key, actor.name, NOW(), NOW()
     FROM (SELECT 1) AS seed
     LEFT JOIN public.users assignee ON $10::uuid IS NOT NULL AND pms_app.app_uuid('user', assignee.user_key) = $10::uuid
     LEFT JOIN public.users actor ON pms_app.app_uuid('user', actor.user_key) = $11::uuid
     LEFT JOIN LATERAL (
       SELECT record_key FROM public.teams WHERE $12 <> '' AND lower(code) = lower($12) LIMIT 1
     ) team ON TRUE
     RETURNING pms_app.app_uuid('task', record_key) AS id`,
    [
      recordKey, input.title, input.description || '', input.status, input.priority,
      input.startDate, input.endDate, input.progress || 0, projectName,
      input.assigneeId || null, actorId, input.teamCode || '',
    ],
  );
  return result.rows[0]?.id || null;
}

async function deleteSourceTask(id) {
  const result = await query(
    `DELETE FROM public.tasks
     WHERE pms_app.app_uuid('task', COALESCE(NULLIF(record_key, ''), id::text)) = $1
     RETURNING id`,
    [id],
  );
  return result.rows[0] ? { id } : null;
}

async function insertTask(projectId, input, actorId) {
  await ensureAssignmentColumns();
  if (!(await projectTasksWritable())) return insertSourceTask(projectId, input, actorId);
  const code = await nextTaskCode();
  const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM project_tasks WHERE project_id = $1', [projectId]);
  const assignment = assignmentPayload(input, actorId);
  const result = await query(
    `INSERT INTO project_tasks (
      project_id, phase_id, task_code, title, description, assignee_id, team_code, priority, status,
      start_date, end_date, estimated_hours, progress, sort_order, created_by, tags,
      assigned_by, assignment_status, accepted_at, rejected_at, rejection_reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
    [
      projectId, input.phaseId, code, input.title, input.description, input.assigneeId, input.teamCode,
      input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
      order.rows[0].next, actorId, input.tags || '',
      assignment.assignedBy, assignment.assignmentStatus, assignment.acceptedAt, assignment.rejectedAt, assignment.rejectionReason,
    ],
  );
  return result.rows[0].id;
}

function assignmentPayload(input, actorId) {
  if (input.assignmentStatus) {
    return {
      assignedBy: input.assignedBy || actorId || null,
      assignmentStatus: input.assignmentStatus,
      acceptedAt: input.acceptedAt || null,
      rejectedAt: input.rejectedAt || null,
      rejectionReason: input.rejectionReason || '',
    };
  }
  const assigneeId = input.assigneeId || null;
  if (!assigneeId || assigneeId === actorId) {
    return {
      assignedBy: actorId || null,
      assignmentStatus: 'ACCEPTED',
      acceptedAt: new Date(),
      rejectedAt: null,
      rejectionReason: '',
    };
  }
  return {
    assignedBy: actorId || null,
    assignmentStatus: 'PENDING_ACCEPTANCE',
    acceptedAt: null,
    rejectedAt: null,
    rejectionReason: '',
  };
}

async function projectTasksWritable() {
  const result = await query(`
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'project_tasks' AND n.nspname = ANY (current_schemas(false))
    ORDER BY array_position(current_schemas(false), n.nspname)
    LIMIT 1
  `);
  return result.rows[0]?.relkind === 'r';
}

async function updateSourceTask(id, projectId, input) {
  const taskKey = `pms_app.app_uuid('task', COALESCE(NULLIF(record_key, ''), id::text))`;
  const projectKey = `pms_app.app_uuid('project', CASE WHEN btrim(COALESCE(project_name, '')) = '' THEN 'internal work' ELSE lower(btrim(project_name)) END)`;
  const result = await query(
    `UPDATE public.tasks SET
      title = $3,
      description = $4,
      start_date = $5,
      due_date = $6,
      progress_percent = $7,
      priority = $8,
      status = $9,
      assigned_to_id = COALESCE(
        (SELECT u.user_key FROM public.users u WHERE $10::uuid IS NOT NULL AND pms_app.app_uuid('user', u.user_key) = $10::uuid LIMIT 1),
        assigned_to_id
      ),
      team_id = COALESCE(
        (SELECT t.record_key FROM public.teams t WHERE $11 <> '' AND lower(t.code) = lower($11) LIMIT 1),
        team_id
      ),
      updated_at = NOW()
     WHERE ${taskKey} = $1
       AND ($2::uuid IS NULL OR ${projectKey} = $2::uuid)
     RETURNING id`,
    [
      id,
      projectId,
      input.title,
      input.description || '',
      input.startDate,
      input.endDate,
      input.progress,
      input.priority,
      input.status,
      input.assigneeId || null,
      input.teamCode || '',
    ],
  );
  return result.rows[0] ? { id } : null;
}

async function updateTask(id, projectId, input) {
  await ensureAssignmentColumns();
  if (!(await projectTasksWritable())) return updateSourceTask(id, projectId, input);
  const assignment = input.assignmentStatus
    ? assignmentPayload(input, input.assignedBy)
    : null;
  const result = await query(
    assignment
      ? `UPDATE project_tasks SET
          phase_id = $3, title = $4, description = $5, assignee_id = $6, team_code = $7, priority = $8,
          status = $9, start_date = $10, end_date = $11, estimated_hours = $12, progress = $13, tags = $14,
          assigned_by = $15, assignment_status = $16, accepted_at = $17, rejected_at = $18, rejection_reason = $19,
          updated_at = NOW()
         WHERE id = $1 AND project_id = $2 RETURNING id`
      : `UPDATE project_tasks SET
          phase_id = $3, title = $4, description = $5, assignee_id = $6, team_code = $7, priority = $8,
          status = $9, start_date = $10, end_date = $11, estimated_hours = $12, progress = $13, tags = $14, updated_at = NOW()
         WHERE id = $1 AND project_id = $2 RETURNING id`,
    assignment
      ? [
        id, projectId, input.phaseId, input.title, input.description, input.assigneeId, input.teamCode,
        input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
        input.tags || '', assignment.assignedBy, assignment.assignmentStatus, assignment.acceptedAt,
        assignment.rejectedAt, assignment.rejectionReason,
      ]
      : [
        id, projectId, input.phaseId, input.title, input.description, input.assigneeId, input.teamCode,
        input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
        input.tags || '',
      ],
  );
  return result.rows[0] || null;
}

async function deleteTask(id, projectId) {
  if (!(await projectTasksWritable())) return deleteSourceTask(id);
  const result = await query('DELETE FROM project_tasks WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
  return result.rows[0] || null;
}

async function insertDependency(projectId, predecessorId, successorId) {
  const result = await query(
    `INSERT INTO task_dependencies (project_id, predecessor_id, successor_id)
     VALUES ($1,$2,$3) RETURNING id`,
    [projectId, predecessorId, successorId],
  );
  return result.rows[0].id;
}

async function deleteDependency(id, projectId) {
  const result = await query('DELETE FROM task_dependencies WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
  return result.rows[0] || null;
}

async function insertMilestone(projectId, input) {
  const result = await query(
    `INSERT INTO project_milestones (project_id, name, milestone_date, owner_id, description, status)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [projectId, input.name, input.date, input.ownerId, input.description, input.status],
  );
  return result.rows[0].id;
}

async function updateMilestone(id, projectId, input) {
  const result = await query(
    `UPDATE project_milestones SET name = $3, milestone_date = $4, owner_id = $5, description = $6, status = $7, updated_at = NOW()
     WHERE id = $1 AND project_id = $2 RETURNING id`,
    [id, projectId, input.name, input.date, input.ownerId, input.description, input.status],
  );
  return result.rows[0] || null;
}

async function deleteMilestone(id, projectId) {
  const result = await query('DELETE FROM project_milestones WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
  return result.rows[0] || null;
}

async function setBaseline(projectId, actorId) {
  await query('DELETE FROM project_baselines WHERE project_id = $1', [projectId]);
  await query(
    `INSERT INTO project_baselines (project_id, planned_start, planned_end, created_by)
     SELECT id, start_date, target_date, $2 FROM projects WHERE id = $1`,
    [projectId, actorId],
  );
  if (await projectTasksWritable()) {
    await query(
      `UPDATE project_tasks SET baseline_start = start_date, baseline_end = end_date, updated_at = NOW() WHERE project_id = $1`,
      [projectId],
    );
  }
}

async function addActivity(projectId, actorId, action, comment, productId = null) {
  if (!projectId && !productId) return;
  await query(
    'INSERT INTO project_activity (project_id, product_id, actor_id, action, comment) VALUES ($1,$2,$3,$4,$5)',
    [projectId || null, productId || null, actorId, action, comment || ''],
  );
}

async function insertProductTask(productId, input, actorId) {
  await ensureAssignmentColumns();
  const code = await nextTaskCode();
  const order = await query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM project_tasks WHERE product_id = $1', [productId]);
  const assignment = assignmentPayload(input, actorId);
  const result = await query(
    `INSERT INTO project_tasks (
      product_id, task_code, title, description, assignee_id, team_code, priority, status,
      start_date, end_date, estimated_hours, progress, sort_order, created_by, tags,
      assigned_by, assignment_status, accepted_at, rejected_at, rejection_reason
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
    [
      productId, code, input.title, input.description, input.assigneeId, input.teamCode,
      input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
      order.rows[0].next, actorId, input.tags || '',
      assignment.assignedBy, assignment.assignmentStatus, assignment.acceptedAt, assignment.rejectedAt, assignment.rejectionReason,
    ],
  );
  return result.rows[0].id;
}

async function updateTaskById(id, input) {
  await ensureAssignmentColumns();
  if (!(await projectTasksWritable())) return updateSourceTask(id, null, input);
  const assignment = input.assignmentStatus
    ? assignmentPayload(input, input.assignedBy)
    : null;
  const result = await query(
    assignment
      ? `UPDATE project_tasks SET
          phase_id = $2, title = $3, description = $4, assignee_id = $5, team_code = $6, priority = $7,
          status = $8, start_date = $9, end_date = $10, estimated_hours = $11, progress = $12, tags = $13,
          assigned_by = $14, assignment_status = $15, accepted_at = $16, rejected_at = $17, rejection_reason = $18,
          updated_at = NOW()
         WHERE id = $1 RETURNING id`
      : `UPDATE project_tasks SET
          phase_id = $2, title = $3, description = $4, assignee_id = $5, team_code = $6, priority = $7,
          status = $8, start_date = $9, end_date = $10, estimated_hours = $11, progress = $12, tags = $13, updated_at = NOW()
         WHERE id = $1 RETURNING id`,
    assignment
      ? [
        id, input.phaseId, input.title, input.description, input.assigneeId, input.teamCode,
        input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
        input.tags || '', assignment.assignedBy, assignment.assignmentStatus, assignment.acceptedAt,
        assignment.rejectedAt, assignment.rejectionReason,
      ]
      : [
        id, input.phaseId, input.title, input.description, input.assigneeId, input.teamCode,
        input.priority, input.status, input.startDate, input.endDate, input.estimatedHours, input.progress,
        input.tags || '',
      ],
  );
  return result.rows[0] || null;
}

async function respondAssignment(id, fields) {
  await ensureAssignmentColumns();
  if (!(await projectTasksWritable())) {
    throw Object.assign(new Error('Assignment acceptance requires a writable project_tasks table.'), { status: 501 });
  }
  const result = await query(
    `UPDATE project_tasks SET
      assignment_status = $2,
      accepted_at = $3,
      rejected_at = $4,
      rejection_reason = $5,
      updated_at = NOW()
     WHERE id = $1
     RETURNING id`,
    [id, fields.assignmentStatus, fields.acceptedAt, fields.rejectedAt, fields.rejectionReason || ''],
  );
  return result.rows[0] || null;
}

async function deleteTaskById(id) {
  if (!(await projectTasksWritable())) return deleteSourceTask(id);
  const result = await query('DELETE FROM project_tasks WHERE id = $1 RETURNING id', [id]);
  return result.rows[0] || null;
}

function iso(value) {
  return isoDate(value);
}

async function listTimeEntries(projectId) {
  const result = await query(`
    SELECT e.*, u.full_name AS user_name, t.title AS task_title
    FROM project_time_entries e
    LEFT JOIN users u ON u.id = e.user_id
    LEFT JOIN project_tasks t ON t.id = e.task_id
    WHERE e.project_id = $1
    ORDER BY e.work_date DESC, e.created_at DESC
  `, [projectId]);
  return result.rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    taskTitle: row.task_title || '',
    userId: row.user_id,
    userName: row.user_name || 'Former member',
    hours: num(row.hours) || 0,
    workDate: iso(row.work_date),
    billable: Boolean(row.billable),
    note: row.note || '',
    createdAt: row.created_at,
  }));
}

async function insertTimeEntry(projectId, input, actorId) {
  const result = await query(
    `INSERT INTO project_time_entries (project_id, task_id, user_id, hours, work_date, billable, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [projectId, input.taskId, input.userId, input.hours, input.workDate, input.billable, input.note, actorId],
  );
  return result.rows[0].id;
}

async function deleteTimeEntry(id, projectId) {
  const result = await query('DELETE FROM project_time_entries WHERE id = $1 AND project_id = $2 RETURNING id', [id, projectId]);
  return result.rows[0] || null;
}

async function listDocuments(projectId) {
  const result = await query(`
    SELECT d.*, u.full_name AS uploader
    FROM project_documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.project_id = $1
    ORDER BY d.created_at DESC
  `, [projectId]);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.original_name,
    storedName: row.stored_name,
    mimeType: row.mime_type || '',
    sizeBytes: Number(row.size_bytes) || 0,
    uploadedBy: row.uploader || 'Workspace',
    uploadedById: row.uploaded_by,
    createdAt: row.created_at,
  }));
}

async function insertDocument(projectId, input) {
  const result = await query(
    `INSERT INTO project_documents (project_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [projectId, input.originalName, input.storedName, input.mimeType, input.sizeBytes, input.uploadedBy],
  );
  return result.rows[0].id;
}

async function findDocument(projectId, documentId) {
  const result = await query(
    'SELECT * FROM project_documents WHERE project_id = $1 AND id = $2',
    [projectId, documentId],
  );
  return result.rows[0] || null;
}

async function deleteDocument(projectId, documentId) {
  const result = await query(
    'DELETE FROM project_documents WHERE project_id = $1 AND id = $2 RETURNING stored_name',
    [projectId, documentId],
  );
  return result.rows[0] || null;
}

module.exports = {
  findProjectHeader,
  projectUuid,
  listPhases,
  listTasks,
  findTask,
  listDependencies,
  listMilestones,
  latestBaseline,
  insertPhase,
  updatePhase,
  deletePhase,
  insertTask,
  insertProductTask,
  updateTask,
  updateTaskById,
  respondAssignment,
  deleteTask,
  deleteTaskById,
  insertDependency,
  deleteDependency,
  insertMilestone,
  updateMilestone,
  deleteMilestone,
  setBaseline,
  addActivity,
  listTimeEntries,
  insertTimeEntry,
  deleteTimeEntry,
  listDocuments,
  insertDocument,
  findDocument,
  deleteDocument,
};
