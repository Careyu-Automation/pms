const costing = require('../services/costing.service');
const workflow = require('../services/workflow.service');
const { query, pool } = require('../db');

async function main() {
  const hub = await costing.projectHub();
  const user = await query(`
    SELECT u.id, u.designation, r.code AS role_code, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.role_id
    WHERE u.email = 'fsdengg1@careyu.ai'
  `);
  const person = user.rows[0];
  const assignments = await workflow.myAssignments({
    id: person.id,
    designation: person.designation,
    role: { code: person.role_code, name: person.role_name },
  });
  const preserved = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM leads) AS leads,
      (SELECT COUNT(*)::int FROM feasibility_studies) AS feasibility,
      (SELECT COUNT(*)::int FROM solution_costings) AS costings,
      (SELECT COUNT(*)::int FROM public.tasks) AS tasks
  `);
  console.log(JSON.stringify({
    teams: hub.teams.map((team) => ({
      code: team.code,
      name: team.name,
      lead: team.leadName,
      projects: team.activeProjects,
      openTasks: team.openTasks,
      members: team.members.length,
    })),
    pendingAssignments: assignments.length,
    preserved: preserved.rows[0],
  }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.stack || error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
