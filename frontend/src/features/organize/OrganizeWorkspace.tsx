import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, Copy, Download, FilePlus2,
  FileText, Layers, Plus, RotateCcw, RotateCw, Scissors, ShieldCheck, Trash2, Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, fileUrl, uploadPdf } from '../../services/api';
import { fileSize } from '../../services/format';
import {
  exportOrganizedPdf,
  mergePdfs,
  packageZip,
  readOrganizePages,
  splitPdf,
  triggerDownload,
  type OrganizePageItem,
  type SplitPart,
} from './pdfOrganize';

type OrganizeMode = 'merge' | 'split' | 'pages';

interface LocalPdfFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  range: string;
}

export function OrganizeWorkspace({ initialMode = 'merge' }: { initialMode?: OrganizeMode }) {
  const [params] = useSearchParams();
  const requested = params.get('mode');
  const resolvedMode: OrganizeMode =
    requested === 'merge' || requested === 'split' || requested === 'pages' ? requested : initialMode;
  const [mode, setMode] = useState<OrganizeMode>(resolvedMode);
  useEffect(() => {
    if (requested === 'merge' || requested === 'split' || requested === 'pages') {
      setMode(requested);
    }
  }, [requested]);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Merge state
  const [mergeFiles, setMergeFiles] = useState<LocalPdfFile[]>([]);
  const [mergeResult, setMergeResult] = useState<{ name: string; bytes: Uint8Array; pageCount: number } | null>(null);

  // Split state
  const [splitSource, setSplitSource] = useState<LocalPdfFile | null>(null);
  const [splitMethod, setSplitMethod] = useState<'ranges' | 'every' | 'extract'>('ranges');
  const [rangesExpr, setRangesExpr] = useState('1-2');
  const [everyN, setEveryN] = useState(1);
  const [splitParts, setSplitParts] = useState<SplitPart[]>([]);

  // Page organizer state
  const [sources, setSources] = useState<{ name: string; bytes: Uint8Array }[]>([]);
  const [pages, setPages] = useState<OrganizePageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [orgResult, setOrgResult] = useState<{ name: string; bytes: Uint8Array; pageCount: number } | null>(null);

  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const mergeInput = useRef<HTMLInputElement>(null);
  const splitInput = useRef<HTMLInputElement>(null);
  const orgInput = useRef<HTMLInputElement>(null);
  const insertPdfInput = useRef<HTMLInputElement>(null);

  const sessionFiles = useQuery({ queryKey: ['files'], queryFn: api.files });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!requested && initialMode) {
      setMode(initialMode);
    }
  }, [initialMode, requested]);

  async function loadPdfBytes(file: File): Promise<LocalPdfFile> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const items = await readOrganizePages(bytes);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      bytes,
      pageCount: items.length,
      range: '',
    };
  }

  async function handleMergeFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null); setStatusMsg(null); setMergeResult(null);
    try {
      const loaded: LocalPdfFile[] = [];
      for (const f of Array.from(files)) {
        loaded.push(await loadPdfBytes(f));
      }
      setMergeFiles(prev => [...prev, ...loaded]);
    } catch {
      setError('One of the selected files could not be opened as an unencrypted PDF.');
    }
  }

  async function addSessionDocToMode(fileId: string, filename: string) {
    setError(null); setStatusMsg(null);
    try {
      const response = await fetch(fileUrl(fileId), { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Could not fetch session document.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const items = await readOrganizePages(bytes, mode === 'pages' ? sources.length : 0, filename);
      if (mode === 'merge') {
        setMergeFiles(prev => [...prev, { id: crypto.randomUUID(), name: filename, bytes, pageCount: items.length, range: '' }]);
      } else if (mode === 'split') {
        setSplitSource({ id: crypto.randomUUID(), name: filename, bytes, pageCount: items.length, range: '' });
        setSplitParts([]);
        setRangesExpr(items.length > 1 ? `1-${Math.ceil(items.length / 2)}` : '1');
      } else {
        if (!sources.length) {
          setSources([{ name: filename, bytes }]);
          setPages(items);
          setSelectedIds(new Set());
          setOrgResult(null);
        } else {
          const nextIdx = sources.length;
          const newItems = await readOrganizePages(bytes, nextIdx, filename);
          setSources(prev => [...prev, { name: filename, bytes }]);
          setPages(prev => [...prev, ...newItems]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load workspace document.');
    }
  }

  async function runMerge() {
    setError(null); setStatusMsg(null); setSavedDocId(null); setBusy(true);
    try {
      const res = await mergePdfs(mergeFiles.map(f => ({ name: f.name, bytes: f.bytes, range: f.range })));
      setMergeResult({ name: 'merged-document.pdf', bytes: res.bytes, pageCount: res.pageCount });
      setStatusMsg(`Merged ${mergeFiles.length} PDFs into ${res.pageCount} pages (${fileSize(res.bytes.byteLength)}). Verified valid PDF.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Merge failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSplitFile(files: FileList | null) {
    if (!files?.length) return;
    setError(null); setStatusMsg(null); setSplitParts([]);
    try {
      const loaded = await loadPdfBytes(files[0]);
      setSplitSource(loaded);
      setRangesExpr(loaded.pageCount > 1 ? `1-${Math.ceil(loaded.pageCount / 2)}` : '1');
    } catch {
      setError('Could not read the selected PDF. Encrypted or malformed PDFs cannot be split locally.');
    }
  }

  async function runSplit() {
    if (!splitSource) return;
    setError(null); setStatusMsg(null); setBusy(true);
    try {
      const parts = await splitPdf(
        splitSource.bytes,
        splitSource.name,
        splitMethod === 'every'
          ? { mode: 'every', everyN }
          : { mode: splitMethod, rangesExpr },
      );
      setSplitParts(parts);
      setStatusMsg(`Created ${parts.length} verified PDF ${parts.length === 1 ? 'output' : 'outputs'}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Split failed.');
    } finally {
      setBusy(false);
    }
  }

  async function downloadSplitZip() {
    if (!splitParts.length) return;
    const blob = await packageZip(splitParts.map(p => ({ name: p.name, bytes: p.bytes })));
    const stem = (splitSource?.name ?? 'split').replace(/\.pdf$/i, '');
    triggerDownload(blob, `${stem}-split.zip`, 'application/zip');
  }

  async function handleOrganizePrimary(files: FileList | null) {
    if (!files?.length) return;
    setError(null); setStatusMsg(null); setOrgResult(null); setSavedDocId(null);
    try {
      const file = files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const items = await readOrganizePages(bytes, 0);
      setSources([{ name: file.name, bytes }]);
      setPages(items);
      setSelectedIds(new Set());
    } catch {
      setError('Could not inspect PDF pages. Ensure the file is a valid, unencrypted PDF.');
    }
  }

  async function handleInsertPdf(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    try {
      const file = files[0];
      const bytes = new Uint8Array(await file.arrayBuffer());
      const nextIndex = sources.length;
      const items = await readOrganizePages(bytes, nextIndex, file.name);
      setSources(prev => [...prev, { name: file.name, bytes }]);
      setPages(prev => [...prev, ...items]);
      setStatusMsg(`Inserted ${items.length} pages from ${file.name}.`);
    } catch {
      setError('Could not read the PDF to insert.');
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectBatch(kind: 'all' | 'none' | 'odd' | 'even') {
    if (kind === 'none') { setSelectedIds(new Set()); return; }
    const next = new Set<string>();
    pages.forEach((p, idx) => {
      const oneBased = idx + 1;
      if (kind === 'all' || (kind === 'odd' && oneBased % 2 === 1) || (kind === 'even' && oneBased % 2 === 0)) {
        next.add(p.id);
      }
    });
    setSelectedIds(next);
  }

  function movePage(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= pages.length) return;
    setPages(prev => {
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function rotateSelected(delta: 90 | -90) {
    const targets = selectedIds.size ? selectedIds : new Set(pages.map(p => p.id));
    setPages(prev => prev.map(p => targets.has(p.id)
      ? { ...p, addedRotation: (((p.addedRotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270 }
      : p));
  }

  function duplicateSelected() {
    if (!selectedIds.size) return;
    const next: OrganizePageItem[] = [];
    for (const p of pages) {
      next.push(p);
      if (selectedIds.has(p.id)) {
        next.push({ ...p, id: `dup-${crypto.randomUUID()}` });
      }
    }
    setPages(next);
  }

  function deleteSelected() {
    if (!selectedIds.size) return;
    if (selectedIds.size >= pages.length) {
      setError('At least one page must remain in the document.');
      return;
    }
    setError(null);
    setPages(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
  }

  function insertBlankPage() {
    const ref = pages.find(p => selectedIds.has(p.id)) ?? pages[pages.length - 1];
    const width = ref?.width ?? 612;
    const height = ref?.height ?? 792;
    const blank: OrganizePageItem = {
      id: `blank-${crypto.randomUUID()}`,
      sourceIndex: -1,
      sourcePageIndex: -1,
      addedRotation: 0,
      width,
      height,
      baseRotation: 0,
      label: 'Blank page',
    };
    if (!selectedIds.size) {
      setPages(prev => [...prev, blank]);
      return;
    }
    const lastSelected = pages.map((p, i) => (selectedIds.has(p.id) ? i : -1)).filter(i => i >= 0).pop() ?? pages.length - 1;
    setPages(prev => [...prev.slice(0, lastSelected + 1), blank, ...prev.slice(lastSelected + 1)]);
  }

  async function runExportOrganized() {
    setError(null); setStatusMsg(null); setSavedDocId(null); setBusy(true);
    try {
      const res = await exportOrganizedPdf(sources.map(s => s.bytes), pages);
      const base = (sources[0]?.name ?? 'document').replace(/\.pdf$/i, '');
      setOrgResult({ name: `${base}-organized.pdf`, bytes: res.bytes, pageCount: res.pageCount });
      setStatusMsg(`Exported ${res.pageCount} pages (${fileSize(res.bytes.byteLength)}). Verified valid PDF.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveToWorkspace(bytes: Uint8Array, name: string) {
    setError(null); setBusy(true);
    try {
      const file = new File([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], name, { type: 'application/pdf' });
      const controller = new AbortController();
      const uploaded = await uploadPdf(file, () => undefined, controller.signal);
      setSavedDocId(uploaded.id);
      await queryClient.invalidateQueries({ queryKey: ['files'] });
      setStatusMsg(`Saved "${uploaded.filename}" to your workspace.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save to workspace.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="dashboard">
    <header className="workspace-header">
      <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
      <span className="badge available"><ShieldCheck size={13} aria-hidden="true" />&nbsp;Local browser processing — files stay on device</span>
    </header>
    <div className="dashboard-content">
      <div className="page-heading">
        <h1>Organize PDFs</h1>
        <p>Merge, split, extract, reorder, rotate, duplicate, and insert pages directly in your browser.</p>
      </div>

      <div className="tool-tabs" role="tablist" aria-label="Organization tools">
        <button role="tab" aria-selected={mode === 'merge'} className={`button ${mode === 'merge' ? 'primary' : 'secondary'} small`} onClick={() => { setMode('merge'); setError(null); setStatusMsg(null); }}><Layers size={15} /> Merge PDFs</button>
        <button role="tab" aria-selected={mode === 'split'} className={`button ${mode === 'split' ? 'primary' : 'secondary'} small`} onClick={() => { setMode('split'); setError(null); setStatusMsg(null); }}><Scissors size={15} /> Split & Extract</button>
        <button role="tab" aria-selected={mode === 'pages'} className={`button ${mode === 'pages' ? 'primary' : 'secondary'} small`} onClick={() => { setMode('pages'); setError(null); setStatusMsg(null); }}><FilePlus2 size={15} /> Organize Pages</button>
      </div>

      {sessionFiles.data?.files.length ? (
        <div className="session-picker">
          <span>Quick-add from your workspace:</span>
          {sessionFiles.data.files.slice(0, 6).map(doc => (
            <button key={doc.id} className="button quiet small" onClick={() => void addSessionDocToMode(doc.id, doc.filename)}>
              <FileText size={14} /> {doc.filename}
            </button>
          ))}
        </div>
      ) : null}

      {error && <div className="error-notice" role="alert"><p>{error}</p></div>}
      {statusMsg && <div className="upload-result done" role="status"><p style={{ margin: 0 }}>{statusMsg}</p></div>}

      {mode === 'merge' && (
        <section className="tool-panel" aria-label="Merge PDFs">
          <div className="tool-panel-actions">
            <button className="button primary" onClick={() => mergeInput.current?.click()}><Upload size={16} /> Add PDF files</button>
            <input ref={mergeInput} type="file" accept="application/pdf,.pdf" multiple className="visually-hidden" onChange={e => { void handleMergeFiles(e.target.files); e.target.value = ''; }} />
            <button className="button secondary" disabled={mergeFiles.length < 2 || busy} onClick={() => void runMerge()}>{busy ? 'Merging…' : `Merge ${mergeFiles.length} PDFs`}</button>
            {mergeFiles.length > 0 && <button className="button quiet small" onClick={() => { setMergeFiles([]); setMergeResult(null); }}>Clear list</button>}
          </div>

          {!mergeFiles.length && <p className="empty-state">Add two or more PDFs, reorder them, optionally enter page ranges (e.g. 1-3, 5), then merge.</p>}

          {mergeFiles.length > 0 && (
            <ol className="document-list">
              {mergeFiles.map((file, idx) => (
                <li key={file.id}>
                  <span className="file-symbol">{idx + 1}</span>
                  <div className="document-name">
                    <strong>{file.name}</strong>
                    <span>{file.pageCount} {file.pageCount === 1 ? 'page' : 'pages'} · {fileSize(file.bytes.byteLength)}</span>
                  </div>
                  <label className="range-inline">
                    <span className="visually-hidden">Pages for {file.name}</span>
                    <input
                      type="text"
                      placeholder="All pages (e.g. 1-3,5)"
                      value={file.range}
                      onChange={e => setMergeFiles(prev => prev.map(item => item.id === file.id ? { ...item, range: e.target.value } : item))}
                    />
                  </label>
                  <div className="document-actions">
                    <button className="icon-button" aria-label={`Move ${file.name} up`} disabled={idx === 0} onClick={() => setMergeFiles(prev => { const c = [...prev]; [c[idx - 1], c[idx]] = [c[idx], c[idx - 1]]; return c; })}><ArrowUp size={16} /></button>
                    <button className="icon-button" aria-label={`Move ${file.name} down`} disabled={idx === mergeFiles.length - 1} onClick={() => setMergeFiles(prev => { const c = [...prev]; [c[idx], c[idx + 1]] = [c[idx + 1], c[idx]]; return c; })}><ArrowDown size={16} /></button>
                    <button className="icon-button" aria-label={`Remove ${file.name}`} onClick={() => setMergeFiles(prev => prev.filter(item => item.id !== file.id))}><Trash2 size={16} /></button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {mergeResult && (
            <div className="tool-output-bar">
              <span><strong>{mergeResult.name}</strong> · {mergeResult.pageCount} pages · {fileSize(mergeResult.bytes.byteLength)}</span>
              <div className="document-actions">
                <button className="button primary small" onClick={() => triggerDownload(mergeResult.bytes, mergeResult.name)}><Download size={15} /> Download PDF</button>
                <button className="button secondary small" disabled={busy} onClick={() => void saveToWorkspace(mergeResult.bytes, mergeResult.name)}>Save to workspace</button>
                {savedDocId && <Link className="text-link" to={`/documents/${savedDocId}`}>Open in viewer</Link>}
              </div>
            </div>
          )}
        </section>
      )}

      {mode === 'split' && (
        <section className="tool-panel" aria-label="Split and Extract PDF">
          <div className="tool-panel-actions">
            <button className="button primary" onClick={() => splitInput.current?.click()}><Upload size={16} /> Choose PDF</button>
            <input ref={splitInput} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF to split" className="visually-hidden" onChange={e => { void handleSplitFile(e.target.files); e.target.value = ''; }} />
            {splitSource && <span className="muted">{splitSource.name} · {splitSource.pageCount} pages</span>}
          </div>

          {splitSource && (
            <div className="split-config">
              <div className="tool-tabs">
                <label className="radio-pill"><input type="radio" name="splitMode" checked={splitMethod === 'ranges'} onChange={() => setSplitMethod('ranges')} /> Split by ranges</label>
                <label className="radio-pill"><input type="radio" name="splitMode" checked={splitMethod === 'every'} onChange={() => setSplitMethod('every')} /> Every N pages</label>
                <label className="radio-pill"><input type="radio" name="splitMode" checked={splitMethod === 'extract'} onChange={() => setSplitMethod('extract')} /> Extract into 1 PDF</label>
              </div>

              {splitMethod === 'every' ? (
                <label className="field-row">
                  <span>Pages per output file</span>
                  <input type="number" min={1} max={splitSource.pageCount} value={everyN} onChange={e => setEveryN(Number(e.target.value))} />
                </label>
              ) : (
                <label className="field-row">
                  <span>{splitMethod === 'ranges' ? 'Ranges (each comma group becomes a PDF)' : 'Pages to extract'}</span>
                  <input type="text" value={rangesExpr} onChange={e => setRangesExpr(e.target.value)} placeholder="1-2, 3-4, 6" />
                </label>
              )}

              <div>
                <button className="button primary" disabled={busy} onClick={() => void runSplit()}>{busy ? 'Processing…' : 'Split PDF'}</button>
              </div>
            </div>
          )}

          {splitParts.length > 0 && (
            <div className="tool-output-list">
              <div className="section-heading">
                <strong>Output files ({splitParts.length})</strong>
                {splitParts.length > 1 && <button className="button primary small" onClick={() => void downloadSplitZip()}><Download size={15} /> Download all (.zip)</button>}
              </div>
              <ul className="document-list">
                {splitParts.map((part, i) => (
                  <li key={`${i}-${part.name}`}>
                    <span className="file-symbol"><FileText size={18} /></span>
                    <div className="document-name">
                      <strong>{part.name}</strong>
                      <span>{part.pageCount} {part.pageCount === 1 ? 'page' : 'pages'} · {fileSize(part.bytes.byteLength)}</span>
                    </div>
                    <button className="button secondary small" onClick={() => triggerDownload(part.bytes, part.name)}><Download size={14} /> Download</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {mode === 'pages' && (
        <section className="tool-panel" aria-label="Organize Pages">
          <div className="tool-panel-actions">
            <button className="button primary" onClick={() => orgInput.current?.click()}><Upload size={16} /> Open PDF</button>
            <input ref={orgInput} type="file" accept="application/pdf,.pdf" className="visually-hidden" onChange={e => { void handleOrganizePrimary(e.target.files); e.target.value = ''; }} />
            {pages.length > 0 && <>
              <button className="button secondary small" onClick={() => insertPdfInput.current?.click()}><FilePlus2 size={15} /> Insert PDF</button>
              <input ref={insertPdfInput} type="file" accept="application/pdf,.pdf" className="visually-hidden" onChange={e => { void handleInsertPdf(e.target.files); e.target.value = ''; }} />
              <button className="button secondary small" onClick={insertBlankPage}><Plus size={15} /> Blank page</button>
              <button className="button quiet small" onClick={() => setPages(prev => [...prev].reverse())}><ArrowUpDown size={15} /> Reverse</button>
            </>}
          </div>

          {pages.length > 0 && (
            <>
              <div className="batch-bar">
                <span>{selectedIds.size} of {pages.length} selected</span>
                <button className="text-link" onClick={() => selectBatch('all')}>All</button>
                <button className="text-link" onClick={() => selectBatch('odd')}>Odd</button>
                <button className="text-link" onClick={() => selectBatch('even')}>Even</button>
                <button className="text-link" onClick={() => selectBatch('none')}>None</button>
                <span className="toolbar-divider" />
                <button className="button quiet small" onClick={() => rotateSelected(-90)} title="Rotate left"><RotateCcw size={14} /> -90°</button>
                <button className="button quiet small" onClick={() => rotateSelected(90)} title="Rotate right"><RotateCw size={14} /> +90°</button>
                <button className="button quiet small" disabled={!selectedIds.size} onClick={duplicateSelected}><Copy size={14} /> Duplicate</button>
                <button className="button danger small" disabled={!selectedIds.size} onClick={deleteSelected}><Trash2 size={14} /> Delete</button>
                <button className="button primary small" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void runExportOrganized()}>{busy ? 'Exporting…' : 'Export PDF'}</button>
              </div>

              <div className="page-grid">
                {pages.map((item, idx) => {
                  const selected = selectedIds.has(item.id);
                  const totalRot = (item.baseRotation + item.addedRotation) % 360;
                  return (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={() => {
                        if (dragIndex !== null && dragIndex !== idx) movePage(dragIndex, idx - dragIndex);
                        setDragIndex(null);
                      }}
                      className={`page-card ${selected ? 'selected' : ''}`}
                    >
                      <label className="page-card-check">
                        <input type="checkbox" checked={selected} onChange={() => toggleSelect(item.id)} aria-label={`Select position ${idx + 1}`} />
                        <span>#{idx + 1}</span>
                      </label>
                      <div className="page-card-preview">
                        <span>{item.label}</span>
                        <small>{Math.round(item.width)} × {Math.round(item.height)} pt{totalRot ? ` · ${totalRot}°` : ''}</small>
                      </div>
                      <div className="page-card-actions">
                        <button className="icon-button" aria-label={`Move position ${idx + 1} left`} disabled={idx === 0} onClick={() => movePage(idx, -1)}><ArrowLeft size={14} /></button>
                        <button className="icon-button" aria-label={`Rotate position ${idx + 1}`} onClick={() => setPages(prev => prev.map(p => p.id === item.id ? { ...p, addedRotation: ((p.addedRotation + 90) % 360) as 0 | 90 | 180 | 270 } : p))}><RotateCw size={14} /></button>
                        <button className="icon-button" aria-label={`Move position ${idx + 1} right`} disabled={idx === pages.length - 1} onClick={() => movePage(idx, 1)}><ArrowRight size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {orgResult && (
            <div className="tool-output-bar">
              <span><strong>{orgResult.name}</strong> · {orgResult.pageCount} pages · {fileSize(orgResult.bytes.byteLength)}</span>
              <div className="document-actions">
                <button className="button primary small" onClick={() => triggerDownload(orgResult.bytes, orgResult.name)}><Download size={15} /> Download PDF</button>
                <button className="button secondary small" disabled={busy} onClick={() => void saveToWorkspace(orgResult.bytes, orgResult.name)}>Save to workspace</button>
                {savedDocId && <Link className="text-link" to={`/documents/${savedDocId}`}>Open in viewer</Link>}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  </div>;
}
