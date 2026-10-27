const ZONE = 'Asia/Kolkata';
const RESUME_ON = '2026-11-02';
const PAUSE_MESSAGE = 'Daily Work Update emails are paused until 2 November 2026. No message was sent.';

function kolkataDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function dailyWorkEmailsPaused(date = new Date()) {
  return kolkataDate(date) < RESUME_ON;
}

function wallToUtc(year, month, day, hour, minute, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (shown - guess));
}

function nextRunAt(input, after = new Date()) {
  if (!input || input.frequency === 'MANUAL' || input.status === 'PAUSED' || input.status === 'DRAFT') return null;
  const [hour, minute] = String(input.sendTime || '09:00').split(':').map(Number);
  const zone = input.timezone || ZONE;
  for (let offset = 0; offset < 370; offset += 1) {
    const probe = new Date(after.getTime() + offset * 86400000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: zone, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(probe).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
    const day = Number(parts.day);
    if ((input.frequency === 'WEEKLY' || input.frequency === 'CUSTOM') && weekday !== Number(input.dayOfWeek ?? 1)) continue;
    if (input.frequency === 'MONTHLY' && day !== Number(input.dayOfMonth || 1)) continue;
    const instant = wallToUtc(Number(parts.year), Number(parts.month), day, hour || 9, minute || 0, zone);
    if (instant > after) return instant;
  }
  return null;
}

function firstRunAfterPause(report) {
  const resume = new Date(`${RESUME_ON}T00:00:00+05:30`);
  return nextRunAt(report, new Date(resume.getTime() - 1));
}

module.exports = {
  ZONE,
  RESUME_ON,
  PAUSE_MESSAGE,
  kolkataDate,
  dailyWorkEmailsPaused,
  nextRunAt,
  firstRunAfterPause,
};
