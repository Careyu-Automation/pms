const { pool, query } = require('./index');
const source = require('./dailyWork.source');

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

function mapDependency(row) {
  const label = row.person_name || row.team_name || row.external_name || row.dependency_type;
  return {
    id: row.id,
    type: row.dependency_type,
    employeeId: row.employee_id,
    teamId: row.team_id,
    externalName: row.external_name || '',
    description: row.description || '',
    label,
  };
}

function mapUpdate(row, dependencies = []) {
  return {
    id: row.id,
    workItemId: row.work_item_id,
    taskId: row.task_id,
    title: row.title,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    teamName: row.team_name || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCode: row.project_code || '',
    projectStart: isoDate(row.project_start),
    projectDeadline: isoDate(row.project_deadline),
    submoduleId: row.submodule_id || '',
    submoduleName: row.submodule_name || '',
    submoduleStart: isoDate(row.submodule_start),
    submoduleDeadline: isoDate(row.submodule_deadline),
    taskStart: isoDate(row.task_start),
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    currentDate: isoDate(row.update_date),
    taskDeadline: isoDate(row.linked_deadline || row.task_deadline),
    completionDate: isoDate(row.completion_date),
    delayDays: Number(row.delay_days) || 0,
    delayStatus: row.delay_status,
    reasonForDelay: row.reason_for_delay || '',
    remarks: row.remarks || '',
    dependencies,
    dependencyText: dependencies.map((item) => item.label).filter(Boolean).join(', '),
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const UPDATE_FROM = `
  FROM daily_work_updates u
  JOIN daily_work_items i ON i.id = u.work_item_id
  JOIN users emp ON emp.id = u.employee_id
  LEFT JOIN projects p ON p.id = u.project_id
  LEFT JOIN project_tasks tsk ON tsk.id = i.task_id
  LEFT JOIN project_phases ph ON ph.id = tsk.phase_id
`;

const UPDATE_COLUMNS = `
  u.*, i.title, i.task_id, emp.full_name AS employee_name,
  p.title AS project_name, p.project_code, p.start_date AS project_start, p.target_date AS project_deadline,
  ph.id AS submodule_id, ph.name AS submodule_name, ph.start_date AS submodule_start, ph.end_date AS submodule_deadline,
  tsk.start_date AS task_start, tsk.end_date AS linked_deadline,
  (SELECT t.name FROM team_members m JOIN teams t ON t.id = m.team_id
    WHERE m.user_id = u.employee_id AND m.status = 'ACTIVE' ORDER BY t.name LIMIT 1) AS team_name
`;

async function attachDependencies(rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const result = await query(
    `SELECT d.*, person.full_name AS person_name, t.name AS team_name
     FROM daily_work_dependencies d
     LEFT JOIN users person ON person.id = d.employee_id
     LEFT JOIN teams t ON t.id = d.team_id
     WHERE d.daily_work_update_id = ANY($1::uuid[])
     ORDER BY d.created_at`,
    [ids],
  );
  const grouped = new Map();
  result.rows.forEach((row) => {
    const list = grouped.get(row.daily_work_update_id) || [];
    list.push(mapDependency(row));
    grouped.set(row.daily_work_update_id, list);
  });
  return rows.map((row) => mapUpdate(row, grouped.get(row.id) || []));
}

async function list(filters) {
  const params = [filters.from, filters.to];
  const where = ['u.update_date BETWEEN $1 AND $2'];
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`u.employee_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`EXISTS (
      SELECT 1 FROM team_members m
      WHERE m.user_id = u.employee_id AND m.team_id = $${params.length} AND m.status = 'ACTIVE'
    )`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`u.project_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`u.status = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    where.push(`u.priority = $${params.length}`);
  }
  if (filters.delay) {
    params.push(filters.delay);
    where.push(`u.delay_status = $${params.length}`);
  }
  if (filters.dependency) {
    params.push(`%${filters.dependency}%`);
    where.push(`EXISTS (
      SELECT 1 FROM daily_work_dependencies d
      LEFT JOIN users person ON person.id = d.employee_id
      LEFT JOIN teams t ON t.id = d.team_id
      WHERE d.daily_work_update_id = u.id
        AND CONCAT_WS(' ', d.dependency_type, d.external_name, d.description, person.full_name, t.name) ILIKE $${params.length}
    )`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const slot = `$${params.length}`;
    where.push(`(
      i.title ILIKE ${slot} OR u.description ILIKE ${slot} OR emp.full_name ILIKE ${slot}
      OR u.reason_for_delay ILIKE ${slot} OR COALESCE(p.title, '') ILIKE ${slot}
      OR EXISTS (
        SELECT 1 FROM daily_work_dependencies d
        LEFT JOIN users person ON person.id = d.employee_id
        LEFT JOIN teams t ON t.id = d.team_id
        WHERE d.daily_work_update_id = u.id
          AND CONCAT_WS(' ', d.external_name, person.full_name, t.name) ILIKE ${slot}
      )
    )`);
  }
  const result = await query(
    `SELECT ${UPDATE_COLUMNS} ${UPDATE_FROM} WHERE ${where.join(' AND ')} ORDER BY u.update_date DESC, emp.full_name, i.title`,
    params,
  );
  return attachDependencies(result.rows);
}

const TASK_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON_HOLD',
  AT_RISK: 'IN_PROGRESS',
  BLOCKED: 'BLOCKED',
};

async function assignedBoard(filters, actor) {
  const params = [filters.date];
  const where = [
    't.assignee_id IS NOT NULL',
    `t.status <> 'CANCELLED'`,
    `(t.status <> 'COMPLETED' OR u.id IS NOT NULL)`,
  ];
  if (Array.isArray(filters.employeeIds)) {
    params.push(filters.employeeIds);
    where.push(`t.assignee_id = ANY($${params.length}::uuid[])`);
  } else if (!filters.organization) {
    params.push(actor.id);
    where.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`EXISTS (
      SELECT 1 FROM team_members m
      WHERE m.user_id = t.assignee_id AND m.team_id = $${params.length} AND m.status = 'ACTIVE'
    )`);
  }
  if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`t.project_id = $${params.length}`);
  }
  if (filters.submoduleId) {
    params.push(filters.submoduleId);
    where.push(`t.phase_id = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const slot = `$${params.length}`;
    where.push(`(t.title ILIKE ${slot} OR emp.full_name ILIKE ${slot} OR p.title ILIKE ${slot} OR COALESCE(ph.name, '') ILIKE ${slot})`);
  }
  const result = await query(
    `SELECT t.id AS task_id, t.title, t.description AS task_description, t.status AS task_status,
            t.start_date AS task_start, t.end_date AS task_deadline, t.priority, t.assignee_id AS employee_id,
            emp.full_name AS employee_name,
            p.id AS project_id, p.title AS project_name, p.project_code,
            p.start_date AS project_start, p.target_date AS project_deadline,
            ph.id AS submodule_id, ph.name AS submodule_name, ph.start_date AS submodule_start, ph.end_date AS submodule_deadline,
            u.id AS update_id, u.work_item_id, u.description, u.status AS update_status, u.reason_for_delay,
            u.delay_status, u.delay_days, u.update_date, u.completion_date, u.remarks, u.created_by, u.created_at, u.updated_at,
            (SELECT tm.name FROM team_members m JOIN teams tm ON tm.id = m.team_id
              WHERE m.user_id = t.assignee_id AND m.status = 'ACTIVE'
              ORDER BY m.is_primary DESC, tm.name LIMIT 1) AS team_name
     FROM project_tasks t
     JOIN users emp ON emp.id = t.assignee_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN project_phases ph ON ph.id = t.phase_id
     LEFT JOIN daily_work_items i ON i.task_id = t.id
     LEFT JOIN daily_work_updates u ON u.work_item_id = i.id AND u.update_date = $1::date
     WHERE ${where.join(' AND ')}
     ORDER BY p.title, ph.sort_order NULLS LAST, t.title`,
    params,
  );
  const savedIds = result.rows.filter((row) => row.update_id).map((row) => row.update_id);
  let grouped = new Map();
  if (savedIds.length) {
    const deps = await query(
      `SELECT d.*, person.full_name AS person_name, t.name AS team_name
       FROM daily_work_dependencies d
       LEFT JOIN users person ON person.id = d.employee_id
       LEFT JOIN teams t ON t.id = d.team_id
       WHERE d.daily_work_update_id = ANY($1::uuid[])`,
      [savedIds],
    );
    deps.rows.forEach((row) => {
      const list = grouped.get(row.daily_work_update_id) || [];
      list.push(mapDependency(row));
      grouped.set(row.daily_work_update_id, list);
    });
  }
  return result.rows.map((row) => {
    const dependencies = grouped.get(row.update_id) || [];
    const status = row.update_status || TASK_STATUS[row.task_status] || 'NOT_STARTED';
    return {
      id: row.update_id || `pending:${row.task_id}`,
      pending: !row.update_id,
      submitted: Boolean(row.update_id),
      workItemId: row.work_item_id || '',
      taskId: row.task_id,
      title: row.title,
      taskDescription: row.task_description || '',
      employeeId: row.employee_id,
      employeeName: row.employee_name || '',
      teamName: row.team_name || '',
      projectId: row.project_id,
      projectName: row.project_name || '',
      projectCode: row.project_code || '',
      projectStart: isoDate(row.project_start),
      projectDeadline: isoDate(row.project_deadline),
      submoduleId: row.submodule_id || '',
      submoduleName: row.submodule_name || '',
      submoduleStart: isoDate(row.submodule_start),
      submoduleDeadline: isoDate(row.submodule_deadline),
      taskStart: isoDate(row.task_start),
      description: row.description || '',
      status,
      priority: row.priority || 'MEDIUM',
      currentDate: filters.date,
      taskDeadline: isoDate(row.task_deadline),
      completionDate: isoDate(row.completion_date),
      delayDays: Number(row.delay_days) || 0,
      delayStatus: row.delay_status || '',
      reasonForDelay: row.reason_for_delay || '',
      remarks: row.remarks || '',
      dependencies,
      dependencyText: dependencies.map((item) => item.label).filter(Boolean).join(', '),
      createdById: row.created_by || row.employee_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }).filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.delay && row.delayStatus && row.delayStatus !== filters.delay) return false;
    return true;
  });
}

