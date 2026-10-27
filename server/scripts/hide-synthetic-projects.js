/**
 * Active Projects are a view over public.tasks.project_name.
 * This keeps every task, lead, feasibility study, costing row, user, and team.
 * It replaces the projects view with the same query plus WHERE false,
 * and stores the previous definition so the change can be restored.
 */
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../db');

async function count(sql) {
  const result = await query(sql);
  return result.rows[0].total;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const definition = await query(`SELECT pg_get_viewdef('pms_app.projects'::regclass, true) AS def`);
  const tasks = await query(`SELECT id, title, project_name, customer_name, status, assigned_to_id FROM public.tasks ORDER BY id`);
  const before = {
    projects: await count('SELECT COUNT(*)::int AS total FROM pms_app.projects'),
    tasks: await count('SELECT COUNT(*)::int AS total FROM public.tasks'),
    leads: await count('SELECT COUNT(*)::int AS total FROM leads'),
    feasibility: await count('SELECT COUNT(*)::int AS total FROM feasibility_studies'),
    costings: await count('SELECT COUNT(*)::int AS total FROM solution_costings'),
    users: await count('SELECT COUNT(*)::int AS total FROM users'),
    teams: await count('SELECT COUNT(*)::int AS total FROM teams'),
  };
  const file = path.join(dir, `projects-view-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    createdAt: new Date().toISOString(),
    note: 'Restore with CREATE OR REPLACE VIEW pms_app.projects AS <definition>. No task rows were deleted.',
    definition: definition.rows[0].def,
    tasks: tasks.rows,
    before,
  }, null, 2));

  const next = `${definition.rows[0].def.trim().replace(/;+\s*$/, '')}\nWHERE false`;
  await query(`CREATE OR REPLACE VIEW pms_app.projects AS ${next}`);
  const after = {
    projects: await count('SELECT COUNT(*)::int AS total FROM pms_app.projects'),
    tasks: await count('SELECT COUNT(*)::int AS total FROM public.tasks'),
    leads: await count('SELECT COUNT(*)::int AS total FROM leads'),
    feasibility: await count('SELECT COUNT(*)::int AS total FROM feasibility_studies'),
    costings: await count('SELECT COUNT(*)::int AS total FROM solution_costings'),
    users: await count('SELECT COUNT(*)::int AS total FROM users'),
    teams: await count('SELECT COUNT(*)::int AS total FROM teams'),
  };
  console.log(JSON.stringify({ file, before, after }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
