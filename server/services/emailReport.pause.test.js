const assert = require('assert');
const {
  dailyWorkEmailsPaused,
  firstRunAfterPause,
  kolkataDate,
  nextRunAt,
} = require('./emailReport.pause');

function kolkataParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

const paused = [
  '2026-10-27T00:00:00+05:30',
  '2026-10-27T09:00:00+05:30',
  '2026-10-31T18:30:00+05:30',
  '2026-11-01T00:00:00+05:30',
  '2026-11-01T23:59:00+05:30',
];
const open = [
  '2026-11-02T00:00:00+05:30',
  '2026-11-02T09:00:00+05:30',
  '2026-11-02T18:30:00+05:30',
  '2026-11-03T09:00:00+05:30',
];

for (const value of paused) assert.strictEqual(dailyWorkEmailsPaused(new Date(value)), true, value);
for (const value of open) assert.strictEqual(dailyWorkEmailsPaused(new Date(value)), false, value);
assert.strictEqual(kolkataDate(new Date('2026-11-01T23:30:00+05:30')), '2026-11-01');
assert.strictEqual(kolkataDate(new Date('2026-11-02T00:30:00+05:30')), '2026-11-02');

function schedule(sendTime) {
  return { frequency: 'DAILY', status: 'ACTIVE', sendTime, timezone: 'Asia/Kolkata', type: 'DAILY_WORK' };
}

for (const sendTime of ['09:00', '18:00']) {
  const next = firstRunAfterPause(schedule(sendTime));
  const parts = kolkataParts(next);
  assert.strictEqual(`${parts.year}-${parts.month}-${parts.day}`, '2026-11-02', sendTime);
  assert.strictEqual(`${parts.hour}:${parts.minute}`, sendTime, sendTime);
  assert.strictEqual(kolkataDate(next) < '2026-11-02', false);
}

const morning = schedule('09:00');
const duringPause = nextRunAt(morning, new Date('2026-10-28T10:00:00+05:30'));
assert.strictEqual(kolkataDate(duringPause), '2026-10-29');
const resumed = firstRunAfterPause(morning);
assert.notStrictEqual(kolkataDate(resumed), '2026-10-29');
assert.notStrictEqual(kolkataDate(resumed), '2026-11-01');

const weekly = { ...morning, frequency: 'WEEKLY', dayOfWeek: 0, sendTime: '09:00' };
const sunday = firstRunAfterPause(weekly);
assert.strictEqual(kolkataDate(sunday), '2026-11-08');

const project = nextRunAt({ frequency: 'DAILY', status: 'ACTIVE', sendTime: '09:00', timezone: 'Asia/Kolkata' }, new Date('2026-10-27T08:00:00+05:30'));
assert.strictEqual(kolkataDate(project), '2026-10-27');

console.log('Daily Work email pause checks passed.');
