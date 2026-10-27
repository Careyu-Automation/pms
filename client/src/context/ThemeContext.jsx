import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'careyu.theme';
const ThemeContext = createContext(null);

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readMode() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'light';
}

function resolveTheme(mode) {
  return mode === 'system' ? systemTheme() : mode;
}

export function ThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(readMode);
  const [systemTick, setSystemTick] = useState(0);
  const themeRevision = useRef(0);
  const theme = themeMode === 'system' ? (systemTick >= 0 ? systemTheme() : 'light') : themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, themeMode);
  }, [theme, themeMode]);

  useEffect(() => {
    if (themeMode !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTick((value) => value + 1);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [themeMode]);

  const applyMode = (next, source) => {
    if (source !== 'sync') themeRevision.current += 1;
    setThemeModeState(next === 'dark' || next === 'system' ? next : 'light');
  };

  const value = useMemo(() => ({
    theme,
    themeMode,
    themeRevision,
    setTheme(next) {
      applyMode(next === 'dark' ? 'dark' : 'light');
    },
    setThemeMode(next, source) {
      applyMode(next, source);
    },
    toggleTheme() {
      applyMode(resolveTheme(themeMode) === 'dark' ? 'light' : 'dark');
    },
  }), [theme, themeMode]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
