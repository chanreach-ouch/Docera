import { ArrowUpRight, BookOpen, Layers, Search, Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { matchingGroups } from './tools';
import { UploadArea } from './UploadArea';
import { RecentDocuments } from './RecentDocuments';
import type { SessionInfo } from '../../types/files';

export function Dashboard({ session }: { session: SessionInfo }) {
  const [search, setSearch] = useState('');
  const groups = matchingGroups(search);
  return <div className="dashboard">
    <header className="workspace-header"><span>Personal workspace</span><span className="session-label"><span className="status-dot" />Local session</span></header>
    <div className="dashboard-content">
      <div className="page-heading"><h1>Good work starts here.</h1><p>A little less document admin. A little more getting things done.</p></div>
      <UploadArea session={session} />
      <section className="quick-access" aria-label="Available tools">
        <div>
          <h2>Ready when you are</h2>
          <p>Start locally in your browser or open dedicated server-backed workflows.</p>
        </div>
        <div className="prop-row">
          <button className="viewer-shortcut" onClick={() => document.getElementById('browse-files')?.focus()}>
            <BookOpen size={22} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>PDF viewer</strong><span>Open, search & read</span></span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </button>
          <Link className="viewer-shortcut" to="/tools/organize">
            <Layers size={22} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>Organize PDF</strong><span>Merge, split & reorder</span></span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link className="viewer-shortcut" to="/tools/customize">
            <Sparkles size={22} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>Customize PDF</strong><span>Watermarks, numbers & crop</span></span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
          <Link className="viewer-shortcut" to="/tools/security">
            <Shield size={22} strokeWidth={1.5} aria-hidden="true" />
            <span><strong>Protect & Redact</strong><span>Encrypt & scrub metadata</span></span>
            <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </section>
      <RecentDocuments />
      <section id="tools" className="tools-section" aria-labelledby="tools-heading">
        <div className="section-heading">
          <div>
            <h2 id="tools-heading">A place for every document task</h2>
            <p className="section-description">Choose a workflow below. Local tools stay inside your browser; server tools note when files upload to this session.</p>
          </div>
          <label className="tool-search">
            <Search size={17} aria-hidden="true" />
            <input type="search" placeholder="Find a tool…" aria-label="Search tools" value={search} onChange={event => setSearch(event.target.value)} />
          </label>
        </div>
        {!groups.length && <p className="empty-state" role="status">No tools match “{search}”. Try a different search.</p>}
        <div className="tool-directory">
          {groups.map(group => <details key={group.name} className="tool-group" open={!!search || undefined}>
            <summary>
              <span><strong>{group.name}</strong><span>{group.description}</span></span>
              <span className="badge available">Ready</span>
            </summary>
            <ul>
              {group.tools.map(tool => <li key={tool.label}>
                <span>{tool.label} <span className="muted">· {tool.execution}</span></span>
                {tool.to === '#browse'
                  ? <button className="text-link" onClick={() => document.getElementById('browse-files')?.click()}>Open PDF <ArrowUpRight size={14} aria-hidden="true" /></button>
                  : <Link className="text-link" to={tool.to}>Open tool <ArrowUpRight size={14} aria-hidden="true" /></Link>}
              </li>)}
            </ul>
          </details>)}
        </div>
      </section>
      <footer className="workspace-footer"><span>Made for the work in your documents.</span><span>Docera · Production workspace</span></footer>
    </div>
  </div>;
}
