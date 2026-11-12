import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, ScanText, Server } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

export function OcrWorkspace() {
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [lang, setLang] = useState('eng');
  const [dpi, setDpi] = useState(200);
  const [pagesCsv, setPagesCsv] = useState('');
  const [scanReport, setScanReport] = useState<{ page_count: number; scanned_pages: number[]; pages: { page: number; char_count: number; image_count: number; needs_ocr: boolean }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<{ engine: string; language: string; average_confidence: number | null; text: string }> | null>(null);

  const capsQuery = useQuery({ queryKey: ['ocr-caps'], queryFn: toolsApi.ocrCapabilities });

  async function detectScans() {
    if (!source) return;
    setBusy(true); setError(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.ocrDetectScans(src);
      setScanReport(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan detection failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runOcr() {
    if (!source) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.ocrProcess(src, lang, dpi, pagesCsv);
      setOutput(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'OCR failed.');
    } finally {
      setBusy(false);
    }
  }

  const availableLangs = capsQuery.data?.engines.flatMap(e => e.languages) ?? [];

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;Server OCR — private session</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>OCR & Scan Detection</h1>
          <p>Detect scanned pages and generate searchable PDFs with an invisible text layer aligned to recognized words.</p>
        </div>

        <section className="tool-panel">
          <h3>OCR engine availability</h3>
          {capsQuery.data && (
            <ul className="document-list">
              {capsQuery.data.engines.map(eng => (
                <li key={eng.id}>
                  <div className="document-name">
                    <strong>{eng.name}</strong>
                    <span>{eng.available ? `Installed (${eng.languages.map(l => l.code).join(', ') || 'default'})` : (eng.note || 'Not installed on this server')}</span>
                  </div>
                  <span className={`badge ${eng.available ? 'available' : ''}`}>{eng.available ? 'Ready' : 'Unavailable'}</span>
                </li>
              ))}
            </ul>
          )}

          <SourcePdfPicker value={source} onChange={s => { setSource(s); setScanReport(null); setOutput(null); setError(null); }} />
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          <div className="form-grid">
            <label className="prop-field">
              <span>Language</span>
              <select value={lang} onChange={e => setLang(e.target.value)}>
                {availableLangs.length
                  ? availableLangs.map(l => <option key={l.code} value={l.code}>{l.label}</option>)
                  : <option value="eng">English (eng — requires Tesseract)</option>}
              </select>
            </label>
            <label className="prop-field">
              <span>Render DPI</span>
              <select value={dpi} onChange={e => setDpi(Number(e.target.value))}>
                <option value={150}>150 DPI</option>
                <option value={200}>200 DPI (recommended)</option>
                <option value={300}>300 DPI (small text)</option>
              </select>
            </label>
            <label className="prop-field">
              <span>Pages (optional, e.g. 1, 2)</span>
              <input type="text" value={pagesCsv} onChange={e => setPagesCsv(e.target.value)} placeholder="All pages" />
            </label>
          </div>

          <div className="tool-panel-actions">
            <button className="button secondary" disabled={!source || busy} onClick={() => void detectScans()}>Detect scanned pages</button>
            <button className="button primary" disabled={!source || busy || !capsQuery.data?.available} onClick={() => void runOcr()}>
              <ScanText size={16} /> {busy ? 'Processing…' : 'Run OCR & Build Searchable PDF'}
            </button>
          </div>

          {scanReport && (
            <div className="result-summary">
              <strong>Scan check:</strong> {scanReport.scanned_pages.length
                ? `Pages ${scanReport.scanned_pages.join(', ')} contain images without selectable text.`
                : `All ${scanReport.page_count} pages already contain selectable text.`}
            </div>
          )}

          {output && (
            <div className="result-summary">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Engine:</strong> {output.report.engine} · <strong>Language:</strong> {output.report.language}
                {output.report.average_confidence != null && <> · <strong>Avg confidence:</strong> {output.report.average_confidence}%</>}
              </p>
              <textarea readOnly rows={5} value={output.report.text} aria-label="Recognized text" style={{ width: '100%', marginBottom: 10 }} />
              <div className="tool-output-bar">
                <span><strong>{output.filename}</strong> · {fileSize(output.blob.size)}</span>
                <button className="button primary small" onClick={() => triggerDownload(output.blob, output.filename)}>
                  <Download size={15} /> Download Searchable PDF
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
