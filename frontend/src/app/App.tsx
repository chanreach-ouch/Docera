import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense, useEffect } from 'react';
import {
  ArrowRightLeft, ChevronDown, Edit3, FileCheck2, Folder,
  Grid2X2, Home, Layers, Minimize2, ScanText, Scissors,
  Settings2, Shield,
} from 'lucide-react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Brand } from '../components/Brand';
import { ErrorNotice } from '../components/ErrorNotice';
import { TopNav } from '../components/TopNav';
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
        </div>
        <nav aria-label="Main navigation">
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Home size={18} aria-hidden="true" />
            <span>Workspace</span>
          </NavLink>
          <Link to="/#tools" className="nav-item">
            <Grid2X2 size={18} aria-hidden="true" />
            <span>All Tools</span>
          </Link>

          <div className="nav-section-title">TOOLS</div>

          <Link to="/#tools" className="nav-item nav-item-edit">
            <span className="nav-icon-badge badge-pink">
              <Edit3 size={15} aria-hidden="true" />
            </span>
            <span>Edit PDF</span>
          </Link>
          <NavLink to="/tools/convert" className={({ isActive }) => `nav-item nav-item-convert ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-blue">
              <ArrowRightLeft size={15} aria-hidden="true" />
            </span>
            <span>Convert PDF</span>
          </NavLink>
          <NavLink to="/tools/compress" className={({ isActive }) => `nav-item nav-item-compress ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-purple">
              <Minimize2 size={15} aria-hidden="true" />
            </span>
            <span>Compress PDF</span>
          </NavLink>
          <NavLink to="/tools/organize" className={({ isActive }) => `nav-item nav-item-organize ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-orange">
              <Layers size={15} aria-hidden="true" />
            </span>
            <span>Merge PDF</span>
          </NavLink>
          <NavLink to="/tools/organize?mode=split" className={({ isActive }) => `nav-item nav-item-split ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-red">
              <Scissors size={15} aria-hidden="true" />
            </span>
            <span>Split PDF</span>
          </NavLink>
          <NavLink to="/tools/forms-sign" className={({ isActive }) => `nav-item nav-item-sign ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-purple">
              <FileCheck2 size={15} aria-hidden="true" />
            </span>
            <span>Sign PDF</span>
          </NavLink>
          <NavLink to="/tools/security" className={({ isActive }) => `nav-item nav-item-protect ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-green">
              <Shield size={15} aria-hidden="true" />
            </span>
            <span>Protect PDF</span>
          </NavLink>
          <NavLink to="/tools/ocr" className={({ isActive }) => `nav-item nav-item-ocr ${isActive ? 'active' : ''}`}>
            <span className="nav-icon-badge badge-amber">
              <ScanText size={15} aria-hidden="true" />
            </span>
            <span>OCR (Scan to Text)</span>
          </NavLink>
          <NavLink to="/tools/customize" className="nav-item nav-item-more">
            <span className="nav-icon-badge badge-gray">
              <ChevronDown size={15} aria-hidden="true" />
            </span>
            <span>More Tools</span>
          </NavLink>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-storage-card">
            <div className="storage-card-header">
              <Folder size={16} className="storage-icon" aria-hidden="true" />
              <span className="storage-title">Storage</span>
            </div>
            <div className="storage-meter-track" role="progressbar" aria-valuenow={24} aria-valuemin={0} aria-valuemax={100}>
              <div className="storage-meter-fill" style={{ width: '24%' }} />
            </div>
            <div className="storage-meta-text">2.4 GB of 10 GB used</div>
          </div>

          <NavLink to="/settings" className={({ isActive }) => `settings-link ${isActive ? 'active' : ''}`}>
            <Settings2 size={18} aria-hidden="true" />
            <span>Settings</span>
          </NavLink>
        </div>
      </aside>

      <div className="main-viewport">
        <TopNav />
        {children}
      </div>
    </div>
  );
}

function ToolRoute({ children }: { children: React.ReactNode }) {
  return (
    <Shell>
      <main id="main-content" className="tool-main-content">
        <Suspense fallback={<div className="boot-state" role="status">Loading tool…</div>}>
          {children}
        </Suspense>
      </main>
    </Shell>
  );
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
