/**
 * Read-only inventory of Active Project records and foreign keys.
 * Writes a JSON backup under server/backups. Does not delete anything.
 */
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../db');

const PRESERVE = new Set([
  'leads', 'lead_activity', 'lead_documents',
  'feasibility_studies', 'feasibility_team_assignments', 'feasibility_team_members',
  'feasibility_assessments', 'feasibility_documents', 'feasibility_requirements',
  'feasibility_risks', 'feasibility_customer_inputs',
  'solution_costings', 'users', 'roles', 'teams', 'team_members',
  'daily_work_entries', 'daily_work_updates', 'work_logs',
]);

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });

  const tables = await query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY (current_schemas(false))
      AND c.relkind IN ('r', 'v', 'p')
    ORDER BY 1, 2
  `);

  const fks = await query(`
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name,
      ccu.table_schema AS foreign_schema,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name AND tc.table_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu
      ON rc.unique_constraint_name = ccu.constraint_name AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND (ccu.table_name = 'projects' OR tc.table_name = 'projects')
    ORDER BY 1, 2
  `);

  let projects = [];
  try {
    const rows = await query(`
      SELECT id, project_code, title, status, customer_name, lead_id, costing_id
      FROM projects
      ORDER BY created_at NULLS LAST
    `);
    projects = rows.rows;
  } catch (error) {
    projects = [{ error: error.message }];
  }

  const counts = {};
  for (const table of ['projects', 'project_tasks', 'project_teams', 'leads', 'feasibility_studies', 'solution_costings', 'users', 'teams', 'team_members']) {
    try {
      const result = await query(`SELECT COUNT(*)::int AS total FROM ${table}`);
      counts[table] = result.rows[0].total;
    } catch (error) {
      counts[table] = error.message;
    }
  }

  const payload = {
    createdAt: new Date().toISOString(),
    note: 'Read-only backup of project inventory. No rows were deleted.',
    schemas: [...new Set(tables.rows.map((row) => row.schema))],
    tables: tables.rows.map((row) => row.name),
    preserve: [...PRESERVE],
    counts,
    projects,
    foreignKeys: fks.rows,
  };
  const file = path.join(dir, `active-projects-inventory-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    file,
    counts,
    projectCount: Array.isArray(projects) ? projects.length : 0,
    foreignKeys: fks.rows.length,
    projectStatuses: projects.reduce((acc, row) => {
      const key = row.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
