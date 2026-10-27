/**
 * Backs up Active Project rows, then deletes only project execution records.
 * Leads, feasibility, costing, users, teams, and daily work rows are kept.
 */
const fs = require('fs');
const path = require('path');
const { query, pool } = require('../db');

const CHILD_TABLES = [
  'project_time_entries',
  'project_documents',
  'project_milestones',
  'project_phases',
  'project_baselines',
  'project_activity',
  'project_teams',
  'project_dependencies',
];

const PRESERVE = ['leads', 'feasibility_studies', 'solution_costings', 'users', 'teams', 'team_members', 'daily_work_updates', 'daily_work_items', 'project_tasks'];

async function count(table) {
  try {
    const result = await query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    return result.rows[0].total;
  } catch (error) {
    return error.message;
  }
}

async function tableExists(name) {
  const result = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_name = $1 AND table_schema = ANY (current_schemas(false))`,
    [name],
  );
  return Boolean(result.rows[0]);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const before = {};
  for (const table of ['projects', ...CHILD_TABLES, ...PRESERVE]) before[table] = await count(table);

  const backup = { createdAt: new Date().toISOString(), tables: {} };
  for (const table of ['projects', 'project_tasks', ...CHILD_TABLES]) {
    if (!(await tableExists(table))) continue;
    const rows = await query(`SELECT * FROM ${table}`);
    backup.tables[table] = rows.rows;
  }
  const file = path.join(dir, `active-projects-full-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(backup));

  const client = await pool.connect();
  const deleted = {};
  try {
    await client.query('BEGIN');
    const referenced = await client.query(`
      SELECT column_name, table_name
      FROM information_schema.columns
      WHERE table_schema = ANY (current_schemas(false))
        AND column_name IN ('project_id', 'task_id')
        AND table_name LIKE 'daily_work%'
    `);
    const taskRefs = referenced.rows.filter((row) => row.column_name === 'task_id').map((row) => row.table_name);
    let protectedTaskIds = [];
    for (const table of taskRefs) {
      const ids = await client.query(`SELECT DISTINCT task_id FROM ${table} WHERE task_id IS NOT NULL`);
      protectedTaskIds.push(...ids.rows.map((row) => row.task_id));
    }
    protectedTaskIds = [...new Set(protectedTaskIds)];

    for (const table of CHILD_TABLES) {
      if (!(await tableExists(table))) continue;
      const result = await client.query(`DELETE FROM ${table} WHERE project_id IN (SELECT id FROM projects)`);
      deleted[table] = result.rowCount;
    }
    if (await tableExists('project_tasks')) {
      if (protectedTaskIds.length) {
        const kept = await client.query(
          `UPDATE project_tasks SET project_id = NULL WHERE id = ANY($1::uuid[]) AND project_id IS NOT NULL`,
          [protectedTaskIds],
        ).catch(async () => {
          await client.query('ROLLBACK');
          throw new Error('Shared tasks could not be detached from projects. No rows were deleted.');
        });
        deleted.project_tasks_detached = kept.rowCount;
      }
      const removed = await client.query(
        protectedTaskIds.length
          ? `DELETE FROM project_tasks WHERE project_id IS NOT NULL AND NOT (id = ANY($1::uuid[]))`
          : 'DELETE FROM project_tasks WHERE project_id IS NOT NULL',
        protectedTaskIds.length ? [protectedTaskIds] : [],
      );
      deleted.project_tasks = removed.rowCount;
    }
    const projects = await client.query('DELETE FROM projects RETURNING id');
    deleted.projects = projects.rowCount;
    await client.query('COMMIT');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw error;
  } finally {
    client.release();
  }

  const after = {};
  for (const table of ['projects', 'project_tasks', ...PRESERVE]) after[table] = await count(table);
  console.log(JSON.stringify({ file, before, deleted, after, dailyWorkColumnsChecked: true }, null, 2));
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
