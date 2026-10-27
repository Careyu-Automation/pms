import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getDefaultSections } from '../routes/navigation';
import { useMediaQuery } from '../hooks/useMediaQuery';

const COLLAPSE_KEY = 'careyu.sidebar.collapsed';
const SECTION_KEY = 'careyu.sidebar.sections';
const SidebarContext = createContext(null);

function readSections() {
  const defaults = getDefaultSections();
  try {
    const stored = JSON.parse(localStorage.getItem(SECTION_KEY) || '{}');
    if (!stored || typeof stored !== 'object') return defaults;
    return { ...defaults, ...stored };
  } catch {
    return defaults;
  }
}

function readCollapsedPreference() {
  const stored = localStorage.getItem(COLLAPSE_KEY);
  if (stored === 'true') return true;
  if (stored === 'false') return false;
  return null;
}

export function SidebarProvider({ children }) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(max-width: 1199px)');
  const [collapsedPref, setCollapsedPref] = useState(readCollapsedPreference);
  const [sections, setSections] = useState(readSections);
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapsed = isMobile ? false : (collapsedPref === null ? isTablet : collapsedPref);

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  useEffect(() => {
    document.body.classList.toggle('has-overlay', isMobile && mobileOpen);
    return () => document.body.classList.remove('has-overlay');
  }, [isMobile, mobileOpen]);

  const setCollapsed = useCallback((value) => {
    if (isMobile) return;
    setCollapsedPref(Boolean(value));
    localStorage.setItem(COLLAPSE_KEY, String(Boolean(value)));
  }, [isMobile]);

  const toggleNavigation = useCallback(() => {
    if (isMobile) {
      setMobileOpen((open) => !open);
      return;
    }
    setCollapsedPref((current) => {
      const next = !(current === null ? isTablet : current);
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  }, [isMobile, isTablet]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  const toggleSection = useCallback((id) => {
    setSections((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(SECTION_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    isMobile,
    collapsed,
    mobileOpen,
    sections,
    toggleNavigation,
    setCollapsed,
    closeMobile,
    toggleSection,
  }), [isMobile, collapsed, mobileOpen, sections, toggleNavigation, setCollapsed, closeMobile, toggleSection]);

  return (
    <SidebarContext.Provider value={value}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within SidebarProvider');
  return context;
}
