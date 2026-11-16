import { Check, Download, Minimize2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

export function CompressWorkspace() {
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [preset, setPreset] = useState<'lossless' | 'balanced' | 'compact'>('balanced');
  const stripMetadata = false;
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
    setBusy(true);
    setError(null);
    setOutput(null);
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

  const originalBytes = source ? source.size : 12.4 * 1024 * 1024;

  const estimatedBytes = preset === 'compact'
    ? Math.round(originalBytes * 0.25)
    : preset === 'balanced'
    ? Math.round(originalBytes * 0.45)
    : Math.round(originalBytes * 0.85);

  const estimatedReduction = preset === 'compact' ? 75 : preset === 'balanced' ? 55 : 15;

  return (
    <div className="approved-tool-page">
      {/* Breadcrumb */}
      <nav className="approved-breadcrumb" aria-label="Breadcrumb">
        <Link to="/" className="breadcrumb-brand">
          <span className="breadcrumb-dot" />
          Docera
        </Link>
        <span className="breadcrumb-separator" aria-hidden="true">&gt;</span>
        <span className="breadcrumb-current">Compress PDF</span>
      </nav>

      {/* Tool Header */}
      <header className="approved-tool-header">
        <div className="tool-header-icon-wrap icon-bg-purple">
          <Minimize2 size={24} color="#8B5CF6" aria-hidden="true" />
        </div>
        <div className="tool-header-text">
          <h1 className="approved-tool-title">Compress PDF</h1>
          <p className="approved-tool-subtitle">
            Reduce your PDF file size while keeping good quality.
          </p>
        </div>
      </header>

      {/* Selected File Card or Upload Picker */}
      <section className="approved-file-section" aria-label="Selected Document">
        {source ? (
          <div className="approved-selected-card">
            <div className="selected-card-left">
              <div className="pdf-type-badge">PDF</div>
              <div className="selected-file-info">
                <span className="selected-filename">{source.name}</span>
                <span className="selected-file-meta">
                  {fileSize(source.size)} • 28 pages
                </span>
              </div>
            </div>
            <button
              type="button"
              className="remove-file-btn"
              onClick={() => {
                setSource(null);
                setOutput(null);
              }}
              aria-label="Remove document"
              title="Remove document"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="tool-upload-box">
            <SourcePdfPicker
              value={source}
              onChange={s => {
                setSource(s);
                setOutput(null);
                setError(null);
              }}
            />
          </div>
        )}
      </section>

      {error && (
        <div className="approved-error-banner" role="alert">
          <p>{error}</p>
        </div>
      )}

      {/* Two-Column Options & Estimate */}
      <div className="compress-options-layout">
        {/* Left: Compression Levels */}
        <div className="compress-levels-col">
          <h2 className="compress-section-heading">Compression level</h2>
          <div className="compress-radio-group" role="radiogroup" aria-label="Compression level">
            {/* High Compression / Compact */}
            <label className={`compress-radio-card ${preset === 'compact' ? 'selected' : ''}`}>
              <div className="radio-indicator">
                <input
                  type="radio"
                  name="compression-preset"
                  value="compact"
                  checked={preset === 'compact'}
                  onChange={() => setPreset('compact')}
                />
                <span className="radio-dot" />
              </div>
              <div className="radio-card-content">
                <div className="radio-card-title">High Compression</div>
                <div className="radio-card-desc">
                  Smaller file size, lower quality <span className="visually-hidden">Compact (96 DPI)</span>
                </div>
              </div>
            </label>

            {/* Balanced (Recommended) */}
            <label className={`compress-radio-card ${preset === 'balanced' ? 'selected' : ''}`}>
              <div className="radio-indicator">
                <input
                  type="radio"
                  name="compression-preset"
                  value="balanced"
                  checked={preset === 'balanced'}
                  onChange={() => setPreset('balanced')}
                />
                <span className="radio-dot" />
              </div>
              <div className="radio-card-content">
                <div className="radio-card-title">Balanced (Recommended)</div>
                <div className="radio-card-desc">
                  Good size and quality <span className="visually-hidden">Balanced (150 DPI)</span>
                </div>
              </div>
            </label>

            {/* Low Compression / Lossless */}
            <label className={`compress-radio-card ${preset === 'lossless' ? 'selected' : ''}`}>
              <div className="radio-indicator">
                <input
                  type="radio"
                  name="compression-preset"
                  value="lossless"
                  checked={preset === 'lossless'}
                  onChange={() => setPreset('lossless')}
                />
                <span className="radio-dot" />
              </div>
              <div className="radio-card-content">
                <div className="radio-card-title">Low Compression</div>
                <div className="radio-card-desc">
                  Larger file, best quality <span className="visually-hidden">Lossless structural</span>
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Right: Estimated Result Card */}
        <div className="compress-estimate-col">
          <div className="estimate-result-card">
            <h3 className="estimate-card-title">Estimated result</h3>
            <div className="estimate-rows">
              <div className="estimate-row">
                <span className="estimate-label">Original size</span>
                <span className="estimate-value">{fileSize(originalBytes)}</span>
              </div>
              <div className="estimate-row">
                <span className="estimate-label">Estimated size</span>
                <span className="estimate-value">≈ {fileSize(estimatedBytes)}</span>
              </div>
              <div className="estimate-row highlight-row">
                <span className="estimate-label">Reduction</span>
                <span className="estimate-reduction-value">≈ {estimatedReduction}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="approved-action-row">
        <button
          type="button"
          className="approved-primary-action-btn"
          disabled={!source || busy}
          onClick={() => void runCompress()}
        >
          <Minimize2 size={18} aria-hidden="true" />
          <span>{busy ? 'Compressing PDF…' : 'Compress PDF'}</span>
        </button>
      </div>

      {/* Post-Compression Result Banner */}
      {output && (
        <div className="approved-result-card" role="region" aria-label="Compression Results">
          <div className="result-header">
            <Check size={20} className="text-success" aria-hidden="true" />
            <h3>Compression Complete</h3>
          </div>
          <div className="result-metrics-grid">
            <div className="result-metric-item">
              <span className="metric-label">Original</span>
              <span className="metric-val">{fileSize(output.report.original_bytes)}</span>
            </div>
            <div className="result-metric-item">
              <span className="metric-label">Compressed</span>
              <span className="metric-val">{fileSize(output.report.compressed_bytes)}</span>
            </div>
            <div className="result-metric-item highlight">
              <span className="metric-label">Reduction</span>
              <span className="metric-val text-success">
                {output.report.percent_change}% ({fileSize(output.report.saved_bytes)} saved)
              </span>
            </div>
          </div>
          <div className="result-actions">
            <button
              type="button"
              className="approved-download-btn"
              onClick={() => triggerDownload(output.blob, output.filename)}
            >
              <Download size={16} /> Download Compressed PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
