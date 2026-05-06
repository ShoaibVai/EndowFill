import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  return (
    <div
      className="flex items-center gap-1 rounded-lg border px-1 py-1"
      style={{ borderColor: 'var(--color-surface-200)', background: 'var(--color-surface-0)' }}
      role="group"
      aria-label="Theme selection"
    >
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${theme === 'light' ? 'badge-brand' : ''}`}
        onClick={() => setTheme('light')}
        aria-pressed={theme === 'light'}
        aria-label="Use light theme"
        title="Light"
      >
        <Sun className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${theme === 'dark' ? 'badge-brand' : ''}`}
        onClick={() => setTheme('dark')}
        aria-pressed={theme === 'dark'}
        aria-label="Use dark theme"
        title="Dark"
      >
        <Moon className="w-4 h-4" />
      </button>
      <button
        type="button"
        className={`btn btn-ghost btn-sm ${theme === 'system' ? 'badge-brand' : ''}`}
        onClick={() => setTheme('system')}
        aria-pressed={theme === 'system'}
        aria-label="Use system theme"
        title="System"
      >
        <Monitor className="w-4 h-4" />
      </button>
    </div>
  );
}
