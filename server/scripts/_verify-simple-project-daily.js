require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const repository = require('../db/costing.repository');
const dailyRepo = require('../db/dailyWork.repository');
const bootstrap = require('../services/dailyWorkReport.bootstrap');
const { dailySubject } = require('../services/emailReport.generate');
const { dailyWorkEmailsPaused } = require('../services/emailReport.pause');
const { query, pool } = require('../db');

async function main() {
  await repository.ensureProjectOrders();
  const options = await repository.listDependencyOptions();
  const configured = options.filter((item) => item.configured);
  console.log('dependency options', configured.map((item) => `${item.label}->${item.fullName}`));

  const users = await query('SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1');
  const actorId = users.rows[0].id;
  const deps = configured.slice(0, 2).map((item) => item.id);

  const created = await repository.createManualProject(actorId, {
    title: `Vision Inspection ${Date.now()}`,
    startDate: '2026-10-29',
    targetDate: '2026-11-30',
    dependencyIds: deps,
  });
  console.log('created', created);

  const project = await repository.findProject(created.id);
  if (!project || project.isActivated) throw new Error('Project missing or incorrectly activated');
  if (deps.length && project.dependencyIds.length !== deps.length) {
    throw new Error(`Expected ${deps.length} dependencies, got ${project.dependencyIds.length}`);
  }

  const lookups = await dailyRepo.catalog();
  const inDaily = lookups.projects.some((row) => row.id === created.id);
  if (!inDaily) throw new Error('Project missing from Daily Work lookups');

  const report = await bootstrap.ensureDailyWorkReport();
  console.log('email bootstrap', report);
  if (dailyWorkEmailsPaused()) throw new Error('Daily work emails are still paused');
  console.log('subject sample', dailySubject('2026-10-29'));

  console.log(JSON.stringify({
    ok: true,
    projectCode: created.projectCode,
    inDailyWork: inDaily,
    dependencyCount: project.dependencyIds.length,
    emailRecipients: report.recipients,
    missingRecipients: report.missing,
    sendTime: report.sendTime,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (pool?.end) await pool.end();
});
