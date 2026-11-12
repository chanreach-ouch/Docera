import { ArrowLeft, CheckCircle2, Download, FileSignature, Plus, Server, ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';
import { SignaturePadModal } from '../editor/SignaturePadModal';
import { exportEditedPdf } from '../editor/editorExport';
import { fileUrl } from '../../services/api';

export function FormsSignWorkspace() {
  const [params] = useSearchParams();
  const tabParam = params.get('tab');
  const isTab = (v: string | null): v is 'forms' | 'visual-sign' | 'digital-sign' =>
    v === 'forms' || v === 'visual-sign' || v === 'digital-sign';
  const [tab, setTab] = useState<'forms' | 'visual-sign' | 'digital-sign'>(isTab(tabParam) ? tabParam : 'forms');
  useEffect(() => {
    if (isTab(tabParam)) setTab(tabParam);
  }, [tabParam]);
  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form inspection/fill
  const [fields, setFields] = useState<{ name: string; type: string; value: string | null; options: string[]; page: number | null }[]>([]);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [flatten, setFlatten] = useState(false);
  const [newFieldName, setNewFieldName] = useState('full_name');
  const [newFieldType, setNewFieldType] = useState<'text' | 'checkbox' | 'choice'>('text');
  const [newFieldPage, setNewFieldPage] = useState(1);
  const [newFieldX, setNewFieldX] = useState(72);
  const [newFieldY, setNewFieldY] = useState(160);

  // Visual signature
  const [showPad, setShowPad] = useState(false);
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null);
  const [sigPage, setSigPage] = useState(1);
  const [sigX, setSigX] = useState(72);
  const [sigY, setSigY] = useState(620);

  // Digital signature
  const [signerName, setSignerName] = useState('Docera Signer');
  const [reason, setReason] = useState('Approved and signed');
  const [location, setLocation] = useState('');
  const [certFile, setCertFile] = useState<File | undefined>(undefined);
  const [certPassword, setCertPassword] = useState('');
  const [verifyReport, setVerifyReport] = useState<{ signature_count: number; signatures: { field_name: string; intact: boolean; valid: boolean; signer: string; self_signed: boolean }[] } | null>(null);

  const [binaryOut, setBinaryOut] = useState<ToolBinaryResult<{ field_name?: string; self_signed?: boolean; certificate_subject?: string }> | null>(null);

  async function inspectForm() {
    if (!source) return;
    setBusy(true); setError(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.formsInspect(src);
      setFields(res.fields);
      const init: Record<string, string | boolean> = {};
      for (const f of res.fields) {
        init[f.name] = f.type === 'checkbox' ? f.value === '/Yes' || f.value === 'Yes' : (f.value || '');
      }
      setValues(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Form inspection failed.');
    } finally {
      setBusy(false);
    }
  }

  async function addFormField() {
    if (!source) return;
    setBusy(true); setError(null); setBinaryOut(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.formsCreate(src, [{
        name: newFieldName,
        type: newFieldType,
        page: newFieldPage,
        x: newFieldX,
        y: newFieldY,
        width: newFieldType === 'checkbox' ? 18 : 180,
        height: newFieldType === 'checkbox' ? 18 : 24,
      }]);
      setBinaryOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add form field.');
    } finally {
      setBusy(false);
    }
  }

  async function fillFormSubmit() {
    if (!source) return;
    setBusy(true); setError(null); setBinaryOut(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.formsFill(src, values, flatten);
      setBinaryOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save form values.');
    } finally {
      setBusy(false);
    }
  }

  async function applyVisualSignature() {
    if (!source || !sigDataUrl) return;
    setBusy(true); setError(null); setBinaryOut(null);
    try {
      const raw = source.kind === 'local'
        ? new Uint8Array(await source.file.arrayBuffer())
        : new Uint8Array(await (await fetch(fileUrl(source.fileId), { credentials: 'same-origin' })).arrayBuffer());
      const outBytes = await exportEditedPdf(raw, [{
        id: 'sig-1',
        kind: 'signature',
        pageIndex: Math.max(0, sigPage - 1),
        x: sigX,
        y: sigY,
        width: 170,
        height: 60,
        rotation: 0,
        opacity: 1,
        color: '#10302d',
        imageDataUrl: sigDataUrl,
      }]);
      const stem = source.name.replace(/\.pdf$/i, '');
      const blob = new Blob([outBytes.buffer.slice(outBytes.byteOffset, outBytes.byteOffset + outBytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
      setBinaryOut({ blob, filename: `${stem}-signed-visual.pdf`, report: {} });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Visual signature placement failed.');
    } finally {
      setBusy(false);
    }
  }

  async function applyDigitalSignature() {
    if (!source) return;
    setBusy(true); setError(null); setBinaryOut(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      const res = await toolsApi.signCryptographic(src, {
        signerName,
        reason,
        location,
        certificate: certFile,
        password: certPassword,
      });
      setBinaryOut(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cryptographic signing failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runVerifySignatures() {
    if (!source) return;
    setBusy(true); setError(null);
    try {
      const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
      setVerifyReport(await toolsApi.verifySignatures(src));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Signature verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="workspace-header">
        <Link className="text-link" to="/"><ArrowLeft size={16} /> Back to workspace</Link>
        <span className="badge"><Server size={13} />&nbsp;Forms & PKCS#7 Signatures</span>
      </header>
      <div className="dashboard-content">
        <div className="page-heading">
          <h1>Forms & Signatures</h1>
          <p>Detect, create, fill, and flatten AcroForm fields, place visual signatures, or apply cryptographic digital signatures.</p>
        </div>

        <div className="tool-tabs" role="tablist">
          <button className={`button ${tab === 'forms' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('forms'); setBinaryOut(null); setError(null); }}>PDF Forms</button>
          <button className={`button ${tab === 'visual-sign' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('visual-sign'); setBinaryOut(null); setError(null); }}>Visual Signature</button>
          <button className={`button ${tab === 'digital-sign' ? 'primary' : 'secondary'} small`} onClick={() => { setTab('digital-sign'); setBinaryOut(null); setError(null); }}>Cryptographic Digital Signature</button>
        </div>

        <section className="tool-panel">
          <SourcePdfPicker value={source} onChange={s => { setSource(s); setBinaryOut(null); setFields([]); setVerifyReport(null); }} />
          {error && <div className="error-notice" role="alert"><p>{error}</p></div>}

          {tab === 'forms' && (
            <>
              <div className="tool-panel-actions">
                <button className="button secondary" disabled={!source || busy} onClick={() => void inspectForm()}>Detect form fields</button>
              </div>

              {fields.length > 0 && (
                <div className="result-summary">
                  <h3>Fill detected fields ({fields.length})</h3>
                  <div className="form-grid">
                    {fields.map(f => (
                      <label key={f.name} className="prop-field">
                        <span>{f.name} ({f.type})</span>
                        {f.type === 'checkbox' ? (
                          <input type="checkbox" checked={Boolean(values[f.name])} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.checked }))} />
                        ) : f.type === 'choice' && f.options.length ? (
                          <select value={String(values[f.name] || '')} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))}>
                            {f.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : (
                          <input type="text" value={String(values[f.name] || '')} onChange={e => setValues(v => ({ ...v, [f.name]: e.target.value }))} />
                        )}
                      </label>
                    ))}
                  </div>
                  <label className="checkbox-row" style={{ marginTop: 10 }}>
                    <input type="checkbox" checked={flatten} onChange={e => setFlatten(e.target.checked)} />
                    <span>Flatten form fields into static page graphics on save</span>
                  </label>
                  <button className="button primary small" style={{ marginTop: 10 }} disabled={busy} onClick={() => void fillFormSubmit()}>Save completed form</button>
                </div>
              )}

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />
              <h3>Add a new form field</h3>
              <div className="form-grid">
                <label className="prop-field"><span>Field name</span><input type="text" value={newFieldName} onChange={e => setNewFieldName(e.target.value)} /></label>
                <label className="prop-field"><span>Type</span><select value={newFieldType} onChange={e => setNewFieldType(e.target.value as typeof newFieldType)}><option value="text">Text field</option><option value="checkbox">Checkbox</option><option value="choice">Dropdown</option></select></label>
                <label className="prop-field"><span>Page</span><input type="number" min={1} value={newFieldPage} onChange={e => setNewFieldPage(Number(e.target.value))} /></label>
                <label className="prop-field"><span>X / Y (pt from top-left)</span><div style={{ display: 'flex', gap: 6 }}><input type="number" value={newFieldX} onChange={e => setNewFieldX(Number(e.target.value))} style={{ width: 80 }} /><input type="number" value={newFieldY} onChange={e => setNewFieldY(Number(e.target.value))} style={{ width: 80 }} /></div></label>
              </div>
              <button className="button secondary small" disabled={!source || busy} onClick={() => void addFormField()}><Plus size={14} /> Add field to PDF</button>
            </>
          )}

          {tab === 'visual-sign' && (
            <>
              <div className="upload-result" style={{ borderColor: 'var(--amber-border)', background: 'var(--amber-bg)', color: 'var(--amber-text)' }}>
                <ShieldAlert size={18} />
                <div><strong>Visual signature only</strong><span>Places a drawn, typed, or uploaded image onto the page. It does not create a cryptographic certificate signature.</span></div>
              </div>
              <div className="tool-panel-actions">
                <button className="button secondary" onClick={() => setShowPad(true)}><FileSignature size={15} /> Create / change signature</button>
                {sigDataUrl && <img src={sigDataUrl} alt="Signature preview" style={{ height: 42, border: '1px solid var(--border)', padding: 4, background: '#fff' }} />}
              </div>
              <div className="form-grid">
                <label className="prop-field"><span>Page</span><input type="number" min={1} value={sigPage} onChange={e => setSigPage(Number(e.target.value))} /></label>
                <label className="prop-field"><span>X (pt)</span><input type="number" value={sigX} onChange={e => setSigX(Number(e.target.value))} /></label>
                <label className="prop-field"><span>Y from top (pt)</span><input type="number" value={sigY} onChange={e => setSigY(Number(e.target.value))} /></label>
              </div>
              <button className="button primary" disabled={!source || !sigDataUrl || busy} onClick={() => void applyVisualSignature()}>Place visual signature & export</button>
            </>
          )}

          {tab === 'digital-sign' && (
            <>
              <p className="muted" style={{ fontSize: 13 }}>
                Applies a standards-compatible CMS/PKCS#7 cryptographic signature (`/ByteRange` + `/Contents`) via pyHanko. Upload a `.p12`/`.pfx` certificate, or leave blank to generate a self-signed local test certificate (clearly marked self-signed).
              </p>
              <div className="form-grid">
                <label className="prop-field"><span>Signer name</span><input type="text" value={signerName} onChange={e => setSignerName(e.target.value)} /></label>
                <label className="prop-field"><span>Reason</span><input type="text" value={reason} onChange={e => setReason(e.target.value)} /></label>
                <label className="prop-field"><span>Location (optional)</span><input type="text" value={location} onChange={e => setLocation(e.target.value)} /></label>
                <label className="prop-field"><span>PKCS#12 (.p12 / .pfx, optional)</span><input type="file" accept=".p12,.pfx" onChange={e => setCertFile(e.target.files?.[0])} /></label>
                <label className="prop-field"><span>Certificate password</span><input type="password" value={certPassword} onChange={e => setCertPassword(e.target.value)} placeholder="Required for .p12/.pfx" /></label>
              </div>
              <div className="tool-panel-actions">
                <button className="button primary" disabled={!source || busy} onClick={() => void applyDigitalSignature()}>Sign cryptographically</button>
                <button className="button secondary" disabled={!source || busy} onClick={() => void runVerifySignatures()}>Verify existing signatures</button>
              </div>

              {verifyReport && (
                <div className="result-summary">
                  <strong>Signatures found: {verifyReport.signature_count}</strong>
                  {verifyReport.signatures.map(sig => (
                    <div key={sig.field_name} style={{ marginTop: 8, fontSize: 13 }}>
                      <CheckCircle2 size={14} style={{ verticalAlign: 'middle' }} /> <strong>{sig.field_name}</strong> · Signer: {sig.signer} · Integrity intact: {String(sig.intact)} · Valid: {String(sig.valid)} {sig.self_signed ? '(Self-signed)' : ''}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {binaryOut && (
            <div className="tool-output-bar">
              <span>
                <strong>{binaryOut.filename}</strong> · {fileSize(binaryOut.blob.size)}
                {binaryOut.report.field_name && <> · Field: {binaryOut.report.field_name} ({binaryOut.report.self_signed ? 'Self-signed certificate' : 'User certificate'})</>}
              </span>
              <button className="button primary small" onClick={() => triggerDownload(binaryOut.blob, binaryOut.filename)}>
                <Download size={15} /> Download PDF
              </button>
            </div>
          )}
        </section>
      </div>

      {showPad && <SignaturePadModal onClose={() => setShowPad(false)} onConfirm={url => { setSigDataUrl(url); setShowPad(false); }} />}
    </div>
  );
}
