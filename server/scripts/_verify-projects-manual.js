/* Quick integrity check for manual projects + active gating. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const repository = require('../db/costing.repository');
const { query } = require('../db');

async function main() {
  await repository.ensureProjectOrders();
  const users = await query(`SELECT id, full_name FROM users ORDER BY created_at NULLS LAST LIMIT 5`);
  if (!users.rows.length) throw new Error('No users for verification.');
  const actorId = users.rows[0].id;
  const managerId = users.rows[1]?.id || actorId;

  const created = await repository.createManualProject(actorId, {
    title: `Verify Manual ${Date.now()}`,
    customerName: 'Verify Customer',
    description: 'Automated verification project without lead or order.',
    ownerId: actorId,
    projectManagerId: managerId,
    projectType: 'Automation',
    lifecycleStage: 'FEASIBILITY_STUDY',
    priority: 'HIGH',
    startDate: '2026-11-01',
    targetDate: '2026-12-15',
    enquiryReference: 'ENQ-VERIFY',
    customerContact: 'Verify Contact',
    customerRequirements: 'Need feasibility linkage',
    estimatedBudget: 100000,
    expectedOrderValue: 250000,
    notes: 'Scenario 1 + 6',
  });
  console.log('created', created);

  const project = await repository.findProject(created.id);
  if (!project) throw new Error('Created project not found.');
  if (project.isActivated) throw new Error('Manual project must not be activated.');
  if (project.orderCode) throw new Error('Manual project must not have an order code.');
  if (project.lifecycleStage !== 'FEASIBILITY_STUDY') throw new Error(`Unexpected stage ${project.lifecycleStage}`);

  const all = await repository.listProjects();
  const inAll = all.some((row) => row.id === created.id);
  const active = all.filter((row) => row.isActivated && row.status !== 'CANCELLED');
  const inActive = active.some((row) => row.id === created.id);
  if (!inAll) throw new Error('Manual project missing from Projects list.');
  if (inActive) throw new Error('Manual project incorrectly appears as active.');

  await repository.updateProject(created.id, {
    title: project.title,
    description: `${project.description} (edited)`,
    projectManagerId: managerId,
    priority: 'MEDIUM',
    startDate: project.startDate,
    targetDate: project.targetDate,
    projectType: project.projectType,
    customerName: project.customerName,
    department: project.department || '',
    teamCode: project.teamCode || '',
    projectCode: project.projectCode,
    customerContact: project.customerContact,
    lifecycleStage: 'TECHNICAL_ASSESSMENT',
    ownerId: actorId,
    notes: 'Scenario 7 edit',
  }, actorId);
  const edited = await repository.findProject(created.id);
  if (edited.lifecycleStage !== 'TECHNICAL_ASSESSMENT') throw new Error('Lifecycle edit did not persist.');
  if (!String(edited.description).includes('(edited)')) throw new Error('Description edit did not persist.');

  console.log(JSON.stringify({
    ok: true,
    projectId: created.id,
    projectCode: created.projectCode,
    lifecycleStage: edited.lifecycleStage,
    inProjects: inAll,
    inActiveProjects: inActive,
    totalProjects: all.length,
    totalActive: active.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  try {
    const { pool } = require('../db');
    if (pool?.end) await pool.end();
  } catch {
    /* ignore */
  }
});
