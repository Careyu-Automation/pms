import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { displayValue, formatDateTime } from '../../utils/format';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Dropdown } from '../ui/Dropdown';
import { Modal } from '../ui/Modal';

export function UserMenu() {
  const { user, logout } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch (error) {
      push({ tone: 'danger', message: error.message || 'Unable to sign out.' });
      setSigningOut(false);
    }
  };

  return (
    <>
      <Dropdown
        label="Account menu"
        trigger={({ open, toggle, menuId }) => (
          <button
            type="button"
            className="user-menu__trigger"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={toggle}
          >
            <Avatar name={user.fullName} size="sm" />
            <span className="user-menu__name">{user.fullName}</span>
            <ChevronDown className="user-menu__chevron" size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <div className="menu-panel__intro">
              <strong>{user.fullName}</strong>
              <span>{user.email}</span>
            </div>
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                close();
                setProfileOpen(true);
              }}
            >
              Profile
            </button>
            <Link role="menuitem" className="menu-item" to="/settings" onClick={close}>
              My Settings
            </Link>
            <Link role="menuitem" className="menu-item" to="/my-time" onClick={close}>
              My Time
            </Link>
            <Link role="menuitem" className="menu-item" to="/leave" onClick={close}>
              Leave & Permission
            </Link>
            <button
              type="button"
              role="menuitem"
              className="menu-item menu-item--danger"
              onClick={() => {
                close();
                signOut();
              }}
              disabled={signingOut}
            >
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              Logout
            </button>
          </>
        )}
      </Dropdown>

      <Modal open={profileOpen} title="Profile" onClose={() => setProfileOpen(false)}>
        <Card>
          <div className="profile-summary">
            <Avatar name={user.fullName} size="lg" />
            <div>
              <h3>{user.fullName}</h3>
              <p>{user.email}</p>
              <Badge>{user.role?.name}</Badge>
            </div>
          </div>
          <dl className="meta-list">
            <div>
              <dt>Department</dt>
              <dd>{displayValue(user.department)}</dd>
            </div>
            <div>
              <dt>Designation</dt>
              <dd>{displayValue(user.designation)}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user.role?.name || 'Not set'}</dd>
            </div>
            <div>
              <dt>Last sign in</dt>
              <dd>{formatDateTime(user.lastLoginAt)}</dd>
            </div>
          </dl>
        </Card>
      </Modal>
    </>
  );
}