async function findUpdate(id) {
  const result = await query(`SELECT ${UPDATE_COLUMNS} ${UPDATE_FROM} WHERE u.id = $1`, [id]);
  const rows = await attachDependencies(result.rows);
  return rows[0] || null;
}

async function findItem(id) {
  const result = await query(
    `SELECT i.*, emp.full_name AS employee_name, p.title AS project_name, p.project_code, t.title AS linked_task_title
     FROM daily_work_items i
     JOIN users emp ON emp.id = i.employee_id
     LEFT JOIN projects p ON p.id = i.project_id
     LEFT JOIN project_tasks t ON t.id = i.task_id
     WHERE i.id = $1 OR i.task_id = $1
     LIMIT 1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    taskId: row.task_id,
    title: row.linked_task_title || row.title,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    projectId: row.project_id,
    projectName: row.project_name || '',
    projectCode: row.project_code || '',
    priority: row.priority,
    deadline: isoDate(row.deadline),
  };
}

async function findItemByTask(taskId) {
  const result = await query('SELECT id FROM daily_work_items WHERE task_id = $1', [taskId]);
  return result.rows[0]?.id || null;
}

async function history(workItemId) {
  const result = await query(
    `SELECT ${UPDATE_COLUMNS} ${UPDATE_FROM} WHERE u.work_item_id = $1 ORDER BY u.update_date DESC, u.created_at DESC`,
    [workItemId],
  );
  return attachDependencies(result.rows);
}

async function listActivity(workItemId) {
  const result = await query(
    `SELECT a.*, u.full_name AS actor_name
     FROM daily_work_activity a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.work_item_id = $1
     ORDER BY a.created_at DESC
     LIMIT 100`,
    [workItemId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorName: row.actor_name || 'CareYu',
    createdAt: row.created_at,
  }));
}

async function insertItem(client, input) {
  const result = await client.query(
    `INSERT INTO daily_work_items (task_id, title, employee_id, project_id, priority, deadline, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [input.taskId, input.title, input.employeeId, input.projectId, input.priority, input.deadline, input.createdById],
  );
  return result.rows[0].id;
}

async function updateItem(client, id, input) {
  await client.query(
    `UPDATE daily_work_items
     SET title = $2, employee_id = $3, project_id = $4, priority = $5, deadline = $6
     WHERE id = $1`,
    [id, input.title, input.employeeId, input.projectId, input.priority, input.deadline],
  );
}

async function insertUpdate(client, input) {
  const result = await client.query(
    `INSERT INTO daily_work_updates (
       work_item_id, employee_id, project_id, description, status, priority, update_date,
       task_deadline, completion_date, delay_days, delay_status, reason_for_delay, remarks, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      input.workItemId, input.employeeId, input.projectId, input.description, input.status, input.priority,
      input.updateDate, input.taskDeadline, input.completionDate, input.delayDays, input.delayStatus,
      input.reasonForDelay, input.remarks, input.createdById,
    ],
  );
  return result.rows[0].id;
}

async function saveUpdate(client, id, input) {
  await client.query(
    `UPDATE daily_work_updates SET
       employee_id = $2, project_id = $3, description = $4, status = $5, priority = $6, update_date = $7,
       task_deadline = $8, completion_date = $9, delay_days = $10, delay_status = $11,
       reason_for_delay = $12, remarks = $13
     WHERE id = $1`,
    [
      id, input.employeeId, input.projectId, input.description, input.status, input.priority,
      input.updateDate, input.taskDeadline, input.completionDate, input.delayDays, input.delayStatus,
      input.reasonForDelay, input.remarks,
    ],
  );
}

async function replaceDependencies(client, updateId, dependencies) {
  await client.query('DELETE FROM daily_work_dependencies WHERE daily_work_update_id = $1', [updateId]);
  for (const item of dependencies) {
    await client.query(
      `INSERT INTO daily_work_dependencies (daily_work_update_id, dependency_type, employee_id, team_id, external_name, description)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [updateId, item.type, item.employeeId, item.teamId, item.externalName, item.description],
    );
  }
}

