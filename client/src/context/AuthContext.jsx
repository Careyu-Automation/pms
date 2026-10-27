import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authService from '../services/auth.service';

const AuthContext = createContext(null);

let bootPromise = null;

function initialSession() {
  if (!bootPromise) {
    bootPromise = authService.hasSessionHint()
      ? authService.me()
      : Promise.resolve(null);
  }
  return bootPromise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');
  const [unavailable, setUnavailable] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const restore = useCallback(() => {
    setStatus('loading');
    let active = true;
    initialSession()
      .then((payload) => {
        if (!active) return;
        setUser(payload?.data?.user || null);
        setUnavailable(false);
        setSessionExpired(false);
      })
      .catch((error) => {
        if (!active) return;
        setUser(null);
        if (error.status === 0) {
          setUnavailable(true);
          return;
        }
        authService.clearSessionHint();
        bootPromise = Promise.resolve(null);
        setUnavailable(false);
        setSessionExpired(error.status === 401);
      })
      .finally(() => {
        if (active) setStatus('ready');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => restore(), [restore]);

  const retry = useCallback(() => {
    bootPromise = null;
    restore();
  }, [restore]);

  const login = useCallback(async (payload) => {
    const result = await authService.login(payload);
    authService.rememberSession();
    bootPromise = Promise.resolve(result);
    setUser(result.data.user);
    setUnavailable(false);
    setSessionExpired(false);
    setStatus('ready');
    return result.data.user;
  }, []);

  const signup = useCallback(async (payload) => {
    const result = await authService.signup(payload);
    return result.data.user;
  }, []);

  const refresh = useCallback(async () => {
    const payload = await authService.me();
    const next = payload?.data?.user || null;
    setUser(next);
    return next;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } finally {
      authService.clearSessionHint();
      bootPromise = Promise.resolve(null);
      setUser(null);
      setSessionExpired(false);
      setUnavailable(false);
    }
  }, []);

  const value = useMemo(() => ({
    user,
    status,
    unavailable,
    sessionExpired,
    login,
    signup,
    logout,
    refresh,
    retry,
  }), [user, status, unavailable, sessionExpired, login, signup, logout, refresh, retry]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
