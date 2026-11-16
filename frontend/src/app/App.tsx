import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import {
  Clock3, FileCheck2, FileOutput, FolderKanban, Grid2X2, Layers, LayoutDashboard,
  Minimize2, ScanText, Settings2, ShieldCheck, Shield, Sparkles,
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ErrorNotice } from '../components/ErrorNotice';
import { ThemeToggle } from '../components/ThemeToggle';
import { Dashboard } from '../features/dashboard/Dashboard';
import { api } from '../services/api';
import { fileSize } from '../services/format';
import type { SessionInfo } from '../types/files';

const PdfViewer = lazy(() => import('../features/pdf-viewer/PdfViewer'));
const PdfEditor = lazy(() => import('../features/editor/PdfEditor'));
const OrganizeWorkspace = lazy(() => import('../features/organize/OrganizeWorkspace').then(m => ({ default: m.OrganizeWorkspace })));
const CustomizeWorkspace = lazy(() => import('../features/customize/CustomizeWorkspace').then(m => ({ default: m.CustomizeWorkspace })));
const CompressWorkspace = lazy(() => import('../features/compress/CompressWorkspace').then(m => ({ default: m.CompressWorkspace })));
const ConvertWorkspace = lazy(() => import('../features/convert/ConvertWorkspace').then(m => ({ default: m.ConvertWorkspace })));
const OcrWorkspace = lazy(() => import('../features/ocr/OcrWorkspace').then(m => ({ default: m.OcrWorkspace })));
const FormsSignWorkspace = lazy(() => import('../features/forms-sign/FormsSignWorkspace').then(m => ({ default: m.FormsSignWorkspace })));
const SecurityWorkspace = lazy(() => import('../features/security/SecurityWorkspace').then(m => ({ default: m.SecurityWorkspace })));
const BatchWorkspace = lazy(() => import('../features/batch/BatchWorkspace').then(m => ({ default: m.BatchWorkspace })));

function Settings({ session }: { session: SessionInfo }) {
  return <main id="main-content" className="settings-page">
    <Link className="text-link" to="/">← Workspace</Link>
    <h1>Workspace settings</h1>
    <p>This local workspace uses limits configured by the person running Docera.</p>
    <dl className="settings-list">
      <div><dt>File retention</dt><dd>{session.retention_seconds / 3600} hours from upload</dd></div>
      <div><dt>Maximum PDF size</dt><dd>{fileSize(session.max_upload_bytes)}</dd></div>
      <div><dt>Maximum page count</dt><dd>{session.max_pages}</dd></div>
      <div><dt>Session storage</dt><dd>{fileSize(session.session_quota_bytes)} · up to {session.max_session_files} files</dd></div>
      <div><dt>Access</dt><dd>This browser session only</dd></div>
    </dl>
    <h2>Your originals stay intact.</h2>
    <p>Previewing, searching, and rotating in the viewer do not alter uploaded originals. Local browser tools (merge, split, organize, edit overlays, customize) export new files directly in your browser without uploading private changes unless you save them. Server tools note explicitly when documents are processed in this session.</p>
  </main>;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Sidebar navigation">
        <div className="sidebar-brand-wrap">
          <Brand />
          <span className="sidebar-tag">WORKSPACE</span>
        </div>
        <nav aria-label="Main navigation">
          <div className="nav-section-title">Overview</div>
          <NavLink to="/" end>
            <LayoutDashboard size={18} aria-hidden="true" />
            <span>Workspace</span>
          </NavLink>
          <Link to="/#tools">
            <Grid2X2 size={18} aria-hidden="true" />
            <span>All Tools</span>
          </Link>
          <Link to="/#recent">
            <Clock3 size={18} aria-hidden="true" />
            <span>Recent Documents</span>
          </Link>

          <div className="nav-section-title">Document Tools</div>
          <NavLink to="/tools/organize">
            <Layers size={18} aria-hidden="true" />
            <span>Organize PDF</span>
          </NavLink>
          <NavLink to="/tools/customize">
            <Sparkles size={18} aria-hidden="true" />
            <span>Customize</span>
          </NavLink>
          <NavLink to="/tools/compress">
            <Minimize2 size={18} aria-hidden="true" />
            <span>Compress</span>
          </NavLink>
          <NavLink to="/tools/convert">
            <FileOutput size={18} aria-hidden="true" />
            <span>Convert</span>
          </NavLink>
          <NavLink to="/tools/ocr">
            <ScanText size={18} aria-hidden="true" />
            <span>OCR PDF</span>
          </NavLink>
          <NavLink to="/tools/forms-sign">
            <FileCheck2 size={18} aria-hidden="true" />
            <span>Forms & Sign</span>
          </NavLink>
          <NavLink to="/tools/security">
            <Shield size={18} aria-hidden="true" />
            <span>Protect & Redact</span>
          </NavLink>
          <NavLink to="/tools/batch">
            <FolderKanban size={18} aria-hidden="true" />
            <span>Batch Processing</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-theme-wrap">
            <ThemeToggle />
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} strokeWidth={1.5} aria-hidden="true" />
            <div>
              <strong>Private & Secure</strong>
              <p>In-browser execution with automatic session cleanup.</p>
            </div>
          </div>
          <NavLink to="/settings" className="settings-link">
            <Settings2 size={18} aria-hidden="true" />
            <span>Settings</span>
          </NavLink>
          <span className="release-label">Docera · v1.0.0</span>
        </div>
      </aside>
      {children}
    </div>
  );
}

