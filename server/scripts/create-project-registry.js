/**
 * Replaces the read-only projects view with an empty writable table.
 * The previous view definition is already stored in server/backups.
 * public.tasks is not modified.
 */
const { query, pool } = require('../db');

async function main() {
  await query(`
    CREATE TABLE IF NOT EXISTS pms_app.project_registry (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      project_code varchar(20) NOT NULL,
      title varchar(200) NOT NULL,
      customer_name varchar(200) NOT NULL DEFAULT '',
      lead_id uuid,
      feasibility_id uuid,
      costing_id uuid,
      costing_version_id uuid,
      status varchar(40) NOT NULL DEFAULT 'READY_FOR_EXECUTION',
      priority varchar(20) NOT NULL DEFAULT 'MEDIUM',
      project_manager_id uuid,
      start_date date,
      target_date date,
      completion_date date,
      description text NOT NULL DEFAULT '',
      site_location text NOT NULL DEFAULT '',
      customer_contact text NOT NULL DEFAULT '',
      hold_reason text NOT NULL DEFAULT '',
      risk_reason text NOT NULL DEFAULT '',
      completion_remarks text NOT NULL DEFAULT '',
      approved_value numeric,
      created_by uuid,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      project_type varchar(40) NOT NULL DEFAULT '',
      department varchar(100) NOT NULL DEFAULT '',
      team_code varchar(40) NOT NULL DEFAULT '',
      assignment_type varchar(30) NOT NULL DEFAULT '',
      assigned_to_id uuid,
      assigned_team_id uuid,
      team_review_status varchar(40) NOT NULL DEFAULT '',
      team_reviewed_by uuid,
      handover_notes text NOT NULL DEFAULT '',
      handover_at timestamptz
    )
  `);
  await query(`CREATE OR REPLACE VIEW pms_app.projects AS SELECT * FROM pms_app.project_registry`);
  const count = await query('SELECT COUNT(*)::int AS total FROM pms_app.projects');
  const tasks = await query('SELECT COUNT(*)::int AS total FROM public.tasks');
  console.log(JSON.stringify({ projects: count.rows[0].total, tasks: tasks.rows[0].total }));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
