const { query, pool } = require('../db');

async function main() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM pms_app.leads) AS leads,
      (SELECT COUNT(*)::int FROM pms_app.feasibility_studies f
        WHERE EXISTS (SELECT 1 FROM pms_app.leads l WHERE l.id = f.lead_id)) AS studies_linked,
      (SELECT COUNT(*)::int FROM pms_app.feasibility_studies) AS studies,
      (SELECT COUNT(*)::int FROM pms_app.feasibility_validations) AS validations,
      (SELECT COUNT(*)::int FROM pms_app.solution_costings c
        JOIN pms_app.feasibility_studies f ON f.id = c.feasibility_id
        JOIN pms_app.leads l ON l.id = c.lead_id) AS costings_linked,
      (SELECT COUNT(*)::int FROM pms_app.solution_costing_versions) AS costing_versions,
      (SELECT COUNT(*)::int FROM pms_app.quotations) AS quotations,
      (SELECT COUNT(*)::int FROM pms_app.negotiation_events) AS negotiations,
      (SELECT COUNT(*)::int FROM public.entity_documents WHERE entity_type IN ('ADDITIONAL_INPUT', 'FEASIBILITY')) AS protected_documents,
      (SELECT COUNT(*)::int FROM public.feasibility_team_assignments) AS legacy_feasibility_assignments,
      (SELECT COUNT(*)::int FROM public.tasks) AS tasks,
      (SELECT COUNT(*)::int FROM pms_app.projects) AS projects,
      (SELECT COUNT(*)::int FROM pms_app.daily_work_updates) AS daily_work,
      (SELECT COUNT(*)::int FROM pms_app.messages) AS messages,
      (SELECT COUNT(*)::int FROM pms_app.escalations) AS escalations,
      (SELECT COUNT(*)::int FROM pms_app.procurement_requests) AS procurement,
      (SELECT COUNT(*)::int FROM pms_app.checklists) AS checklists,
      (SELECT COUNT(*)::int FROM public.users) AS users,
      (SELECT COUNT(*)::int FROM public.teams) AS teams,
      (SELECT COUNT(*)::int FROM pms_app.team_members) AS memberships
  `);
  console.log(JSON.stringify(result.rows[0], null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