function ToolRoute({ children }: { children: React.ReactNode }) {
  return <Shell><main id="main-content"><Suspense fallback={<div className="boot-state" role="status">Loading tool…</div>}>{children}</Suspense></main></Shell>;
}

export function App() {
  const session = useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: 5 * 60 * 1000 });
  const location = useLocation();
  useEffect(() => {
    if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
    else window.scrollTo(0, 0);
  }, [location]);
  if (session.isPending) return <div className="boot-state" role="status"><Brand /><p>Opening your workspace…</p></div>;
  if (session.error) return <div className="boot-state"><Brand /><h1>Let’s reconnect your workspace.</h1><ErrorNotice error={session.error} onRetry={() => void session.refetch()} /></div>;
  return <><a className="skip-link" href="#main-content">Skip to content</a><Routes>
    <Route path="/documents/:id" element={<main id="main-content"><Suspense fallback={<div className="boot-state" role="status">Loading PDF viewer…</div>}><PdfViewer /></Suspense></main>} />
    <Route path="/documents/:id/edit" element={<main id="main-content"><Suspense fallback={<div className="boot-state" role="status">Loading PDF editor…</div>}><PdfEditor /></Suspense></main>} />
    <Route path="/" element={<Shell><main id="main-content"><Dashboard session={session.data} /></main></Shell>} />
    <Route path="/tools/organize" element={<ToolRoute><OrganizeWorkspace /></ToolRoute>} />
    <Route path="/tools/customize" element={<ToolRoute><CustomizeWorkspace /></ToolRoute>} />
    <Route path="/tools/compress" element={<ToolRoute><CompressWorkspace /></ToolRoute>} />
    <Route path="/tools/convert" element={<ToolRoute><ConvertWorkspace /></ToolRoute>} />
    <Route path="/tools/ocr" element={<ToolRoute><OcrWorkspace /></ToolRoute>} />
    <Route path="/tools/forms-sign" element={<ToolRoute><FormsSignWorkspace /></ToolRoute>} />
    <Route path="/tools/security" element={<ToolRoute><SecurityWorkspace /></ToolRoute>} />
    <Route path="/tools/batch" element={<ToolRoute><BatchWorkspace /></ToolRoute>} />
    <Route path="/settings" element={<Shell><Settings session={session.data} /></Shell>} />
    <Route path="*" element={<div className="boot-state"><h1>Page not found</h1><Link to="/">Back to your workspace</Link></div>} />
  </Routes></>;
}
