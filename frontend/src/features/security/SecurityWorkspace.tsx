import { Check, Download, Eye, EyeOff, Lock, Shield, Unlock, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SourcePdfPicker, type SelectedPdfSource } from '../../components/SourcePdfPicker';
import { fileSize } from '../../services/format';
import { toolsApi, type ToolBinaryResult } from '../../services/toolsApi';
import { triggerDownload } from '../organize/pdfOrganize';

export function SecurityWorkspace() {
  const [params] = useSearchParams();
  const tabParam = params.get('tab');
  const [mode, setMode] = useState<'encrypt' | 'unlock'>('encrypt');

  useEffect(() => {
    if (tabParam === 'unlock') setMode('unlock');
    else setMode('encrypt');
  }, [tabParam]);

  const [source, setSource] = useState<SelectedPdfSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<ToolBinaryResult<any> | null>(null);

  // Passwords
  const [userPassword, setUserPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Unlock password
  const [unlockPassword, setUnlockPassword] = useState('');

  // Permissions
  const allowPrint = true;
  const allowCopy = false;
  const allowModify = false;
  const allowAnnotate = true;

  async function handleAction() {
    if (!source) return;
    setError(null);
    setOutput(null);

    if (mode === 'encrypt') {
      if (!userPassword) {
        setError('Please enter a password to encrypt your document.');
        return;
      }
      if (confirmPassword && userPassword !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
      setBusy(true);
      try {
        const src = source.kind === 'local' ? { file: source.file } : { fileId: source.fileId };
        const res = await toolsApi.securityEncrypt(src, {
          userPassword,
          ownerPassword: '',
          allowPrint,
          allowCopy,
          allowModify,
          allowAnnotate,
        });
        setOutput(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Encryption failed.');
      } finally {
        setBusy(false);
      }
    } else {
      if (!unlockPassword) {
        setError('Please enter the password to unlock this document.');
        return;
      }
      setBusy(true);
      try {
        const file = source.kind === 'local' ? source.file : new File([], source.name);
        const res = await toolsApi.securityUnlock(file, unlockPassword);
        setOutput(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unlock failed. Incorrect password.');
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <div className="approved-tool-page">
      {/* Breadcrumb */}
      <nav className="approved-breadcrumb" aria-label="Breadcrumb">
        <Link to="/" className="breadcrumb-brand">
          <span className="breadcrumb-dot" />
          Docera
        </Link>
        <span className="breadcrumb-separator" aria-hidden="true">&gt;</span>
        <span className="breadcrumb-current">Protect PDF</span>
      </nav>

      {/* Header */}
      <header className="approved-tool-header">
        <div className="tool-header-icon-wrap icon-bg-green">
          <Shield size={24} color="#10B981" aria-hidden="true" />
        </div>
        <div className="tool-header-text">
          <h1 className="approved-tool-title">Protect PDF</h1>
          <p className="approved-tool-subtitle">
            Add a password to encrypt your PDF and keep it secure.
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
                  {fileSize(source.size)} • 6 pages
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

      {/* Two-Column Form Layout */}
      <div className="protect-layout-grid">
        {/* Left Column: Mode Radio and Inputs */}
        <div className="protect-form-col">
          {/* Mode Selector */}
          <div className="protect-mode-selector" role="radiogroup" aria-label="Protection Mode">
            <label className={`protect-radio-item ${mode === 'encrypt' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="protect-mode"
                value="encrypt"
                checked={mode === 'encrypt'}
                onChange={() => setMode('encrypt')}
              />
              <span className="radio-dot" />
              <span className="mode-text">Set a password (Encrypt)</span>
            </label>

            <label className={`protect-radio-item ${mode === 'unlock' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="protect-mode"
                value="unlock"
                checked={mode === 'unlock'}
                onChange={() => setMode('unlock')}
              />
              <span className="radio-dot" />
              <span className="mode-text">Remove password (Unlock)</span>
            </label>
          </div>

          {mode === 'encrypt' ? (
            <div className="protect-inputs-wrap">
              <div className="protect-field-group">
                <label htmlFor="user-password-input" className="field-label">
                  Enter password
                </label>
                <div className="password-input-row">
                  <input
                    id="user-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter password"
                    aria-label="Open password (Enter password)"
                    value={userPassword}
                    onChange={e => setUserPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="protect-field-group">
                <label htmlFor="confirm-password-input" className="field-label">
                  Confirm password
                </label>
                <div className="password-input-row">
                  <input
                    id="confirm-password-input"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="Confirm password"
                    aria-label="Confirm password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowConfirm(v => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="protect-inputs-wrap">
              <div className="protect-field-group">
                <label htmlFor="unlock-password-input" className="field-label">
                  Current password
                </label>
                <div className="password-input-row">
                  <input
                    id="unlock-password-input"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter current password to remove protection"
                    aria-label="Current document password"
                    value={unlockPassword}
                    onChange={e => setUnlockPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Information Card */}
        <div className="protect-info-col">
          <div className="approved-security-card">
            <div className="security-icon-circle">
              <Shield size={28} color="#008F4F" aria-hidden="true" />
            </div>
            <p className="security-card-text">
              Your PDF will be encrypted with a strong password to prevent unauthorized access.
            </p>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="approved-action-row">
        <button
          type="button"
          className="approved-primary-action-btn"
          disabled={!source || busy}
          onClick={() => void handleAction()}
          aria-label={mode === 'encrypt' ? 'Protect PDF (Encrypt with AES-256)' : 'Unlock PDF'}
        >
          {mode === 'encrypt' ? (
            <Lock size={18} aria-hidden="true" />
          ) : (
            <Unlock size={18} aria-hidden="true" />
          )}
          <span>
            {busy
              ? mode === 'encrypt'
                ? 'Encrypting…'
                : 'Unlocking…'
              : mode === 'encrypt'
              ? 'Protect PDF'
              : 'Unlock PDF'}
            <span className="visually-hidden"> Encrypt with AES-256</span>
          </span>
        </button>
      </div>

      {/* Output banner */}
      {output && (
        <div className="approved-result-card" role="region" aria-label="Security Results">
          <div className="result-header">
            <Check size={20} className="text-success" aria-hidden="true" />
            <h3>{mode === 'encrypt' ? 'PDF Successfully Encrypted' : 'PDF Protection Removed'}</h3>
          </div>
          <div className="result-actions">
            <button
              type="button"
              className="approved-download-btn"
              onClick={() => triggerDownload(output.blob, output.filename)}
            >
              <Download size={16} /> Download Protected PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
