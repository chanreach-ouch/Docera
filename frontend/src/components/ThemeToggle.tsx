import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark';

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') return 'light';
    try {
      const saved = localStorage.getItem('docera-theme');
      if (saved === 'light' || saved === 'dark') return saved;
      if (typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {
      // fallback
    }
    return 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('docera-theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  function toggle() {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggle}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      {theme === 'light' ? (
        <>
          <Moon size={15} aria-hidden="true" />
          <span className="theme-toggle-label">Dark</span>
        </>
      ) : (
        <>
          <Sun size={15} aria-hidden="true" />
          <span className="theme-toggle-label">Light</span>
        </>
      )}
    </button>
  );
}
