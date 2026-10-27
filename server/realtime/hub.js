const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');
const { WebSocketServer } = require('ws');
const env = require('../config/env');
const { readAuthToken } = require('../utils/cookies');
const userRepository = require('../db/user.repository');
const repository = require('../db/messages.repository');

const IDLE_MS = 5 * 60 * 1000;
const sockets = new Map();
const viewing = new Map();
const idleTimers = new Map();

function onlineIds() {
  return [...sockets.keys()];
}

function isOnline(userId) {
  return Boolean(sockets.get(userId)?.size);
}

function send(userId, payload) {
  const group = sockets.get(userId);
  if (!group) return 0;
  const text = JSON.stringify(payload);
  let sent = 0;
  group.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(text);
      sent += 1;
    }
  });
  return sent;
}

function sendMany(userIds, payload) {
  [...new Set(userIds)].forEach((userId) => send(userId, payload));
}

function isViewing(userId, conversationId) {
  return viewing.get(userId) === conversationId;
}

async function setStatus(userId, status) {
  await repository.upsertPresence(userId, status);
  const rows = await repository.presenceRows();
  const person = rows.find((row) => row.id === userId);
  sendMany(onlineIds(), { type: 'presence', person: person || { id: userId, status } });
}

function bumpIdle(userId) {
  clearTimeout(idleTimers.get(userId));
  idleTimers.set(userId, setTimeout(() => {
    if (isOnline(userId)) setStatus(userId, 'IDLE').catch(() => {});
  }, IDLE_MS));
}

function verifySocket(request) {
  const ticket = new URL(request.url, 'http://localhost').searchParams.get('ticket');
  if (ticket) {
    return jwt.verify(ticket, env.jwtSecret, { issuer: 'careyu-pms', audience: 'careyu-pms-ws' });
  }
  const token = readAuthToken(request);
  if (!token) return null;
  return jwt.verify(token, env.jwtSecret, { issuer: 'careyu-pms', audience: 'careyu-pms-client' });
}

function attach(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (socket, request) => {
    let user = null;
    try {
      const payload = verifySocket(request);
      if (!payload) {
        socket.close(4401, 'Authentication required');
        return;
      }
      const row = await userRepository.findById(payload.sub);
      if (!row || !row.is_active) {
        socket.close(4401, 'Authentication required');
        return;
      }
      user = { id: row.id, name: row.full_name };
    } catch {
      socket.close(4401, 'Authentication required');
      return;
    }

    const group = sockets.get(user.id) || new Set();
    group.add(socket);
    sockets.set(user.id, group);
    try {
      await setStatus(user.id, 'ONLINE');
    } catch (error) {
      logger.error('presence_failed', { code: error.code });
    }
    bumpIdle(user.id);
    socket.send(JSON.stringify({ type: 'connected' }));

    socket.on('message', (raw) => {
      let event = null;
      try { event = JSON.parse(String(raw)); } catch { event = null; }
      if (!event || typeof event.type !== 'string') return;
      if (event.type === 'activity') {
        bumpIdle(user.id);
        setStatus(user.id, 'ONLINE').catch(() => {});
        return;
      }
      if (event.type === 'viewing') {
        viewing.set(user.id, event.conversationId || '');
        return;
      }
      if (event.type === 'typing' && event.conversationId) {
        repository.memberIds(event.conversationId).then((ids) => {
          if (!ids.includes(user.id)) return;
          sendMany(ids.filter((id) => id !== user.id), {
            type: 'typing',
            conversationId: event.conversationId,
            userId: user.id,
            name: user.name,
            active: Boolean(event.active),
          });
        }).catch(() => {});
      }
    });

    const close = async () => {
      const current = sockets.get(user.id);
      if (current) {
        current.delete(socket);
        if (!current.size) sockets.delete(user.id);
      }
      viewing.delete(user.id);
      if (!isOnline(user.id)) {
        clearTimeout(idleTimers.get(user.id));
        await setStatus(user.id, 'OFFLINE');
      }
    };
    socket.on('close', () => { close().catch(() => {}); });
    socket.on('error', () => { close().catch(() => {}); });
  });
  return wss;
}

module.exports = { attach, send, sendMany, isOnline, onlineIds, isViewing };
