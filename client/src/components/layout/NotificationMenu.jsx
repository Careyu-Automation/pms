import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';
import { EmptyState } from '../ui/EmptyState';
import { Tooltip } from '../ui/Tooltip';
import { listNotifications, markNotificationRead } from '../../services/leave.service';

export function NotificationMenu() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);

  function refresh() {
    listNotifications()
      .then((result) => setItems(result.data.notifications || []))
      .catch(() => setItems([]));
  }

  useEffect(() => {
    refresh();
  }, []);

  const unread = items.some((item) => !item.readAt);

  async function openItem(item, close) {
    if (!item.readAt) {
      try {
        await markNotificationRead(item.id);
      } catch {
        // The list still opens the related page if marking it read fails.
      }
      setItems((current) => current.map((row) => (row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row)));
    }
    close();
    if (item.link) navigate(item.link);
  }

  return (
    <Dropdown
      label="Notifications"
      trigger={({ open, toggle, menuId }) => (
        <Tooltip content="Notifications">
          <button
            type="button"
            className="icon-button notice-trigger"
            aria-label={unread ? 'Notifications, unread' : 'Notifications'}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={() => {
              refresh();
              toggle();
            }}
          >
            <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
            {unread ? <span className="notice-dot" /> : null}
          </button>
        </Tooltip>
      )}
    >
      {({ close }) => (
        <div className="menu-panel">
          <p className="menu-panel__title">Notifications</p>
          {items.length ? (
            <div className="notice-list">
              {items.map((item) => (
                <button key={item.id} type="button" role="menuitem" className={item.readAt ? '' : 'is-unread'} onClick={() => openItem(item, close)}>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Bell} title="No notifications" description="Approvals and leave updates will show up here." />
          )}
        </div>
      )}
    </Dropdown>
  );
}
