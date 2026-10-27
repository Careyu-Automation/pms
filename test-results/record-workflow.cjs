/**
 * Screen recording of the running CareYu app.
 * A temporary sign-in is applied to three existing accounts and removed afterward.
 * The password is never written to disk or printed.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
const pool = require(path.join(__dirname, '..', 'server', 'db', 'pool'));
const { chromium } = require(path.join(__dirname, 'recorder', 'node_modules', 'playwright'));

const BASE = 'http://localhost:5176';
const OUT = path.join(__dirname, 'demo-videos');
const TITLE = 'Automated Component Inspection System';
const SIDE = 'DEMO-REVIEW-PATH Inspection hold';
const PROJECT = 'Automated Component Inspection';
const WORK = 'Bolt and nut inspection check';
const results = [];
const marks = [];
let clock = 0;

function log(message) {
  console.log(message);
}

async function people() {
  const found = await pool.query(`
    SELECT email, full_name, password_hash, must_change_password, failed_login_count, locked_until, designation
    FROM users
    WHERE is_active = TRUE AND account_status = 'ACTIVE'
    ORDER BY full_name
  `);
  const rows = found.rows;
  const bh = rows.find((row) => /business head/i.test(row.designation || ''));
  const pm = rows.find((row) => /project manager/i.test(row.designation || ''));
  const employee = rows.find((row) => !/business head|project manager|engineering director|ceo|cto|system admin/i.test(row.designation || ''));
  if (!bh || !pm || !employee) throw new Error('The directory is missing a business head, project manager, or employee.');
  return { bh, pm, employee };
}

async function applySignIn(accounts, password) {
  const hash = await bcrypt.hash(password, 10);
  for (const account of accounts) {
    await pool.query(
      `UPDATE users
       SET password_hash = $2, must_change_password = FALSE, failed_login_count = 0, locked_until = NULL
       WHERE lower(email) = lower($1)`,
      [account.email, hash],
    );
  }
}

async function restoreSignIn(accounts) {
  for (const account of accounts) {
    await pool.query(
      `UPDATE users
       SET password_hash = $2, must_change_password = $3, failed_login_count = $4, locked_until = $5
       WHERE lower(email) = lower($1)`,
      [account.email, account.password_hash, account.must_change_password, account.failed_login_count, account.locked_until],
    );
  }
}

async function caption(page, text) {
  await page.evaluate((value) => {
    let bar = document.getElementById('demo-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'demo-caption';
      bar.setAttribute('data-demo', 'caption');
      bar.style.cssText = 'position:fixed;left:24px;bottom:20px;z-index:100000;max-width:78%;background:#08203f;color:#fff;padding:12px 18px;border-radius:12px;font:600 20px Segoe UI,sans-serif;line-height:1.35;box-shadow:0 10px 28px rgba(0,0,0,.28);pointer-events:none';
      document.body.appendChild(bar);
    }
    bar.textContent = value;
  }, text);
  await page.waitForTimeout(700);
}

async function shot(page, name, work) {
  try {
    const actual = await work();
    results.push({ step: name, status: 'PASS', actual: actual || 'Shown in the recording' });
    log(`PASS ${name}`);
    return true;
  } catch (error) {
    results.push({ step: name, status: 'FAIL', actual: error.message });
    log(`FAIL ${name}: ${error.message}`);
    return false;
  }
}

function mark(name) {
  marks.push({ name, seconds: Math.max(0, (Date.now() - clock) / 1000) });
}

async function signIn(page, account, password, label) {
  await page.context().clearCookies();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await caption(page, `Sign in — ${label}`);
  await page.locator('#email').fill(account.email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(/\/(dashboard|change-password)/, { timeout: 40000 });
  if (page.url().includes('change-password')) throw new Error('The account was sent to change password.');
  await page.waitForTimeout(1200);
  await caption(page, `Signed in as ${account.full_name} · ${account.designation}`);
  await page.locator('.user-menu__trigger').click();
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
}

async function signOut(page) {
  await page.locator('.user-menu__trigger').click();
  await page.getByRole('menuitem', { name: 'Logout' }).click();
  await page.waitForURL(/\/login/, { timeout: 20000 });
}

async function openMenu(page, label) {
  let link = page.locator('a.sidebar__link', { hasText: label });
  if (!(await link.count())) {
    const toggles = page.locator('.sidebar__section-toggle');
    const count = await toggles.count();
    for (let index = 0; index < count; index += 1) {
      const toggle = toggles.nth(index);
      if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      link = page.locator('a.sidebar__link', { hasText: label });
      if (await link.count()) break;
    }
  }
  await link.first().click();
  await page.waitForTimeout(900);
}

async function openRecord(page, menu, title, id = '') {
  await openMenu(page, menu);
  if (id) {
    const link = page.locator(`a[href*="${id}"]`).first();
    await link.waitFor({ timeout: 15000 });
    await link.click();
  } else {
    const row = page.locator('tbody tr', { hasText: title }).first();
    await row.waitFor({ timeout: 15000 });
    const view = row.getByRole('button', { name: 'View' });
    if (await view.count()) await view.click();
    else await row.locator('a').first().click();
  }
  await page.waitForTimeout(1000);
}

async function fillLead(page, title, extra = '') {
  await page.locator('#lead-title').fill(title);
  await page.locator('#customer-name').fill('Demo Manufacturing Pvt Ltd');
  await page.locator('#customer-type').selectOption('End customer');
  await page.locator('#business-vertical').selectOption('Automotive');
  await page.locator('#priority').selectOption('High');
  await page.locator('#decision-date').fill('2026-12-15');
  await page.locator('#contact-person').fill('Demo Contact');
  await page.locator('#designation').fill('Production Manager');
  await page.locator('#email').fill('demo.inspection@example.com');
  await page.locator('#phone').fill('9000000101');
  await page.locator('#office-location').fill('Chennai');
  await page.locator('#site-location').fill('Chennai');
  await page.locator('#description').fill('Automatically inspect components and identify missing or incorrectly assembled parts.');
  await page.locator('#customer-requirement').fill('Automatically inspect components and identify missing or incorrectly assembled parts.');
  await page.locator('#use-case').fill('Detect missing bolts and nuts in automotive assemblies');
  await page.locator('#production-quantity').fill('Demo line, one station');
  await page.locator('#estimated-value').fill('185000');
  await page.locator('#required-solution').fill('Vision Inspection Automation');
  await page.locator('#technical-requirements').fill('Camera-based inspection, image processing, result reporting, and integration readiness.');
  await page.getByRole('button', { name: 'Further technical and commercial details' }).click();
  await page.locator('#detail-timeline').fill(extra || '12 weeks');
  await page.locator('#visit-requirement').selectOption('No Visit Required');
}

async function record(accounts, password) {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, slowMo: 80 });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  clock = Date.now();
  page.setDefaultTimeout(20000);
  const ids = { lead: '', hold: '', changes: '', costing: '', projectCode: '' };

  mark('01_Lead_Creation_and_PM_Review');
  await shot(page, 'Login and dashboard', async () => {
    await signIn(page, accounts.bh, password, 'Business Head');
    await caption(page, 'Dashboard — Lead Pipeline, Feasibility, Costing, Projects, Tasks, Daily Work, Email Reports');
    await page.waitForTimeout(1800);
    return accounts.bh.designation;
  });

  await shot(page, 'Show required-field validation', async () => {
    await openMenu(page, 'Lead Pipeline');
    await page.getByRole('button', { name: 'Create Lead' }).first().click();
    await page.getByRole('button', { name: 'Submit to PM' }).click();
    await page.locator('.field__error').first().waitFor({ timeout: 8000 });
    await caption(page, 'Required fields are checked before the lead can be submitted');
    await page.waitForTimeout(1600);
    return 'Validation message shown';
  });

  const drafted = await shot(page, 'Create and save the inspection lead', async () => {
    await caption(page, 'Create lead — Automated Component Inspection System');
    await fillLead(page, TITLE);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.waitForURL(/\/lead-pipeline\/.+\/edit/, { timeout: 45000 });
    ids.lead = (page.url().match(/lead-pipeline\/([^/]+)/) || [])[1] || '';
    await page.reload({ waitUntil: 'domcontentloaded' });
    const title = await page.locator('#lead-title').inputValue();
    if (title !== TITLE) throw new Error(`Reloaded title was ${title}`);
    await caption(page, 'Draft reloaded — the saved customer and requirement are still here');
    await page.waitForTimeout(1200);
    await page.locator('#remarks').fill('Demo note: lighting must be controlled at the inspection station.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.waitForTimeout(1500);
    return title;
  });

  if (drafted) {
    await shot(page, 'Show the lead in the pipeline and open it', async () => {
      await openRecord(page, 'Lead Pipeline', TITLE, ids.lead);
      await page.getByRole('heading', { name: TITLE }).waitFor();
      await caption(page, 'Lead details show the saved customer, requirement, and priority');
      await page.waitForTimeout(1500);
      return page.url();
    });
    await shot(page, 'Submit the lead to the project manager', async () => {
      await page.getByRole('button', { name: 'Submit to PM' }).first().click();
      await page.getByRole('dialog').getByRole('button', { name: 'Submit to PM' }).click();
      await page.waitForTimeout(1800);
      await caption(page, 'Lead submitted to the project manager');
      return 'submitted';
    });
  }

  async function submitSideLead(title, timeline) {
    await openMenu(page, 'Lead Pipeline');
    await page.getByRole('button', { name: 'Create Lead' }).first().click();
    await fillLead(page, title, timeline);
    await page.getByRole('button', { name: 'Submit to PM' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit to PM' }).click();
    await page.waitForURL(/\/lead-pipeline\/(?!create)/, { timeout: 20000 });
    await page.waitForTimeout(1000);
    return (page.url().match(/lead-pipeline\/([^/?]+)/) || [])[1] || '';
  }

  await shot(page, 'Create separate leads for hold and change request', async () => {
    await caption(page, 'Separate lead — this one will be placed on hold');
    ids.hold = await submitSideLead(SIDE, 'Hold path only');
    await caption(page, 'Separate lead — this one will be sent back for changes');
    ids.changes = await submitSideLead('DEMO-REVIEW-PATH Inspection changes', 'Changes path only');
    return 'two review leads submitted';
  });

  await shot(page, 'Project manager reviews, holds, requests changes, and approves', async () => {
    await signOut(page);
    await signIn(page, accounts.pm, password, 'Project Manager');
    await openRecord(page, 'Lead Pipeline', SIDE, ids.hold);
    await page.locator('#pm-note').fill('Confirm the sample part orientation before this side lead continues.');
    await page.getByRole('button', { name: 'Put on hold' }).click();
    await page.waitForTimeout(1400);
    await openRecord(page, 'Lead Pipeline', 'DEMO-REVIEW-PATH Inspection changes', ids.changes);
    await page.locator('#pm-note').fill('Add the expected parts per minute before resubmitting this side lead.');
    await page.getByRole('button', { name: 'Request changes' }).click();
    await page.waitForTimeout(1400);
    await caption(page, 'Side leads saved: one on hold, one returned for changes. The main lead continues.');
    await openRecord(page, 'Lead Pipeline', TITLE, ids.lead);
    await page.locator('#pm-note').fill('Accepted for vision inspection feasibility.');
    await page.getByRole('button', { name: 'Approve for team assignment' }).click();
    await page.waitForTimeout(1500);
    return 'approved';
  });

  mark('02_Team_Assignment_and_Feasibility');
  const assigned = await shot(page, 'Assign the five delivery teams', async () => {
    await caption(page, 'Assign Vision, Robotics, Software, Procurement, and Execution');
    for (const name of ['Vision Team', 'Robotics & Automation Solution Team', 'Software Team', 'Procurement / Costing Team', 'Execution Team']) {
      await page.getByRole('checkbox', { name, exact: true }).check();
    }
    await page.getByPlaceholder('Assignment notes').fill('Vision: camera and inspection. Robotics: positioning. Software: image processing. Procurement: supplier lead time. Execution: installation and commissioning.');
    await page.getByRole('button', { name: 'Assign teams' }).click();
    await page.waitForTimeout(1800);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Team assignments' }).waitFor();
    return 'assignments reloaded';
  });

  if (assigned) {
    await shot(page, 'Accept the team assignments', async () => {
      for (let index = 0; index < 5; index += 1) {
        const button = page.getByRole('button', { name: 'Accept', exact: true });
        if (!(await button.count())) break;
        await button.first().click();
        await page.waitForTimeout(900);
      }
      await caption(page, 'Accepted assignments open one feasibility study');
      await page.getByRole('link', { name: 'Open feasibility study' }).click();
      await page.waitForURL(/feasibility-studies/);
      return page.url();
    });
  }

  const studied = await shot(page, 'Complete the feasibility study', async () => {
    if (!page.url().includes('feasibility')) {
      await openRecord(page, 'Feasibility Studies', TITLE);
    }
    await caption(page, 'Feasibility — lead, customer, and requirement are carried forward');
    const start = page.getByRole('button', { name: 'Start study' });
    if (await start.count()) {
      await start.click();
      await page.getByText(/study started/i).first().waitFor({ timeout: 15000 }).catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: 'Overview' }).waitFor();
    }
    await page.getByRole('tab', { name: 'Requirements' }).click();
    const addRequirement = page.getByRole('button', { name: '+ Add requirement' });
    try {
      await addRequirement.waitFor({ timeout: 15000 });
    } catch (error) {
      const message = await page.locator('.toast__message').allTextContents();
      throw new Error(message.join(' ') || 'Requirements could not be edited.');
    }
    await addRequirement.click();
    const requirement = page.locator('table tbody tr').last();
    await requirement.locator('input').nth(0).fill('Detect missing bolts and nuts');
    await requirement.locator('input').nth(2).fill('Camera-based automated component inspection');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('tab', { name: 'Team Assessments' }).click();
    const assessments = [
      ['Vision Team', 'vision', 'Assess camera, lens, lighting, detection accuracy, and sample-image requirements. Proposed solution: camera-based automated component inspection.'],
      ['Robotics & Automation Solution Team', 'robotics', 'Assess component positioning, handling, and repeatability.'],
      ['Software Team', 'software', 'Assess the image-processing workflow, result storage, and system integration.'],
      ['Procurement / Costing Team', 'procurement', 'Assess component availability, supplier quotes, and lead times.'],
      ['Execution Team', 'execution', 'Assess installation space, utilities, commissioning, and manpower.'],
    ];
    for (const [name, code, text] of assessments) {
      const card = page.locator('.feas-team-card', { hasText: name });
      await card.getByRole('button', { name: 'View / Edit' }).click();
      await page.locator(`#${code}-tech`).fill(text);
      await page.locator(`#${code}-resources`).fill('Industrial camera, lens, lighting, processing hardware, and inspection software.');
      await page.locator(`#${code}-constraints`).fill('Component orientation, reflections, and variation in lighting.');
      await page.locator(`#${code}-assumptions`).fill('Components are presented within a defined inspection area with suitable lighting.');
      await page.getByRole('button', { name: 'Submit assessment' }).click();
      try {
        await card.getByText('Completed', { exact: true }).waitFor({ timeout: 15000 });
      } catch (error) {
        const message = await page.locator('.toast__message').allTextContents();
        throw new Error(`${name} was not completed. ${message.join(' ')}`.trim());
      }
    }
    await page.getByRole('tab', { name: 'Technical Validation' }).click();
    await page.getByRole('button', { name: '+ Add validation test' }).click();
    await page.locator('table tbody tr').last().locator('input').first().fill('Demo only: missing-bolt check. No hardware test was run.');
    await page.getByRole('tab', { name: 'Risks & Inputs' }).click();
    await page.getByRole('button', { name: '+ Add risk' }).click();
    const riskRow = page.locator('table tbody tr').last();
    await riskRow.locator('input').nth(0).fill('Demo risk: reflections on machined parts can hide a missing bolt.');
    await riskRow.locator('input').nth(1).fill('Control lighting and confirm the sample image before any hardware trial.');
    await page.getByRole('tab', { name: 'PM Review' }).click();
    await page.locator('#decision').selectOption('FEASIBLE');
    await page.locator('#conclusion').fill('Demo conclusion: camera inspection is feasible if lighting and part presentation stay controlled.');
    await page.getByLabel('Recommended next step').selectOption({ label: 'Proceed to Solution & Costing' });
    const owner = page.locator('#decision-owner');
    const ownerValue = await owner.locator('option', { hasText: accounts.pm.full_name }).first().getAttribute('value');
    if (ownerValue) await owner.selectOption(ownerValue);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Submit Feasibility' }).click();
    const confirm = page.getByRole('dialog').getByRole('button', { name: 'Submit to PM' });
    try {
      await confirm.waitFor({ timeout: 8000 });
    } catch (error) {
      const message = await page.locator('.toast__message').allTextContents();
      throw new Error(message.join(' ') || 'Feasibility submit did not open the confirmation.');
    }
    await confirm.click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Approve' }).click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await caption(page, 'Feasibility decision saved: Feasible');
    return 'feasible';
  });

  mark('03_Solution_Costing_and_Project_Handover');
  let costingReady = false;
  if (studied) {
    costingReady = await shot(page, 'Build and approve solution costing', async () => {
      const proceed = page.getByRole('button', { name: /Solution & Costing|Solution and costing/i });
      if (await proceed.count()) await proceed.first().click();
      else {
        await openRecord(page, 'Solution Costing', TITLE);
      }
      await page.waitForURL(/solution-costing\/.+/);
      ids.costing = (page.url().match(/solution-costing\/([^/?]+)/) || [])[1] || '';
      await caption(page, 'Solution costing — linked to the feasible study');
      await page.getByRole('tab', { name: 'Solution Design' }).click();
      const editSolution = page.getByRole('button', { name: 'Edit solution' });
      if (!(await editSolution.count())) {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.getByRole('tab', { name: 'Solution Design' }).click();
      }
      try {
        await editSolution.waitFor({ timeout: 20000 });
      } catch (error) {
        const status = await page.locator('.feas-top').innerText().catch(() => '');
        throw new Error(`Solution editor is not available. ${status.replace(/\s+/g, ' ').slice(0, 240)}`);
      }
      await editSolution.click();
      await page.locator('#solution-name').waitFor();
      await page.locator('#solution-name').fill('Camera-based component inspection');
      await page.locator('#solution-description').fill('Industrial camera, lens, lighting, and inspection software for missing bolts and nuts.');
      await page.locator('#architecture').fill('Camera and lighting over a fixed inspection area, with results stored for the line system.');
      await page.getByRole('tab', { name: 'BOM' }).click();
      async function bomRow(component, quantity, cost, supplier) {
        await page.getByRole('button', { name: 'Add BOM item' }).click();
        const row = page.locator('.cost-table tbody tr').last();
        await row.locator('td').nth(2).locator('input').fill(component);
        await row.locator('td').nth(3).locator('input').fill(String(quantity));
        await row.locator('td').nth(5).locator('input').fill(String(cost));
        await row.locator('td').nth(7).locator('input').fill(supplier);
      }
      await bomRow('Demo inspection camera', 2, 10000, 'Demo supplier');
      await bomRow('Demo inspection lens', 3, 5000, 'Demo supplier');
      await page.waitForTimeout(800);
      await page.getByRole('tab', { name: 'Commercial' }).click();
      await page.locator('#margin').fill('10');
      await page.getByRole('button', { name: 'Save Draft' }).click();
      await page.waitForTimeout(1200);
      await caption(page, 'Material is quantity times unit cost. Margin is 10% of internal cost.');
      await page.getByRole('button', { name: 'Submit for Review' }).click();
      const approval = page.getByRole('button', { name: 'Submit for Approval' });
      await approval.waitFor({ timeout: 20000 });
      await approval.click();
      await page.getByRole('dialog').getByRole('button', { name: 'Submit for Approval' }).click();
      const approve = page.getByRole('button', { name: 'Approve', exact: true });
      await approve.waitFor({ timeout: 20000 });
      await approve.click();
      await page.getByText('Approved', { exact: true }).first().waitFor({ timeout: 20000 });
      await caption(page, 'Costing approved inside the application');
      return 'costing approved';
    });
  } else results.push({ step: 'Build and approve solution costing', status: 'BLOCKED', actual: 'Feasibility did not finish' });

  if (costingReady) {
    await shot(page, 'Accept the quotation and convert the project', async () => {
      await signOut(page);
      await signIn(page, accounts.bh, password, 'Business Head');
      await openRecord(page, 'Lead Pipeline', TITLE, ids.lead);
      await caption(page, 'Quotation stays inside the application. It is not emailed.');
      await page.getByPlaceholder('Scope').fill('Demo vision inspection station');
      await page.getByPlaceholder('Price').fill('38500');
      await page.getByPlaceholder('Validity').fill('30 days');
      await page.getByRole('button', { name: 'Create quotation version' }).click();
      const sendQuote = page.getByRole('button', { name: /^Send V/ });
      await sendQuote.waitFor({ timeout: 20000 });
      await sendQuote.click();
      await page.getByRole('button', { name: 'Mark won' }).click();
      await page.getByText(/marked won/i).first().waitFor({ timeout: 20000 });
      await signOut(page);
      await signIn(page, accounts.pm, password, 'Project Manager');
      await openRecord(page, 'Solution Costing', TITLE, ids.costing);
      await page.getByRole('button', { name: 'Convert to Project' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Project name').fill(PROJECT);
      const manager = dialog.locator('select').first();
      const managerValue = await manager.locator('option', { hasText: accounts.pm.full_name }).first().getAttribute('value');
      if (!managerValue) throw new Error('The project manager is not in the convert list.');
      await manager.selectOption(managerValue);
      const dates = dialog.locator('input[type="date"]');
      if (!(await dates.nth(0).inputValue())) await dates.nth(0).fill('2026-10-26');
      if (!(await dates.nth(1).inputValue())) await dates.nth(1).fill('2027-01-18');
      await dialog.getByRole('button', { name: 'Convert to Project' }).click();
      try {
        await page.waitForURL(/\/projects\/[^/?]+/, { timeout: 25000 });
      } catch (error) {
        const message = await page.locator('.toast__message').allTextContents();
        throw new Error(message.join(' ') || 'Convert did not open the project.');
      }
      ids.projectCode = (await page.locator('.pd-code').innerText()).trim();
      await caption(page, `Project ${ids.projectCode} was created from the approved costing`);
      await page.waitForTimeout(1200);
      await page.locator('a.sidebar__link[href="/projects"]').click();
      await page.getByText(ids.projectCode).first().waitFor({ timeout: 20000 });
      return ids.projectCode;
    });
  } else results.push({ step: 'Accept the quotation and convert the project', status: 'BLOCKED', actual: 'Costing was not approved' });

  mark('04_Task_Assignment_and_Daily_Work');
  const planned = await shot(page, 'Plan the project and assign a task', async () => {
    if (!ids.projectCode) throw new Error('The project was not converted.');
    await openMenu(page, 'Project Planning & Gantt');
    const projectSelect = page.locator('.plan-select select');
    const projectValue = await projectSelect.locator('option', { hasText: ids.projectCode || PROJECT }).last().getAttribute('value');
    if (!projectValue) throw new Error('The new project is not in the planning list');
    await projectSelect.selectOption(projectValue);
    await page.waitForTimeout(1200);
    await caption(page, 'Project Planning & Gantt — day, week, and month');
    for (const mode of ['day', 'week', 'month']) {
      await page.locator('.plan-modes button', { hasText: mode }).click();
      await page.waitForTimeout(500);
    }
    await page.getByRole('button', { name: 'Today' }).click();
    await page.getByRole('button', { name: 'Fit to screen' }).click();
    await page.locator('.plan-tools').getByRole('button', { name: 'Add phase' }).first().click();
    await page.getByRole('dialog').getByLabel('Phase name').fill('Demo inspection setup');
    await page.getByRole('dialog').getByRole('button', { name: /Create|Save|Add/ }).click();
    await page.waitForTimeout(800);
    await page.locator('.plan-tools').getByRole('button', { name: 'Add task' }).first().click();
    const dialog = page.getByRole('dialog');
    ids.taskName = `Demo camera inspection setup ${ids.projectCode}`;
    await dialog.getByLabel('Task name').fill(ids.taskName);
    const startDate = dialog.locator('input[type="date"]').nth(0);
    const endDate = dialog.locator('input[type="date"]').nth(1);
    if (!(await startDate.inputValue())) await startDate.fill('2026-10-26');
    if (!(await endDate.inputValue())) await endDate.fill('2026-11-20');
    const assignee = dialog.locator('select').nth(1);
    const assigneeValue = await assignee.locator('option', { hasText: accounts.employee.full_name }).first().getAttribute('value');
    if (!assigneeValue) throw new Error('The employee is not in the assignee list');
    await assignee.selectOption(assigneeValue);
    await dialog.locator('select').nth(2).selectOption('vision');
    await dialog.locator('select').nth(3).selectOption('HIGH');
    await dialog.getByRole('button', { name: 'Create task' }).click();
    await page.waitForTimeout(1200);
    return 'task created';
  });

  if (planned) {
    await shot(page, 'Employee sees the task and logs daily work', async () => {
      await signOut(page);
      await signIn(page, accounts.employee, password, accounts.employee.designation);
      await openMenu(page, 'My Assigned Work');
      await page.getByText(ids.taskName).first().waitFor();
      await caption(page, 'My Assigned Work shows only this employee\'s task');
      const status = page.getByLabel(`${ids.taskName} status`).first();
      if (await status.count()) await status.selectOption('IN_PROGRESS');
      await page.waitForTimeout(800);
      await openMenu(page, 'Team Tasks');
      await page.waitForTimeout(1000);
      await openMenu(page, 'Daily Work Updates');
      await caption(page, 'Daily Work Updates — spreadsheet table');
      await page.getByRole('button', { name: 'Add Row' }).click();
      const draft = page.locator('.daily-draft');
      await draft.getByLabel('Work type').selectOption({ index: 1 });
      await draft.getByLabel('Work title').fill(WORK);
      await draft.getByLabel('Description').fill('Checked the demo inspection view for a missing bolt. No hardware test was run.');
      const project = draft.getByLabel('Project');
      const projectValue = await project.locator('option', { hasText: PROJECT }).last().getAttribute('value');
      if (projectValue) await project.selectOption(projectValue);
      await draft.getByLabel('Status').selectOption('IN_PROGRESS');
      await draft.getByLabel('Priority').selectOption('HIGH');
      await draft.getByLabel('Dependency').selectOption({ label: /Technical/i }).catch(() => {});
      const dependency = draft.getByLabel('Dependency details');
      if (await dependency.count()) await dependency.fill('Waiting for a sample image of the bolt circle.');
      await draft.getByLabel('Next action').fill('Review the sample image with the vision team.');
      await draft.getByLabel('Progress').fill('40');
      await draft.getByLabel('Hours').fill('3');
      await draft.getByRole('button', { name: 'Save' }).click();
      await page.getByText(WORK).first().waitFor();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByText(WORK).first().waitFor();
      const scroller = page.locator('.daily-scroll');
      await scroller.evaluate((node) => { node.scrollLeft = node.scrollWidth; });
      await page.waitForTimeout(1200);
      await caption(page, 'Horizontal scroll reaches the Actions column');
      const row = page.locator('tr', { hasText: WORK });
      await row.getByRole('button', { name: 'Edit' }).click();
      await page.getByLabel('Description').last().fill('Checked the demo inspection view and recorded the lighting constraint.');
      await page.locator('.daily-draft, tr').getByRole('button', { name: 'Save' }).last().click();
      await page.waitForTimeout(1200);
      return WORK;
    });
  } else results.push({ step: 'Employee sees the task and logs daily work', status: 'BLOCKED', actual: 'The task was not created' });

  mark('05_Email_Reports');
  await shot(page, 'Preview and download the daily work report', async () => {
    await openMenu(page, 'Email Reports');
    await caption(page, 'Email report uses the saved daily work. Sending needs SMTP.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    await page.getByLabel('Report Date').fill(today);
    await page.getByLabel('Period').selectOption('MORNING');
    await page.getByRole('button', { name: 'Preview Report' }).click();
    await page.frameLocator('iframe[title="Report preview"]').getByText(WORK).first().waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: 'Desktop Preview' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Mobile Preview' }).click();
    await page.waitForTimeout(800);
    const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
    await page.getByRole('button', { name: 'Download PDF' }).click();
    await downloadPromise.catch(() => null);
    const send = page.getByRole('button', { name: 'Send Test Email' });
    if (await send.isDisabled()) {
      await caption(page, 'The report can be previewed and downloaded. Sending stays unavailable.');
      results.push({ step: 'Email delivery', status: 'BLOCKED', actual: 'Send Test Email is disabled for this account. SMTP is not configured, so no message was sent.' });
    } else {
      await page.getByLabel('Search recipients').click();
      await page.locator('.recipient-field__menu button').first().click();
      await send.click();
      await page.waitForTimeout(2500);
      await caption(page, 'The application reports the real email result. No success is invented.');
      results.push({ step: 'Email delivery', status: 'BLOCKED', actual: 'SMTP is not configured. The recording shows the application response instead of a sent message.' });
    }
    await page.getByRole('heading', { name: 'Report History' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(1200);
    return 'preview shown';
  });

  const video = page.video();
  await context.close();
  await browser.close();
  const recorded = await video.path();
  const combined = path.join(OUT, 'CareYu_Project_Hub_Complete_Workflow_Demo.mp4');
  fs.copyFileSync(recorded, combined);
  if (path.resolve(recorded) !== path.resolve(combined)) fs.rmSync(recorded, { force: true });
  return combined;
}

function cutClips(combined) {
  const ffmpeg = path.join(process.env.TEMP, 'careyu-ffmpeg', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe');
  if (!fs.existsSync(ffmpeg) || marks.length < 2) return;
  const names = [
    '01_Lead_Creation_and_PM_Review.mp4',
    '02_Team_Assignment_and_Feasibility.mp4',
    '03_Solution_Costing_and_Project_Handover.mp4',
    '04_Task_Assignment_and_Daily_Work.mp4',
    '05_Email_Reports.mp4',
  ];
  marks.push({ name: 'end', seconds: null });
  for (let index = 0; index < names.length && index < marks.length - 1; index += 1) {
    const start = Math.max(0, marks[index].seconds - 0.3);
    const args = ['-y', '-ss', start.toFixed(2), '-i', combined];
    if (marks[index + 1].seconds != null) args.push('-to', (marks[index + 1].seconds - start).toFixed(2));
    args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', path.join(OUT, names[index]));
    spawnSync(ffmpeg, args, { stdio: 'ignore' });
  }
}

async function main() {
  const found = await people();
  const accounts = { bh: found.bh, pm: found.pm, employee: found.employee };
  const password = `Rec${crypto.randomBytes(9).toString('base64url')}a1`;
  const originals = [found.bh, found.pm, found.employee];
  log('Applying a temporary sign-in for the recording.');
  await applySignIn(originals, password);
  let combined = '';
  try {
    combined = await record(accounts, password);
    cutClips(combined);
  } finally {
    await restoreSignIn(originals);
    log('Existing sign-in details were restored.');
    await pool.end();
  }
  const report = {
    video: combined,
    folder: OUT,
    results,
  };
  fs.writeFileSync(path.join(OUT, 'recording-report.json'), JSON.stringify(report, null, 2));
  log(`VIDEO ${combined}`);
  log(`RESULTS ${results.filter((item) => item.status === 'PASS').length}/${results.length}`);
}

main().catch(async (error) => {
  console.error(error.message);
  try { await pool.end(); } catch { /* already closed */ }
  process.exitCode = 1;
});
