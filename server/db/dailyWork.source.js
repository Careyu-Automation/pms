const { query } = require('./index');
const ApiError = require('../utils/ApiError');

const TASK_UUID = `pms_app.app_uuid('task', COALESCE(NULLIF(record_key, ''), id::text))`;
const UPDATE_UUID = `pms_app.app_uuid('work-update', id::text)`;
const USER_UUID = `pms_app.app_uuid('user', user_key)`;

function metaOf(row) {
  const meta = row.pm_comments && typeof row.pm_comments === 'object' ? row.pm_comments : {};
  const worked = Number(row.hours_worked) || 0;
  return {
    priority: meta.priority || 'MEDIUM',
    productId: meta.productId || '',
    productName: meta.productName || '',
    minutes: Number.isInteger(Number(meta.minutes)) ? Number(meta.minutes) : 0,
    dependencyType: meta.dependencyType || '',
    hours: Number.isInteger(Number(meta.hours)) ? Number(meta.hours) : Math.floor(worked),
  };
}

function mapRow(row) {
  const meta = metaOf(row);
  return {
    id: row.update_id,
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
    productId: meta.productId,
    productName: meta.productName,
    status: row.status || 'IN_PROGRESS',
    priority: meta.priority,
    currentDate: String(row.work_date || '').slice(0, 10),
    period: String(row.period || 'MORNING').toUpperCase() === 'EVENING' ? 'EVENING' : 'MORNING',
    nextAction: row.next_action || '',
    hours: meta.hours,
    minutes: meta.minutes,
    dependencyType: meta.dependencyType,
    dependencyDetails: row.dependency_details || '',
    taskId: row.task_uuid || '',
    deadline: row.due_date ? String(row.due_date).slice(0, 10) : '',
    entryKind: row.task_uuid ? 'UPDATE' : 'MANUAL',
    progress: row.progress_percent == null ? null : Number(row.progress_percent),
    createdById: row.created_by || row.employee_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: [],
  };
}

const SELECT = `
  SELECT
    ${UPDATE_UUID.replace(/id::text/g, 'd.id::text')} AS update_id,
    pms_app.app_uuid('user', d.user_id) AS employee_id,
    COALESCE(emp.name, d.user_name, '') AS employee_name,
    CASE WHEN team.record_key IS NOT NULL THEN pms_app.app_uuid('team', team.record_key) ELSE NULL END AS team_id,
    COALESCE(team.name, d.team_name, '') AS team_name,
    COALESCE(NULLIF(d.update_type, ''), 'INTERNAL') AS work_type,
    COALESCE(wt.name, NULLIF(d.update_type, ''), 'Internal work') AS work_type_name,
    COALESCE(NULLIF(btrim(d.task_title), ''), 'Daily work') AS work_title,
    COALESCE(d.work_completed, '') AS description,
    CASE WHEN btrim(COALESCE(d.project_name, '')) = '' THEN NULL
         ELSE pms_app.app_uuid('project', lower(btrim(d.project_name))) END AS project_id,
    COALESCE(d.project_name, '') AS project_name,
    COALESCE(NULLIF(d.work_status, ''), 'IN_PROGRESS') AS status,
    d.work_date,
    COALESCE(d.period, 'MORNING') AS period,
    COALESCE(d.next_plan, '') AS next_action,
    d.hours_worked,
    COALESCE(d.dependency, '') AS dependency_details,
    d.pm_comments,
    d.progress_percent,
    CASE WHEN task.id IS NOT NULL THEN pms_app.app_uuid('task', COALESCE(NULLIF(task.record_key, ''), task.id::text)) ELSE NULL END AS task_uuid,
    COALESCE(task.due_date, '') AS due_date,
    pms_app.app_uuid('user', d.user_id) AS created_by,
    d.created_at,
    d.updated_at
  FROM public.daily_updates d
  LEFT JOIN public.users emp ON emp.user_key = d.user_id
  LEFT JOIN public.teams team ON team.record_key = d.team_id
  LEFT JOIN public.tasks task ON task.record_key = d.task_id OR task.id::text = d.task_id
  LEFT JOIN daily_work_types wt ON wt.code = d.update_type
`;

