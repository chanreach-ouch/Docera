import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight,
  Circle, Copy, Download, Highlighter, Image as ImageIcon, Minus,
  MousePointer2, Move, PenTool, Plus, Redo2, Save, Search,
  Signature, Square, Stamp, StickyNote, Strikethrough, Trash2, Type,
  Underline, Undo2, Wrench, X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api, fileUrl, uploadPdf } from '../../services/api';
import { toolsApi } from '../../services/toolsApi';
import { fileSize } from '../../services/format';
import { ErrorNotice } from '../../components/ErrorNotice';
import { PageCanvas } from '../pdf-viewer/PageCanvas';
import { fitScale, formatPdfLoadError, loadPdf, pageDimensions } from '../pdf-viewer/pdf';
import { triggerDownload } from '../organize/pdfOrganize';
import { exportEditedPdf } from './editorExport';
import {
  alignEditorObjects,
  commitHistory,
  createHistory,
  duplicateEditorObjects,
  redoHistory,
  reorderZIndex,
  undoHistory,
  type EditorObject,
  type EditorObjectKind,
  type FontFamilyOption,
  type NativeTextEdit,
  type NativeTextSpan,
  type ObjectAlignAction,
} from './editorModel';
import { SignaturePadModal } from './SignaturePadModal';

type ToolMode = 'select' | 'edit-text' | 'text' | 'rect' | 'circle' | 'line' | 'arrow' | 'ink' | 'highlight' | 'underline' | 'strikeout' | 'note' | 'stamp';
type ResizeHandle = 'nw' | 'ne' | 'se' | 'sw';

const PRESET_COLORS = [
  { label: 'Dark Slate', value: '#1c302e' },
  { label: 'Pine Green', value: '#23665a' },
  { label: 'Rust Red', value: '#b43c2d' },
  { label: 'Warm Amber', value: '#d97706' },
  { label: 'Sapphire', value: '#2563eb' },
  { label: 'Pure White', value: '#ffffff' },
];

function hasKhmer(text: string): boolean {
  return /[\u1780-\u17FF]/.test(text);
}

