/**
 * Remove operational and test rows from ProjectManagementSystem.
 * Preserves leads, feasibility, solution costing, users, roles, teams, and settings.
 * Does not drop tables, views, or sequences.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const { pool } = require('../db');

const PRESERVE = [
  ['public.leads', 'SELECT COUNT(*)::int AS n FROM public.leads'],
  ['public.lead_comments', 'SELECT COUNT(*)::int AS n FROM public.lead_comments'],
  ['public.lead_status_history', 'SELECT COUNT(*)::int AS n FROM public.lead_status_history'],
  ['public.lead_activities', 'SELECT COUNT(*)::int AS n FROM public.lead_activities'],
  ['public.lead_documents', 'SELECT COUNT(*)::int AS n FROM public.lead_documents'],
  ['public.feasibility_team_assignments', 'SELECT COUNT(*)::int AS n FROM public.feasibility_team_assignments'],
  ['public.feasibility_employee_allocations', 'SELECT COUNT(*)::int AS n FROM public.feasibility_employee_allocations'],
  ['protected_documents', `SELECT COUNT(*)::int AS n FROM public.entity_documents WHERE entity_type IN ('ADDITIONAL_INPUT', 'FEASIBILITY')`],
  ['lead_assignment_history', `SELECT COUNT(*)::int AS n FROM public.assignment_history WHERE entity_type = 'LEAD'`],
  ['lead_audits', `SELECT COUNT(*)::int AS n FROM public.audits WHERE entity_type = 'LEAD'`],
  ['pms_app.feasibility_studies', 'SELECT COUNT(*)::int AS n FROM pms_app.feasibility_studies'],
  ['pms_app.feasibility_validations', 'SELECT COUNT(*)::int AS n FROM pms_app.feasibility_validations'],
  ['pms_app.solution_costings', 'SELECT COUNT(*)::int AS n FROM pms_app.solution_costings'],
  ['pms_app.solution_costing_versions', 'SELECT COUNT(*)::int AS n FROM pms_app.solution_costing_versions'],
  ['pms_app.quotations', 'SELECT COUNT(*)::int AS n FROM pms_app.quotations'],
  ['pms_app.negotiation_events', 'SELECT COUNT(*)::int AS n FROM pms_app.negotiation_events'],
  ['public.users', 'SELECT COUNT(*)::int AS n FROM public.users'],
  ['public.roles', 'SELECT COUNT(*)::int AS n FROM public.roles'],
  ['public.teams', 'SELECT COUNT(*)::int AS n FROM public.teams'],
  ['pms_app.role_permissions', 'SELECT COUNT(*)::int AS n FROM pms_app.role_permissions'],
  ['pms_app.email_report_templates', 'SELECT COUNT(*)::int AS n FROM pms_app.email_report_templates'],
  ['pms_app.email_settings', 'SELECT COUNT(*)::int AS n FROM pms_app.email_settings'],
  ['pms_app.system_settings', 'SELECT COUNT(*)::int AS n FROM pms_app.system_settings'],
  ['pms_app.user_preferences', 'SELECT COUNT(*)::int AS n FROM pms_app.user_preferences'],
  ['pms_app.user_auth_state', 'SELECT COUNT(*)::int AS n FROM pms_app.user_auth_state'],
  ['pms_app.leave_types', 'SELECT COUNT(*)::int AS n FROM pms_app.leave_types'],
  ['pms_app.leave_balances', 'SELECT COUNT(*)::int AS n FROM pms_app.leave_balances'],
  ['pms_app.organization_calendar', 'SELECT COUNT(*)::int AS n FROM pms_app.organization_calendar'],
  ['pms_app.forum_tags', 'SELECT COUNT(*)::int AS n FROM pms_app.forum_tags'],
  ['public.pending_signups', 'SELECT COUNT(*)::int AS n FROM public.pending_signups'],
];

const BACKUP_QUERIES = {
  'public.notification_deliveries': 'SELECT * FROM public.notification_deliveries',
  'public.notifications': 'SELECT * FROM public.notifications',
  'public.outbound_emails': 'SELECT * FROM public.outbound_emails',
  'public.forum_reactions': 'SELECT * FROM public.forum_reactions',
  'public.forum_comments': 'SELECT * FROM public.forum_comments',
  'public.forum_posts': 'SELECT * FROM public.forum_posts',
  'public.forum_live_messages': 'SELECT * FROM public.forum_live_messages',
  'public.forum_tags': 'SELECT * FROM public.forum_tags',
  'public.chat_messages': 'SELECT * FROM public.chat_messages',
  'public.conversation_participants': 'SELECT * FROM public.conversation_participants',
  'public.conversations': 'SELECT * FROM public.conversations',
  'public.daily_updates': 'SELECT * FROM public.daily_updates',
  'public.entity_documents_operational': `SELECT * FROM public.entity_documents WHERE entity_type IN ('TASK', 'CONVERSATION')`,
  'public.assignment_history_tasks': `SELECT * FROM public.assignment_history WHERE entity_type = 'TASK'`,
  'public.audits_operational': `SELECT * FROM public.audits WHERE entity_type IN ('TASK', 'PROJECT', 'CONVERSATION', 'DAILY_UPDATE')`,
  'public.stage_transitions': `SELECT * FROM public.stage_transitions WHERE NULLIF(btrim(lead_id), '') IS NULL`,
  'public.tasks': `SELECT * FROM public.tasks WHERE NULLIF(btrim(lead_id), '') IS NULL AND NULLIF(btrim(feasibility_team_assignment_id), '') IS NULL`,
  'public.system_meta_operational': `SELECT * FROM public.system_meta WHERE payload_type IN ('DAILY_STATUS_SNAPSHOT', 'EMAIL_REPORT_HISTORY', 'MORNING_LOCK_STATE', 'EMAIL_REPORT_SCHEDULE')`,
  'pms_app.leave_activity': 'SELECT * FROM pms_app.leave_activity',
  'pms_app.leave_approval_history': 'SELECT * FROM pms_app.leave_approval_history',
  'pms_app.permission_approval_history': 'SELECT * FROM pms_app.permission_approval_history',
  'pms_app.leave_requests': 'SELECT * FROM pms_app.leave_requests',
  'pms_app.permission_requests': 'SELECT * FROM pms_app.permission_requests',
  'pms_app.user_presence': 'SELECT * FROM pms_app.user_presence',
};

async function snapshot(client) {
  const counts = {};
  for (const [name, sql] of PRESERVE) {
    const result = await client.query(sql);
    counts[name] = result.rows[0].n;
  }
  const passwordColumn = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users'
      AND column_name IN ('password_hash', 'password')
    ORDER BY CASE column_name WHEN 'password_hash' THEN 1 ELSE 2 END
    LIMIT 1
  `);
  const secret = passwordColumn.rows[0]?.column_name;
  const users = await client.query(`
    SELECT md5(COALESCE(string_agg(
      COALESCE(user_key, id::text) || ':' || ${secret ? `COALESCE("${secret}", '')` : `''`},
      '|' ORDER BY id
    ), '')) AS fingerprint
    FROM public.users
  `);
  counts.userFingerprint = users.rows[0].fingerprint;
  return counts;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await snapshot(client);
    const backup = {};
    for (const [name, sql] of Object.entries(BACKUP_QUERIES)) {
      const result = await client.query(sql);
      backup[name] = result.rows;
    }
    const backupFile = path.join(dir, `operational-cleanup-${stamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({
      createdAt: new Date().toISOString(),
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      preservedBefore: before,
      deletedRows: backup,
    }, null, 2));

    const statements = [
      ['public.notification_deliveries', 'DELETE FROM public.notification_deliveries'],
      ['public.notifications', 'DELETE FROM public.notifications'],
      ['public.outbound_emails', 'DELETE FROM public.outbound_emails'],
      ['public.forum_reactions', 'DELETE FROM public.forum_reactions'],
      ['public.forum_comments', 'DELETE FROM public.forum_comments'],
      ['public.forum_posts', 'DELETE FROM public.forum_posts'],
      ['public.forum_live_messages', 'DELETE FROM public.forum_live_messages'],
      ['public.forum_tags', 'DELETE FROM public.forum_tags'],
      ['public.chat_messages', 'DELETE FROM public.chat_messages'],
      ['public.conversation_participants', 'DELETE FROM public.conversation_participants'],
      ['public.conversations', 'DELETE FROM public.conversations'],
      ['public.daily_updates', `DELETE FROM public.daily_updates WHERE NULLIF(btrim(lead_id), '') IS NULL`],
      ['public.entity_documents', `DELETE FROM public.entity_documents WHERE entity_type IN ('TASK', 'CONVERSATION')`],
      ['public.assignment_history', `DELETE FROM public.assignment_history WHERE entity_type = 'TASK'`],
      ['public.audits', `DELETE FROM public.audits WHERE entity_type IN ('TASK', 'PROJECT', 'CONVERSATION', 'DAILY_UPDATE')`],
      ['public.stage_transitions', `DELETE FROM public.stage_transitions WHERE NULLIF(btrim(lead_id), '') IS NULL`],
      ['public.tasks', `DELETE FROM public.tasks WHERE NULLIF(btrim(lead_id), '') IS NULL AND NULLIF(btrim(feasibility_team_assignment_id), '') IS NULL`],
      ['public.system_meta', `DELETE FROM public.system_meta WHERE payload_type IN ('DAILY_STATUS_SNAPSHOT', 'EMAIL_REPORT_HISTORY', 'MORNING_LOCK_STATE', 'EMAIL_REPORT_SCHEDULE')`],
      ['pms_app.leave_activity', 'DELETE FROM pms_app.leave_activity'],
      ['pms_app.leave_approval_history', 'DELETE FROM pms_app.leave_approval_history'],
      ['pms_app.permission_approval_history', 'DELETE FROM pms_app.permission_approval_history'],
      ['pms_app.leave_requests', 'DELETE FROM pms_app.leave_requests'],
      ['pms_app.permission_requests', 'DELETE FROM pms_app.permission_requests'],
      ['pms_app.user_presence', 'DELETE FROM pms_app.user_presence'],
    ];

    const deleted = {};
    for (const [name, sql] of statements) {
      const result = await client.query(sql);
      deleted[name] = result.rowCount;
    }

    const after = await snapshot(client);
    const changed = Object.keys(before).filter((key) => before[key] !== after[key]);
    if (changed.length) {
      throw new Error(`Protected data changed: ${changed.join(', ')}. Rolled back.`);
    }

    const remaining = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM public.tasks) AS tasks,
        (SELECT COUNT(*)::int FROM pms_app.projects) AS projects,
        (SELECT COUNT(*)::int FROM pms_app.project_tasks) AS project_tasks,
        (SELECT COUNT(*)::int FROM pms_app.daily_work_items) AS daily_work_items,
        (SELECT COUNT(*)::int FROM pms_app.messages) AS messages,
        (SELECT COUNT(*)::int FROM pms_app.leads) AS lead_view,
        (SELECT COUNT(*)::int FROM public.users) AS users,
        (SELECT COUNT(*)::int FROM public.teams) AS teams
    `);

    await client.query('COMMIT');
    console.log(JSON.stringify({
      backupFile,
      host: env.db.host,
      port: env.db.port,
      database: env.db.database,
      deleted,
      preserved: after,
      remaining: remaining.rows[0],
    }, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
