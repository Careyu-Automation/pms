const pool = require('../db/pool');

async function main() {
  const ld001 = await pool.query(`
    SELECT
      length(coalesce(fs_proposed_solution,'')) AS sol,
      length(coalesce(fs_technical_feasibility,'')) AS tech,
      length(coalesce(fs_required_resources,'')) AS res,
      length(coalesce(fs_major_constraints,'')) AS constraints,
      length(coalesce(fs_estimated_timeline,'')) AS timeline,
      length(coalesce(fs_required_equipment,'')) AS equip,
      length(coalesce(fs_technical_assumptions,'')) AS assumptions,
      length(coalesce(fs_team_remarks,'')) AS remarks,
      fs_status, costing_status,
      costing_bom_components,
      costing_vendor_requirements,
      costing_component_costs, costing_procurement_costs, costing_engineering_costs,
      costing_software_costs, costing_installation_costs, costing_other_costs,
      costing_total_estimated_cost, costing_commercial_assumptions,
      quotation_value, quotation_payment_terms, quotation_delivery_terms, quotation_validity
    FROM public.leads
    WHERE record_key = 'lead-1788174481220-zvq1'
  `);
  console.log('LD-001 legacy', JSON.stringify(ld001.rows[0], null, 2));

  const entrySample = await pool.query(`
    SELECT e.* FROM pms_app.solution_cost_entries e LIMIT 3
  `);
  console.log('orphan entry sample', JSON.stringify(entrySample.rows, null, 2));

  const entryCols = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='pms_app' AND table_name='solution_cost_entries'
  `);
  console.log('entry cols', entryCols.rows.map((r) => r.column_name).join(', '));

  const versionIds = await pool.query(`
    SELECT DISTINCT version_id FROM pms_app.solution_cost_entries LIMIT 10
  `);
  console.log('orphan version ids', versionIds.rows);

  const current = await pool.query(`
    SELECT v.id, c.costing_code, al.lead_code
    FROM pms_app.solution_costing_versions v
    JOIN pms_app.solution_costings c ON c.id = v.costing_id
    JOIN pms_app.leads al ON al.id = c.lead_id
    WHERE v.is_current
  `);
  console.log('current versions', current.rows);

  const teamStatus = await pool.query(`
    SELECT DISTINCT status FROM public.feasibility_team_assignments
  `);
  console.log('legacy team statuses', teamStatus.rows);

  const assess = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_name ILIKE '%feasib%' OR table_name ILIKE '%assess%'
    ORDER BY table_schema, table_name
  `).catch(() => ({ rows: [] }));
  console.log('related tables', assess.rows);

  const pubAssess = await pool.query(`
    SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_name ILIKE '%feasibility%' OR table_name ILIKE '%team_assess%'
    ORDER BY 1,2
  `);
  console.log('feas tables', pubAssess.rows);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
