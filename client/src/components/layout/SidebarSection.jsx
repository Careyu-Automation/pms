import { ChevronDown, ChevronRight } from 'lucide-react';
import { SidebarItem } from './SidebarItem';

export function SidebarSection({ group, open, collapsed, showDivider, onToggle, onNavigate }) {
  const panelId = `sidebar-section-${group.id}`;

  return (
    <section className="sidebar__section" aria-label={group.label}>
      {collapsed ? (showDivider ? <div className="sidebar__divider" /> : null) : (
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(group.id)}
        >
          <span>{group.label}</span>
          {open
            ? <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
            : <ChevronRight size={14} strokeWidth={1.75} aria-hidden="true" />}
        </button>
      )}
      {(collapsed || open) ? (
        <div id={panelId} className="sidebar__items">
          {group.items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
