const pool = require('../db/pool');
const feasibility = require('../db/feasibility.repository');
const costing = require('../db/costing.repository');

async function main() {
  const lead = await pool.query(`SELECT id, lead_code FROM leads WHERE lead_code = 'LD-001'`);
  const leadId = lead.rows[0].id;
  const studyId = await feasibility.findIdByLead(leadId);
  const study = await feasibility.findById(studyId);
  console.log({
    leadCode: lead.rows[0].lead_code,
    studyId,
    status: study.status,
    decision: study.decision,
    proposedSolution: String(study.proposedSolution || '').slice(0, 80),
    technicalFeasibility: String(study.technicalFeasibility || '').slice(0, 80),
    assumptions: String(study.technicalAssumptions || '').slice(0, 80),
    teams: (study.teams || []).map((t) => ({ code: t.teamCode, status: t.status, lead: t.teamLeadName || t.teamLeadId })),
  });

  const costingRow = await pool.query(`SELECT id FROM solution_costings WHERE lead_id = $1`, [leadId]);
  const pack = await costing.findById(costingRow.rows[0].id);
  const version = pack.version || {};
  console.log({
    costingId: pack.id,
    costingCode: pack.costingCode,
    feasibilityProposed: String(pack.feasibility?.proposedSolution || '').slice(0, 80),
    status: version.status,
    solutionName: version.solutionName,
    solutionDescription: String(version.solutionDescription || '').slice(0, 80),
    teams: (version.teams || []).map((t) => t.teamCode),
    entries: (version.entries || []).length,
    bom: (version.bom || []).map((b) => b.component),
  });

  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(1);
});
