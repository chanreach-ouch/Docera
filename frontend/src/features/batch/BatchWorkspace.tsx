import { ArrowLeft, Download, Layers, Server, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

export function BatchWorkspace() {
  const [files, setFiles] = useState<File[]>([]);
  const [operation, setOperation] = useState<'compress' | 'to_png' | 'to_jpeg' | 'strip_metadata' | 'rotate_90'>('compress');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<{
    operation: string;
    total: number;
    succeeded: number;
    failed: number;
    items: { file: string; status: string; error?: string; saved_bytes?: number; pages?: number }[];
  }> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function runBatch() {
    if (!files.length) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      setOutput(await toolsApi.batch(files, operation));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Batch job failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;Batch ZIP processing</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>Batch PDF Processing</h1>
          <p>Process multiple PDFs in one job with per-file error isolation and download everything in a single ZIP archive.</p>
        </div>

        <section className="tool-panel">
          <div className="tool-panel-actions">
            <button className="button primary" onClick={() => inputRef.current?.click()}><Upload size={16} /> Select PDFs</button>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="visually-hidden" onChange={e => { setFiles(Array.from(e.target.files || [])); setOutput(null); }} />
            <label className="prop-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <span>Operation</span>
              <select value={operation} onChange={e => setOperation(e.target.value as typeof operation)}>
                <option value="compress">Compress (Balanced)</option>
                <option value="to_png">Convert to PNG images</option>
                <option value="to_jpeg">Convert to JPEG images</option>
                <option value="strip_metadata">Strip metadata & sanitize</option>
                <option value="rotate_90">Rotate all pages +90°</option>
              </select>
            </label>
            <button className="button secondary" disabled={!files.length || busy} onClick={() => void runBatch()}>
              <Layers size={15} /> {busy ? 'Processing batch…' : `Run on ${files.length} files`}
            </button>
          </div>

          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          {files.length > 0 && (
            <ul className="document-list">
              {files.map((f, i) => (
                <li key={`${i}-${f.name}`}>
                  <div className="document-name"><strong>{f.name}</strong><span>{fileSize(f.size)}</span></div>
                </li>
              ))}
            </ul>
          )}

          {output && (
            <div className="result-summary">
              <p style={{ margin: '0 0 8px' }}>
                <strong>Batch summary:</strong> {output.report.succeeded} succeeded, {output.report.failed} failed (of {output.report.total})
              </p>
              <ul className="document-list" style={{ marginBottom: 12 }}>
                {output.report.items.map((item, i) => (
                  <li key={`${i}-${item.file}`}>
                    <div className="document-name">
                      <strong>{item.file}</strong>
                      <span>{item.status === 'ok' ? 'Processed cleanly' : `Failed: ${item.error}`}</span>
                    </div>
                    <span className={`badge ${item.status === 'ok' ? 'available' : ''}`}>{item.status}</span>
                  </li>
                ))}
              </ul>
              <div className="tool-output-bar">
                <span><strong>{output.filename}</strong> · {fileSize(output.blob.size)}</span>
                <button className="button primary small" onClick={() => triggerDownload(output.blob, output.filename)}>
                  <Download size={15} /> Download ZIP
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
