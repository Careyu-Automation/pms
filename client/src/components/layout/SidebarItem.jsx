import { NavLink } from 'react-router-dom';
import { AppIcon } from '../common/icons';
import { useMessageUnread } from '../../hooks/useMessageUnread';
import { cx } from '../../utils/cx';

function badgeCount(value) {
  const numeric = typeof value === 'number' ? value : Number(value?.count ?? 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

export function SidebarItem({ item, collapsed, onNavigate }) {
  const { count } = useMessageUnread();
  const badge = item.id === 'messages' ? badgeCount(count) : 0;
  return (
    <NavLink
      to={item.path}
      end={item.path !== '/lead-pipeline' && item.path !== '/messages'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => cx('sidebar__link', isActive && 'is-active')}
      onClick={onNavigate}
    >
      <AppIcon name={item.icon} />
      <span className={collapsed ? 'sr-only' : 'sidebar__label'}>{item.label}</span>
      {badge ? <span className="msg-unread">{badge}</span> : null}
    </NavLink>
  );
}
