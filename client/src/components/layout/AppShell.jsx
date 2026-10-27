import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { applyWorkspacePreferences, loadMySettings } from '../../services/settings.service';
import { SidebarProvider, useSidebar } from '../../context/SidebarContext';
import { cx } from '../../utils/cx';
import { connectMessages, sendSocket } from '../../services/messagesSocket';
import '../../styles/messages.css';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';

function PreferenceSync() {
  const { user, status } = useAuth();
  const { setThemeMode, themeRevision } = useTheme();
  const { setCollapsed } = useSidebar();
  useEffect(() => {
    if (status !== 'ready' || !user) return undefined;
    let active = true;
    const seen = themeRevision.current;
    loadMySettings().then((payload) => {
      if (!active || themeRevision.current !== seen) return;
      const preferences = payload.data.preferences;
      applyWorkspacePreferences(preferences);
      if (preferences.appearance?.theme) setThemeMode(preferences.appearance.theme, 'sync');
      if (typeof preferences.appearance?.sidebarCollapsed === 'boolean') setCollapsed(preferences.appearance.sidebarCollapsed);
    }).catch(() => {});
    return () => { active = false; };
  }, [status, user, setThemeMode, setCollapsed, themeRevision]);
  return null;
}

function ShellFrame() {
  const { isMobile, collapsed } = useSidebar();
  useEffect(() => {
    connectMessages();
    const mark = () => sendSocket({ type: 'activity' });
    window.addEventListener('pointerdown', mark);
    const beat = setInterval(mark, 60000);
    return () => {
      window.removeEventListener('pointerdown', mark);
      clearInterval(beat);
    };
  }, []);

  return (
    <div className={cx('app-shell', !isMobile && collapsed && 'is-collapsed', isMobile && 'is-mobile')}>
      <PreferenceSync />
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Sidebar />
      <div className="app-main">
        <TopHeader />
        <main id="main-content" className="app-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <SidebarProvider>
      <ShellFrame />
    </SidebarProvider>
  );
}