export default function PdfEditor() {
  const { id = '' } = useParams();
  const fileQuery = useQuery({ queryKey: ['file', id], queryFn: () => api.file(id) });
  const queryClient = useQueryClient();

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [sourceBytes, setSourceBytes] = useState<Uint8Array | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
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

  // Native PDF stream inspection
  const [nativeRuns, setNativeRuns] = useState<{ op_index: number; text: string; font: string | null; font_size: number; editable: boolean; reason: string | null }[]>([]);
  const [nativeImages, setNativeImages] = useState<{ op_index: number; name: string; width: number; height: number }[]>([]);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [editingRun, setEditingRun] = useState<{ op_index: number; text: string } | null>(null);

  // Real Existing-Text Editing State (interactive on-canvas selection & true replacement)
  const [nativeSpansByPage, setNativeSpansByPage] = useState<Record<number, NativeTextSpan[]>>({});
  const [loadingSpansPages, setLoadingSpansPages] = useState<Record<number, boolean>>({});
  const [selectedSpan, setSelectedSpan] = useState<NativeTextSpan | null>(null);
  const [hoveredSpanId, setHoveredSpanId] = useState<string | null>(null);
  const [editingSpanId, setEditingSpanId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingFont, setEditingFont] = useState('');
  const [editingFontSize, setEditingFontSize] = useState<number>(12);
  const [editingColor, setEditingColor] = useState('#1c302e');
  const [isComposing, setIsComposing] = useState(false);
  const [nativeEdits, setNativeEdits] = useState<Record<string, NativeTextEdit>>({});
  const [nativeEditsPast, setNativeEditsPast] = useState<Record<string, NativeTextEdit>[]>([]);
  const [nativeEditsFuture, setNativeEditsFuture] = useState<Record<string, NativeTextEdit>[]>([]);

  // Drag / Ink state with 4-corner handle support
  const [dragState, setDragState] = useState<{
    kind: 'move' | 'resize' | 'draw-ink';
    handle?: ResizeHandle;
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
    const docId = data?.id || id;
    if (!docId) return;
    let disposed = false;
    setPdf(null);
    setLoadError(null);

    const task = loadPdf(fileUrl(docId));
    void task.promise
      .then(value => {
        if (disposed) return;
        setPdf(value);
        // Also retrieve raw source bytes directly from PDF.js proxy for export reliability
        void value.getData().then(bytes => {
          if (!disposed) setSourceBytes(bytes);
        }).catch(() => undefined);
      })
      .catch(err => {
        if (!disposed) {
          setLoadError(formatPdfLoadError(err));
        }
      });

    void fetch(fileUrl(docId), { credentials: 'same-origin' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then(buf => {
        if (!disposed) setSourceBytes(new Uint8Array(buf));
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      void task.destroy().catch(() => undefined);
    };
  }, [data?.id, id, loadAttempt]);

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

  // Keyboard shortcut listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (isField) return;

      if (e.key === 'Escape') {
        setSelectedIds(new Set());
        setSelectedSpan(null);
        setEditingSpanId(null);
        setTool('select');
        return;
      }

      if (e.key === 'Enter' && selectedSpan && !editingSpanId) {
        e.preventDefault();
        setEditingSpanId(selectedSpan.id);
        return;
      }

      if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setTool('edit-text');
        setSelectedIds(new Set());
        if (sourceBytes) void loadSpansForPage(page);
        return;
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault();
        deleteSelected();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          if (tool === 'edit-text' && nativeEditsFuture.length > 0) {
            const nextState = nativeEditsFuture[nativeEditsFuture.length - 1];
            setNativeEditsPast(prev => [...prev, nativeEdits]);
            setNativeEditsFuture(prev => prev.slice(0, -1));
            setNativeEdits(nextState);
            return;
          }
          setHistory(redoHistory);
        } else {
          if (tool === 'edit-text' && nativeEditsPast.length > 0) {
            const prevState = nativeEditsPast[nativeEditsPast.length - 1];
            setNativeEditsFuture(prev => [...prev, nativeEdits]);
            setNativeEditsPast(prev => prev.slice(0, -1));
            setNativeEdits(prevState);
            return;
          }
          setHistory(undoHistory);
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (tool === 'edit-text' && nativeEditsFuture.length > 0) {
          const nextState = nativeEditsFuture[nativeEditsFuture.length - 1];
          setNativeEditsPast(prev => [...prev, nativeEdits]);
          setNativeEditsFuture(prev => prev.slice(0, -1));
          setNativeEdits(nextState);
          return;
        }
        setHistory(redoHistory);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        if (selectedIds.size > 0) {
          const d = duplicateEditorObjects(objects, selectedIds);
          pushObjects(d.next);
          setSelectedIds(new Set(d.newIds));
        }
        return;
      }

      if (selectedIds.size > 0 && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft') dx = -delta;
        if (e.key === 'ArrowRight') dx = delta;
        if (e.key === 'ArrowUp') dy = -delta;
        if (e.key === 'ArrowDown') dy = delta;
        pushObjects(objects.map(o => selectedIds.has(o.id) ? { ...o, x: Math.max(0, o.x + dx), y: Math.max(0, o.y + dy) } : o));
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, objects]);

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
    if (tool === 'select' || tool === 'edit-text') {
      if (e.target === e.currentTarget) {
        setSelectedIds(new Set());
        setSelectedSpan(null);
      }
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

    if (dragState.kind === 'move') {
      setHistory(h => ({
        ...h,
        present: h.present.map(o => {
          if (o.id !== dragState.objId || o.pageIndex !== pageIndex) return o;
          return { ...o, x: Math.max(0, dragState.origX + dx), y: Math.max(0, dragState.origY + dy) };
        }),
      }));
      return;
    }

    if (dragState.kind === 'resize') {
      const handle = dragState.handle || 'se';
      let nextX = dragState.origX;
      let nextY = dragState.origY;
      let nextW = dragState.origW;
      let nextH = dragState.origH;

      if (handle === 'se') {
        nextW = Math.max(16, dragState.origW + dx);
        nextH = Math.max(12, dragState.origH + dy);
      } else if (handle === 'sw') {
        const rawW = dragState.origW - dx;
        if (rawW >= 16) {
          nextX = dragState.origX + dx;
          nextW = rawW;
        }
        nextH = Math.max(12, dragState.origH + dy);
      } else if (handle === 'ne') {
        nextW = Math.max(16, dragState.origW + dx);
        const rawH = dragState.origH - dy;
        if (rawH >= 12) {
          nextY = dragState.origY + dy;
          nextH = rawH;
        }
      } else if (handle === 'nw') {
        const rawW = dragState.origW - dx;
        if (rawW >= 16) {
          nextX = dragState.origX + dx;
          nextW = rawW;
        }
        const rawH = dragState.origH - dy;
        if (rawH >= 12) {
          nextY = dragState.origY + dy;
          nextH = rawH;
        }
      }

      setHistory(h => ({
        ...h,
        present: h.present.map(o => (o.id === dragState.objId && o.pageIndex === pageIndex
          ? { ...o, x: nextX, y: nextY, width: nextW, height: nextH }
          : o)),
      }));
    }
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

  async function loadSpansForPage(pageNum: number) {
    if (nativeSpansByPage[pageNum] || loadingSpansPages[pageNum] || !sourceBytes) return;
    setLoadingSpansPages(prev => ({ ...prev, [pageNum]: true }));
    try {
      const f = new File(
        [sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer],
        data?.filename || 'doc.pdf',
        { type: 'application/pdf' },
      );
      const res = await toolsApi.nativeTextSpans({ file: f }, pageNum);
      setNativeSpansByPage(prev => ({ ...prev, [pageNum]: res.spans }));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not extract page text spans.');
    } finally {
      setLoadingSpansPages(prev => ({ ...prev, [pageNum]: false }));
    }
  }

  useEffect(() => {
    if (tool === 'edit-text' && sourceBytes) {
      void loadSpansForPage(page);
    }
  }, [tool, page, !!sourceBytes]);

  function pushNativeEdits(updater: (prev: Record<string, NativeTextEdit>) => Record<string, NativeTextEdit>) {
    setNativeEditsPast(prev => [...prev.slice(-49), nativeEdits]);
    setNativeEditsFuture([]);
    setNativeEdits(updater);
  }

  function commitSpanEdit(span: NativeTextSpan, newText: string, extra?: { font_name?: string; font_size?: number; color?: string }) {
    setEditingSpanId(null);
    const fontName = extra?.font_name || editingFont || span.font;
    const fontSize = extra?.font_size ?? editingFontSize ?? span.font_size;
    const color = extra?.color || editingColor || span.color;

    if (newText === span.text && fontName === span.font && fontSize === span.font_size && color === span.color) {
      if (nativeEdits[span.id]) {
        pushNativeEdits(prev => {
          const next = { ...prev };
          delete next[span.id];
          return next;
        });
      }
      return;
    }

    const edit: NativeTextEdit = {
      spanId: span.id,
      page: span.page,
      bbox: span.bbox,
      origin: span.origin,
      original_text: span.text,
      new_text: newText,
      font_name: fontName,
      font_size: fontSize,
      color,
      flags: span.flags,
    };
    pushNativeEdits(prev => ({ ...prev, [span.id]: edit }));
    setStatusMsg(`Edited text "${span.text}" -> "${newText}". Staged for native PDF export.`);
  }

  function revertSpanEdit(spanId: string) {
    if (!nativeEdits[spanId]) return;
    pushNativeEdits(prev => {
      const next = { ...prev };
      delete next[spanId];
      return next;
    });
    const span = Object.values(nativeSpansByPage).flat().find(s => s.id === spanId);
    if (span) {
      setEditingText(span.text);
      setEditingFont(span.font);
      setEditingFontSize(span.font_size);
      setEditingColor(span.color);
    }
    setStatusMsg('Reverted text edit to original PDF text.');
  }

  async function runExport(saveCopy: boolean) {
    if (!sourceBytes || !data) return;
    setBusy(true); setErrorMsg(null); setStatusMsg(null);
    try {
      let currentBytes = sourceBytes;
      const editsList = Object.values(nativeEdits);
      if (editsList.length > 0) {
        setStatusMsg(`Applying ${editsList.length} genuine native text edits to PDF...`);
        const f = new File(
          [sourceBytes.buffer.slice(sourceBytes.byteOffset, sourceBytes.byteOffset + sourceBytes.byteLength) as ArrayBuffer],
          data.filename,
          { type: 'application/pdf' },
        );
        const res = await toolsApi.nativeApplyEdits({ file: f }, editsList);
        currentBytes = new Uint8Array(await res.blob.arrayBuffer());
      }

      const outBytes = await exportEditedPdf(currentBytes, objects);
      const outName = data.filename.replace(/\.pdf$/i, '') + '-edited.pdf';
      if (saveCopy) {
        const f = new File([outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength) as ArrayBuffer], outName, { type: 'application/pdf' });
        const saved = await uploadPdf(f, () => undefined, new AbortController().signal);
        await queryClient.invalidateQueries({ queryKey: ['files'] });
        setStatusMsg(`Saved edited copy "${saved.filename}" (${fileSize(saved.size_bytes)}) to workspace.`);
      } else {
        triggerDownload(outBytes, outName);
        const editCountMsg = editsList.length > 0 ? ` (${editsList.length} native text edits)` : '';
        setStatusMsg(`Exported "${outName}" (${fileSize(outBytes.byteLength)})${editCountMsg}.`);
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

  function handleAlign(action: ObjectAlignAction) {
    pushObjects(alignEditorObjects(objects, selectedIds, action, dims.width, dims.height));
  }

  return (
    <div className="viewer" onPointerUp={() => setDragState(null)}>
      <header className="viewer-header">
        <div className="viewer-header-left">
          <Link to={data ? `/documents/${data.id}` : '/'} className="icon-button" title="Back to viewer" aria-label="Back to viewer">
            <ArrowLeft size={18} />
          </Link>
          <div className="viewer-title">
            <strong>{data ? data.filename : (fileQuery.isError ? 'Document not found' : 'PDF Editor')}</strong>
            <span className="viewer-title-sub">
              {data ? `${data.page_count} ${data.page_count === 1 ? 'page' : 'pages'} · ${objects.length} placed objects` : (fileQuery.isError ? 'Unable to load document' : 'Loading…')}
            </span>
          </div>
        </div>

        {data && (
          <div className="document-actions">
            <button className="button secondary small" disabled={busy || !sourceBytes} onClick={() => void runExport(true)}>
              <Save size={15} /> Save copy
            </button>
            <button className="button primary small" disabled={busy || !sourceBytes} onClick={() => void runExport(false)}>
              <Download size={15} /> Export PDF
            </button>
          </div>
        )}
      </header>

      {fileQuery.error && (
        <div className="viewer-error">
          <ErrorNotice error={fileQuery.error} onRetry={() => void fileQuery.refetch()} />
          <Link to="/" className="text-link">Return to workspace</Link>
        </div>
      )}
      {loadError && (
        <div className="viewer-error">
          <ErrorNotice error={loadError} onRetry={() => setLoadAttempt(v => v + 1)} />
          <Link to="/" className="text-link">Return to workspace</Link>
        </div>
      )}

      {data && pdf && (
        <>
          <div className="viewer-toolbar" role="toolbar" aria-label="Editor tools">
            <div className="toolbar-segment">
              <button className="icon-button" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!history.past.length} onClick={() => setHistory(undoHistory)}>
                <Undo2 size={16} />
              </button>
              <button className="icon-button" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!history.future.length} onClick={() => setHistory(redoHistory)}>
                <Redo2 size={16} />
              </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-segment">
              <button
                className={`icon-button ${tool === 'select' ? 'tool-active' : ''}`}
                title="Select & transform (V / Esc)"
                aria-label="Select"
                onClick={() => { setTool('select'); setSelectedSpan(null); }}
              >
                <MousePointer2 size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'edit-text' ? 'tool-active' : ''}`}
                title="Edit Existing PDF Text (E)"
                aria-label="Edit Existing Text"
                onClick={() => {
                  setTool('edit-text');
                  setSelectedIds(new Set());
                  if (sourceBytes) void loadSpansForPage(page);
                }}
              >
                <PenTool size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'text' ? 'tool-active' : ''}`}
                title="Insert text box (T)"
                aria-label="Insert text"
                onClick={() => { setTool('text'); setSelectedSpan(null); }}
              >
                <Type size={16} />
              </button>
              <button
                className="icon-button"
                title="Insert image"
                aria-label="Insert image"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon size={16} />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="visually-hidden"
                onChange={e => { handleImageUpload(e.target.files?.[0]); e.target.value = ''; }}
              />

              <button
                className={`icon-button ${tool === 'rect' ? 'tool-active' : ''}`}
                title="Rectangle shape"
                aria-label="Rectangle"
                onClick={() => setTool('rect')}
              >
                <Square size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'circle' ? 'tool-active' : ''}`}
                title="Ellipse shape"
                aria-label="Ellipse"
                onClick={() => setTool('circle')}
              >
                <Circle size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'line' ? 'tool-active' : ''}`}
                title="Line shape"
                aria-label="Line"
                onClick={() => setTool('line')}
              >
                <Minus size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'arrow' ? 'tool-active' : ''}`}
                title="Arrow pointer"
                aria-label="Arrow"
                onClick={() => setTool('arrow')}
              >
                <ArrowUpRight size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'ink' ? 'tool-active' : ''}`}
                title="Freehand drawing pen"
                aria-label="Freehand draw"
                onClick={() => setTool('ink')}
              >
                <PenTool size={16} />
              </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-segment">
              <button
                className={`icon-button ${tool === 'highlight' ? 'tool-active' : ''}`}
                title="Highlight annotation (/Annots)"
                aria-label="Highlight"
                onClick={() => setTool('highlight')}
              >
                <Highlighter size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'underline' ? 'tool-active' : ''}`}
                title="Underline annotation"
                aria-label="Underline"
                onClick={() => setTool('underline')}
              >
                <Underline size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'strikeout' ? 'tool-active' : ''}`}
                title="Strikeout annotation"
                aria-label="Strikeout"
                onClick={() => setTool('strikeout')}
              >
                <Strikethrough size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'note' ? 'tool-active' : ''}`}
                title="Sticky note comment"
                aria-label="Sticky note"
                onClick={() => setTool('note')}
              >
                <StickyNote size={16} />
              </button>
              <button
                className={`icon-button ${tool === 'stamp' ? 'tool-active' : ''}`}
                title="Stamp approval annotation"
                aria-label="Stamp"
                onClick={() => setTool('stamp')}
              >
                <Stamp size={16} />
              </button>
              <button
                className="icon-button"
                title="Draw, type, or upload visual signature"
                aria-label="Visual signature"
                onClick={() => setShowSigModal(true)}
              >
                <Signature size={16} />
              </button>
            </div>

            <div className="toolbar-divider" />

            <div className="toolbar-segment zoom-controls">
              <button className="icon-button" aria-label="Zoom out" onClick={() => setZoom(Math.max(0.25, scale - 0.15))}>
                <Minus size={15} />
              </button>
              <select
                className="zoom-select"
                aria-label="Select zoom level"
                value={typeof zoom === 'number' ? `${Math.round(zoom * 100)}%` : zoom}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'width' || val === 'page') setZoom(val);
                  else setZoom(parseFloat(val) / 100);
                }}
              >
                <option value="width">Fit Width</option>
                <option value="page">Fit Page</option>
                <option value="50%">50%</option>
                <option value="75%">75%</option>
                <option value="100%">100%</option>
                <option value="125%">125%</option>
                <option value="150%">150%</option>
                <option value="200%">200%</option>
              </select>
              <button className="icon-button" aria-label="Zoom in" onClick={() => setZoom(Math.min(2.5, scale + 0.15))}>
                <Plus size={15} />
              </button>
            </div>

            {tool !== 'select' && (
              <span className="tool-hint-badge">
                Click canvas to place {tool}
              </span>
            )}
          </div>

          {(errorMsg || statusMsg) && (
            <div className="editor-status-bar">
              {errorMsg && (
                <div className="error-notice" role="alert">
                  <p>{errorMsg}</p>
                  <button type="button" className="icon-button small" onClick={() => setErrorMsg(null)} aria-label="Dismiss error">
                    <X size={14} />
                  </button>
                </div>
              )}
              {statusMsg && (
                <div className="upload-result done" role="status">
                  <p style={{ margin: 0 }}>{statusMsg}</p>
                  <button type="button" className="icon-button small" onClick={() => setStatusMsg(null)} aria-label="Dismiss message">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="editor-body">
            {/* Left Rail: Thumbnails */}
            <aside className="page-panel is-open" aria-label="Page thumbnails rail">
              <div className="panel-header">
                <h3 className="pages-label">Pages <span>{data.page_count}</span></h3>
              </div>
              <ol className="thumbnail-list">
                {data.pages.map(info => (
                  <li key={info.index}>
                    <button
                      type="button"
                      className={`thumbnail-button ${page === info.index + 1 ? 'selected' : ''}`}
                      onClick={() => {
                        setPage(info.index + 1);
                        scrollRef.current?.querySelector(`[data-page="${info.index + 1}"]`)?.scrollIntoView({ block: 'start' });
                      }}
                    >
                      <PageCanvas pdf={pdf} info={info} scale={110 / Math.max(info.width, info.height)} rotation={0} thumbnail />
                      <span className="thumbnail-page-number">{info.index + 1}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </aside>

            {/* Center Canvas: Pages Stack */}
            <div ref={scrollRef} className="document-scroll" aria-label="Editor canvas viewport">
              <div className="pages-stack">
                {data.pages.map(info => {
                  const pageObjs = objects.filter(o => o.pageIndex === info.index);
                  return (
                    <div key={info.index} className="editor-page-wrapper" data-page={info.index + 1} style={{ position: 'relative' }}>
                      <PageCanvas pdf={pdf} info={info} scale={scale} rotation={0} onActive={idx => setPage(idx + 1)} />
                      <div
                        className={`editor-overlay ${tool !== 'select' && tool !== 'edit-text' ? 'placing' : ''}`}
                        onClick={e => handleCanvasClick(info.index, e)}
                        onPointerDown={e => handleCanvasPointerDown(info.index, e)}
                        onPointerMove={e => handleCanvasPointerMove(info.index, e)}
                      >
                        {/* Real Native Existing-PDF Text Spans Overlay */}
                        {tool === 'edit-text' && (nativeSpansByPage[info.index + 1] || []).map(span => {
                          const edit = nativeEdits[span.id];
                          const isHovered = hoveredSpanId === span.id;
                          const isSelected = selectedSpan?.id === span.id;
                          const isEditing = editingSpanId === span.id;
                          const displayText = edit ? edit.new_text : span.text;
                          const displayColor = edit?.color || span.color;
                          const displaySize = (edit?.font_size || span.font_size) * scale;
                          const isKhmer = hasKhmer(edit ? edit.new_text : span.text);
                          const khmerFamily = "'KhmerOSBattambang', 'Noto Sans Khmer', sans-serif";
                          const displayFont = isKhmer
                            ? (edit?.font_name ? `'${edit.font_name}', ${khmerFamily}` : khmerFamily)
                            : (edit?.font_name || span.standard_font || 'Helvetica, sans-serif');

                          const spanStyle: React.CSSProperties = {
                            position: 'absolute',
                            left: span.bbox[0] * scale,
                            top: span.bbox[1] * scale,
                            width: Math.max(16, (span.bbox[2] - span.bbox[0]) * scale),
                            height: Math.max(14, (span.bbox[3] - span.bbox[1]) * scale),
                            zIndex: isEditing ? 35 : isSelected ? 25 : isHovered ? 20 : 12,
                          };

                          if (isEditing) {
                            return (
                              <div key={span.id} style={spanStyle} onClick={e => e.stopPropagation()}>
                                <input
                                  className="existing-text-inline-input"
                                  autoFocus
                                  value={editingText}
                                  onChange={e => setEditingText(e.target.value)}
                                  onCompositionStart={() => setIsComposing(true)}
                                  onCompositionEnd={() => setIsComposing(false)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !isComposing) {
                                      e.preventDefault();
                                      commitSpanEdit(span, editingText);
                                    } else if (e.key === 'Escape') {
                                      e.preventDefault();
                                      setEditingSpanId(null);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (!isComposing) {
                                      commitSpanEdit(span, editingText);
                                    }
                                  }}
                                  style={{
                                    fontSize: displaySize,
                                    color: displayColor,
                                    fontFamily: displayFont,
                                  }}
                                />
                              </div>
                            );
                          }

                          return (
                            <div
                              key={span.id}
                              className={`existing-text-span ${isSelected ? 'selected' : ''} ${edit ? 'edited' : ''}`}
                              style={spanStyle}
                              title={`Click to select, double-click or Enter to edit: "${displayText}"`}
                              onPointerEnter={() => setHoveredSpanId(span.id)}
                              onPointerLeave={() => setHoveredSpanId(null)}
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedSpan(span);
                                setEditingText(edit ? edit.new_text : span.text);
                                setEditingFont(edit?.font_name || span.font);
                                setEditingFontSize(edit?.font_size || span.font_size);
                                setEditingColor(edit?.color || span.color);
                              }}
                              onDoubleClick={e => {
                                e.stopPropagation();
                                setSelectedSpan(span);
                                setEditingSpanId(span.id);
                                setEditingText(edit ? edit.new_text : span.text);
                                setEditingFont(edit?.font_name || span.font);
                                setEditingFontSize(edit?.font_size || span.font_size);
                                setEditingColor(edit?.color || span.color);
                              }}
                            >
                              {edit && (
                                <div
                                  className="existing-text-replacement"
                                  style={{
                                    color: displayColor,
                                    fontSize: displaySize,
                                    fontFamily: displayFont,
                                  }}
                                >
                                  {edit.new_text}
                                </div>
                              )}
                            </div>
                          );
                        })}
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

                              {/* 4-corner interactive resize handles */}
                              {isSel && obj.kind !== 'ink' && (
                                <>
                                  <div
                                    className="resize-handle handle-se"
                                    title="Resize"
                                    onPointerDown={e => {
                                      e.stopPropagation();
                                      setDragState({
                                        kind: 'resize',
                                        handle: 'se',
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
                                  <div
                                    className="resize-handle handle-sw"
                                    title="Resize"
                                    onPointerDown={e => {
                                      e.stopPropagation();
                                      setDragState({
                                        kind: 'resize',
                                        handle: 'sw',
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
                                  <div
                                    className="resize-handle handle-ne"
                                    title="Resize"
                                    onPointerDown={e => {
                                      e.stopPropagation();
                                      setDragState({
                                        kind: 'resize',
                                        handle: 'ne',
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
                                  <div
                                    className="resize-handle handle-nw"
                                    title="Resize"
                                    onPointerDown={e => {
                                      e.stopPropagation();
                                      setDragState({
                                        kind: 'resize',
                                        handle: 'nw',
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
                                </>
                              )}
                            </div>
                          );
                        })}

                        {/* Freehand Ink strokes */}
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

            {/* Right Rail: Properties & Native Stream Inspector */}
            <aside className="properties-panel" aria-label="Properties inspector">
              <div className="panel-header">
                <h3>Properties</h3>
                {tool === 'edit-text' && (
                  <span className="native-badge-pill"><PenTool size={11} /> Existing Text</span>
                )}
                {selectedObjects.length > 0 && tool !== 'edit-text' && (
                  <span className="badge available">{selectedObjects.length} selected</span>
                )}
              </div>

              {/* Native Existing-Text Inspector */}
              {tool === 'edit-text' && selectedSpan && (
                <div className="prop-group">
                  <div className="panel-heading">
                    <h4 style={{ margin: 0, fontSize: 13 }}>Edit PDF Text (Page {selectedSpan.page})</h4>
                    {nativeEdits[selectedSpan.id] && (
                      <span className="badge available">Edited</span>
                    )}
                  </div>

                  <div className="prop-row" style={{ marginTop: 8 }}>
                    <span className="prop-label">Original text</span>
                    <div style={{ fontSize: 12, padding: '4px 6px', background: 'var(--bg-subtle)', borderRadius: 4, wordBreak: 'break-word', border: '1px solid var(--border)' }}>
                      {selectedSpan.text}
                    </div>
                  </div>

                  <div className="prop-row" style={{ marginTop: 8 }}>
                    <span className="prop-label">Replacement text</span>
                    <textarea
                      rows={3}
                      aria-label="Replacement text"
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 13, padding: 6, borderRadius: 4, border: '1px solid var(--border)' }}
                    />
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Font</span>
                    <select value={editingFont} onChange={e => setEditingFont(e.target.value)}>
                      <option value={selectedSpan.font}>{selectedSpan.font} (Detected)</option>
                      <optgroup label="Khmer Fonts">
                        <option value="KhmerOSBattambang">KhmerOS Battambang</option>
                        <option value="KhmerOS">KhmerOS (Regular)</option>
                        <option value="KhmerOSMuol">KhmerOS Muol (Heading)</option>
                        <option value="Noto Sans Khmer">Noto Sans Khmer</option>
                        <option value="Noto Serif Khmer">Noto Serif Khmer</option>
                      </optgroup>
                      <optgroup label="Standard Latin Fonts">
                        <option value="helv">Helvetica / Arial (Standard Sans)</option>
                        <option value="times-roman">Times Roman (Standard Serif)</option>
                        <option value="courier">Courier (Monospace)</option>
                      </optgroup>
                    </select>
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Size</span>
                    <input
                      type="number"
                      min={6}
                      max={120}
                      step={0.5}
                      value={editingFontSize}
                      onChange={e => setEditingFontSize(Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                    <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>pt</span>
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Color</span>
                    <div className="color-swatches-row">
                      <input
                        type="color"
                        className="color-picker-input"
                        value={editingColor}
                        onChange={e => setEditingColor(e.target.value)}
                      />
                      {PRESET_COLORS.map(c => (
                        <button
                          key={c.value}
                          type="button"
                          className={`swatch-circle ${editingColor === c.value ? 'active' : ''}`}
                          style={{ backgroundColor: c.value }}
                          title={c.label}
                          onClick={() => setEditingColor(c.value)}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="tool-panel-actions" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      className="button primary small"
                      onClick={() => commitSpanEdit(selectedSpan, editingText, { font_name: editingFont, font_size: editingFontSize, color: editingColor })}
                    >
                      Apply text change
                    </button>
                    {nativeEdits[selectedSpan.id] && (
                      <button
                        type="button"
                        className="button danger small"
                        onClick={() => revertSpanEdit(selectedSpan.id)}
                      >
                        Revert
                      </button>
                    )}
                    <button
                      type="button"
                      className="button quiet small"
                      onClick={() => setSelectedSpan(null)}
                    >
                      Done
                    </button>
                  </div>

                  {selectedSpan.is_subset && (
                    <small className="muted" style={{ display: 'block', marginTop: 8, fontSize: 11 }}>
                      {hasKhmer(selectedSpan.text)
                        ? `Embedded subset font (${selectedSpan.font}). Replacements are shaped and rendered with high-fidelity OpenType font (KhmerOSBattambang).`
                        : `Embedded subset font (${selectedSpan.font}). Replacement text will be reconstructed with high-fidelity matching glyphs.`}
                    </small>
                  )}
                </div>
              )}

              {tool === 'edit-text' && !selectedSpan && (
                <div className="inspector-empty-state">
                  <PenTool size={24} strokeWidth={1.5} className="muted" />
                  <p>Click any existing text on the PDF to select and edit it. Double-click or press Enter to edit directly in-place.</p>
                  {Object.keys(nativeEdits).length > 0 && (
                    <div style={{ width: '100%', marginTop: 10, textAlign: 'left' }}>
                      <strong style={{ fontSize: 12 }}>Staged text edits ({Object.keys(nativeEdits).length}):</strong>
                      <ul className="native-list" style={{ marginTop: 4 }}>
                        {Object.values(nativeEdits).map(ed => (
                          <li key={ed.spanId} style={{ fontSize: 12 }}>
                            <span>&ldquo;{ed.original_text}&rdquo; &rarr; <strong>&ldquo;{ed.new_text}&rdquo;</strong></span>
                            <button className="text-link" style={{ fontSize: 11, color: 'var(--rust)' }} onClick={() => revertSpanEdit(ed.spanId)}>Revert</button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {tool !== 'edit-text' && !selectedObjects.length && (
                <div className="inspector-empty-state">
                  <Move size={24} strokeWidth={1.5} className="muted" />
                  <p>Select any text, shape, image, or annotation on the canvas to inspect and edit its properties.</p>
                </div>
              )}

              {tool !== 'edit-text' && selectedObjects.length > 0 && (
                <div className="prop-group">
                  <div className="tool-panel-actions">
                    <button
                      type="button"
                      className="button quiet small"
                      onClick={() => { const d = duplicateEditorObjects(objects, selectedIds); pushObjects(d.next); setSelectedIds(new Set(d.newIds)); }}
                      title="Duplicate (Ctrl+D)"
                    >
                      <Copy size={13} /> Duplicate
                    </button>
                    <button
                      type="button"
                      className="button danger small"
                      onClick={deleteSelected}
                      title="Delete (Backspace / Del)"
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Align</span>
                    <div className="document-actions">
                      <button type="button" className="icon-button" title="Align left" onClick={() => handleAlign('left')}><AlignLeft size={14} /></button>
                      <button type="button" className="icon-button" title="Align center" onClick={() => handleAlign('center')}><AlignCenter size={14} /></button>
                      <button type="button" className="icon-button" title="Align right" onClick={() => handleAlign('right')}><AlignRight size={14} /></button>
                      <button type="button" className="icon-button" title="Align top" onClick={() => handleAlign('top')}><ArrowUp size={14} /></button>
                      <button type="button" className="icon-button" title="Align middle" onClick={() => handleAlign('middle')}><Minus size={14} /></button>
                      <button type="button" className="icon-button" title="Align bottom" onClick={() => handleAlign('bottom')}><ArrowDown size={14} /></button>
                    </div>
                  </div>

                  <div className="prop-row">
                    <span className="prop-label">Arrange</span>
                    <div className="document-actions">
                      <button
                        type="button"
                        className="button quiet small"
                        title="Bring layer forward"
                        onClick={() => pushObjects(reorderZIndex(objects, selectedIds, 'bringForward'))}
                      >
                        Forward
                      </button>
                      <button
                        type="button"
                        className="button quiet small"
                        title="Send layer backward"
                        onClick={() => pushObjects(reorderZIndex(objects, selectedIds, 'sendBackward'))}
                      >
                        Backward
                      </button>
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
                        <span>Font family</span>
                        <select value={primarySelected.fontFamily || 'Helvetica'} onChange={e => updateSelected({ fontFamily: e.target.value as FontFamilyOption })}>
                          <option value="Helvetica">Helvetica (Sans-Serif)</option>
                          <option value="TimesRoman">Times Roman (Serif)</option>
                          <option value="Courier">Courier (Monospace)</option>
                        </select>
                      </label>
                      <label className="prop-field">
                        <span>Font size ({primarySelected.fontSize || 14} pt)</span>
                        <input type="range" min={8} max={72} value={primarySelected.fontSize || 14} onChange={e => updateSelected({ fontSize: Number(e.target.value) })} />
                      </label>
                      <div className="prop-row">
                        <span className="prop-label">Alignment</span>
                        <div className="document-actions">
                          <button type="button" className={`icon-button ${primarySelected.align === 'left' ? 'tool-active' : ''}`} onClick={() => updateSelected({ align: 'left' })} title="Left"><AlignLeft size={14} /></button>
                          <button type="button" className={`icon-button ${primarySelected.align === 'center' ? 'tool-active' : ''}`} onClick={() => updateSelected({ align: 'center' })} title="Center"><AlignCenter size={14} /></button>
                          <button type="button" className={`icon-button ${primarySelected.align === 'right' ? 'tool-active' : ''}`} onClick={() => updateSelected({ align: 'right' })} title="Right"><AlignRight size={14} /></button>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="prop-field">
                    <span>Preset colors</span>
                    <div className="color-swatches-row">
                      {PRESET_COLORS.map(sw => (
                        <button
                          key={sw.value}
                          type="button"
                          className={`swatch-circle ${primarySelected.color === sw.value ? 'active' : ''}`}
                          style={{ backgroundColor: sw.value }}
                          title={sw.label}
                          onClick={() => updateSelected({ color: sw.value })}
                        />
                      ))}
                      <input
                        type="color"
                        className="color-picker-input"
                        value={primarySelected.color}
                        onChange={e => updateSelected({ color: e.target.value })}
                        title="Custom hex color"
                      />
                    </div>
                  </div>

                  {(primarySelected.kind === 'rect' || primarySelected.kind === 'circle') && (
                    <>
                      <label className="prop-field">
                        <span>Border width ({primarySelected.strokeWidth ?? 2}px)</span>
                        <input type="range" min={0} max={12} value={primarySelected.strokeWidth ?? 2} onChange={e => updateSelected({ strokeWidth: Number(e.target.value) })} />
                      </label>
                      <label className="prop-field">
                        <span>Fill color</span>
                        <select value={primarySelected.fillColor || 'transparent'} onChange={e => updateSelected({ fillColor: e.target.value })}>
                          <option value="transparent">Transparent (None)</option>
                          <option value="#e4efec">Soft pine</option>
                          <option value="#fef6e6">Warm amber</option>
                          <option value="#ffffff">Pure white</option>
                          <option value="#1c302e">Dark ink</option>
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
                  <h4 style={{ margin: 0, fontSize: 13 }}><Wrench size={13} /> Native stream editor (Page {page})</h4>
                  <button className="button quiet small" disabled={nativeLoading || !sourceBytes} onClick={() => void inspectNativePage()}>
                    <Search size={13} /> Inspect
                  </button>
                </div>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 8px' }}>
                  Inspects and replaces text operators in the underlying PDF stream. Subset and CID fonts are protected from glyph corruption.
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
