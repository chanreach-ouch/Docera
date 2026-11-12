import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, ArrowUpRight, Circle,
  Copy, Download, Highlighter, Image as ImageIcon, Minus, MousePointer2, PenTool,
  Plus, Redo2, Save, Search, Signature, Square, Stamp, StickyNote, Strikethrough,
  Trash2, Type, Underline, Undo2, Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, fileUrl, uploadPdf } from '../../services/api';
import { toolsApi } from '../../services/toolsApi';
import { fileSize } from '../../services/format';
import { ErrorNotice } from '../../components/ErrorNotice';
import { PageCanvas } from '../pdf-viewer/PageCanvas';
import { fitScale, loadPdf, pageDimensions } from '../pdf-viewer/pdf';
import { triggerDownload } from '../organize/pdfOrganize';
import { exportEditedPdf } from './editorExport';
import {
  alignEditorObjects,
  commitHistory,
  createHistory,
  duplicateEditorObjects,
  redoHistory,
  undoHistory,
  type EditorObject,
  type EditorObjectKind,
  type FontFamilyOption,
} from './editorModel';
import { SignaturePadModal } from './SignaturePadModal';

type ToolMode = 'select' | 'text' | 'rect' | 'circle' | 'line' | 'arrow' | 'ink' | 'highlight' | 'underline' | 'strikeout' | 'note' | 'stamp';

