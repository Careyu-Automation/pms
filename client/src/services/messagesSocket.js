import { api, socketUrl } from './api';

const listeners = new Set();
let socket = null;
let retry = null;
let attempts = 0;
let connecting = false;

function url() {
  return socketUrl();
}

function scheduleRetry() {
  clearTimeout(retry);
  attempts += 1;
  if (attempts > 3) return;
  const delay = [1000, 3000, 5000][attempts - 1] || 5000;
  retry = setTimeout(connectMessages, delay);
}

export function messageConnection() {
  return socket?.readyState === 1 ? 'connected' : 'reconnecting';
}

export async function connectMessages() {
  if (connecting || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
  connecting = true;
  let target = url();
  let ticket = '';
  try {
    const payload = await api('/auth/realtime-ticket');
    ticket = payload?.data?.ticket || '';
    if (payload?.data?.url) target = payload.data.url;
  } catch {
    connecting = false;
    scheduleRetry();
    return;
  }
  const joiner = target.includes('?') ? '&' : '?';
  socket = new WebSocket(ticket ? `${target}${joiner}ticket=${encodeURIComponent(ticket)}` : target);
  connecting = false;
  socket.onopen = () => {
    attempts = 0;
    listeners.forEach((fn) => fn({ type: 'connection', state: 'connected' }));
  };
  socket.onclose = () => {
    listeners.forEach((fn) => fn({ type: 'connection', state: 'reconnecting' }));
    scheduleRetry();
  };
  socket.onerror = () => socket?.close();
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      listeners.forEach((fn) => fn(data));
      if (['message', 'forum', 'read'].includes(data.type)) window.dispatchEvent(new Event('messages:unread'));
    } catch {
      // Ignore malformed socket frames.
    }
  };
}

export function onMessageEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function sendSocket(payload) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(payload));
}
