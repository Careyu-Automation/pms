const pool = require('../db/pool');
const reports = require('../services/emailReport.service');
const { kolkataDate } = require('../services/emailReport.pause');

function stamp(value) {
  if (!value) return 'none';
  return `${kolkataDate(new Date(value))} ${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(value))}`;
}

async function scheduled() {
  const result = await pool.query(
    `SELECT id, type, frequency, send_time, status, next_run_at
     FROM email_reports
     WHERE type = 'DAILY_WORK' AND frequency <> 'MANUAL' AND status = 'ACTIVE'
     ORDER BY send_time`,
  );
  return result.rows;
}

async function main() {
  const beforeRuns = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_report_runs
     WHERE report_type = 'DAILY_WORK' AND status = 'SENT' AND started_at > NOW() - INTERVAL '2 minutes'`,
  );
  const before = await scheduled();
  await reports.tick();
  const after = await scheduled();
  const sent = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_report_runs
     WHERE report_type = 'DAILY_WORK' AND status = 'SENT' AND started_at > NOW() - INTERVAL '2 minutes'`,
  );
  const other = await pool.query(
    `SELECT COUNT(*)::int AS n FROM email_reports
     WHERE type <> 'DAILY_WORK' AND frequency <> 'MANUAL' AND status = 'ACTIVE'`,
  );
  console.log(`active_daily_work_schedules ${before.length}`);
  before.forEach((row, index) => {
    const next = after[index];
    console.log(`${row.frequency} ${row.send_time} before ${stamp(row.next_run_at)} after ${stamp(next.next_run_at)}`);
    if (next.next_run_at && kolkataDate(new Date(next.next_run_at)) < '2026-11-02') {
      throw new Error('A Daily Work schedule is still due before 2 November 2026.');
    }
  });
  if (sent.rows[0].n > beforeRuns.rows[0].n) throw new Error('A Daily Work email was sent during the pause.');
  console.log(`sent_during_check ${sent.rows[0].n}`);
  console.log(`other_active_schedules ${other.rows[0].n}`);
  await pool.end();
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* already closed */ }
  process.exitCode = 1;
});
