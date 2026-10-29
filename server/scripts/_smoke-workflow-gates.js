/* Smoke: workflow gates + module load (no mock data). */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  const roles = require('../services/workflow.roles');
  const procurement = require('../services/procurement.service');
  const procurementRepo = require('../db/procurement.repository');
  const workflow = require('../services/workflow.service');
  const costingRepo = require('../db/costing.repository');
  const { query } = require('../db');

  await procurementRepo.ensureSchema();
  await costingRepo.ensureProjectOrders();

  const cols = await query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'procurement_requests'
      AND column_name IN ('lead_id','feasibility_id','no_purchase_required')
    ORDER BY column_name
  `);
  if (cols.rows.length < 3) {
    throw new Error(`Missing procurement columns: ${cols.rows.map((r) => r.column_name).join(',')}`);
  }

  const docs = await query(`
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'procurement_request_documents' LIMIT 1
  `);
  if (!docs.rows[0]) throw new Error('procurement_request_documents missing');

  const bh = { fullName: 'Mrs. Shradha Patil', designation: 'Business Head', role: { code: 'management', name: 'Management' } };
  const arivan = { fullName: 'Mr. Arivan', designation: 'Robotics Lead', role: { code: 'employee', name: 'Employee' } };
  const sabari = { fullName: 'Mr. Sabarigiri', designation: 'Director', role: { code: 'employee', name: 'Employee' } };
  const ceo = { fullName: 'CEO', designation: 'CEO', role: { code: 'management', name: 'Management' } };
  const member = { fullName: 'Aakash', designation: 'Engineer', role: { code: 'employee', name: 'Employee' } };

  if (roles.actorKind(bh) !== 'BH') throw new Error(`Expected BH for Shradha, got ${roles.actorKind(bh)}`);
  if (!roles.seesOrganization(arivan)) throw new Error('Arivan should see organization');
  if (!roles.seesOrganization(sabari)) throw new Error('Sabarigiri should see organization');
  if (!roles.seesOrganization(ceo)) throw new Error('CEO should see organization');
  if (roles.seesOrganization(member)) throw new Error('Plain member should not see organization');
  if (!roles.canEditCostingCommercial(bh)) throw new Error('Shradha should edit commercial costing');

  const blocked = await procurement.leadReadyForCosting('00000000-0000-4000-8000-000000000000');
  if (blocked) throw new Error('Unknown lead should not be ready for costing');

  const active = await query(`
    SELECT COUNT(*)::int AS n
    FROM projects p
    JOIN project_orders po ON po.project_id = p.id
    WHERE po.activated_at IS NOT NULL AND p.status <> 'CANCELLED'
  `);
  console.log(JSON.stringify({
    ok: true,
    procurementColumns: cols.rows.map((r) => r.column_name),
    activatedProjects: active.rows[0].n,
    markLead: typeof workflow.markLead,
    sendQuotationSets: 'QUOTATION_SENT',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