async function updatesAreView() {
  const found = await query(
    `SELECT c.relkind
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'daily_work_updates'
       AND n.nspname = ANY (current_schemas(false))
     ORDER BY array_position(current_schemas(false), n.nspname)
     LIMIT 1`,
  );
  return found.rows[0]?.relkind === 'v';
}

async function removeUpdate(client, id) {
  if (await updatesAreView()) return source.remove(client, id);
  const result = await client.query('DELETE FROM daily_work_updates WHERE id = $1 RETURNING id, work_item_id', [id]);
  return result.rows[0] || null;
}

async function addActivity(client, workItemId, updateId, actorId, action) {
  if (await updatesAreView()) return;
  await client.query(
    'INSERT INTO daily_work_activity (work_item_id, update_id, actor_id, action) VALUES ($1,$2,$3,$4)',
    [workItemId, updateId, actorId, action],
  );
}

async function dayTaken(workItemId, updateDate, exceptId) {
  const result = await query(
    `SELECT id FROM daily_work_updates
     WHERE work_item_id = $1 AND update_date = $2 AND id <> COALESCE($3::uuid, '00000000-0000-0000-0000-000000000000')`,
    [workItemId, updateDate, exceptId || null],
  );
  return Boolean(result.rows[0]);
}

async function lookups() {
  const [people, teams, projects, tasks, submodules] = await Promise.all([
    query(`SELECT id, full_name, email FROM users WHERE is_active = TRUE ORDER BY full_name`),
    query(`SELECT id, name, code FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
    query(`SELECT id, title, project_code FROM projects ORDER BY title LIMIT 300`),
    query(
      `SELECT t.id, t.title, t.project_id, t.end_date, t.priority, t.assignee_id, p.title AS project_title
       FROM project_tasks t
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.status <> 'CANCELLED'
       ORDER BY t.updated_at DESC
       LIMIT 300`,
    ),
    query(`SELECT id, project_id, name FROM project_phases ORDER BY name LIMIT 400`),
  ]);
  return {
    people: people.rows.map((row) => ({ id: row.id, fullName: row.full_name, email: row.email })),
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name, code: row.code })),
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title, code: row.project_code })),
    submodules: submodules.rows.map((row) => ({ id: row.id, projectId: row.project_id, name: row.name })),
    tasks: tasks.rows.map((row) => ({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
      projectName: row.project_title || '',
      deadline: isoDate(row.end_date),
      priority: row.priority,
      assigneeId: row.assignee_id,
    })),
  };
}

async function openWithoutUpdate(employeeId, day) {
  const result = await query(
    `SELECT i.id, i.title
     FROM daily_work_items i
     WHERE i.employee_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM daily_work_updates u
         WHERE u.work_item_id = i.id AND u.update_date = $2
       )
       AND NOT EXISTS (
         SELECT 1 FROM daily_work_updates latest
         WHERE latest.work_item_id = i.id
           AND latest.update_date = (SELECT MAX(update_date) FROM daily_work_updates WHERE work_item_id = i.id)
           AND latest.status = 'COMPLETED'
       )
     ORDER BY i.title`,
    [employeeId, day],
  );
  return result.rows.map((row) => ({ id: row.id, title: row.title }));
}

async function findTask(id) {
  const result = await query(
    `SELECT t.id, t.title, t.project_id, t.end_date, t.priority, t.assignee_id, p.title AS project_title
     FROM project_tasks t
     LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    projectName: row.project_title || '',
    deadline: isoDate(row.end_date),
    priority: row.priority,
    assigneeId: row.assignee_id,
  };
}

const LOG_FROM = `
  FROM daily_work_updates d
  LEFT JOIN daily_work_items i ON i.id = d.work_item_id
  JOIN users emp ON emp.id = d.employee_id
  LEFT JOIN teams tm ON tm.id = d.team_id
  LEFT JOIN LATERAL (
    SELECT t.name FROM team_members m
    JOIN teams t ON t.id = m.team_id
    WHERE m.user_id = d.employee_id AND m.status = 'ACTIVE'
      AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
    ORDER BY m.is_primary DESC, t.name
    LIMIT 1
  ) primary_team ON TRUE
  LEFT JOIN projects p ON p.id = d.project_id
  LEFT JOIN products pr ON pr.id = d.product_id
  LEFT JOIN daily_work_types wt ON wt.code = d.work_type
  LEFT JOIN project_tasks tsk ON tsk.id = i.task_id
`;

function mapLog(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || '',
    teamId: row.team_id || '',
    teamName: row.team_name || '',
    workType: row.work_type || 'INTERNAL',
    workTypeName: row.work_type_name || row.work_type || 'Internal work',
    workTitle: row.work_title || '',
    description: row.description || '',
    projectId: row.project_id || '',
    projectName: row.project_name || '',
    productId: row.product_id || '',
    productName: row.product_name || '',
    status: row.status,
    priority: row.priority || 'MEDIUM',
    currentDate: isoDate(row.update_date),
    nextAction: row.next_action || '',
    hours: Number(row.hours) || 0,
    minutes: Number(row.minutes) || 0,
    dependencyType: row.dependency_type || '',
    dependencyDetails: row.dependency_details || '',
    taskId: row.task_id || '',
    entryKind: row.task_id ? 'UPDATE' : 'MANUAL',
    progress: row.task_progress == null || row.task_progress === '' ? null : Number(row.task_progress),
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: row.attachments || [],
  };
}

