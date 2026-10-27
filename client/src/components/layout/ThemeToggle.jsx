import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { saveMySettings } from '../../services/settings.service';
import { Tooltip } from '../ui/Tooltip';

export function ThemeToggle() {
  const { user } = useAuth();
  const { theme, setThemeMode } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  const choose = () => {
    const next = isDark ? 'light' : 'dark';
    setThemeMode(next);
    if (!user) return;
    saveMySettings({ preferences: { appearance: { theme: next } } }).catch(() => {});
  };

  return (
    <Tooltip content={label}>
      <button
        type="button"
        className="icon-button"
        aria-label={label}
        aria-pressed={isDark}
        onClick={choose}
      >
        {isDark ? <Sun size={18} strokeWidth={1.75} aria-hidden="true" /> : <Moon size={18} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </Tooltip>
  );
}
