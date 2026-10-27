export const REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

export function formatStamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function receiptLabel(receipt) {
  if (receipt === 'read') return 'Read';
  if (receipt === 'delivered') return 'Delivered';
  if (receipt === 'sent') return 'Sent';
  return '';
}

export function isImageName(name) {
  return /\.(png|jpe?g|webp)$/i.test(name || '');
}

export function presenceLabel(status, lastSeen) {
  if (status === 'ONLINE') return 'Online';
  if (status === 'IDLE') return 'Away';
  if (lastSeen) return `Last seen ${formatStamp(lastSeen)}`;
  return 'Offline';
}