const LOG_COLUMNS = `
  d.id, d.employee_id, d.project_id, d.product_id, d.team_id, d.update_date, d.description,
  d.status, d.priority, d.created_by, d.created_at, d.updated_at, d.hours, d.minutes,
  d.next_action, d.dependency_type, d.dependency_details, i.task_id, tsk.progress AS task_progress,
  COALESCE(NULLIF(d.work_title, ''), i.title, 'Work update') AS work_title,
  COALESCE(NULLIF(d.work_type, ''), CASE WHEN d.project_id IS NULL THEN 'INTERNAL' ELSE 'PROJECT_WORK' END) AS work_type,
  emp.full_name AS employee_name,
  COALESCE(tm.name, primary_team.name, '') AS team_name,
  COALESCE(p.title, '') AS project_name,
  COALESCE(pr.name, '') AS product_name,
  COALESCE(wt.name, d.work_type, 'Internal work') AS work_type_name
`;

async function logList(filters, actor) {
  if (await updatesAreView()) return source.list(filters, actor);
  const params = [filters.from, filters.to];
  const where = ['d.update_date BETWEEN $1 AND $2'];
  if (Array.isArray(filters.employeeIds)) {
    params.push(filters.employeeIds);
    where.push(`d.employee_id = ANY($${params.length}::uuid[])`);
  } else if (!filters.organization) {
    params.push(actor.id);
    where.push(`d.employee_id = $${params.length}`);
  }
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`d.employee_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`(d.team_id = $${params.length} OR (d.team_id IS NULL AND EXISTS (
      SELECT 1 FROM team_members m WHERE m.user_id = d.employee_id AND m.team_id = $${params.length} AND m.status = 'ACTIVE'
    )))`);
  }
  if (filters.projectId === 'none') where.push('d.project_id IS NULL');
  else if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`d.project_id = $${params.length}`);
  }
  if (filters.productId) {
    params.push(filters.productId);
    where.push(`d.product_id = $${params.length}`);
  }
  if (filters.workType) {
    params.push(filters.workType);
    where.push(`d.work_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`d.status = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    where.push(`d.priority = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(d.work_title ILIKE $${params.length} OR d.description ILIKE $${params.length} OR emp.full_name ILIKE $${params.length} OR COALESCE(pr.name, '') ILIKE $${params.length} OR COALESCE(p.title, '') ILIKE $${params.length})`);
  }
  const result = await query(
    `SELECT ${LOG_COLUMNS} ${LOG_FROM} WHERE ${where.join(' AND ')} ORDER BY d.update_date DESC, emp.full_name, d.created_at DESC LIMIT 500`,
    params,
  );
  const ids = result.rows.map((row) => row.id);
  const files = ids.length
    ? await query(
      `SELECT id, update_id, original_name, mime_type, size_bytes, created_at
       FROM daily_work_attachments WHERE update_id = ANY($1::uuid[]) ORDER BY created_at`,
      [ids],
    )
    : { rows: [] };
  const grouped = new Map();
  files.rows.forEach((file) => {
    const list = grouped.get(file.update_id) || [];
    list.push({ id: file.id, name: file.original_name, mimeType: file.mime_type, size: file.size_bytes });
    grouped.set(file.update_id, list);
  });
  return result.rows.map((row) => mapLog({ ...row, attachments: grouped.get(row.id) || [] }));
}

async function findLog(id) {
  if (await updatesAreView()) return source.find(id);
  const result = await query(`SELECT ${LOG_COLUMNS} ${LOG_FROM} WHERE d.id = $1`, [id]);
  if (!result.rows[0]) return null;
  const files = await query(
    `SELECT id, original_name, mime_type, size_bytes FROM daily_work_attachments WHERE update_id = $1 ORDER BY created_at`,
    [id],
  );
  return mapLog({
    ...result.rows[0],
    attachments: files.rows.map((file) => ({ id: file.id, name: file.original_name, mimeType: file.mime_type, size: file.size_bytes })),
  });
}

async function insertLog(client, input) {
  if (await updatesAreView()) return source.insert(client, input);
  const result = await client.query(
    `INSERT INTO daily_work_updates (
       work_item_id, employee_id, project_id, product_id, team_id, work_type, work_title,
       description, status, priority, update_date, task_deadline, completion_date,
       delay_days, delay_status, reason_for_delay, remarks, next_action, hours, minutes,
       dependency_type, dependency_details, created_by
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NULL,NULL,0,'ON_TIME','','',$12,$13,$14,$15,$16,$17
     ) RETURNING id`,
    [
      input.workItemId || null, input.employeeId, input.projectId, input.productId, input.teamId, input.workType, input.workTitle,
      input.description, input.status, input.priority, input.updateDate, input.nextAction,
      input.hours, input.minutes, input.dependencyType, input.dependencyDetails, input.createdById,
    ],
  );
  return result.rows[0].id;
}

async function saveLog(client, id, input) {
  if (await updatesAreView()) return source.save(client, id, input);
  await client.query(
    `UPDATE daily_work_updates SET
       employee_id = $2, project_id = $3, product_id = $4, team_id = $5, work_type = $6, work_title = $7,
       description = $8, status = $9, priority = $10, update_date = $11, next_action = $12,
       hours = $13, minutes = $14, dependency_type = $15, dependency_details = $16
     WHERE id = $1`,
    [
      id, input.employeeId, input.projectId, input.productId, input.teamId, input.workType, input.workTitle,
      input.description, input.status, input.priority, input.updateDate, input.nextAction,
      input.hours, input.minutes, input.dependencyType, input.dependencyDetails,
    ],
  );
}

async function syncTimeEntry(client, updateId, input) {
  const total = input.hours * 60 + input.minutes;
  const existing = await client.query('SELECT id FROM project_time_entries WHERE daily_work_update_id = $1', [updateId]);
  if (total <= 0) {
    if (existing.rows[0]) await client.query('DELETE FROM project_time_entries WHERE id = $1', [existing.rows[0].id]);
    return;
  }
  const hours = Math.round((total / 60) * 100) / 100;
  const note = input.workTitle;
  if (existing.rows[0]) {
    await client.query(
      `UPDATE project_time_entries
       SET project_id = $2, user_id = $3, hours = $4, work_date = $5, note = $6, duration_minutes = $7
       WHERE id = $1`,
      [existing.rows[0].id, input.projectId, input.employeeId, hours, input.updateDate, note, total],
    );
    return;
  }
  await client.query(
    `INSERT INTO project_time_entries
      (project_id, task_id, user_id, hours, work_date, billable, note, created_by, duration_minutes, daily_work_update_id)
     VALUES ($1, NULL, $2, $3, $4, FALSE, $5, $6, $7, $8)`,
    [input.projectId, input.employeeId, hours, input.updateDate, note, input.createdById, total, updateId],
  );
}

async function relatedLogs(employeeId, title, exceptId) {
  const result = await query(
    `SELECT ${LOG_COLUMNS} ${LOG_FROM}
     WHERE d.employee_id = $1 AND lower(COALESCE(NULLIF(d.work_title, ''), i.title, '')) = lower($2) AND d.id <> $3
     ORDER BY d.update_date DESC LIMIT 30`,
    [employeeId, title, exceptId],
  );
  return result.rows.map((row) => mapLog(row));
}

async function activityForUpdate(updateId) {
  const result = await query(
    `SELECT a.action, a.created_at, u.full_name
     FROM daily_work_activity a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.update_id = $1
     ORDER BY a.created_at DESC LIMIT 40`,
    [updateId],
  );
  return result.rows.map((row) => ({ action: row.action, at: row.created_at, actor: row.full_name || '' }));
}

async function catalog() {
  const [people, teams, projects, products, types, memberships] = await Promise.all([
    query(`SELECT id, full_name FROM users WHERE is_active = TRUE AND account_status = 'ACTIVE' ORDER BY full_name`),
    query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
    query(`SELECT id, title, project_code FROM projects WHERE status <> 'CANCELLED' ORDER BY updated_at DESC NULLS LAST, title LIMIT 500`),
    query(`SELECT id, name FROM products ORDER BY name LIMIT 300`),
    query(`SELECT code, name FROM daily_work_types WHERE is_active = TRUE ORDER BY sort_order, name`),
    query(
      `SELECT m.user_id, m.team_id, m.is_primary, t.name
       FROM team_members m JOIN teams t ON t.id = m.team_id
       WHERE m.status = 'ACTIVE' AND m.role IN ('TEAM_LEAD', 'SENIOR_MEMBER', 'MEMBER')
       ORDER BY m.is_primary DESC, t.name`,
    ),
  ]);
  return {
    people: people.rows.map((row) => ({ id: row.id, fullName: row.full_name })),
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name })),
    projects: projects.rows.map((row) => ({
      id: row.id,
      name: row.title,
      code: row.project_code || '',
      label: row.project_code ? `${row.project_code} · ${row.title}` : row.title,
    })),
    products: products.rows.map((row) => ({ id: row.id, name: row.name })),
    workTypes: types.rows.map((row) => ({ code: row.code, name: row.name })),
    memberships: memberships.rows.map((row) => ({
      userId: row.user_id,
      teamId: row.team_id,
      teamName: row.name,
      isPrimary: row.is_primary,
    })),
  };
}

async function insertAttachment(row) {
  const result = await query(
    `INSERT INTO daily_work_attachments (update_id, original_name, stored_name, mime_type, size_bytes, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, original_name, mime_type, size_bytes`,
    [row.updateId, row.originalName, row.storedName, row.mimeType, row.size, row.uploadedBy],
  );
  const file = result.rows[0];
  return { id: file.id, name: file.original_name, mimeType: file.mime_type, size: file.size_bytes };
}

async function findAttachment(id) {
  const result = await query('SELECT * FROM daily_work_attachments WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function removeAttachment(id) {
  const result = await query('DELETE FROM daily_work_attachments WHERE id = $1 RETURNING *', [id]);
  return result.rows[0] || null;
}

let taskLinkReady;

function ensureTaskLink() {
  if (!taskLinkReady) {
    taskLinkReady = (async () => {
      const found = await query(
        `SELECT c.relkind
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relname = 'daily_work_items'
           AND n.nspname = ANY (current_schemas(false))
         ORDER BY array_position(current_schemas(false), n.nspname)
         LIMIT 1`,
      );
      if (found.rows[0]?.relkind !== 'r') return;
      await query('DROP INDEX IF EXISTS daily_work_items_task_idx');
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS daily_work_items_task_employee_idx
         ON daily_work_items (task_id, employee_id) WHERE task_id IS NOT NULL`,
      );
    })().catch((error) => {
      taskLinkReady = null;
      throw error;
    });
  }
  return taskLinkReady;
}

