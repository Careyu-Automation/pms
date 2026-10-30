const pool = require('../db/pool');

async function main() {
  const pubCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
    ORDER BY ordinal_position
  `);
  console.log('public.leads columns', pubCols.rows.map((r) => r.column_name).join(', '));

  const sample = await pool.query(`
    SELECT id, record_key, status, pipeline_stage, title,
           length(coalesce(fs_proposed_solution,'')) AS pub_sol,
           length(coalesce(fs_technical_feasibility,'')) AS pub_tech,
           fs_status, costing_status
    FROM public.leads
    ORDER BY id
    LIMIT 15
  `);
  console.log('public leads sample', JSON.stringify(sample.rows, null, 2));

  const join = await pool.query(`
    SELECT
      al.lead_code,
      al.status AS app_status,
      pl.status AS pub_status,
      pl.fs_status,
      length(coalesce(pl.fs_proposed_solution, '')) AS pub_sol,
      length(coalesce(pl.fs_technical_feasibility, '')) AS pub_tech,
      length(coalesce(s.proposed_solution, '')) AS app_sol,
      length(coalesce(s.technical_feasibility, '')) AS app_tech,
      s.status AS study_status,
      s.id AS study_id,
      (SELECT count(*)::int FROM pms_app.feasibility_team_assignments t WHERE t.feasibility_id = s.id) AS app_teams,
      c.id AS costing_id,
      c.status AS costing_status,
      length(coalesce(v.solution_description, '')) AS cost_desc,
      length(coalesce(v.solution_name, '')) AS cost_name,
      (SELECT count(*)::int FROM pms_app.solution_cost_entries e WHERE e.version_id = v.id) AS entries,
      (SELECT count(*)::int FROM pms_app.solution_costing_teams ct WHERE ct.version_id = v.id) AS cost_teams,
      (SELECT count(*)::int FROM pms_app.solution_costing_components cc WHERE cc.version_id = v.id) AS components
    FROM pms_app.leads al
    LEFT JOIN public.leads pl
      ON pms_app.app_uuid('lead', COALESCE(NULLIF(pl.record_key, ''), pl.id::text)) = al.id
    LEFT JOIN pms_app.feasibility_studies s ON s.lead_id = al.id
    LEFT JOIN pms_app.solution_costings c ON c.lead_id = al.id
    LEFT JOIN pms_app.solution_costing_versions v ON v.costing_id = c.id AND v.is_current = true
    ORDER BY al.lead_code
    LIMIT 25
  `);
  console.log(JSON.stringify(join.rows, null, 2));

  const legacyTeams = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'feasibility_team_assignments'
    ORDER BY ordinal_position
  `);
  console.log('legacy team cols', legacyTeams.rows.map((r) => r.column_name).join(', '));

  const teams = await pool.query(`
    SELECT * FROM public.feasibility_team_assignments LIMIT 10
  `);
  console.log('legacy teams', JSON.stringify(teams.rows, null, 2));

  const orphan = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM pms_app.solution_cost_entries) AS entries_total,
      (SELECT count(*)::int FROM pms_app.solution_cost_entries e
        WHERE NOT EXISTS (SELECT 1 FROM pms_app.solution_costing_versions v WHERE v.id = e.version_id)) AS entries_orphan,
      (SELECT count(*)::int FROM pms_app.solution_costing_teams) AS teams_total,
      (SELECT count(*)::int FROM pms_app.feasibility_team_assignments) AS app_feas_teams,
      (SELECT count(*)::int FROM public.feasibility_team_assignments) AS pub_feas_teams
  `);
  console.log('counts', orphan.rows[0]);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
