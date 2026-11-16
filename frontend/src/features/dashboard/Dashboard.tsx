import { Check, Search, X } from 'lucide-react';
import { useState } from 'react';
import { matchingGroups } from './tools';
import { ToolIcon } from './ToolIcon';
import { UploadArea } from './UploadArea';
import { HeroIllustration } from './HeroIllustration';
import { PopularTools } from './PopularTools';
import { RecentDocuments } from './RecentDocuments';
import { PromoCard } from './PromoCard';
import type { SessionInfo } from '../../types/files';

export function Dashboard({ session }: { session: SessionInfo }) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const allGroups = matchingGroups(search);

  const filteredGroups = activeCategory === 'all'
    ? allGroups
    : allGroups.filter(g => g.id === activeCategory);

  return (
    <div className="approved-dashboard">
      {/* Hero Section */}
      <section className="approved-hero-section" aria-label="Hero Introduction">
        <div className="hero-left-col">
          <h1 className="hero-main-title">
            All-in-one PDF solution for work and productivity
            <span className="visually-hidden"> Good work starts here.</span>
          </h1>
          <p className="hero-subtitle">
            Edit, convert, compress, merge, sign, and more — fast, secure, and free.
          </p>
          <ul className="hero-check-list">
            <li>
              <span className="hero-check-icon">
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span>Professional editing</span>
            </li>
            <li>
              <span className="hero-check-icon">
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span>Full Khmer &amp; English support</span>
            </li>
            <li>
              <span className="hero-check-icon">
                <Check size={16} strokeWidth={2.5} aria-hidden="true" />
              </span>
              <span>Your files stay private and secure</span>
            </li>
          </ul>
        </div>

        <div className="hero-center-col">
          <UploadArea session={session} />
        </div>

        <div className="hero-right-col">
          <HeroIllustration />
        </div>
      </section>

      {/* Popular Tools & Overview (Visible when not actively searching) */}
      {!search && (
        <>
          <PopularTools />

          {/* Two-Column Bottom Section: Recent Documents + Promo Card */}
          <section className="dashboard-bottom-split" aria-label="Recent documents and overview">
            <div className="split-left-col">
              <RecentDocuments />
            </div>
            <div className="split-right-col">
              <PromoCard />
            </div>
          </section>
        </>
      )}

      {/* Complete Searchable Tool Directory */}
      <section id="tools" className="tools-directory-section" aria-labelledby="tools-heading">
        <div className="directory-header">
          <div>
            <h2 id="tools-heading" className="directory-title">All Document Tools</h2>
            <p className="directory-desc">
              All 34 production-ready PDF utilities. Local tools execute 100% inside your browser.
            </p>
          </div>
          <div className="directory-search-wrap">
            <label className="directory-search-label">
              <Search size={16} aria-hidden="true" />
              <input
                id="search-tools"
                type="search"
                placeholder="Search tools (e.g. merge, edit, compress)…"
                aria-label="Search tools"
                value={search}
                onChange={event => setSearch(event.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Category Pills */}
        <div className="category-pill-bar" role="tablist" aria-label="Tool Categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'all'}
            className={`category-pill ${activeCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
          >
            All Categories ({allGroups.reduce((acc, g) => acc + g.tools.length, 0)})
          </button>
          {allGroups.map(group => (
            <button
              key={group.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === group.id}
              className={`category-pill ${activeCategory === group.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(group.id)}
            >
              {group.name} ({group.tools.length})
            </button>
          ))}
        </div>

        {filteredGroups.length === 0 ? (
          <div className="empty-tools-state">
            <p>No tools matched “{search}”.</p>
            <button type="button" className="button quiet" onClick={() => setSearch('')}>
              Clear search filter
            </button>
          </div>
        ) : (
          <div className="tool-category-grid">
            {filteredGroups.map(group => (
              <div key={group.id} className="category-deck-card">
                <div className="deck-header">
                  <h3 className="deck-title">{group.name}</h3>
                  <span className="deck-count">{group.tools.length} tools</span>
                </div>
                <p className="deck-description">{group.description}</p>
                <ul className="deck-tool-list">
                  {group.tools.map(tool => (
                    <li key={tool.id} className="deck-tool-item">
                      <a
                        href={tool.to}
                        className="deck-tool-link"
                        title={tool.description}
                      >
                        <div className="deck-tool-icon-col">
                          <ToolIcon name={tool.icon} />
                        </div>
                        <div className="deck-tool-text-col">
                          <div className="deck-tool-name-row">
                            <span className="deck-tool-name">{tool.label}</span>
                            <span className="tool-status-badge">Ready</span>
                          </div>
                          <span className="deck-tool-desc">{tool.description}</span>
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
