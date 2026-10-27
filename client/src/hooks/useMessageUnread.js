import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUnreadCount } from '../services/messages.service';

/**
 * The messages API returns `{ success, data: { count } }`.
 * Older or partial payloads may be a bare number, `{ count }`, or `{ unreadCount }`.
 * @param {unknown} payload
 * @returns {number}
 */
export function normalizeUnreadCount(payload) {
  const source = payload && typeof payload === 'object' && 'data' in payload
    ? payload.data
    : payload;
  const raw = typeof source === 'number' || typeof source === 'string'
    ? source
    : (source && typeof source === 'object'
      ? (source.count ?? source.unreadCount ?? source.unread ?? 0)
      : 0);
  const count = Number(raw);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}

const subscribers = new Set();
let snapshot = { count: 0, loading: false, error: null };
let activeUserId = '';
let requestGeneration = 0;
let inflight = null;
let pollId = null;
let onUnreadEvent = null;

function emit(next) {
  snapshot = next;
  subscribers.forEach((subscriber) => subscriber(snapshot));
}

function reset(loading) {
  requestGeneration += 1;
  inflight = null;
  emit({ count: 0, loading, error: null });
}

/**
 * Server count is authoritative. Socket events and the poll call this;
 * they never increment a local number.
 */
function refresh() {
  const userId = activeUserId;
  if (!userId) {
    reset(false);
    return Promise.resolve();
  }
  if (inflight) return inflight;
  const generation = requestGeneration;
  const pending = getUnreadCount()
    .then((payload) => {
      if (generation !== requestGeneration || activeUserId !== userId) return;
      emit({ count: normalizeUnreadCount(payload), loading: false, error: null });
    })
    .catch((error) => {
      if (generation !== requestGeneration || activeUserId !== userId) return;
      emit({ count: 0, loading: false, error });
    })
    .finally(() => {
      if (inflight === pending) inflight = null;
    });
  inflight = pending;
  return pending;
}

function startPolling() {
  if (onUnreadEvent) return;
  onUnreadEvent = () => {
    refresh();
  };
  window.addEventListener('messages:unread', onUnreadEvent);
  pollId = window.setInterval(onUnreadEvent, 30000);
}

function stopPolling() {
  if (onUnreadEvent) window.removeEventListener('messages:unread', onUnreadEvent);
  if (pollId !== null) window.clearInterval(pollId);
  onUnreadEvent = null;
  pollId = null;
}

/**
 * Unread messages for the signed-in user.
 * One shared request serves every sidebar row and the header icon.
 * @returns {{
 *   count: number,
 *   loading: boolean,
 *   error: Error | null,
 *   refresh: () => Promise<void>
 * }}
 */
export function useMessageUnread() {
  const { user } = useAuth();
  const userId = user?.id || '';
  const [state, setState] = useState(snapshot);

  useEffect(() => {
    subscribers.add(setState);
    setState(snapshot);

    if (!userId) {
      if (activeUserId) {
        activeUserId = '';
        stopPolling();
        reset(false);
      }
    } else {
      const userChanged = activeUserId !== userId;
      const needsFetch = userChanged || pollId === null;
      activeUserId = userId;
      if (userChanged) reset(true);
      startPolling();
      if (needsFetch) refresh();
    }

    return () => {
      subscribers.delete(setState);
      if (subscribers.size === 0) stopPolling();
    };
  }, [userId]);

  return {
    count: state.count,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}