async function assignedForLog(filters, actor) {
  await ensureTaskLink();
  const params = [filters.from, filters.to];
  const where = [
    't.assignee_id IS NOT NULL',
    `t.status <> 'CANCELLED'`,
    't.end_date >= $1',
    't.start_date <= $2',
  ];
  if (Array.isArray(filters.employeeIds)) {
    params.push(filters.employeeIds);
    where.push(`t.assignee_id = ANY($${params.length}::uuid[])`);
  } else if (!filters.organization) {
    params.push(actor.id);
    where.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`t.assignee_id = $${params.length}`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`EXISTS (
      SELECT 1 FROM team_members m
      WHERE m.user_id = t.assignee_id AND m.team_id = $${params.length} AND m.status = 'ACTIVE'
    )`);
  }
  if (filters.projectId === 'none') where.push('FALSE');
  else if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`t.project_id = $${params.length}`);
  }
  if (filters.productId) where.push('FALSE');
  if (filters.workType && filters.workType !== 'PROJECT_WORK') where.push('FALSE');
  if (filters.priority) {
    params.push(filters.priority);
    where.push(`t.priority = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`t.status = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const slot = `$${params.length}`;
    where.push(`(t.title ILIKE ${slot} OR t.description ILIKE ${slot} OR emp.full_name ILIKE ${slot} OR COALESCE(p.title, '') ILIKE ${slot})`);
  }
  const result = await query(
    `SELECT t.id AS task_id, t.title, t.description, t.status, t.priority, t.progress,
            t.assignee_id, t.project_id, t.start_date, t.end_date,
            emp.full_name AS employee_name, COALESCE(p.title, '') AS project_name,
            team.team_id, team.team_name
     FROM project_tasks t
     JOIN users emp ON emp.id = t.assignee_id
     LEFT JOIN projects p ON p.id = t.project_id
     LEFT JOIN LATERAL (
       SELECT tm.id AS team_id, tm.name AS team_name
       FROM team_members m
       JOIN teams tm ON tm.id = m.team_id
       WHERE m.user_id = t.assignee_id AND m.status = 'ACTIVE'
       ORDER BY m.is_primary DESC, tm.name
       LIMIT 1
     ) team ON TRUE
     WHERE ${where.join(' AND ')}
     ORDER BY emp.full_name, t.title
     LIMIT 200`,
    params,
  );
  const allowed = new Set(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'ON_HOLD']);
  return result.rows.map((row) => ({
    id: '',
    entryKind: 'ASSIGNED',
    taskId: row.task_id,
    employeeId: row.assignee_id,
    employeeName: row.employee_name || '',
    teamId: row.team_id || '',
    teamName: row.team_name || '',
    workType: 'PROJECT_WORK',
    workTypeName: 'Project Work',
    workTitle: row.title,
    description: row.description || '',
    projectId: row.project_id || '',
    projectName: row.project_name || '',
    productId: '',
    productName: '',
    status: allowed.has(row.status) ? row.status : 'IN_PROGRESS',
    priority: row.priority || 'MEDIUM',
    currentDate: filters.anchor || filters.from,
    nextAction: '',
    hours: 0,
    minutes: 0,
    dependencyType: '',
    dependencyDetails: '',
    startDate: isoDate(row.start_date),
    deadline: isoDate(row.end_date),
    reasonForDelay: '',
    morningWork: '',
    eveningWork: '',
    loggedHours: 0,
    period: filters.period === 'EVENING' ? 'EVENING' : 'MORNING',
    progress: Number(row.progress) || 0,
    createdById: row.assignee_id,
    attachments: [],
  }));
}

