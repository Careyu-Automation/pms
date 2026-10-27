const pool = require('../db/pool');
const time = require('../services/time.service');

function isoToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

async function main() {
  const users = await pool.query(
    `SELECT u.id, u.full_name, r.code
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.is_active = TRUE
     ORDER BY u.created_at
     LIMIT 1`,
  );
  const row = users.rows[0];
  if (!row) throw new Error('no user');
  const actor = { id: row.id, fullName: row.full_name, role: { code: row.code } };
  const zone = 'Asia/Kolkata';
  const date = isoToday();
  const day = await time.checkIn(actor, { date, timeZone: zone });
  if (!day.session) throw new Error('check-in missing');
  await time.startBreak(actor, { date, type: 'Lunch', timeZone: zone });
  const open = await time.day(actor, date, { timeZone: zone });
  if (!open.openBreak) throw new Error('break missing');
  await time.endBreak(actor, open.openBreak.id, { timeZone: zone });
  const start = new Date();
  start.setHours(10, 0, 0, 0);
  const end = new Date();
  end.setHours(11, 30, 0, 0);
  const entry = await time.createEntry(actor, {
    date,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    description: 'Verification entry for My Time',
    timeZone: zone,
  });
  if (entry.durationMinutes !== 90) throw new Error(`duration ${entry.durationMinutes}`);
  let overlap = false;
  try {
    await time.createEntry(actor, {
      date,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      description: 'Overlapping verification entry',
      timeZone: zone,
    });
  } catch (error) {
    overlap = error.statusCode === 409;
  }
  if (!overlap) throw new Error('overlap was allowed');
  const checked = await time.checkOut(actor, { date, timeZone: zone });
  if (checked.summary.status !== 'CHECKED_OUT') throw new Error('not checked out');
  if (checked.summary.breakMinutes < 0) throw new Error('negative break');
  const report = await time.saveReport(actor, {
    date,
    whatIDid: checked.entries.length ? undefined : 'Worked on verification',
    notes: 'Vendor follow-up is planned for tomorrow.',
    submit: true,
    timeZone: zone,
  });
  if (report.status !== 'SUBMITTED') throw new Error('report not submitted');
  if (!report.whatIDid.includes('Verification entry')) throw new Error(`summary missing entry: ${report.whatIDid}`);
  await pool.query('DELETE FROM daily_reports WHERE user_id = $1 AND report_date = $2', [actor.id, date]);
  await pool.query('DELETE FROM project_time_entries WHERE id = $1', [entry.id]);
  await pool.query('DELETE FROM attendance_sessions WHERE user_id = $1 AND work_date = $2', [actor.id, date]);
  const left = await pool.query('SELECT COUNT(*)::int AS count FROM attendance_sessions WHERE user_id = $1 AND work_date = $2', [actor.id, date]);
  if (left.rows[0].count !== 0) throw new Error('cleanup failed');
  console.log('time workflow ok', { worked: checked.summary.workedMinutes, breaks: checked.summary.breakMinutes });
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error);
    pool.end().finally(() => process.exit(1));
  });
