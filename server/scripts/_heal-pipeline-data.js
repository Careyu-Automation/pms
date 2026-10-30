const env = require('../config/env');
const { install } = require('../db/aivenCompat');
const pool = require('../db/pool');

async function verify() {
  const result = await pool.query(`
    SELECT
      al.lead_code,
      length(coalesce(s.proposed_solution, '')) AS sol,
      length(coalesce(s.technical_feasibility, '')) AS tech,
      length(coalesce(s.technical_assumptions, '')) AS assumptions,
      s.status AS study_status,
      s.decision,
      s.started_at IS NOT NULL AS started,
      (SELECT count(*)::int FROM pms_app.feasibility_team_assignments t WHERE t.feasibility_id = s.id) AS teams,
      length(coalesce(v.solution_description, '')) AS cost_desc,
      (SELECT count(*)::int FROM pms_app.solution_costing_teams ct WHERE ct.version_id = v.id) AS cost_teams,
      (SELECT count(*)::int FROM pms_app.solution_cost_entries e WHERE e.version_id = v.id) AS entries,
      (SELECT count(*)::int FROM pms_app.solution_bom_items b WHERE b.version_id = v.id) AS bom
    FROM pms_app.leads al
    LEFT JOIN pms_app.feasibility_studies s ON s.lead_id = al.id
    LEFT JOIN pms_app.solution_costings c ON c.lead_id = al.id
    LEFT JOIN pms_app.solution_costing_versions v ON v.costing_id = c.id AND v.is_current = true
    WHERE al.lead_code IN ('LD-001', 'LD-002', 'LD-003', 'LD-004', 'LD-005', 'LEAD-042')
    ORDER BY al.lead_code
  `);
  console.log(JSON.stringify(result.rows, null, 2));
}

async function main() {
  console.log('Running compatibility heal…');
  await install(env.db.connectionString);
  console.log('Verify:');
  await verify();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