async function linkAssignedTask(client, taskId, input) {
  if (await updatesAreView()) return source.linkTask(client, taskId, input);
  await ensureTaskLink();
  const task = await client.query(
    `SELECT id, assignee_id, project_id, title, priority, end_date FROM project_tasks WHERE id = $1`,
    [taskId],
  );
  const row = task.rows[0];
  if (!row) throw new (require('../utils/ApiError'))(404, 'Assigned task not found.');
  if (row.assignee_id !== input.employeeId) {
    throw new (require('../utils/ApiError'))(403, 'This task is not assigned to that employee.');
  }
  let item = await client.query(
    'SELECT id FROM daily_work_items WHERE task_id = $1 AND employee_id = $2',
    [taskId, input.employeeId],
  );
  if (!item.rows[0]) {
    item = await client.query(
      `INSERT INTO daily_work_items (task_id, title, employee_id, project_id, priority, deadline, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [taskId, row.title, input.employeeId, row.project_id, row.priority || input.priority, row.end_date, input.createdById],
    );
  }
  const existing = await client.query(
    'SELECT id FROM daily_work_updates WHERE work_item_id = $1 AND update_date = $2',
    [item.rows[0].id, input.updateDate],
  );
  return { itemId: item.rows[0].id, updateId: existing.rows[0]?.id || null };
}

async function syncAssignedTask(client, taskId, input) {
  if (await updatesAreView()) return source.syncTask(client, taskId, input);
  const status = {
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    BLOCKED: 'BLOCKED',
    ON_HOLD: 'ON_HOLD',
  }[input.status];
  if (!status && input.progress == null) return;
  if (status && input.progress != null) {
    await client.query('UPDATE project_tasks SET status = $2, progress = $3 WHERE id = $1', [taskId, status, input.progress]);
    return;
  }
  if (status) await client.query('UPDATE project_tasks SET status = $2 WHERE id = $1', [taskId, status]);
  else await client.query('UPDATE project_tasks SET progress = $2 WHERE id = $1', [taskId, input.progress]);
}

module.exports = {
  withTransaction,
  list,
  assignedBoard,
  findUpdate,
  findItem,
  findItemByTask,
  history,
  listActivity,
  insertItem,
  updateItem,
  insertUpdate,
  saveUpdate,
  replaceDependencies,
  removeUpdate,
  addActivity,
  dayTaken,
  lookups,
  openWithoutUpdate,
  findTask,
  logList,
  assignedForLog,
  linkAssignedTask,
  syncAssignedTask,
  teamAudience: source.teamAudience,
  updatesAreView,
  findLog,
  insertLog,
  saveLog,
  syncTimeEntry,
  relatedLogs,
  activityForUpdate,
  catalog,
  insertAttachment,
  findAttachment,
  removeAttachment,
};
