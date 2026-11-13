import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Download, Info, Maximize,
  Maximize2, Minimize2, Minus, PanelLeftClose, PanelLeftOpen, PenLine, Plus, Printer, RotateCw, Search, X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, fileUrl } from '../../services/api';
import { expiryLabel, fileSize } from '../../services/format';
import { ErrorNotice } from '../../components/ErrorNotice';
import { PageCanvas } from './PageCanvas';
import { fitScale, formatPdfLoadError, loadPdf, pageDimensions } from './pdf';

export default function PdfViewer() {
  const { id = '' } = useParams();
  const fileQuery = useQuery({ queryKey: ['file', id], queryFn: () => api.file(id) });
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [page, setPage] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState<number | 'width' | 'page'>('width');
  const [panel, setPanel] = useState(() => window.innerWidth > 760);
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<number[]>([]);
  const [searchMessage, setSearchMessage] = useState('');
  const [viewport, setViewport] = useState({ width: 1000, height: 800 });
  const viewerRef = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const pageInput = useRef<HTMLInputElement>(null);
  const data = fileQuery.data;
  const validId = data?.id;

  useEffect(() => {
    if (!validId) return;
    let disposed = false;
    setPdf(null); setLoadError(null);
    const task = loadPdf(fileUrl(validId));
    void task.promise.then(value => { if (!disposed) setPdf(value); }).catch(err => {
      if (!disposed) setLoadError(formatPdfLoadError(err));
    });
    return () => { disposed = true; void task.destroy().catch(() => undefined); };
  }, [validId, loadAttempt]);

  useEffect(() => {
    if (!scroll.current) return;
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0]?.contentRect;
      if (bounds) setViewport({ width: bounds.width, height: bounds.height });
    });
    observer.observe(scroll.current);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    if (pageInput.current && window.document.activeElement !== pageInput.current) {
      pageInput.current.value = String(page);
    }
  }, [page]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(window.document.fullscreenElement));
    window.document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => window.document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const goTo = useCallback((value: number) => {
    if (!data) return;
    const target = Math.max(1, Math.min(data.page_count, Math.round(value)));
    if (!Number.isFinite(target)) return;
    setPage(target);
    scroll.current?.querySelector(`[data-page="${target}"]`)?.scrollIntoView({ block: 'start' });
  }, [data]);

  const currentInfo = data?.pages[page - 1] ?? data?.pages[0];
  const dimensions = currentInfo ? pageDimensions(currentInfo.width, currentInfo.height, rotation) : { width: 612, height: 792 };
  const scale = typeof zoom === 'number' ? zoom : fitScale(dimensions.width, dimensions.height, viewport.width, viewport.height, zoom);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      const isInput = element ? ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || element.isContentEditable : false;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); setPanel(true); searchInput.current?.focus(); return; }
      if (isInput || event.altKey || event.metaKey || event.ctrlKey) return;
      if (['PageDown', 'ArrowRight'].includes(event.key)) { event.preventDefault(); goTo(page + 1); }
      if (['PageUp', 'ArrowLeft'].includes(event.key)) { event.preventDefault(); goTo(page - 1); }
      if (event.key === '+' || event.key === '=') setZoom(Math.min(3, scale + 0.1));
      if (event.key === '-') setZoom(Math.max(0.1, scale - 0.1));
      if (event.key.toLowerCase() === 'r') setRotation(value => (value + 90) % 360);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, page, scale]);

  useEffect(() => {
    let cancelled = false;
    setMatches([]);
    setSearchMessage('');
    const query = search.trim().toLocaleLowerCase();
    if (!pdf || !query) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        const found: number[] = [];
        let characters = 0;
        try {
          for (let index = 1; index <= pdf.numPages; index++) {
            if (cancelled) return;
            setSearchMessage(`Searching page ${index} of ${pdf.numPages}…`);
            const source = await (await pdf.getPage(index)).getTextContent();
            const text = source.items.map(item => 'str' in item ? item.str : '').join(' ');
            characters += text.length;
            if (characters > 10_000_000) { setSearchMessage(`Search stopped at page ${index}: text limit reached. ${found.length} matching pages so far.`); setMatches(found); return; }
            if (text.toLocaleLowerCase().includes(query)) found.push(index);
          }
          if (!cancelled) { setMatches(found); setSearchMessage(found.length ? `${found.length} matching ${found.length === 1 ? 'page' : 'pages'}` : 'No matching text. Scanned pages may need OCR.'); }
        } catch { if (!cancelled) setSearchMessage('Text search failed. Try another document.'); }
      })();
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [pdf, search]);

  async function toggleFullscreen() {
    try {
      if (window.document.fullscreenElement) {
        await window.document.exitFullscreen();
      } else if (viewerRef.current?.requestFullscreen) {
        await viewerRef.current.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen denial in restricted browsers.
    }
  }

  return <div ref={viewerRef} className="viewer">
    <header className="viewer-header">
      <Link to="/" className="icon-button" title="Back to workspace" aria-label="Back to workspace"><ArrowLeft size={20} /></Link>
      <div className="viewer-title">
        <strong>{data?.filename ?? 'PDF viewer'}</strong>
        <span>{data ? `${data.page_count} ${data.page_count === 1 ? 'page' : 'pages'} · ${fileSize(data.size_bytes)}` : 'Opening document…'}</span>
      </div>
      <span className="badge available viewer-original">Original PDF</span>
      {data && <div className="doc-info-popover">
        <button className="icon-button" aria-label="Document information" aria-expanded={showInfo} title="Document information" onClick={() => setShowInfo(v => !v)}><Info size={18} /></button>
        {showInfo && <div className="doc-info-card" role="dialog" aria-label="Document information">
          <h3>Document info</h3>
          <dl>
            <dt>File</dt><dd>{data.filename}</dd>
            <dt>Pages</dt><dd>{data.page_count}</dd>
            <dt>Size</dt><dd>{fileSize(data.size_bytes)}</dd>
            {currentInfo && <><dt>Page {page}</dt><dd>{Math.round(dimensions.width)} × {Math.round(dimensions.height)} pt</dd></>}
            <dt>Expires</dt><dd>{expiryLabel(data.expires_at)}</dd>
          </dl>
        </div>}
      </div>}
      {data && <Link className="button secondary small" to={`/documents/${data.id}/edit`}><PenLine size={16} aria-hidden="true" /><span>Edit & Annotate</span></Link>}
      {data && <a className="button primary small" href={fileUrl(data.id)}><Download size={16} aria-hidden="true" /><span>Download original</span></a>}
    </header>
    {fileQuery.isPending && <div className="boot-state" role="status">Checking document access…</div>}
    {fileQuery.error && <div className="viewer-error"><ErrorNotice error={fileQuery.error} onRetry={() => void fileQuery.refetch()} /><Link to="/" className="text-link">Return to workspace</Link></div>}
    {loadError && <div className="viewer-error"><ErrorNotice error={loadError} onRetry={() => setLoadAttempt(value => value + 1)} /></div>}
    {data && !pdf && !loadError && <div className="boot-state" role="status">Loading PDF pages…</div>}
    {data && pdf && <>
      <div className="viewer-toolbar" role="toolbar" aria-label="Document controls">
        <button className="icon-button" title="Toggle pages and search" aria-label="Toggle pages and search" aria-expanded={panel} onClick={() => setPanel(value => !value)}>{panel ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}</button>
        <div className="toolbar-divider" />
        <button className="icon-button" title="Previous page (Left arrow)" aria-label="Previous page" disabled={page === 1} onClick={() => goTo(page - 1)}><ChevronLeft size={18} /></button>
        <label className="page-control"><span className="visually-hidden">Page number</span><input ref={pageInput} type="number" defaultValue={page} min={1} max={data.page_count} onBlur={event => { if (event.target.value) goTo(Number(event.target.value)); else event.target.value = String(page); }} onKeyDown={event => { if (event.key === 'Enter') { goTo(Number(event.currentTarget.value)); event.currentTarget.blur(); } }} /><span>of {data.page_count}</span></label>
        <button className="icon-button" title="Next page (Right arrow)" aria-label="Next page" disabled={page === data.page_count} onClick={() => goTo(page + 1)}><ChevronRight size={18} /></button>
        <div className="toolbar-divider" />
        <button className="icon-button" aria-label="Zoom out" title="Zoom out (-)" disabled={scale <= 0.1} onClick={() => setZoom(Math.max(0.1, scale - 0.1))}><Minus size={17} /></button>
        <span className="zoom-value">{Math.round(scale * 100)}%</span>
        <button className="icon-button" aria-label="Zoom in" title="Zoom in (+)" disabled={scale >= 3} onClick={() => setZoom(Math.min(3, scale + 0.1))}><Plus size={17} /></button>
        <label className="fit-control"><Maximize size={15} aria-hidden="true" /><span className="visually-hidden">Fit mode</span><select value={typeof zoom === 'number' ? 'custom' : zoom} onChange={event => setZoom(event.target.value as 'width' | 'page')}><option value="width">Fit width</option><option value="page">Fit page</option>{typeof zoom === 'number' && <option value="custom">Custom zoom</option>}</select><ChevronDown size={12} aria-hidden="true" /></label>
        <button className="icon-button" aria-label="Rotate view clockwise" title="Rotate view (R) — original stays unchanged" onClick={() => setRotation(value => (value + 90) % 360)}><RotateCw size={18} /></button>
        <button className="icon-button" aria-label="Print document" title="Print" onClick={() => window.print()}><Printer size={17} /></button>
        <button className="icon-button" aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={() => void toggleFullscreen()}>{isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
        <span className="view-only-note">View only{rotation ? ` · rotated ${rotation}°` : ''}</span>
      </div>
      <div className="viewer-body">
        <aside className={`page-panel ${panel ? 'is-open' : ''}`} aria-label="Pages and search" hidden={!panel}>
          <div className="panel-heading"><h2>Document</h2><button className="icon-button mobile-panel-close" aria-label="Close pages panel" onClick={() => setPanel(false)}><X size={17} /></button></div>
          <label className="document-search"><Search size={16} aria-hidden="true" /><input ref={searchInput} value={search} onChange={event => setSearch(event.target.value)} type="search" placeholder="Find in document" aria-label="Find in document" /></label>
          {search && <div className="search-results"><p role="status">{searchMessage}</p>{matches.length > 0 && <ul>{matches.map(index => <li key={index}><button onClick={() => goTo(index)}>Page {index}<ChevronRight size={14} aria-hidden="true" /></button></li>)}</ul>}</div>}
          <h3 className="pages-label">Pages <span>{data.page_count}</span></h3>
          <ol className="thumbnail-list">{data.pages.map(info => <li key={info.index}><button className={`thumbnail-button ${page === info.index + 1 ? 'selected' : ''}`} aria-label={`Go to page ${info.index + 1}`} aria-current={page === info.index + 1 ? 'page' : undefined} onClick={() => goTo(info.index + 1)}><PageCanvas pdf={pdf} info={info} scale={116 / Math.max(info.width, info.height)} rotation={rotation} thumbnail /><span>{info.index + 1}</span></button></li>)}</ol>
        </aside>
        <div ref={scroll} className="document-scroll" tabIndex={0} aria-label="PDF document pages">
          <div className="pages-stack">{data.pages.map(info => <PageCanvas key={info.index} pdf={pdf} info={info} scale={scale} rotation={rotation} search={search} onActive={index => setPage(index + 1)} />)}</div>
        </div>
      </div>
      <footer className="viewer-status"><span>Original preserved · Preview changes are not saved</span><span>← → Pages <span aria-hidden="true">·</span> + − Zoom <span aria-hidden="true">·</span> R Rotate view</span></footer>
    </>}
  </div>;
}