export default function PdfEditor() {
  const { id = '' } = useParams();
  const fileQuery = useQuery({ queryKey: ['file', id], queryFn: () => api.file(id) });
  const queryClient = useQueryClient();

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | 'width' | 'page'>('width');
  const [viewport, setViewport] = useState({ width: 820, height: 760 });
  const [tool, setTool] = useState<ToolMode>('select');
  const [history, setHistory] = useState(() => createHistory([]));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSigModal, setShowSigModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Native PDF stream inspection (Part 6.3 existing content editing)
  const [nativeRuns, setNativeRuns] = useState<{ op_index: number; text: string; font: string | null; font_size: number; editable: boolean; reason: string | null }[]>([]);
  const [nativeImages, setNativeImages] = useState<{ op_index: number; name: string; width: number; height: number }[]>([]);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [editingRun, setEditingRun] = useState<{ op_index: number; text: string } | null>(null);

  // Drag / Ink state
  const [dragState, setDragState] = useState<{
    kind: 'move' | 'resize' | 'draw-ink';
    objId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const data = fileQuery.data;
  const objects = history.present;
  const selectedObjects = objects.filter(o => selectedIds.has(o.id));
  const primarySelected = selectedObjects.length === 1 ? selectedObjects[0] : null;

  useEffect(() => {
    if (!data?.id) return;
    let disposed = false;
    setPdf(null); setLoadError(null);
    const task = loadPdf(fileUrl(data.id));
    void task.promise.then(value => { if (!disposed) setPdf(value); }).catch(() => {
      if (!disposed) setLoadError(new Error('Could not load PDF in editor.'));
    });
    void fetch(fileUrl(data.id), { credentials: 'same-origin' })
      .then(r => r.arrayBuffer())
      .then(buf => { if (!disposed) setSourceBytes(new Uint8Array(buf)); })
      .catch(() => undefined);
    return () => { disposed = true; void task.destroy().catch(() => undefined); };
  }, [data?.id]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const obs = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setViewport({ width: rect.width, height: rect.height });
    });
    obs.observe(scrollRef.current);
    return () => obs.disconnect();
  }, [pdf]);

  const currentInfo = data?.pages[page - 1] ?? data?.pages[0];
  const dims = currentInfo ? pageDimensions(currentInfo.width, currentInfo.height, 0) : { width: 612, height: 792 };
  const scale = typeof zoom === 'number' ? zoom : fitScale(dims.width, dims.height, viewport.width, viewport.height, zoom);

  function pushObjects(next: EditorObject[]) {
    setHistory(h => commitHistory(h, next));
  }

  function updateSelected(patch: Partial<EditorObject>) {
    if (!selectedIds.size) return;
    pushObjects(objects.map(o => selectedIds.has(o.id) ? { ...o, ...patch } : o));
  }

  function deleteSelected() {
    if (!selectedIds.size) return;
    pushObjects(objects.filter(o => !selectedIds.has(o.id)));
    setSelectedIds(new Set());
  }

  function addObjectOnPage(pageIndex: number, ptX: number, ptY: number, kind: EditorObjectKind, extra: Partial<EditorObject> = {}) {
    const defaults: Record<EditorObjectKind, Partial<EditorObject>> = {
      text: { width: 190, height: 32, text: 'Double-click or edit text in panel', fontFamily: 'Helvetica', fontSize: 14, align: 'left', lineHeight: 1.25, color: '#1c302e' },
      image: { width: 160, height: 120, color: '#1c302e' },
      signature: { width: 170, height: 60, color: '#10302d' },
      rect: { width: 130, height: 80, color: '#23665a', fillColor: 'transparent', strokeWidth: 2 },
      circle: { width: 100, height: 100, color: '#23665a', fillColor: 'transparent', strokeWidth: 2 },
      line: { width: 140, height: 2, color: '#1c302e', strokeWidth: 2 },
      arrow: { width: 140, height: 24, color: '#23665a', strokeWidth: 2.5 },
      ink: { width: 1, height: 1, color: '#163f3b', strokeWidth: 2.5, points: [{ x: ptX, y: ptY }] },
      highlight: { width: 170, height: 18, color: '#f5c542', opacity: 0.45, text: 'Highlight' },
      underline: { width: 170, height: 16, color: '#23665a', opacity: 1, text: 'Underline' },
      strikeout: { width: 170, height: 16, color: '#b43c2d', opacity: 1, text: 'Strikeout' },
      note: { width: 24, height: 24, color: '#f5c542', text: 'Review note' },
      stamp: { width: 130, height: 36, color: '#23665a', stampLabel: 'APPROVED' },
    };
    const obj: EditorObject = {
      id: `obj-${crypto.randomUUID()}`,
      kind,
      pageIndex,
      x: Math.max(0, ptX),
      y: Math.max(0, ptY),
      width: 120,
      height: 40,
      rotation: 0,
      opacity: 1,
      color: '#1c302e',
      ...defaults[kind],
      ...extra,
    };
    pushObjects([...objects, obj]);
    setSelectedIds(new Set([obj.id]));
    if (kind !== 'ink') setTool('select');
    return obj;
  }

  function handleCanvasClick(pageIndex: number, e: React.MouseEvent<HTMLDivElement>) {
    if (tool === 'select') {
      if (e.target === e.currentTarget) setSelectedIds(new Set());
      return;
    }
    if (tool === 'ink') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ptX = (e.clientX - rect.left) / scale;
    const ptY = (e.clientY - rect.top) / scale;
    addObjectOnPage(pageIndex, ptX, ptY, tool);
  }

  function handleCanvasPointerDown(pageIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    if (tool !== 'ink') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ptX = (e.clientX - rect.left) / scale;
    const ptY = (e.clientY - rect.top) / scale;
    const created = addObjectOnPage(pageIndex, ptX, ptY, 'ink');
    setDragState({
      kind: 'draw-ink',
      objId: created.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: ptX,
      origY: ptY,
      origW: 0,
      origH: 0,
    });
  }

  function handleCanvasPointerMove(pageIndex: number, e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState) return;
    if (dragState.kind === 'draw-ink') {
      const rect = e.currentTarget.getBoundingClientRect();
      const ptX = (e.clientX - rect.left) / scale;
      const ptY = (e.clientY - rect.top) / scale;
      setHistory(h => ({
        ...h,
        present: h.present.map(o => o.id === dragState.objId
          ? { ...o, points: [...(o.points || []), { x: ptX, y: ptY }] }
          : o),
      }));
      return;
    }
    const dx = (e.clientX - dragState.startClientX) / scale;
    const dy = (e.clientY - dragState.startClientY) / scale;
    setHistory(h => ({
      ...h,
      present: h.present.map(o => {
        if (o.id !== dragState.objId || o.pageIndex !== pageIndex) return o;
        if (dragState.kind === 'move') return { ...o, x: Math.max(0, dragState.origX + dx), y: Math.max(0, dragState.origY + dy) };
        return { ...o, width: Math.max(16, dragState.origW + dx), height: Math.max(12, dragState.origH + dy) };
      }),
    }));
  }

  function handleImageUpload(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        addObjectOnPage(page - 1, 72, 100, 'image', { imageDataUrl: reader.result });
      }
    };
    reader.readAsDataURL(file);
  }

  async function runExport(saveCopy: boolean) {
    if (!sourceBytes || !data) return;
    setBusy(true); setErrorMsg(null); setStatusMsg(null);
    try {
      const outBytes = await exportEditedPdf(sourceBytes, objects);
      const outName = data.filename.replace(/\.pdf$/i, '') + '-edited.pdf';
      if (saveCopy) {
        const f = new File([outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength) as ArrayBuffer], outName, { type: 'application/pdf' });
        const saved = await uploadPdf(f, () => undefined, new AbortController().signal);
        await queryClient.invalidateQueries({ queryKey: ['files'] });
        setStatusMsg(`Saved edited copy "${saved.filename}" (${fileSize(saved.size_bytes)}) to workspace.`);
      } else {
        triggerDownload(outBytes, outName);
        setStatusMsg(`Exported "${outName}" (${fileSize(outBytes.byteLength)}) with ${objects.length} objects/annotations.`);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function inspectNativePage() {
    if (!sourceBytes) return;
    setNativeLoading(true); setErrorMsg(null);
    try {
      const f = new File([sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer], data?.filename || 'doc.pdf', { type: 'application/pdf' });
      const res = await toolsApi.nativeInspect({ file: f }, page);
      setNativeRuns(res.text_runs);
      setNativeImages(res.images);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not inspect native content stream.');
    } finally {
      setNativeLoading(false);
    }
  }

  async function applyNativeTextReplace() {
    if (!sourceBytes || !editingRun) return;
    setNativeLoading(true); setErrorMsg(null); setStatusMsg(null);
    try {
      const f = new File([sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer], data?.filename || 'doc.pdf', { type: 'application/pdf' });
      const res = await toolsApi.nativeReplaceText({ file: f }, page, editingRun.op_index, editingRun.text);
      const nextBytes = new Uint8Array(await res.blob.arrayBuffer());
      setSourceBytes(nextBytes);
      const reloaded = await loadPdf(URL.createObjectURL(res.blob)).promise;
      setPdf(reloaded);
      setEditingRun(null);
      setStatusMsg('Updated underlying PDF text stream directly (old text removed). Export to download.');
      await inspectNativePage();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Native text edit failed.');
    } finally {
      setNativeLoading(false);
    }
  }

  async function applyNativeImageDelete(opIndex: number) {
    if (!sourceBytes) return;
    setNativeLoading(true); setErrorMsg(null);
    try {
      const f = new File([sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer], data?.filename || 'doc.pdf', { type: 'application/pdf' });
      const res = await toolsApi.nativeDeleteImage({ file: f }, page, opIndex);
      const nextBytes = new Uint8Array(await res.blob.arrayBuffer());
      setSourceBytes(nextBytes);
      const reloaded = await loadPdf(URL.createObjectURL(res.blob)).promise;
      setPdf(reloaded);
      setStatusMsg('Removed embedded image XObject from PDF stream.');
      await inspectNativePage();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Image removal failed.');
    } finally {
      setNativeLoading(false);
    }
  }

  return (
    <div className="viewer" onPointerUp={() => setDragState(null)}>
      <header className="viewer-header">
        <Link to={data ? `/documents/${data.id}` : '/'} className="icon-button" title="Back to viewer" aria-label="Back to viewer"><ArrowLeft size={20} /></Link>
        <div className="viewer-title">
          <strong>{data ? `Edit · ${data.filename}` : 'PDF Editor'}</strong>
          <span>{data ? `${data.page_count} pages · ${objects.length} placed objects` : 'Loading…'}</span>
        </div>
        {data && (
          <div className="document-actions">
            <button className="button secondary small" disabled={busy || !sourceBytes} onClick={() => void runExport(true)}><Save size={15} /> Save copy</button>
            <button className="button primary small" disabled={busy || !sourceBytes} onClick={() => void runExport(false)}><Download size={15} /> Export PDF</button>
          </div>
        )}
      </header>

      {fileQuery.error && <div className="viewer-error"><ErrorNotice error={fileQuery.error} /></div>}
      {loadError && <div className="viewer-error"><ErrorNotice error={loadError} /></div>}

      {data && pdf && (
        <>
          <div className="viewer-toolbar" role="toolbar" aria-label="Editor tools">
            <button className="icon-button" title="Undo" aria-label="Undo" disabled={!history.past.length} onClick={() => setHistory(undoHistory)}><Undo2 size={17} /></button>
            <button className="icon-button" title="Redo" aria-label="Redo" disabled={!history.future.length} onClick={() => setHistory(redoHistory)}><Redo2 size={17} /></button>
            <div className="toolbar-divider" />

            <button className={`icon-button ${tool === 'select' ? 'tool-active' : ''}`} title="Select & move" aria-label="Select" onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
            <button className={`icon-button ${tool === 'text' ? 'tool-active' : ''}`} title="Insert text" aria-label="Insert text" onClick={() => setTool('text')}><Type size={17} /></button>
            <button className="icon-button" title="Insert image" aria-label="Insert image" onClick={() => imageInputRef.current?.click()}><ImageIcon size={17} /></button>
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" className="visually-hidden" onChange={e => { handleImageUpload(e.target.files?.[0]); e.target.value = ''; }} />

            <button className={`icon-button ${tool === 'rect' ? 'tool-active' : ''}`} title="Rectangle" aria-label="Rectangle" onClick={() => setTool('rect')}><Square size={17} /></button>
            <button className={`icon-button ${tool === 'circle' ? 'tool-active' : ''}`} title="Ellipse" aria-label="Ellipse" onClick={() => setTool('circle')}><Circle size={17} /></button>
            <button className={`icon-button ${tool === 'line' ? 'tool-active' : ''}`} title="Line" aria-label="Line" onClick={() => setTool('line')}><Minus size={17} /></button>
            <button className={`icon-button ${tool === 'arrow' ? 'tool-active' : ''}`} title="Arrow" aria-label="Arrow" onClick={() => setTool('arrow')}><ArrowUpRight size={17} /></button>
            <button className={`icon-button ${tool === 'ink' ? 'tool-active' : ''}`} title="Freehand ink" aria-label="Freehand draw" onClick={() => setTool('ink')}><PenTool size={17} /></button>
            <div className="toolbar-divider" />

            <button className={`icon-button ${tool === 'highlight' ? 'tool-active' : ''}`} title="Highlight annotation" aria-label="Highlight" onClick={() => setTool('highlight')}><Highlighter size={17} /></button>
            <button className={`icon-button ${tool === 'underline' ? 'tool-active' : ''}`} title="Underline annotation" aria-label="Underline" onClick={() => setTool('underline')}><Underline size={17} /></button>
            <button className={`icon-button ${tool === 'strikeout' ? 'tool-active' : ''}`} title="Strikeout annotation" aria-label="Strikeout" onClick={() => setTool('strikeout')}><Strikethrough size={17} /></button>
            <button className={`icon-button ${tool === 'note' ? 'tool-active' : ''}`} title="Sticky note comment" aria-label="Sticky note" onClick={() => setTool('note')}><StickyNote size={17} /></button>
            <button className={`icon-button ${tool === 'stamp' ? 'tool-active' : ''}`} title="Stamp annotation" aria-label="Stamp" onClick={() => setTool('stamp')}><Stamp size={17} /></button>
            <button className="icon-button" title="Visual signature" aria-label="Visual signature" onClick={() => setShowSigModal(true)}><Signature size={17} /></button>

            <div className="toolbar-divider" />
            <button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.25, scale - 0.15))}><Minus size={16} /></button>
            <span className="zoom-value">{Math.round(scale * 100)}%</span>
            <button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, scale + 0.15))}><Plus size={16} /></button>

            {tool !== 'select' && <span className="view-only-note">Click page to place {tool}</span>}
          </div>

          {(errorMsg || statusMsg) && (
            <div style={{ padding: '6px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
              {errorMsg && <div className="error-notice" role="alert"><p>{errorMsg}</p></div>}
              {statusMsg && <div className="upload-result done" role="status"><p style={{ margin: 0 }}>{statusMsg}</p></div>}
            </div>
          )}

          <div className="editor-body">
            {/* Left panel: Thumbnails */}
            <aside className="page-panel is-open" aria-label="Pages">
              <h3 className="pages-label">Pages <span>{data.page_count}</span></h3>
              <ol className="thumbnail-list">
                {data.pages.map(info => (
                  <li key={info.index}>
                    <button
                      className={`thumbnail-button ${page === info.index + 1 ? 'selected' : ''}`}
                      onClick={() => {
                        setPage(info.index + 1);
                        scrollRef.current?.querySelector(`[data-page="${info.index + 1}"]`)?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      <PageCanvas pdf={pdf} info={info} scale={110 / Math.max(info.width, info.height)} rotation={0} thumbnail />
                      <span>{info.index + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            {/* Center panel: Pages + Interactive Overlays */}
            <div ref={scrollRef} className="document-scroll" aria-label="Editor canvas">
              <div className="pages-stack">
                {data.pages.map(info => {
                  const pageObjs = objects.filter(o => o.pageIndex === info.index);
                  return (
                    <div key={info.index} className="editor-page-wrapper" style={{ position: 'relative' }}>
                      <PageCanvas pdf={pdf} info={info} scale={scale} rotation={0} onActive={idx => setPage(idx + 1)} />
                      <div
                        className={`editor-overlay ${tool !== 'select' ? 'placing' : ''}`}
                        onClick={e => handleCanvasClick(info.index, e)}
                        onPointerDown={e => handleCanvasPointerDown(info.index, e)}
                        onPointerMove={e => handleCanvasPointerMove(info.index, e)}
                      >
                        {pageObjs.map(obj => {
                          const isSel = selectedIds.has(obj.id);
                          const style: React.CSSProperties = {
                            left: obj.x * scale,
                            top: obj.y * scale,
                            width: obj.width * scale,
                            height: obj.height * scale,
                            opacity: obj.opacity,
                            transform: obj.rotation ? `rotate(${obj.rotation}deg)` : undefined,
                          };
                          return (
                            <div
                              key={obj.id}
                              className={`editor-item ${isSel ? 'selected' : ''}`}
                              style={style}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedIds(prev => {
                                  if (e.shiftKey) {
                                    const next = new Set(prev);
                                    if (next.has(obj.id)) next.delete(obj.id);
                                    else next.add(obj.id);
                                    return next;
                                  }
                                  return new Set([obj.id]);
                                });
                              }}
                              onPointerDown={e => {
                                if (tool !== 'select') return;
                                e.stopPropagation();
                                setSelectedIds(new Set([obj.id]));
                                setDragState({
                                  kind: 'move',
                                  objId: obj.id,
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  origX: obj.x,
                                  origY: obj.y,
                                  origW: obj.width,
                                  origH: obj.height,
                                });
                              }}
                            >
                              {obj.kind === 'text' && (
                                <div style={{ color: obj.color, fontSize: (obj.fontSize || 14) * scale, fontFamily: obj.fontFamily, textAlign: obj.align, lineHeight: obj.lineHeight, whiteSpace: 'pre-wrap' }}>
                                  {obj.text}
                                </div>
                              )}
                              {(obj.kind === 'image' || obj.kind === 'signature') && obj.imageDataUrl && (
                                <img src={obj.imageDataUrl} alt={obj.kind} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                              )}
                              {obj.kind === 'rect' && (
                                <div style={{ width: '100%', height: '100%', border: `${(obj.strokeWidth || 2) * scale}px solid ${obj.color}`, background: obj.fillColor === 'transparent' ? 'transparent' : obj.fillColor }} />
                              )}
                              {obj.kind === 'circle' && (
                                <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: `${(obj.strokeWidth || 2) * scale}px solid ${obj.color}`, background: obj.fillColor === 'transparent' ? 'transparent' : obj.fillColor }} />
                              )}
                              {(obj.kind === 'line' || obj.kind === 'arrow') && (
                                <svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
                                  <line x1="0" y1="10" x2={obj.kind === 'arrow' ? '92' : '100'} y2="10" stroke={obj.color} strokeWidth="3" />
                                  {obj.kind === 'arrow' && <polygon points="100,10 86,2 86,18" fill={obj.color} />}
                                </svg>
                              )}
                              {obj.kind === 'highlight' && <div style={{ width: '100%', height: '100%', background: obj.color, opacity: 0.45 }} />}
                              {obj.kind === 'underline' && <div style={{ width: '100%', height: '100%', borderBottom: `2px solid ${obj.color}` }} />}
                              {obj.kind === 'strikeout' && <div style={{ width: '100%', height: '50%', borderBottom: `2px solid ${obj.color}` }} />}
                              {obj.kind === 'note' && <div title={obj.text} style={{ width: '100%', height: '100%', background: obj.color, border: '1px solid #1c302e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✎</div>}
                              {obj.kind === 'stamp' && <div style={{ width: '100%', height: '100%', border: `2px solid ${obj.color}`, color: obj.color, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 * scale }}>{obj.stampLabel || 'APPROVED'}</div>}
                              {obj.kind === 'ink' && obj.points && obj.points.length > 1 && (
                                <svg style={{ position: 'fixed', left: 0, top: 0, width: 0, height: 0, overflow: 'visible', pointerEvents: 'none' }} />
                              )}
                              {isSel && obj.kind !== 'ink' && (
                                <div
                                  className="resize-handle"
                                  onPointerDown={e => {
                                    e.stopPropagation();
                                    setDragState({
                                      kind: 'resize',
                                      objId: obj.id,
                                      startClientX: e.clientX,
                                      startClientY: e.clientY,
                                      origX: obj.x,
                                      origY: obj.y,
                                      origW: obj.width,
                                      origH: obj.height,
                                    });
                                  }}
                                />
                              )}
                            </div>
                          );
                        })}
                        {/* Render ink strokes across the page */}
                        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                          {pageObjs.filter(o => o.kind === 'ink' && o.points?.length).map(o => (
                            <polyline
                              key={o.id}
                              fill="none"
                              stroke={o.color}
                              strokeWidth={(o.strokeWidth || 2.5) * scale}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={o.points!.map(pt => `${pt.x * scale},${pt.y * scale}`).join(' ')}
                            />
                          ))}
                        </svg>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right panel: Properties & Native Stream Inspector */}
            <aside className="properties-panel" aria-label="Properties inspector">
              <h3>Properties</h3>
              {!selectedObjects.length && <p className="muted" style={{ fontSize: 13 }}>Select an object on the page to edit its formatting, alignment, or annotation properties.</p>}

              {selectedObjects.length > 0 && (
                <div className="prop-group">
                  <div className="tool-panel-actions">
                    <button className="button quiet small" onClick={() => { const d = duplicateEditorObjects(objects, selectedIds); pushObjects(d.next); setSelectedIds(new Set(d.newIds)); }}><Copy size={14} /> Duplicate</button>
                    <button className="button danger small" onClick={deleteSelected}><Trash2 size={14} /> Delete</button>
                  </div>
                  <div className="prop-row">
                    <span>Align</span>
                    <div className="document-actions">
                      <button className="icon-button" title="Align left" onClick={() => pushObjects(alignEditorObjects(objects, selectedIds, 'left', dims.width, dims.height))}><AlignLeft size={14} /></button>
                      <button className="icon-button" title="Align center" onClick={() => pushObjects(alignEditorObjects(objects, selectedIds, 'center', dims.width, dims.height))}><AlignCenter size={14} /></button>
                      <button className="icon-button" title="Align right" onClick={() => pushObjects(alignEditorObjects(objects, selectedIds, 'right', dims.width, dims.height))}><AlignRight size={14} /></button>
                    </div>
                  </div>
                </div>
              )}

              {primarySelected && (
                <div className="prop-group">
                  {(primarySelected.kind === 'text' || primarySelected.kind === 'note' || primarySelected.kind === 'highlight' || primarySelected.kind === 'underline' || primarySelected.kind === 'strikeout') && (
                    <label className="prop-field">
                      <span>{primarySelected.kind === 'text' ? 'Text content' : 'Comment / Note'}</span>
                      <textarea rows={3} value={primarySelected.text || ''} onChange={e => updateSelected({ text: e.target.value })} />
                    </label>
                  )}

                  {primarySelected.kind === 'stamp' && (
                    <label className="prop-field">
                      <span>Stamp preset</span>
                      <select value={primarySelected.stampLabel || 'APPROVED'} onChange={e => updateSelected({ stampLabel: e.target.value })}>
                        <option value="APPROVED">APPROVED</option>
                        <option value="CONFIDENTIAL">CONFIDENTIAL</option>
                        <option value="DRAFT">DRAFT</option>
                        <option value="REVIEWED">REVIEWED</option>
                        <option value="FINAL">FINAL</option>
                      </select>
                    </label>
                  )}

                  {primarySelected.kind === 'text' && (
                    <>
                      <label className="prop-field">
                        <span>Font</span>
                        <select value={primarySelected.fontFamily || 'Helvetica'} onChange={e => updateSelected({ fontFamily: e.target.value as FontFamilyOption })}>
                          <option value="Helvetica">Helvetica</option>
                          <option value="TimesRoman">Times Roman</option>
                          <option value="Courier">Courier</option>
                        </select>
                      </label>
                      <label className="prop-field">
                        <span>Font size (pt)</span>
                        <input type="number" min={6} max={96} value={primarySelected.fontSize || 14} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} />
                      </label>
                      <label className="prop-field">
                        <span>Line spacing</span>
                        <input type="number" step={0.1} min={0.8} max={3} value={primarySelected.lineHeight || 1.25} onChange={e => updateSelected({ lineHeight: Number(e.target.value) })} />
                      </label>
                    </>
                  )}

                  <label className="prop-field">
                    <span>Color</span>
                    <input type="color" value={primarySelected.color} onChange={e => updateSelected({ color: e.target.value })} />
                  </label>

                  {(primarySelected.kind === 'rect' || primarySelected.kind === 'circle') && (
                    <>
                      <label className="prop-field">
                        <span>Border width</span>
                        <input type="number" min={0} max={20} value={primarySelected.strokeWidth ?? 2} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })} />
                      </label>
                      <label className="prop-field">
                        <span>Fill</span>
                        <select value={primarySelected.fillColor || 'transparent'} onChange={e => updateSelected({ fillColor: e.target.value })}>
                          <option value="transparent">Transparent</option>
                          <option value="#e4efec">Soft pine</option>
                          <option value="#fef6e6">Warm amber</option>
                          <option value="#ffffff">White</option>
                        </select>
                      </label>
                    </>
                  )}

                  <label className="prop-field">
                    <span>Opacity ({Math.round((primarySelected.opacity ?? 1) * 100)}%)</span>
                    <input type="range" min={0.1} max={1} step={0.05} value={primarySelected.opacity ?? 1} onChange={e => updateSelected({ opacity: Number(e.target.value) })} />
                  </label>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '14px 0' }} />

              <div className="prop-group">
                <div className="panel-heading">
                  <h4 style={{ margin: 0, fontSize: 13 }}><Wrench size={13} /> Existing PDF content (Page {page})</h4>
                  <button className="button quiet small" disabled={nativeLoading || !sourceBytes} onClick={() => void inspectNativePage()}>
                    <Search size={13} /> Inspect
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                  Modifies supported single-byte text operators directly in the PDF stream without white-box masking. Subset/CID fonts are flagged as unsupported.
                </p>

                {nativeRuns.length > 0 && (
                  <ul className="native-list">
                    {nativeRuns.map(run => (
                      <li key={run.op_index}>
                        <div style={{ fontSize: 12 }}>
                          <strong>{run.text}</strong>
                          <small style={{ display: 'block', color: 'var(--ink-muted)' }}>
                            {run.editable ? `Editable · ${run.font || 'Font'}` : `Unsupported: ${run.reason}`}
                          </small>
                        </div>
                        {run.editable && (
                          <button className="text-link" style={{ fontSize: 12 }} onClick={() => setEditingRun({ op_index: run.op_index, text: run.text })}>Edit</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {editingRun && (
                  <div className="prop-group" style={{ marginTop: 8, padding: 8, background: 'var(--bg-subtle)', borderRadius: 6 }}>
                    <input type="text" value={editingRun.text} onChange={e => setEditingRun({ ...editingRun, text: e.target.value })} />
                    <div className="tool-panel-actions">
                      <button className="button primary small" disabled={nativeLoading} onClick={() => void applyNativeTextReplace()}>Apply stream edit</button>
                      <button className="button quiet small" onClick={() => setEditingRun(null)}>Cancel</button>
                    </div>
                  </div>
                )}

                {nativeImages.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <small className="muted">Embedded images on page {page}:</small>
                    <ul className="native-list">
                      {nativeImages.map(img => (
                        <li key={img.op_index}>
                          <span style={{ fontSize: 12 }}>{img.name} ({img.width}×{img.height})</span>
                          <button className="text-link" style={{ fontSize: 12, color: 'var(--rust)' }} onClick={() => void applyNativeImageDelete(img.op_index)}>Remove</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}

      {showSigModal && (
        <SignaturePadModal
          onClose={() => setShowSigModal(false)}
          onConfirm={dataUrl => {
            addObjectOnPage(page - 1, 72, 140, 'signature', { imageDataUrl: dataUrl });
            setShowSigModal(false);
          }}
        />
      )}
    </div>
  );
}
