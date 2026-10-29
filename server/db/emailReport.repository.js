const { query } = require('./index');

function mapReport(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description || '',
    scope: row.scope,
    scopeId: row.scope_id,
    status: row.status,
    subject: row.subject || '',
    configuration: row.configuration || {},
    attachment: row.attachment,
    ownerId: row.owner_id,
    ownerName: row.owner_name || '',
    frequency: row.frequency,
    sendTime: row.send_time,
    dayOfWeek: row.day_of_week,
    dayOfMonth: row.day_of_month,
    timezone: row.timezone,
    nextRunAt: row.next_run_at,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recipientCount: Number(row.recipient_count || 0),
  };
}

const REPORT_SELECT = `
  SELECT r.*, u.full_name AS owner_name,
         (SELECT COUNT(*) FROM email_report_recipients x WHERE x.report_id = r.id) AS recipient_count
  FROM email_reports r
  JOIN users u ON u.id = r.owner_id
`;

async function listReports(where, params) {
  const result = await query(`${REPORT_SELECT} ${where} ORDER BY r.updated_at DESC`, params);
  return result.rows.map(mapReport);
}

async function findReport(id) {
  const result = await query(`${REPORT_SELECT} WHERE r.id = $1`, [id]);
  return mapReport(result.rows[0]);
}

async function recipients(reportId) {
  const result = await query(
    `SELECT id, kind, recipient_type, user_id, team_id, email, name
     FROM email_report_recipients WHERE report_id = $1 ORDER BY kind, name`,
    [reportId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    recipientType: row.recipient_type,
    userId: row.user_id,
    teamId: row.team_id,
    email: row.email,
    name: row.name,
  }));
}

async function insertReport(input) {
  const result = await query(
    `INSERT INTO email_reports
      (name, type, description, scope, scope_id, status, subject, configuration, attachment, owner_id, frequency, send_time, day_of_week, day_of_month, timezone, next_run_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING id`,
    [input.name, input.type, input.description, input.scope, input.scopeId, input.status, input.subject, JSON.stringify(input.configuration || {}), input.attachment, input.ownerId, input.frequency, input.sendTime, input.dayOfWeek, input.dayOfMonth, input.timezone, input.nextRunAt],
  );
  return result.rows[0].id;
}

async function updateReport(id, input) {
  await query(
    `UPDATE email_reports SET
      name=$2, type=$3, description=$4, scope=$5, scope_id=$6, status=$7, subject=$8, configuration=$9::jsonb,
      attachment=$10, frequency=$11, send_time=$12, day_of_week=$13, day_of_month=$14, timezone=$15, next_run_at=$16
     WHERE id=$1`,
    [id, input.name, input.type, input.description, input.scope, input.scopeId, input.status, input.subject, JSON.stringify(input.configuration || {}), input.attachment, input.frequency, input.sendTime, input.dayOfWeek, input.dayOfMonth, input.timezone, input.nextRunAt],
  );
}

async function setStatus(id, status, nextRunAt) {
  await query('UPDATE email_reports SET status=$2, next_run_at=$3 WHERE id=$1', [id, status, nextRunAt]);
}

async function setNext(id, nextRunAt) {
  await query('UPDATE email_reports SET next_run_at=$2 WHERE id=$1', [id, nextRunAt]);
}

async function touchSent(id, when, nextRunAt, status) {
  await query('UPDATE email_reports SET last_sent_at=$2, next_run_at=$3, status=$4 WHERE id=$1', [id, when, nextRunAt, status]);
}

async function removeReport(id) {
  await query('DELETE FROM email_reports WHERE id=$1', [id]);
}

