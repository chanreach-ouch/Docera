import { ArrowLeft, Download, FileOutput, Server } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

type ConvertDirection = 'pdf-to-image' | 'pdf-to-doc' | 'images-to-pdf' | 'office-to-pdf' | 'html-to-pdf';

export function ConvertWorkspace() {
  const [params] = useSearchParams();
  const dirParam = params.get('direction');
  const validDir = (v: string | null): v is ConvertDirection =>
    v === 'pdf-to-image' || v === 'pdf-to-doc' || v === 'images-to-pdf' || v === 'office-to-pdf' || v === 'html-to-pdf';
  const [direction, setDirection] = useState<ConvertDirection>(validDir(dirParam) ? dirParam : 'pdf-to-image');
  useEffect(() => {
    if (validDir(dirParam)) setDirection(dirParam);
  }, [dirParam]);
  const [source, setSource] = useState<SelectedPdfSource | null>(null);

  // PDF -> Image
  const [imgFmt, setImgFmt] = useState<'png' | 'jpeg'>('png');
  const [dpi, setDpi] = useState(150);
  const [quality, setQuality] = useState(88);
  const [pagesCsv, setPagesCsv] = useState('');

  // PDF -> Doc
  const [docTarget, setDocTarget] = useState<'docx' | 'xlsx' | 'pptx' | 'txt' | 'html'>('docx');
  const [docMode, setDocMode] = useState('default');

  // Images -> PDF
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState<'auto' | 'a4' | 'letter'>('auto');

  // Office -> PDF
  const [officeFile, setOfficeFile] = useState<File | null>(null);

  // HTML -> PDF
  const [htmlText, setHtmlText] = useState('<h1>Document Title</h1>\n<p>Write or paste HTML content to convert offline into a clean PDF.</p>');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<{
    limitations?: string | null;
    engine?: string;
    page_count?: number;
    table_count?: number;
    image_count?: number;
    page_size?: string;
  }> | null>(null);

  const imgInput = useRef<HTMLInputElement>(null);
  const officeInput = useRef<HTMLInputElement>(null);

  async function runConvert() {
    setBusy(true); setError(null); setOutput(null);
    try {
      if (direction === 'pdf-to-image') {
        if (!source) throw new Error('Choose a PDF first.');
        const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
        setOutput(await toolsApi.pdfToImages(src, imgFmt, dpi, quality, pagesCsv));
      } else if (direction === 'pdf-to-doc') {
        if (!source) throw new Error('Choose a PDF first.');
        const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
        setOutput(await toolsApi.pdfToDocument(src, docTarget, docMode));
      } else if (direction === 'images-to-pdf') {
        if (!imageFiles.length) throw new Error('Choose at least one PNG or JPEG image.');
        setOutput(await toolsApi.imagesToPdf(imageFiles, pageSize, 24));
      } else if (direction === 'office-to-pdf') {
        if (!officeFile) throw new Error('Choose a .docx, .xlsx, or .pptx file.');
        setOutput(await toolsApi.officeToPdf(officeFile));
      } else {
        setOutput(await toolsApi.htmlToPdf(htmlText));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Conversion failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;Server conversion — private session</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>Convert Documents & PDFs</h1>
          <p>Convert between PDF, PNG/JPEG images, Word, Excel, PowerPoint, Text, and HTML with clear fidelity disclosures.</p>
        </div>

        <div className="tool-tabs" role="tablist">
          <button className={`button ${direction === 'pdf-to-image' ? 'primary' : 'secondary'} small`} onClick={() => { setDirection('pdf-to-image'); setOutput(null); setError(null); }}>PDF → Images</button>
          <button className={`button ${direction === 'pdf-to-doc' ? 'primary' : 'secondary'} small`} onClick={() => { setDirection('pdf-to-doc'); setOutput(null); setError(null); }}>PDF → Office / Text / HTML</button>
          <button className={`button ${direction === 'images-to-pdf' ? 'primary' : 'secondary'} small`} onClick={() => { setDirection('images-to-pdf'); setOutput(null); setError(null); }}>Images → PDF</button>
          <button className={`button ${direction === 'office-to-pdf' ? 'primary' : 'secondary'} small`} onClick={() => { setDirection('office-to-pdf'); setOutput(null); setError(null); }}>Office → PDF</button>
          <button className={`button ${direction === 'html-to-pdf' ? 'primary' : 'secondary'} small`} onClick={() => { setDirection('html-to-pdf'); setOutput(null); setError(null); }}>HTML → PDF</button>
        </div>

        <section className="tool-panel">
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          {(direction === 'pdf-to-image' || direction === 'pdf-to-doc') && (
            <SourcePdfPicker value={source} onChange={s => { setSource(s); setOutput(null); }} />
          )}

          {direction === 'pdf-to-image' && (
            <div className="form-grid">
              <label className="prop-field">
                <span>Format</span>
                <select value={imgFmt} onChange={e => setImgFmt(e.target.value as 'png' | 'jpeg')}>
                  <option value="png">PNG (lossless)</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </label>
              <label className="prop-field">
                <span>Resolution (DPI)</span>
                <select value={dpi} onChange={e => setDpi(Number(e.target.value))}>
                  <option value={96}>96 DPI (screen)</option>
                  <option value={150}>150 DPI (standard)</option>
                  <option value={240}>240 DPI (high)</option>
                  <option value={300}>300 DPI (print)</option>
                </select>
              </label>
              {imgFmt === 'jpeg' && (
                <label className="prop-field">
                  <span>JPEG quality ({quality})</span>
                  <input type="range" min={50} max={95} value={quality} onChange={e => setQuality(Number(e.target.value))} />
                </label>
              )}
              <label className="prop-field">
                <span>Pages (optional, e.g. 1, 3)</span>
                <input type="text" value={pagesCsv} onChange={e => setPagesCsv(e.target.value)} placeholder="All pages" />
              </label>
            </div>
          )}

          {direction === 'pdf-to-doc' && (
            <div className="form-grid">
              <label className="prop-field">
                <span>Target format</span>
                <select value={docTarget} onChange={e => { setDocTarget(e.target.value as typeof docTarget); setDocMode('default'); }}>
                  <option value="docx">Word (.docx)</option>
                  <option value="xlsx">Excel (.xlsx — detected tables)</option>
                  <option value="pptx">PowerPoint (.pptx)</option>
                  <option value="txt">Plain Text (.txt)</option>
                  <option value="html">HTML (.html)</option>
                </select>
              </label>
              {docTarget === 'docx' && (
                <label className="prop-field">
                  <span>Word mode</span>
                  <select value={docMode} onChange={e => setDocMode(e.target.value)}>
                    <option value="default">Editable text & tables (layout simplified)</option>
                    <option value="page_images">Exact layout as page images</option>
                  </select>
                </label>
              )}
              {docTarget === 'pptx' && (
                <label className="prop-field">
                  <span>PowerPoint mode</span>
                  <select value={docMode} onChange={e => setDocMode(e.target.value)}>
                    <option value="default">Exact slide images (high visual fidelity)</option>
                    <option value="editable_text">Editable text boxes (graphics omitted)</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {direction === 'images-to-pdf' && (
            <div className="form-grid">
              <div className="prop-field">
                <button className="button secondary" onClick={() => imgInput.current?.click()}>Select PNG / JPEG / WebP images</button>
                <input ref={imgInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="visually-hidden" onChange={e => setImageFiles(Array.from(e.target.files || []))} />
                {imageFiles.length > 0 && <small className="muted">{imageFiles.length} images selected: {imageFiles.map(f => f.name).join(', ')}</small>}
              </div>
              <label className="prop-field">
                <span>Page size</span>
                <select value={pageSize} onChange={e => setPageSize(e.target.value as typeof pageSize)}>
                  <option value="auto">Fit to each image</option>
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                </select>
              </label>
            </div>
          )}

          {direction === 'office-to-pdf' && (
            <div className="prop-field">
              <button className="button secondary" onClick={() => officeInput.current?.click()}>Select .docx, .xlsx, or .pptx</button>
              <input ref={officeInput} type="file" accept=".docx,.xlsx,.pptx" className="visually-hidden" onChange={e => setOfficeFile(e.target.files?.[0] || null)} />
              {officeFile && <span className="muted">{officeFile.name} · {fileSize(officeFile.size)}</span>}
            </div>
          )}

          {direction === 'html-to-pdf' && (
            <label className="prop-field">
              <span>HTML input (scripts & external network requests are stripped for safety)</span>
              <textarea rows={7} value={htmlText} onChange={e => setHtmlText(e.target.value)} />
            </label>
          )}

          <div className="tool-panel-actions">
            <button className="button primary" disabled={busy} onClick={() => void runConvert()}>
              <FileOutput size={16} /> {busy ? 'Converting…' : 'Convert'}
            </button>
          </div>

          {output && (
            <div className="result-summary">
              {output.report.engine && <p style={{ margin: '0 0 6px', fontSize: 13 }}><strong>Engine:</strong> {output.report.engine}</p>}
              {output.report.limitations && <p className="muted" style={{ margin: '0 0 10px', fontSize: 13 }}>{output.report.limitations}</p>}
              <div className="tool-output-bar">
                <span><strong>{output.filename}</strong> · {fileSize(output.blob.size)}</span>
                <button className="button primary small" onClick={() => triggerDownload(output.blob, output.filename)}>
                  <Download size={15} /> Download
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
