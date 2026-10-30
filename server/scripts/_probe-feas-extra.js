const pool = require('../db/pool');

async function main() {
  const allocCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='feasibility_employee_allocations'
    ORDER BY ordinal_position
  `);
  console.log('alloc cols', allocCols.rows.map((r) => r.column_name).join(', '));
  const alloc = await pool.query(`SELECT * FROM public.feasibility_employee_allocations LIMIT 5`);
  console.log('alloc sample', JSON.stringify(alloc.rows, null, 2));

  const orphanTeams = await pool.query(`
    SELECT * FROM pms_app.solution_costing_teams LIMIT 5
  `);
  console.log('orphan cost teams', JSON.stringify(orphanTeams.rows, null, 2));

  const nonempty = await pool.query(`
    SELECT lead_number, title,
      length(coalesce(fs_proposed_solution,'')) sol,
      length(coalesce(fs_technical_feasibility,'')) tech,
      length(coalesce(fs_technical_assumptions,'')) assumptions,
      fs_status, costing_status,
      costing_bom_components,
      costing_total_estimated_cost
    FROM public.leads
    WHERE btrim(coalesce(fs_proposed_solution,'')) <> ''
       OR btrim(coalesce(fs_technical_feasibility,'')) <> ''
       OR btrim(coalesce(fs_technical_assumptions,'')) <> ''
       OR btrim(coalesce(costing_bom_components::text,'')) NOT IN ('', 'null')
    ORDER BY id
  `);
  console.log('leads with fs/cost content', JSON.stringify(nonempty.rows, null, 2));

  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