function pushFilter(filters, params, where) {
  if (filters.employeeId) {
    params.push(filters.employeeId);
    where.push(`pms_app.app_uuid('user', d.user_id) = $${params.length}`);
  } else if (Array.isArray(filters.employeeIds)) {
    params.push(filters.employeeIds);
    where.push(`pms_app.app_uuid('user', d.user_id) = ANY($${params.length}::uuid[])`);
  }
  if (filters.teamId) {
    params.push(filters.teamId);
    where.push(`pms_app.app_uuid('team', d.team_id) = $${params.length}`);
  }
  if (filters.projectId === 'none') where.push(`btrim(COALESCE(d.project_name, '')) = ''`);
  else if (filters.projectId) {
    params.push(filters.projectId);
    where.push(`pms_app.app_uuid('project', lower(btrim(COALESCE(d.project_name, '')))) = $${params.length}`);
  }
  if (filters.workType) {
    params.push(filters.workType);
    where.push(`d.update_type = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`upper(COALESCE(d.work_status, '')) = $${params.length}`);
  }
  if (filters.priority) {
    params.push(filters.priority);
    where.push(`upper(COALESCE(d.pm_comments->>'priority', 'MEDIUM')) = $${params.length}`);
  }
  if (filters.period === 'MORNING' || filters.period === 'EVENING') {
    params.push(filters.period);
    where.push(`upper(COALESCE(d.period, '')) = $${params.length}`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    where.push(`(d.task_title ILIKE $${params.length} OR d.work_completed ILIKE $${params.length} OR COALESCE(emp.name, d.user_name, '') ILIKE $${params.length} OR COALESCE(d.project_name, '') ILIKE $${params.length})`);
  }
}

async function list(filters) {
  const params = [filters.from, filters.to];
  const where = ['left(d.work_date::text, 10) BETWEEN $1 AND $2'];
  pushFilter(filters, params, where);
  const result = await query(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY d.work_date DESC, employee_name, d.created_at DESC LIMIT 500`,
    params,
  );
  return result.rows.map(mapRow);
}

async function find(id) {
  const result = await query(`${SELECT} WHERE ${UPDATE_UUID.replace(/id::text/g, 'd.id::text')} = $1`, [id]);
  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

async function resolveUser(client, id) {
  const result = await client.query(
    `SELECT user_key, name, role_code FROM public.users WHERE ${USER_UUID} = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function resolveTeam(client, id) {
  if (!id) return null;
  const result = await client.query(
    `SELECT record_key, name FROM public.teams WHERE pms_app.app_uuid('team', record_key) = $1 LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function resolveProjectName(client, projectId) {
  if (!projectId) return '';
  const result = await client.query('SELECT title FROM projects WHERE id = $1', [projectId]);
  return result.rows[0]?.title || '';
}

async function resolveTaskKey(client, taskId) {
  if (!taskId) return '';
  const result = await client.query(
    `SELECT COALESCE(NULLIF(record_key, ''), id::text) AS key FROM public.tasks WHERE ${TASK_UUID} = $1`,
    [taskId],
  );
  return result.rows[0]?.key || '';
}

function payload(input, user, team, projectName) {
  return {
    userKey: user?.user_key || null,
    userName: user?.name || '',
    userRole: user?.role_code || '',
    teamKey: team?.record_key || null,
    teamName: team?.name || '',
    projectName,
    comments: {
      priority: input.priority || 'MEDIUM',
      productId: input.productId || '',
      productName: input.productName || '',
      minutes: input.minutes || 0,
      hours: input.hours || 0,
      dependencyType: input.dependencyType || '',
    },
  };
}

async function insert(client, input) {
  const user = await resolveUser(client, input.employeeId);
  if (!user) throw new ApiError(400, 'Select an employee.');
  const team = await resolveTeam(client, input.teamId);
  const projectName = input.projectName || await resolveProjectName(client, input.projectId);
  const taskKey = await resolveTaskKey(client, input.taskId);
  const packed = payload(input, user, team, projectName);
  const recordKey = `work-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const result = await client.query(
    `INSERT INTO public.daily_updates (
       id, record_key, user_id, user_name, user_role, team_id, team_name,
       task_id, project_id, project_name, task_title, work_date, work_completed,
       work_status, dependency, next_plan, summary, progress_percent, hours_worked,
       pm_comments, period, update_type, created_at, updated_at, submitted_at
     )
     SELECT
       COALESCE((SELECT MAX(id) FROM public.daily_updates), 0) + 1,
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,NOW(),NOW(),NOW()
     RETURNING ${UPDATE_UUID} AS id`,
    [
      recordKey, packed.userKey, packed.userName, packed.userRole, packed.teamKey, packed.teamName,
      taskKey || null, input.projectId || null, projectName, input.workTitle, input.updateDate, input.description,
      input.status, input.dependencyDetails || '', input.nextAction || '', input.workTitle, input.progress,
      (Number(input.hours) || 0) + ((Number(input.minutes) || 0) / 60),
      JSON.stringify(packed.comments), input.period || 'MORNING', input.workType,
    ],
  );
  return result.rows[0].id;
}

async function save(client, id, input) {
  const user = await resolveUser(client, input.employeeId);
  if (!user) throw new ApiError(400, 'Select an employee.');
  const team = await resolveTeam(client, input.teamId);
  const projectName = input.projectName || await resolveProjectName(client, input.projectId);
  const taskKey = await resolveTaskKey(client, input.taskId);
  const packed = payload(input, user, team, projectName);
  const result = await client.query(
    `UPDATE public.daily_updates SET
       user_id = $2, user_name = $3, user_role = $4, team_id = $5, team_name = $6,
       task_id = COALESCE($7, task_id), project_id = $8, project_name = $9, task_title = $10,
       work_date = $11, work_completed = $12, work_status = $13, dependency = $14, next_plan = $15,
       summary = $10, progress_percent = $16, hours_worked = $17, pm_comments = $18::jsonb,
       period = $19, update_type = $20, updated_at = NOW()
     WHERE ${UPDATE_UUID} = $1
     RETURNING id`,
    [
      id, packed.userKey, packed.userName, packed.userRole, packed.teamKey, packed.teamName,
      taskKey || null, input.projectId || null, projectName, input.workTitle, input.updateDate, input.description,
      input.status, input.dependencyDetails || '', input.nextAction || '', input.progress,
      (Number(input.hours) || 0) + ((Number(input.minutes) || 0) / 60),
      JSON.stringify(packed.comments), input.period || 'MORNING', input.workType,
    ],
  );
  return result.rows[0] || null;
}

async function remove(client, id) {
  const result = await client.query(`DELETE FROM public.daily_updates WHERE ${UPDATE_UUID} = $1 RETURNING id`, [id]);
  return result.rows[0] || null;
}

async function linkTask(client, taskId, input) {
  const task = await client.query(
    `SELECT COALESCE(NULLIF(record_key, ''), id::text) AS key, assigned_to_id
     FROM public.tasks WHERE ${TASK_UUID} = $1`,
    [taskId],
  );
  const row = task.rows[0];
  if (!row) throw new ApiError(404, 'Assigned task not found.');
  const assignee = await client.query(`SELECT ${USER_UUID} AS id FROM public.users WHERE user_key = $1`, [row.assigned_to_id]);
  if (assignee.rows[0]?.id !== input.employeeId) throw new ApiError(403, 'This task is not assigned to that employee.');
  const existing = await client.query(
    `SELECT ${UPDATE_UUID} AS id FROM public.daily_updates WHERE task_id = $1 AND work_date = $2 LIMIT 1`,
    [row.key, input.updateDate],
  );
  return { itemId: null, updateId: existing.rows[0]?.id || null };
}

async function syncTask(client, taskId, input) {
  await client.query(
    `UPDATE public.tasks SET
       status = COALESCE($2, status),
       progress_percent = COALESCE($3, progress_percent),
       updated_at = NOW()
     WHERE ${TASK_UUID} = $1`,
    [taskId, input.status || null, input.progress == null ? null : input.progress],
  );
}

async function teamAudience(userId) {
  const result = await query(
    `SELECT DISTINCT pms_app.app_uuid('user', member.user_key) AS id
     FROM public.teams t
     JOIN public.users lead ON lead.user_key = t.team_lead_id
     JOIN public.users member ON member.team_id = t.record_key
     WHERE pms_app.app_uuid('user', lead.user_key) = $1
       AND upper(COALESCE(member.account_status, '')) = 'ACTIVE'`,
    [userId],
  );
  return result.rows.map((row) => row.id);
}

module.exports = {
  list, find, insert, save, remove, linkTask, syncTask, teamAudience,
};
