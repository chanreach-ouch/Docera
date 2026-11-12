import { ArrowLeft, Download, Eraser, KeyRound, Lock, Server, ShieldCheck, Unlock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileUrl } from '../../services/api';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { loadPdf } from '../pdf-viewer/pdf';
import { triggerDownload } from '../organize/pdfOrganize';

interface RedactBox {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function SecurityWorkspace() {
  const [params] = useSearchParams();
  const tabParam = params.get('tab');
  const isTab = (v: string | null): v is 'protect' | 'unlock' | 'metadata' | 'redact' =>
    v === 'protect' || v === 'unlock' || v === 'metadata' || v === 'redact';
  const [tab, setTab] = useState<'protect' | 'unlock' | 'metadata' | 'redact'>(isTab(tabParam) ? tabParam : 'protect');
  useEffect(() => {
    if (isTab(tabParam)) setTab(tabParam);
  }, [tabParam]);
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<{ verified_removed?: boolean; remaining_chars_in_boxes?: number; removed_snippets_count?: number; removed_metadata_keys?: string[]; removed_active_items?: string[] }> | null>(null);

  // Encrypt
  const [userPassword, setUserPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(false);
  const [allowModify, setAllowModify] = useState(false);
  const [allowAnnotate, setAllowAnnotate] = useState(true);

  // Unlock
  const [lockedFile, setLockedFile] = useState<File | null>(null);
  const [unlockPassword, setUnlockPassword] = useState('');

  // Metadata
  const [metaInfo, setMetaInfo] = useState<{ docinfo: Record<string, string>; has_xmp: boolean; active_content: string[]; page_count: number } | null>(null);
  const [removeAllMeta, setRemoveAllMeta] = useState(true);
  const [sanitizeActive, setSanitizeActive] = useState(true);

  // Interactive Redaction preview
  const [redactPdf, setRedactPdf] = useState<PDFDocumentProxy | null>(null);
  const [redactPage, setRedactPage] = useState(1);
  const [pageDims, setPageDims] = useState({ width: 612, height: 792 });
  const [boxes, setBoxes] = useState<RedactBox[]>([]);
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewScale = 1.0;

  useEffect(() => {
    if (tab !== 'redact' || !source) { setRedactPdf(null); return; }
    let disposed = false;
    void (async () => {
      try {
        const bytes = source.kind === 'local'
          ? new Uint8Array(await source.file.arrayBuffer())
          : new Uint8Array(await (await fetch(fileUrl(source.fileId), { credentials: 'same-origin' })).arrayBuffer());
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        const doc = await loadPdf(blobUrl).promise;
        if (!disposed) { setRedactPdf(doc); setRedactPage(1); setBoxes([]); }
      } catch {
        if (!disposed) setError('Could not render PDF preview for redaction.');
      }
    })();
    return () => { disposed = true; };
  }, [tab, source]);

  useEffect(() => {
    if (!redactPdf || !canvasRef.current) return;
    let cancelled = false;
    void (async () => {
      const p = await redactPdf.getPage(redactPage);
      if (cancelled || !canvasRef.current) return;
      const vp = p.getViewport({ scale: previewScale });
      setPageDims({ width: vp.width, height: vp.height });
      canvasRef.current.width = vp.width;
      canvasRef.current.height = vp.height;
      await p.render({ canvas: canvasRef.current, viewport: vp }).promise;
    })();
    return () => { cancelled = true; };
  }, [redactPdf, redactPage]);

  async function runEncrypt() {
    if (!source) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      setOutput(await toolsApi.securityEncrypt(src, { userPassword, ownerPassword, allowPrint, allowCopy, allowModify, allowAnnotate }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Encryption failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runUnlock() {
    if (!lockedFile) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      setOutput(await toolsApi.securityUnlock(lockedFile, unlockPassword));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unlock failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runInspectMetadata() {
    if (!source) return;
    setBusy(true); setError(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      setMetaInfo(await toolsApi.securityInspectMetadata(src));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Metadata inspection failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runCleanMetadata() {
    if (!source) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      setOutput(await toolsApi.securityClean(src, removeAllMeta, sanitizeActive));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sanitization failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runRedact() {
    if (!source || !boxes.length) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      setOutput(await toolsApi.securityRedact(src, boxes.map(({ page, x, y, width, height }) => ({ page, x, y, width, height }))));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Redaction failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;AES-256 & Verified Redaction</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>PDF Security & Redaction</h1>
          <p>Protect PDFs with AES-256 encryption, unlock with authorized passwords, strip metadata/active content, and irreversibly redact sensitive regions.</p>
        </div>

        <div className="tool-tabs" role="tablist">
          <button className={`button ${tab === 'protect' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('protect'); setOutput(null); setError(null); }}><Lock size={14} /> Password Protect</button>
          <button className={`button ${tab === 'unlock' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('unlock'); setOutput(null); setError(null); }}><Unlock size={14} /> Unlock PDF</button>
          <button className={`button ${tab === 'metadata' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('metadata'); setOutput(null); setError(null); }}><KeyRound size={14} /> Metadata & Sanitize</button>
          <button className={`button ${tab === 'redact' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('redact'); setOutput(null); setError(null); }}><Eraser size={14} /> Content Redaction</button>
        </div>

        <section className="tool-panel">
          {tab !== 'unlock' && <SourcePdfPicker value={source} onChange={s => { setSource(s); setOutput(null); setMetaInfo(null); setError(null); }} />}
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          {tab === 'protect' && (
            <>
              <div className="form-grid">
                <label className="prop-field"><span>Open password (user)</span><input type="password" value={userPassword} onChange={e => setUserPassword(e.target.value)} /></label>
                <label className="prop-field"><span>Permissions password (owner, optional)</span><input type="password" value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} /></label>
              </div>
              <div className="tool-tabs">
                <label className="checkbox-row"><input type="checkbox" checked={allowPrint} onChange={e => setAllowPrint(e.target.checked)} /> Allow printing</label>
                <label className="checkbox-row"><input type="checkbox" checked={allowCopy} onChange={e => setAllowCopy(e.target.checked)} /> Allow copy/extract</label>
                <label className="checkbox-row"><input type="checkbox" checked={allowAnnotate} onChange={e => setAllowAnnotate(e.target.checked)} /> Allow annotations</label>
                <label className="checkbox-row"><input type="checkbox" checked={allowModify} onChange={e => setAllowModify(e.target.checked)} /> Allow modify</label>
              </div>
              <button className="button primary" disabled={!source || busy} onClick={() => void runEncrypt()}>Encrypt with AES-256</button>
            </>
          )}

          {tab === 'unlock' && (
            <div className="form-grid">
              <label className="prop-field"><span>Password-protected PDF</span><input type="file" accept="application/pdf,.pdf" onChange={e => setLockedFile(e.target.files?.[0] || null)} /></label>
              <label className="prop-field"><span>Authorized password</span><input type="password" value={unlockPassword} onChange={e => setUnlockPassword(e.target.value)} /></label>
              <div className="tool-panel-actions"><button className="button primary" disabled={!lockedFile || busy} onClick={() => void runUnlock()}>Unlock PDF</button></div>
            </div>
          )}

          {tab === 'metadata' && (
            <>
              <div className="tool-panel-actions">
                <button className="button secondary" disabled={!source || busy} onClick={() => void runInspectMetadata()}>Inspect metadata & active content</button>
              </div>
              {metaInfo && (
                <div className="result-summary">
                  <strong>DocInfo entries:</strong> {Object.keys(metaInfo.docinfo).length ? JSON.stringify(metaInfo.docinfo) : 'None'}
                  <br /><strong>XMP stream:</strong> {metaInfo.has_xmp ? 'Present' : 'None'}
                  <br /><strong>Active content (JS/Actions):</strong> {metaInfo.active_content.length ? metaInfo.active_content.join(', ') : 'None detected'}
                </div>
              )}
              <div className="tool-tabs">
                <label className="checkbox-row"><input type="checkbox" checked={removeAllMeta} onChange={e => setRemoveAllMeta(e.target.checked)} /> Remove all DocInfo & XMP metadata</label>
                <label className="checkbox-row"><input type="checkbox" checked={sanitizeActive} onChange={e => setSanitizeActive(e.target.checked)} /> Strip JavaScript, OpenAction & embedded files</label>
              </div>
              <button className="button primary" disabled={!source || busy} onClick={() => void runCleanMetadata()}>Clean & sanitize PDF</button>
            </>
          )}

          {tab === 'redact' && (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Drag rectangles over sensitive areas below. Redacted pages are permanently rebuilt without underlying text, vectors, or annotations, and verified with an independent text extractor.
              </p>
              {redactPdf && (
                <>
                  <div className="tool-panel-actions">
                    <button className="button quiet small" disabled={redactPage <= 1} onClick={() => setRedactPage(p => p - 1)}>Prev page</button>
                    <span>Page {redactPage} of {redactPdf.numPages}</span>
                    <button className="button quiet small" disabled={redactPage >= redactPdf.numPages} onClick={() => setRedactPage(p => p + 1)}>Next page</button>
                    <button className="button quiet small" disabled={!boxes.length} onClick={() => setBoxes([])}>Clear {boxes.length} boxes</button>
                    <button className="button danger small" style={{ marginLeft: 'auto' }} disabled={!boxes.length || busy} onClick={() => void runRedact()}>
                      {busy ? 'Redacting…' : `Apply permanent redaction (${boxes.length})`}
                    </button>
                  </div>
                  <div
                    className="redact-stage"
                    style={{ width: pageDims.width, height: pageDims.height }}
                    onPointerDown={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      setDrawingStart({ x: e.clientX - r.left, y: e.clientY - r.top });
                    }}
                    onPointerMove={e => {
                      if (!drawingStart) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const cx = e.clientX - r.left;
                      const cy = e.clientY - r.top;
                      setDraftBox({
                        x: Math.min(drawingStart.x, cx),
                        y: Math.min(drawingStart.y, cy),
                        width: Math.abs(cx - drawingStart.x),
                        height: Math.abs(cy - drawingStart.y),
                      });
                    }}
                    onPointerUp={() => {
                      if (draftBox && draftBox.width > 6 && draftBox.height > 6) {
                        setBoxes(prev => [...prev, { id: crypto.randomUUID(), page: redactPage, ...draftBox }]);
                      }
                      setDrawingStart(null);
                      setDraftBox(null);
                    }}
                  >
                    <canvas ref={canvasRef} style={{ display: 'block' }} />
                    {boxes.filter(b => b.page === redactPage).map(b => (
                      <div key={b.id} className="redact-box" style={{ left: b.x, top: b.y, width: b.width, height: b.height }} />
                    ))}
                    {draftBox && <div className="redact-box draft" style={{ left: draftBox.x, top: draftBox.y, width: draftBox.width, height: draftBox.height }} />}
                  </div>
                </>
              )}
            </>
          )}

          {output && (
            <div className="result-summary">
              {output.report.verified_removed !== undefined && (
                <p style={{ margin: '0 0 8px' }}>
                  <ShieldCheck size={15} style={{ verticalAlign: 'middle' }} /> <strong>Redaction verified:</strong> {output.report.verified_removed ? '0 extractable characters remain in redacted regions.' : 'Warning: some text remained.'} ({output.report.removed_snippets_count} snippets removed)
                </p>
              )}
              <div className="tool-output-bar">
                <span><strong>{output.filename}</strong> · {fileSize(output.blob.size)}</span>
                <button className="button primary small" onClick={() => triggerDownload(output.blob, output.filename)}>
                  <Download size={15} /> Download PDF
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
