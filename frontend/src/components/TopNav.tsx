import React from 'react';
import { Bell, HelpCircle, Search } from 'lucide-react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = React.useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchTerm.trim()) {
      if (location.pathname !== '/') {
        navigate(`/#tools`);
      }
      const el = document.getElementById('search-tools');
      if (el) {
        (el as HTMLInputElement).value = searchTerm;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.focus();
      }
    }
  }

  return (
    <header className="app-top-nav" aria-label="Main horizontal navigation">
      <div className="top-nav-tabs">
        <NavLink to="/" end className={({ isActive }) => `top-nav-tab ${isActive ? 'active' : ''}`}>
          Workspace
        </NavLink>
        <Link to="/#tools" className="top-nav-tab">
          All Tools
        </Link>
        <Link to="/#recent" className="top-nav-tab">
          Recent
        </Link>
        <NavLink to="/settings" className={({ isActive }) => `top-nav-tab ${isActive ? 'active' : ''}`}>
          Templates
        </NavLink>
      </div>

      <div className="top-nav-actions">
        <form className="top-nav-search" onSubmit={handleSearch} role="search">
          <Search size={16} className="search-icon" aria-hidden="true" />
          <input
            type="search"
            aria-label="Search tools, documents..."
            placeholder="Search tools, documents..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </form>

        <button
          type="button"
          className="top-nav-icon-btn"
          aria-label="Notifications"
          title="No unread notifications"
        >
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" aria-hidden="true" />
        </button>

        <Link
          to="/settings"
          className="top-nav-icon-btn"
          aria-label="Help and Documentation"
          title="Help & Support"
        >
          <HelpCircle size={18} aria-hidden="true" />
        </Link>

        <ThemeToggle />

        <div className="user-avatar" title="Docera User (Local Session)" aria-label="User avatar: DC">
          <span>DC</span>
        </div>
      </div>
    </header>
  );
}
