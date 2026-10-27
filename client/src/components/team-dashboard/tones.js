export function contributionTone(level) {
  if (level === 'Primary' || level === 'Major') return 'progress';
  return 'neutral';
}
