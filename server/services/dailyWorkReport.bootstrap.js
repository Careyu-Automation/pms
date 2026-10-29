const { query } = require('../db');
const repository = require('../db/emailReport.repository');
const { nextRunAt } = require('./emailReport.pause');

const MORNING = {
  name: 'Morning Daily Work Updates Report',
  sendTime: process.env.DAILY_WORK_MORNING_TIME || '11:15',
  period: 'MORNING',
  description: 'Automatic morning daily work updates for CareYu Automation (11:15 AM IST).',
};
const EVENING = {
  name: 'Evening Daily Work Updates Report',
  sendTime: process.env.DAILY_WORK_EVENING_TIME || '19:15',
  period: 'EVENING',
  description: 'Automatic evening daily work updates for CareYu Automation (7:15 PM IST).',
};

const TO_MATCHERS = [
  { label: 'Mr. Arivan', keys: ['arivan'] },
  { label: 'Mr. Sabarigiri', keys: ['sabarigiri'] },
  { label: 'CEO', keys: ['ceo', 'bernard'], designation: /ceo/i },
];
const CC_MATCHERS = [
  { label: 'Mr. Raja', keys: ['raja'] },
  { label: 'Shradha', keys: ['shradha'] },
];

function normalize(value) {
  return String(value || '').toLowerCase().replace(/^(mr\.?|mrs\.?|ms\.?)\s+/i, '').replace(/\s+/g, ' ').trim();
}

function matchUser(people, matcher) {
  return people.find((person) => {
    const full = normalize(person.full_name);
    const designation = String(person.designation || '');
    if (matcher.designation && matcher.designation.test(designation)) return true;
    return matcher.keys.some((key) => full === key || full.startsWith(`${key} `) || full.includes(key));
  }) || null;
}

async function loadPeople() {
  const result = await query(`SELECT id, full_name, email, designation FROM users ORDER BY full_name`);
  const seen = new Set();
  return result.rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function buildRecipients(people) {
  const missing = [];
  const recipients = [];
  for (const matcher of TO_MATCHERS) {
    const person = matchUser(people, matcher);
    if (!person?.email) {
      missing.push(`TO: ${matcher.label}`);
      continue;
    }
    recipients.push({
      kind: 'TO',
      recipientType: 'USER',
      userId: person.id,
      teamId: null,
      email: person.email,
      name: person.full_name || matcher.label,
    });
  }
  for (const matcher of CC_MATCHERS) {
    const person = matchUser(people, matcher);
    if (!person?.email) {
      missing.push(`CC: ${matcher.label}`);
      continue;
    }
    recipients.push({
      kind: 'CC',
      recipientType: 'USER',
      userId: person.id,
      teamId: null,
      email: person.email,
      name: person.full_name || matcher.label,
    });
  }
  return { recipients, missing };
}

async function pauseLegacyReports(keepIds) {
  await query(
    `UPDATE email_reports
     SET status = 'PAUSED', next_run_at = NULL, updated_at = NOW()
     WHERE type = 'DAILY_WORK'
       AND frequency = 'DAILY'
       AND id <> ALL($1::uuid[])
       AND status = 'ACTIVE'`,
    [keepIds],
  );
}

async function ensureOne(spec, ownerId, recipients) {
  const existing = await query(
    `SELECT id FROM email_reports
     WHERE type = 'DAILY_WORK' AND name = $1
     ORDER BY created_at ASC LIMIT 1`,
    [spec.name],
  );
  const draft = {
    name: spec.name,
    type: 'DAILY_WORK',
    description: spec.description,
    scope: 'ORGANIZATION',
    scopeId: null,
    status: 'ACTIVE',
    subject: 'Daily Work Updates Report — {{period}}',
    configuration: { period: spec.period, includeCompleted: true },
    attachment: 'NONE',
    frequency: 'DAILY',
    sendTime: spec.sendTime,
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: 'Asia/Kolkata',
    ownerId,
  };
  const scheduled = nextRunAt(draft);
  draft.nextRunAt = scheduled;
  let reportId = existing.rows[0]?.id || null;
  if (reportId) await repository.updateReport(reportId, draft);
  else reportId = await repository.insertReport(draft);
  if (recipients.length) await repository.replaceRecipients(reportId, recipients);
  return {
    reportId,
    name: spec.name,
    sendTime: spec.sendTime,
    period: spec.period,
    nextRunAt: scheduled ? scheduled.toISOString() : null,
  };
}

async function ensureDailyWorkReport() {
  const people = await loadPeople();
  const { recipients, missing } = buildRecipients(people);
  const ceo = matchUser(people, { keys: ['bernard'], designation: /ceo/i })
    || matchUser(people, { keys: ['arivan'] })
    || people[0];
  if (!ceo?.id) {
    return { ok: false, missing: ['No users available to own the daily work report'], reports: [] };
  }

  const morning = await ensureOne(MORNING, ceo.id, recipients);
  const evening = await ensureOne(EVENING, ceo.id, recipients);
  await pauseLegacyReports([morning.reportId, evening.reportId]);

  return {
    ok: missing.length === 0,
    reportId: evening.reportId,
    sendTime: evening.sendTime,
    timezone: 'Asia/Kolkata',
    reports: [morning, evening],
    recipients: recipients.map((row) => ({ kind: row.kind, name: row.name, email: row.email })),
    missing,
  };
}

module.exports = {
  ensureDailyWorkReport,
  REPORT_NAME: EVENING.name,
  SEND_TIME: EVENING.sendTime,
  MORNING_TIME: MORNING.sendTime,
  EVENING_TIME: EVENING.sendTime,
};
