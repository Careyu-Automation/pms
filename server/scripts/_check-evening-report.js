require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const generate = require('../services/emailReport.generate');
const userRepository = require('../db/user.repository');
const { toPublicUser } = require('../utils/publicUser');
const { pool } = require('../db');
const repository = require('../db/dailyWork.repository');

async function main() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const people = await userRepository.listActive();
  const adminRow = people.find((p) => /bernard|ceo/i.test(p.fullName)) || people[0];
  const admin = toPublicUser(adminRow);
  admin.role = { code: 'admin', name: 'Admin' };

  console.log('updatesAreView', await repository.updatesAreView());

  for (const period of ['EVENING', 'MORNING', 'FULL']) {
    const snapshot = await generate.build({
      type: 'DAILY_WORK',
      name: 'Daily Work Updates Report',
      configuration: { dateFrom: today, dateTo: today, period },
      frequency: 'MANUAL',
      scope: 'ORGANIZATION',
    }, admin);
    console.log({
      period,
      count: snapshot.recordCount,
      empty: snapshot.empty,
      shift: snapshot.shift,
      sample: (snapshot.dailyRows || []).slice(0, 2).map((r) => ({
        name: r.employeeName, project: r.projectName, status: r.status, period: r.period,
        desc: String(r.description || '').slice(0, 60),
      })),
    });
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => { if (pool?.end) await pool.end(); });
