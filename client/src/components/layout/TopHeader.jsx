import { Link } from 'react-router-dom';
import { Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { usePageMeta } from '../../hooks/usePageMeta';
import { useSidebar } from '../../context/SidebarContext';
import { useMessageUnread } from '../../hooks/useMessageUnread';
import { Tooltip } from '../ui/Tooltip';
import { Breadcrumb } from './Breadcrumb';
import { NotificationMenu } from './NotificationMenu';
import { SearchField } from './SearchField';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function TopHeader() {
  const meta = usePageMeta();
  const { isMobile, collapsed, mobileOpen, toggleNavigation } = useSidebar();
  const { count: unreadCount } = useMessageUnread();
  const expanded = isMobile ? mobileOpen : !collapsed;
  const label = isMobile
    ? (mobileOpen ? 'Close navigation' : 'Open navigation')
    : (collapsed ? 'Expand sidebar' : 'Collapse sidebar');

  let ToggleIcon = PanelLeftClose;
  if (isMobile) ToggleIcon = mobileOpen ? X : Menu;
  else if (collapsed) ToggleIcon = PanelLeftOpen;

  return (
    <header className="topbar">
      <div className="topbar__start">
        <button
          id="sidebar-toggle"
          type="button"
          className="icon-button"
          aria-label={label}
          aria-expanded={expanded}
          aria-controls="app-sidebar"
          onClick={toggleNavigation}
        >
          <ToggleIcon size={18} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className="topbar__titles">
          <Breadcrumb crumbs={meta.crumbs} />
          <p className="topbar__title">{meta.title}</p>
        </div>
      </div>
      <div className="topbar__end">
        <SearchField />
        <NotificationMenu />
        <Tooltip content="Messages">
          <Link to="/messages" className="icon-button notice-trigger" aria-label={unreadCount > 0 ? `Messages, ${unreadCount} unread` : 'Messages'}>
            <MessageSquare size={18} strokeWidth={1.75} aria-hidden="true" />
            {unreadCount > 0 ? <span className="notice-dot" /> : null}
          </Link>
        </Tooltip>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
