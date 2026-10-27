import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { navigation } from '../../routes/navigation';
import { useSidebar } from '../../context/SidebarContext';
import { Brand } from '../common/Brand';
import { SidebarSection } from './SidebarSection';

export function Sidebar() {
  const location = useLocation();
  const sidebarRef = useRef(null);
  const {
    isMobile,
    collapsed,
    mobileOpen,
    sections,
    toggleNavigation,
    closeMobile,
    toggleSection,
  } = useSidebar();

  useEffect(() => {
    closeMobile();
  }, [location.pathname, closeMobile]);

  const drawerClosed = isMobile && !mobileOpen;

  useEffect(() => {
    const node = sidebarRef.current;
    if (!node) return undefined;
    if (drawerClosed) node.setAttribute('inert', '');
    else node.removeAttribute('inert');
    return undefined;
  }, [drawerClosed]);

  useEffect(() => {
    if (!isMobile || !mobileOpen) return undefined;
    sidebarRef.current?.querySelector('a, button')?.focus();
    return () => {
      document.getElementById('sidebar-toggle')?.focus();
    };
  }, [isMobile, mobileOpen]);

  return (
    <>
      {isMobile && mobileOpen ? (
        <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={closeMobile} />
      ) : null}
      <aside
        id="app-sidebar"
        ref={sidebarRef}
        className={mobileOpen ? 'sidebar is-open' : 'sidebar'}
        aria-label="Primary"
        aria-hidden={drawerClosed ? true : undefined}
      >
        <div className="sidebar__brand">
          <Link to="/dashboard" className="brand-link" onClick={closeMobile}>
            <Brand compact={collapsed} />
          </Link>
        </div>
        <nav className="sidebar__nav">
          {navigation.map((group, index) => (
            <SidebarSection
              key={group.id}
              group={group}
              open={Boolean(sections[group.id])}
              collapsed={collapsed}
              showDivider={collapsed && index > 0}
              onToggle={toggleSection}
              onNavigate={closeMobile}
            />
          ))}
        </nav>
        <div className="sidebar__footer">
          <button
            type="button"
            className="sidebar__collapse"
            title={collapsed ? 'Expand sidebar' : undefined}
            aria-label={collapsed ? 'Expand sidebar' : undefined}
            onClick={toggleNavigation}
          >
            {collapsed
              ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden="true" />
              : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden="true" />}
            <span className={collapsed ? 'sr-only' : 'sidebar__label'}>
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
