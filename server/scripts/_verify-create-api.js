require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const health = await fetch('http://127.0.0.1:5000/api/health').then((r) => r.json()).catch((e) => ({ error: e.message }));
  console.log('health', health);

  // Login as Kabitha
  const login = await fetch('http://127.0.0.1:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'fsdengg1@careyu.ai', password: process.env.DEMO_PASSWORD || 'CareYu@123' }),
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));

  if (!login.body?.data?.accessToken && !login.body?.data?.token) {
    // try alternate password from env
    console.log('login failed first attempt', login.status, login.body?.message || login.body);
  }
  const token = login.body?.data?.accessToken || login.body?.data?.token || login.body?.data?.tokens?.accessToken;
  if (!token) {
    console.log('Could not login; checking listProjects code path locally instead');
    const costing = require('../services/costing.service');
    const userRepo = require('../db/user.repository');
    const users = await userRepo.listActive();
    const user = users[0];
    const listed = await costing.listProjects('all', { id: user.id, role: { code: 'project_manager' } });
    console.log('dependencyOptions', (listed.dependencyOptions || []).length, listed.dependencyOptions?.slice(0, 3));
    const created = await costing.createProject({ id: user.id, role: { code: 'project_manager' } }, {
      title: `API Fix Check ${Date.now()}`,
      startDate: '2026-10-29',
      targetDate: '2026-11-03',
      dependencyIds: (listed.dependencyOptions || []).filter((d) => d.id).slice(0, 1).map((d) => d.id),
    });
    console.log('created ok', created.projectCode, created.customerName);
    return;
  }

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const listed = await fetch('http://127.0.0.1:5000/api/projects', { headers }).then((r) => r.json());
  console.log('deps', (listed.data?.dependencyOptions || []).length);
  const create = await fetch('http://127.0.0.1:5000/api/projects', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: `Mainline Vision Inspection ${Date.now()}`,
      startDate: '2026-10-29',
      targetDate: '2026-11-03',
      dependencyIds: (listed.data?.dependencyOptions || []).filter((d) => d.id).slice(0, 2).map((d) => d.id),
    }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log('create', create.status, create.body.message || create.body, create.body.data?.project?.projectCode);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async () => {
  try { const { pool } = require('../db'); if (pool?.end) await pool.end(); } catch { /* */ }
});