async function replaceRecipients(reportId, rows) {
  await query('DELETE FROM email_report_recipients WHERE report_id=$1', [reportId]);
  for (const row of rows) {
    await query(
      `INSERT INTO email_report_recipients (report_id, kind, recipient_type, user_id, team_id, email, name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [reportId, row.kind, row.recipientType, row.userId, row.teamId, row.email || '', row.name || ''],
    );
  }
}

async function templates() {
  const result = await query(
    `SELECT id, name, type, description, configuration, is_system, created_by, created_at
     FROM email_report_templates ORDER BY is_system DESC, name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    configuration: row.configuration || {},
    isSystem: row.is_system,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

async function findTemplate(id) {
  const result = await query('SELECT * FROM email_report_templates WHERE id=$1', [id]);
  const row = result.rows[0];
  if (!row) return null;
  return { id: row.id, name: row.name, type: row.type, description: row.description, configuration: row.configuration || {}, isSystem: row.is_system, createdBy: row.created_by };
}

async function insertTemplate(input) {
  const result = await query(
    `INSERT INTO email_report_templates (name, type, description, configuration, is_system, created_by)
     VALUES ($1,$2,$3,$4::jsonb,FALSE,$5) RETURNING id`,
    [input.name, input.type, input.description, JSON.stringify(input.configuration || {}), input.createdBy],
  );
  return result.rows[0].id;
}

async function updateTemplate(id, input) {
  await query(
    `UPDATE email_report_templates SET name=$2, type=$3, description=$4, configuration=$5::jsonb, updated_at=NOW() WHERE id=$1`,
    [id, input.name, input.type, input.description, JSON.stringify(input.configuration || {})],
  );
}

async function reportCount(ownerClause, params) {
  const result = await query(`SELECT COUNT(*)::int AS n FROM email_reports r ${ownerClause}`, params);
  return result.rows[0].n;
}

async function kpis(ownerClause, params) {
  const active = await query(`SELECT COUNT(*)::int AS n FROM email_reports r ${ownerClause} ${ownerClause ? 'AND' : 'WHERE'} r.status = 'ACTIVE'`, params);
  const today = await query(
    `SELECT COUNT(*)::int AS n FROM email_reports r
     ${ownerClause} ${ownerClause ? 'AND' : 'WHERE'} r.status = 'ACTIVE'
     AND r.next_run_at IS NOT NULL
     AND (r.next_run_at AT TIME ZONE 'Asia/Kolkata')::date = (NOW() AT TIME ZONE 'Asia/Kolkata')::date`,
    params,
  );
  const sent = await query(
    `SELECT COUNT(*)::int AS n FROM email_report_runs n
     LEFT JOIN email_reports r ON r.id = n.report_id
     WHERE n.status = 'SENT' AND n.started_at >= date_trunc('week', NOW())
     ${ownerClause ? `AND (n.sent_by = $1 OR r.owner_id = $1)` : ''}`,
    params,
  );
  const failed = await query(
    `SELECT COUNT(*)::int AS n FROM email_report_runs n
     LEFT JOIN email_reports r ON r.id = n.report_id
     WHERE n.status IN ('FAILED', 'PARTIAL') AND n.started_at >= NOW() - INTERVAL '7 days'
     ${ownerClause ? `AND (n.sent_by = $1 OR r.owner_id = $1)` : ''}`,
    params,
  );
  return {
    active: active.rows[0].n,
    scheduledToday: today.rows[0].n,
    sentThisWeek: sent.rows[0].n,
    failed: failed.rows[0].n,
  };
}

async function upcoming(ownerClause, params) {
  const result = await query(
    `${REPORT_SELECT} ${ownerClause} ${ownerClause ? 'AND' : 'WHERE'} r.status = 'ACTIVE' AND r.next_run_at IS NOT NULL
     ORDER BY r.next_run_at LIMIT 6`,
    params,
  );
  return result.rows.map(mapReport);
}

async function recentRuns(ownerClause, params) {
  const result = await query(
    `SELECT n.id, n.report_id, n.report_name, n.report_type, n.started_at, n.status, n.attachment, n.recipient_count, n.is_test,
            n.error, n.completed_at, COALESCE(u.full_name, '') AS sent_by_name, r.configuration,
            COALESCE(n.snapshot->>'recordCount', '') AS record_count
     FROM email_report_runs n
     LEFT JOIN email_reports r ON r.id = n.report_id
     LEFT JOIN users u ON u.id = n.sent_by
     WHERE 1=1 ${ownerClause ? 'AND (n.sent_by = $1 OR r.owner_id = $1)' : ''}
     ORDER BY n.started_at DESC
     LIMIT 12`,
    params,
  );
  return result.rows.map(mapRun);
}

function mapRun(row) {
  return {
    id: row.id,
    reportId: row.report_id,
    reportName: row.report_name,
    reportType: row.report_type,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    status: row.status,
    subject: row.subject || '',
    error: row.error || '',
    attachment: row.attachment,
    fileName: row.file_name || '',
    sentByName: row.sent_by_name || '',
    isTest: row.is_test,
    recipientCount: Number(row.recipient_count || 0),
    attemptOf: row.attempt_of || null,
    reportDate: configDate(row.configuration),
    period: configPeriod(row.configuration),
    recordCount: Number(row.record_count || 0),
  };
}

function configValue(configuration) {
  if (!configuration) return {};
  if (typeof configuration === 'string') {
    try { return JSON.parse(configuration); } catch { return {}; }
  }
  return configuration;
}

function configDate(configuration) {
  return configValue(configuration).dateFrom || '';
}

function configPeriod(configuration) {
  const period = String(configValue(configuration).period || '').toUpperCase();
  if (period === 'EVENING') return 'Evening';
  if (period === 'MORNING') return 'Morning';
  if (period === 'FULL') return 'Full day';
  return '—';
}

async function insertRun(input) {
  const result = await query(
    `INSERT INTO email_report_runs
      (report_id, report_name, report_type, status, subject, attachment, sent_by, is_test, attempt_of, snapshot)
     VALUES ($1,$2,$3,'QUEUED',$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING id`,
    [input.reportId, input.reportName, input.reportType, input.subject || '', input.attachment, input.sentBy, input.isTest, input.attemptOf, JSON.stringify(input.snapshot || {})],
  );
  return result.rows[0].id;
}

async function finishRun(id, input) {
  await query(
    `UPDATE email_report_runs
     SET status=$2, completed_at=NOW(), error=$3, subject=$4, file_name=$5, file_body=$6, snapshot=$7::jsonb, recipient_count=$8
     WHERE id=$1`,
    [id, input.status, input.error || '', input.subject || '', input.fileName || '', input.fileBody || null, JSON.stringify(input.snapshot || {}), input.recipientCount || 0],
  );
}

async function findRun(id) {
  const result = await query(
    `SELECT n.*, COALESCE(u.full_name, '') AS sent_by_name
     FROM email_report_runs n
     LEFT JOIN users u ON u.id = n.sent_by
     WHERE n.id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { ...mapRun(row), snapshot: row.snapshot || {}, sentBy: row.sent_by, fileBody: row.file_body };
}

async function deliveries(runId) {
  const result = await query(
    'SELECT kind, email, name, status, error, sent_at FROM email_report_deliveries WHERE run_id=$1 ORDER BY kind, email',
    [runId],
  );
  return result.rows.map((row) => ({
    kind: row.kind, email: row.email, name: row.name, status: row.status, error: row.error || '', sentAt: row.sent_at,
  }));
}

async function insertDelivery(runId, row) {
  await query(
    `INSERT INTO email_report_deliveries (run_id, kind, email, name, status, error, sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [runId, row.kind, row.email, row.name || '', row.status, row.error || '', row.sentAt],
  );
}

async function due(now) {
  const result = await query(
    `${REPORT_SELECT} WHERE r.status = 'ACTIVE' AND r.frequency <> 'MANUAL' AND r.next_run_at IS NOT NULL AND r.next_run_at <= $1
     ORDER BY r.next_run_at LIMIT 10`,
    [now],
  );
  return result.rows.map(mapReport);
}

async function activity(reportId, actorId, action) {
  await query(
    'INSERT INTO email_report_activity (report_id, actor_id, action) VALUES ($1,$2,$3)',
    [reportId, actorId, action.slice(0, 120)],
  );
}

async function settings() {
  const result = await query('SELECT * FROM email_settings WHERE id = 1');
  return result.rows[0] || null;
}

async function saveSettings(input) {
  await query(
    `UPDATE email_settings SET provider=$1, host=$2, port=$3, username=$4, password_enc=CASE WHEN $5 = '' THEN password_enc ELSE $5 END,
      from_name=$6, from_email=$7, reply_to=$8, secure=$9, updated_by=$10, updated_at=NOW()
     WHERE id = 1`,
    [input.provider, input.host, input.port, input.username, input.passwordEnc, input.fromName, input.fromEmail, input.replyTo, input.secure, input.updatedBy],
  );
}

async function options() {
  const [teams, projects, people, products, workTypes] = await Promise.all([
    query(`SELECT id, name FROM teams WHERE status = 'ACTIVE' ORDER BY name`),
    query(`SELECT id, title, project_code FROM projects WHERE status <> 'CANCELLED' ORDER BY title LIMIT 200`),
    query(`SELECT id, full_name, email FROM users WHERE is_active = TRUE ORDER BY full_name`),
    query(`SELECT id, name FROM products ORDER BY name LIMIT 200`),
    query(`SELECT code, name FROM daily_work_types WHERE is_active = TRUE ORDER BY sort_order`),
  ]);
  return {
    teams: teams.rows.map((row) => ({ id: row.id, name: row.name })),
    projects: projects.rows.map((row) => ({ id: row.id, name: row.title, code: row.project_code })),
    people: people.rows.map((row) => ({ id: row.id, name: row.full_name, email: row.email })),
    products: products.rows.map((row) => ({ id: row.id, name: row.name })),
    workTypes: workTypes.rows.map((row) => ({ code: row.code, name: row.name })),
  };
}

async function userById(id) {
  const result = await query(
    `SELECT u.*, r.code AS role_code, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function emailsForUsers(ids) {
  if (!ids.length) return [];
  const result = await query('SELECT id, full_name, email FROM users WHERE id = ANY($1::uuid[]) AND is_active = TRUE', [ids]);
  return result.rows;
}

async function emailsForTeam(teamId) {
  const result = await query(
    `SELECT u.id, u.full_name, u.email FROM team_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.team_id = $1 AND m.status = 'ACTIVE' AND u.is_active = TRUE`,
    [teamId],
  );
  return result.rows;
}

async function roleEmails(code) {
  const result = await query(
    `SELECT u.full_name, u.email FROM users u JOIN roles r ON r.id = u.role_id
     WHERE r.code = $1 AND u.is_active = TRUE`,
    [code],
  );
  return result.rows;
}

module.exports = {
  listReports, findReport, recipients, insertReport, updateReport, setStatus, setNext, touchSent, removeReport, reportCount,
  replaceRecipients, templates, findTemplate, insertTemplate, updateTemplate, kpis, upcoming, recentRuns,
  insertRun, finishRun, findRun, deliveries, insertDelivery, due, activity, settings, saveSettings, options,
  userById, emailsForUsers, emailsForTeam, roleEmails,
};
