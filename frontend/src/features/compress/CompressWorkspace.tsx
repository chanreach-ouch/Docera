import { ArrowLeft, Download, Gauge, Server } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

export function CompressWorkspace() {
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [preset, setPreset] = useState<'lossless' | 'balanced' | 'compact'>('balanced');
  const [stripMetadata, setStripMetadata] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<{
    original_bytes: number;
    compressed_bytes: number;
    saved_bytes: number;
    percent_change: number;
    was_reduced: boolean;
    recompressed_images: number;
    deduped_images: number;
    warning?: string | null;
  }> | null>(null);

  async function runCompress() {
    if (!source) return;
    setBusy(true); setError(null); setOutput(null);
    try {
      const res = await toolsApi.compress(
        source.kind === 'local' ? { file: source.file } : { fileId: source.fileId },
        preset,
        stripMetadata,
      );
      setOutput(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compression failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;Server processing — private session</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>Compress & Optimize PDF</h1>
          <p>Reduce file size with QPDF stream optimization, resource deduplication, and image downsampling.</p>
        </div>

        <section className="tool-panel">
          <SourcePdfPicker value={source} onChange={s => { setSource(s); setOutput(null); setError(null); }} />
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          <div className="preset-grid">
            <label className={`preset-card ${preset === 'lossless' ? 'selected' : ''}`}>
              <input type="radio" name="preset" checked={preset === 'lossless'} onChange={() => setPreset('lossless')} />
              <strong>Lossless structural</strong>
              <span>Compresses object streams & deduplicates identical images without re-encoding photos.</span>
            </label>
            <label className={`preset-card ${preset === 'balanced' ? 'selected' : ''}`}>
              <input type="radio" name="preset" checked={preset === 'balanced'} onChange={() => setPreset('balanced')} />
              <strong>Balanced (150 DPI)</strong>
              <span>Downsamples large photos to 150 DPI and recompresses JPEG streams at quality 78.</span>
            </label>
            <label className={`preset-card ${preset === 'compact' ? 'selected' : ''}`}>
              <input type="radio" name="preset" checked={preset === 'compact'} onChange={() => setPreset('compact')} />
              <strong>Compact (96 DPI)</strong>
              <span>Aggressive 96 DPI image optimization and metadata cleanup for smallest email-ready size.</span>
            </label>
          </div>

          <label className="checkbox-row">
            <input type="checkbox" checked={stripMetadata} onChange={e => setStripMetadata(e.target.checked)} />
            <span>Remove document metadata (DocInfo & XMP)</span>
          </label>

          <div className="tool-panel-actions">
            <button className="button primary" disabled={!source || busy} onClick={() => void runCompress()}>
              <Gauge size={16} /> {busy ? 'Optimizing…' : 'Compress PDF'}
            </button>
          </div>

          {output && (
            <div className="result-summary">
              <div className="metrics-row">
                <div><small>Original size</small><strong>{fileSize(output.report.original_bytes)}</strong></div>
                <div><small>Result size</small><strong>{fileSize(output.report.compressed_bytes)}</strong></div>
                <div>
                  <small>Change</small>
                  <strong>{output.report.was_reduced ? `${output.report.percent_change}% (${fileSize(output.report.saved_bytes)} saved)` : '0% (already optimal)'}</strong>
                </div>
                <div><small>Images optimized</small><strong>{output.report.recompressed_images} recompressed · {output.report.deduped_images} deduped</strong></div>
              </div>
              {output.report.warning && <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{output.report.warning}</p>}
              <div className="tool-output-bar" style={{ marginTop: 12 }}>
                <span>{output.filename}</span>
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
