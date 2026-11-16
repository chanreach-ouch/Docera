import { ArrowUpRight, BookOpen, Layers, Search, Shield, Sparkles, X, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { matchingGroups } from './tools';
import { ToolIcon } from './ToolIcon';
import { UploadArea } from './UploadArea';
import { RecentDocuments } from './RecentDocuments';
import { ThemeToggle } from '../../components/ThemeToggle';
import type { SessionInfo } from '../../types/files';

export function Dashboard({ session }: { session: SessionInfo }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const allGroups = matchingGroups(search);

  const filteredGroups = activeCategory === 'all'
    ? allGroups
    : allGroups.filter(g => g.id === activeCategory);

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <div className="workspace-header-info">
          <span className="workspace-badge-pill">
            <CheckCircle2 size={13} className="text-forest" aria-hidden="true" />
            <span>Personal Workspace</span>
          </span>
          <span className="session-label">
            <span className="status-dot" />
            Local session active
          </span>
        </div>
        <div className="workspace-header-actions">
          <ThemeToggle />
          <Link to="/settings" className="header-link" title="Workspace limits & settings">
            Settings
          </Link>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="page-heading">
          <div className="page-heading-tag">
            <span className="badge-dot" /> Enterprise-Grade PDF Suite
          </div>
          <h1>Good work starts here.</h1>
          <p>World-class PDF engineering. Direct on-page text editing with authentic Khmer & English typography, instant lossless page organizing, and zero-storage private workflows.</p>
          <div className="hero-feature-pills">
            <span className="feature-pill">⚡ Direct In-Document Caret</span>
            <span className="feature-pill">🇰🇭 HarfBuzz Khmer OpenType</span>
            <span className="feature-pill">🔒 100% Client-Side Privacy</span>
            <span className="feature-pill">🚀 34 Production Tools</span>
          </div>
        </div>

        <UploadArea session={session} />

        <section className="quick-access" aria-label="Available tools">
          <div className="section-title-wrap">
            <h2>Popular Workflows</h2>
            <p>Immediate in-browser execution with zero upload latency.</p>
          </div>
          <div className="quick-access-grid">
            <button className="viewer-shortcut" onClick={() => document.getElementById('browse-files')?.click()}>
              <div className="shortcut-icon-box"><BookOpen size={22} strokeWidth={1.8} aria-hidden="true" /></div>
              <span className="shortcut-meta">
                <strong>Edit Existing PDF</strong>
                <span>Direct on-page text & shapes</span>
              </span>
              <ArrowUpRight size={16} className="shortcut-arrow" aria-hidden="true" />
            </button>
            <Link className="viewer-shortcut" to="/tools/organize">
              <div className="shortcut-icon-box"><Layers size={22} strokeWidth={1.8} aria-hidden="true" /></div>
              <span className="shortcut-meta">
                <strong>Organize PDF</strong>
                <span>Merge, split & reorder</span>
              </span>
              <ArrowUpRight size={16} className="shortcut-arrow" aria-hidden="true" />
            </Link>
            <Link className="viewer-shortcut" to="/tools/customize">
              <div className="shortcut-icon-box"><Sparkles size={22} strokeWidth={1.8} aria-hidden="true" /></div>
              <span className="shortcut-meta">
                <strong>Customize PDF</strong>
                <span>Watermarks, numbers & crop</span>
              </span>
              <ArrowUpRight size={16} className="shortcut-arrow" aria-hidden="true" />
            </Link>
            <Link className="viewer-shortcut" to="/tools/security">
              <div className="shortcut-icon-box"><Shield size={22} strokeWidth={1.8} aria-hidden="true" /></div>
              <span className="shortcut-meta">
                <strong>Protect & Redact</strong>
                <span>Encrypt & scrub metadata</span>
              </span>
              <ArrowUpRight size={16} className="shortcut-arrow" aria-hidden="true" />
            </Link>
          </div>
        </section>

        <RecentDocuments />

        <section id="tools" className="tools-section" aria-labelledby="tools-heading">
          <div className="section-heading">
            <div>
              <h2 id="tools-heading">A place for every document task</h2>
              <p className="section-description">
                Choose a workflow below. Local tools stay inside your browser; server tools note when files upload to this session.
              </p>
            </div>
            <div className="tool-search-wrap">
              <label className="tool-search">
                <Search size={16} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Find a tool (e.g. merge, edit, ocr)…"
                  aria-label="Search tools"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                />
                {search && (
                  <button
                    type="button"
                    className="tool-search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
            </div>
          </div>

          {!search && (
            <div className="category-filter-bar" role="tablist" aria-label="Tool categories">
              <button
                type="button"
                role="tab"
                aria-selected={activeCategory === 'all'}
                className={`category-chip ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All Tools
              </button>
              {allGroups.map(g => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={activeCategory === g.id}
                  className={`category-chip ${activeCategory === g.id ? 'active' : ''}`}
                  onClick={() => setActiveCategory(g.id)}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}

          {!filteredGroups.length && (
            <div className="empty-state-card" role="status">
              <Search size={28} className="empty-state-icon" aria-hidden="true" />
              <h3>No matching tools found</h3>
              <p>No tools match “{search}”. Try searching for “edit”, “merge”, “split”, or “convert”.</p>
              <button className="button secondary small" onClick={() => setSearch('')}>
                Clear search filter
              </button>
            </div>
          )}

          <div className="tool-directory">
            {filteredGroups.map(group => (
              <details key={group.id} className="tool-group" open>
                <summary>
                  <span className="group-summary-header">
                    <strong>{group.name}</strong>
                    <span>{group.description}</span>
                  </span>
                  <span className="badge available">Ready</span>
                </summary>
                <ul className="tool-grid">
                  {group.tools.map(tool => (
                    <li
                      key={tool.id}
                      className="tool-card"
                      onClick={() => {
                        if (tool.to === '#browse') {
                          document.getElementById('browse-files')?.click();
                        }
                      }}
                    >
                      <div className="tool-card-header">
                        <div className={`tool-card-icon icon-group-${group.id}`}>
                          <ToolIcon name={tool.icon} size={20} />
                        </div>
                        <div className="tool-card-badges">
                          <span className={`badge ${tool.execution.toLowerCase().includes('local') ? 'badge-local' : 'badge-server'}`}>
                            {tool.execution}
                          </span>
                          <span className="badge available">Ready</span>
                        </div>
                      </div>
                      <div className="tool-card-body">
                        <strong>{tool.label}</strong>
                        <p>{tool.description}</p>
                      </div>
                      <div className="tool-card-footer">
                        {tool.to === '#browse' ? (
                          <button
                            type="button"
                            className="text-link tool-action-link"
                            onClick={e => {
                              e.stopPropagation();
                              document.getElementById('browse-files')?.click();
                            }}
                          >
                            Open PDF <ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                        ) : (
                          <Link
                            className="text-link tool-action-link"
                            to={tool.to}
                            onClick={e => e.stopPropagation()}
                          >
                            Open tool <ArrowUpRight size={14} aria-hidden="true" />
                          </Link>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>

        <footer className="workspace-footer">
          <span>Made for the work in your documents.</span>
          <span>Docera · Production workspace</span>
        </footer>
      </div>
    </div>
  );
}
