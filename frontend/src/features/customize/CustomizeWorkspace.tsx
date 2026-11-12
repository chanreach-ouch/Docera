import { ArrowLeft, Download, ShieldCheck, Stamp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileUrl } from '../../services/api';
import { fileSize } from '../../services/format';
import { customizePdf, type CustomizeOptions } from '../editor/editorExport';
import { triggerDownload } from '../organize/pdfOrganize';

export function CustomizeWorkspace() {
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [watermarkText, setWatermarkText] = useState('CONFIDENTIAL');
  const [watermarkPosition, setWatermarkPosition] = useState<CustomizeOptions['watermarkPosition']>('center');
  const [watermarkOpacity, setWatermarkOpacity] = useState(0.25);
  const [watermarkRotation, setWatermarkRotation] = useState(-35);
  const [watermarkColor, setWatermarkColor] = useState('#163f3b');
  const [watermarkImageDataUrl, setWatermarkImageDataUrl] = useState<string | undefined>(undefined);
  const [enablePageNumbers, setEnablePageNumbers] = useState(true);
  const [pageNumPos, setPageNumPos] = useState<'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right'>('bottom-right');
  const [pageNumFmt, setPageNumFmt] = useState<'number' | 'of_total'>('of_total');
  const [startAt, setStartAt] = useState(1);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [cropMarginPt, setCropMarginPt] = useState(0);
  const [backgroundTint, setBackgroundTint] = useState('none');
  const [pageRangeExpr, setPageRangeExpr] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; bytes: Uint8Array } | null>(null);

  function handleWatermarkImage(file: File | undefined) {
    if (!file) { setWatermarkImageDataUrl(undefined); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') setWatermarkImageDataUrl(reader.result); };
    reader.readAsDataURL(file);
  }

  async function runCustomize() {
    if (!source) return;
    setBusy(true); setError(null); setResult(null);
    try {
      let raw: Uint8Array;
      if (source.kind === 'local') {
        raw = new Uint8Array(await source.file.arrayBuffer());
      } else {
        const res = await fetch(fileUrl(source.fileId), { credentials: 'same-origin' });
        if (!res.ok) throw new Error('Could not load workspace document.');
        raw = new Uint8Array(await res.arrayBuffer());
      }
      const out = await customizePdf(raw, {
        pageRangeExpr,
        watermarkText,
        watermarkColor,
        watermarkOpacity,
        watermarkRotation,
        watermarkPosition,
        watermarkImageDataUrl,
        pageNumbers: {
          enabled: enablePageNumbers,
          position: pageNumPos,
          format: pageNumFmt,
          startAt,
          fontSize: 10,
        },
        headerText,
        footerText,
        cropMarginPt,
        backgroundTint,
      });
      const stem = source.name.replace(/\.pdf$/i, '');
      setResult({ name: `${stem}-customized.pdf`, bytes: out });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Customization failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge available"><ShieldCheck size={13} />&nbsp;Local browser processing — files stay on device</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>Watermarks & Page Customization</h1>
          <p>Apply text or image watermarks, page numbering, headers, footers, crop margins, and background tints.</p>
        </div>

        <section className="tool-panel">
          <SourcePdfPicker value={source} onChange={s => { setSource(s); setResult(null); }} />
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          <div className="form-grid">
            <label className="prop-field">
              <span>Watermark text</span>
              <input type="text" value={watermarkText} onChange={e => setWatermarkText(e.target.value)} placeholder="Leave empty for none" />
            </label>
            <label className="prop-field">
              <span>Watermark position</span>
              <select value={watermarkPosition} onChange={e => setWatermarkPosition(e.target.value as CustomizeOptions['watermarkPosition'])}>
                <option value="center">Center</option>
                <option value="tiled">Tiled across page</option>
                <option value="top-left">Top left</option>
                <option value="top-right">Top right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="bottom-right">Bottom right</option>
              </select>
            </label>
            <label className="prop-field">
              <span>Opacity ({Math.round(watermarkOpacity * 100)}%)</span>
              <input type="range" min={0.05} max={0.9} step={0.05} value={watermarkOpacity} onChange={e => setWatermarkOpacity(Number(e.target.value))} />
            </label>
            <label className="prop-field">
              <span>Rotation (degrees)</span>
              <input type="number" min={-180} max={180} value={watermarkRotation} onChange={e => setWatermarkRotation(Number(e.target.value))} />
            </label>
            <label className="prop-field">
              <span>Watermark color</span>
              <input type="color" value={watermarkColor} onChange={e => setWatermarkColor(e.target.value)} />
            </label>
            <label className="prop-field">
              <span>Optional image watermark (PNG/JPG)</span>
              <input type="file" accept="image/png,image/jpeg" onChange={e => handleWatermarkImage(e.target.files?.[0])} />
            </label>
            <label className="prop-field">
              <span>Header text</span>
              <input type="text" value={headerText} onChange={e => setHeaderText(e.target.value)} placeholder="Top center header" />
            </label>
            <label className="prop-field">
              <span>Footer text</span>
              <input type="text" value={footerText} onChange={e => setFooterText(e.target.value)} placeholder="Bottom left footer" />
            </label>
            <label className="prop-field">
              <span>Page numbers</span>
              <select value={enablePageNumbers ? pageNumPos : 'off'} onChange={e => {
                if (e.target.value === 'off') setEnablePageNumbers(false);
                else { setEnablePageNumbers(true); setPageNumPos(e.target.value as typeof pageNumPos); }
              }}>
                <option value="off">Off</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-center">Bottom center</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-center">Top center</option>
                <option value="top-right">Top right</option>
              </select>
            </label>
            <label className="prop-field">
              <span>Number format & start</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={pageNumFmt} onChange={e => setPageNumFmt(e.target.value as typeof pageNumFmt)}>
                  <option value="of_total">Page 1 of N</option>
                  <option value="number">1, 2, 3</option>
                </select>
                <input type="number" min={1} value={startAt} onChange={e => setStartAt(Number(e.target.value))} style={{ width: 70 }} aria-label="Start page number" />
              </div>
            </label>
            <label className="prop-field">
              <span>Crop margin (pt from all edges)</span>
              <input type="number" min={0} max={180} value={cropMarginPt} onChange={e => setCropMarginPt(Number(e.target.value))} />
            </label>
            <label className="prop-field">
              <span>Background tint</span>
              <select value={backgroundTint} onChange={e => setBackgroundTint(e.target.value)}>
                <option value="none">None (white)</option>
                <option value="#f6f7f3">Warm paper</option>
                <option value="#e4efec">Soft pine</option>
                <option value="#fef6e6">Cream</option>
              </select>
            </label>
            <label className="prop-field">
              <span>Page range (optional)</span>
              <input type="text" value={pageRangeExpr} onChange={e => setPageRangeExpr(e.target.value)} placeholder="All pages (e.g. 1-3, 5)" />
            </label>
          </div>

          <div className="tool-panel-actions">
            <button className="button primary" disabled={!source || busy} onClick={() => void runCustomize()}>
              <Stamp size={16} /> {busy ? 'Applying…' : 'Apply customization'}
            </button>
          </div>

          {result && (
            <div className="tool-output-bar">
              <span><strong>{result.name}</strong> · {fileSize(result.bytes.byteLength)}</span>
              <button className="button primary small" onClick={() => triggerDownload(result.bytes, result.name)}>
                <Download size={15} /> Download PDF
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
