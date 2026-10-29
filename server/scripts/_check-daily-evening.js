require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('../db');
const generate = require('../services/emailReport.generate');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');

async function main() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  console.log('today', today);

  const rows = await query(`
    SELECT id, employee_id, update_date, period, status,
           left(COALESCE(description,''), 100) AS description,
           project_id
    FROM daily_work_updates
    WHERE update_date = $1::date
    ORDER BY created_at DESC
    LIMIT 40
  `, [today]);
  console.log('updates today', rows.rows.length);
  console.log(rows.rows);

  const byPeriod = await query(`
    SELECT COALESCE(period,'') AS period, COUNT(*)::int AS n
    FROM daily_work_updates
    WHERE update_date = $1::date
    GROUP BY 1
  `, [today]);
  console.log('by period', byPeriod.rows);

  const people = await userRepository.listActive();
  const actor = toPublicUser(people.find((p) => /kabitha/i.test(p.fullName)) || people[0]);
  actor.role = actor.role || { code: 'employee' };
  // elevate for report
  const admin = toPublicUser(people.find((p) => /bernard|ceo/i.test(p.fullName)) || people[0]);
  admin.role = { code: 'admin', name: 'Admin' };

  for (const period of ['EVENING', 'MORNING', 'FULL', '']) {
    const snapshot = await generate.build({
      type: 'DAILY_WORK',
      name: 'Daily Work Updates Report',
      configuration: { dateFrom: today, dateTo: today, period: period || 'FULL' },
      frequency: 'MANUAL',
      scope: 'ORGANIZATION',
    }, admin);
    console.log('period', period || 'FULL', 'count', snapshot.recordCount, 'empty', snapshot.empty, 'shift', snapshot.shift);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  if (pool?.end) await pool.end();
});
