import { useEffect, useRef, useState } from 'react';
import { PenTool, Type, Upload, X } from 'lucide-react';

export function SignaturePadModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'draw' | 'type' | 'upload'>('draw');
  const [typedText, setTypedText] = useState('A. Signer');
  const [inkColor, setInkColor] = useState('#10302d');
  const [drawing, setDrawing] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 2.6;
      ctx.strokeStyle = inkColor;
    }
  }, [inkColor, tab]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }

  function startDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = inkColor;
    setDrawing(true);
    setHasStroke(true);
  }

  function moveDraw(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pointerPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasStroke(false);
    }
  }

  function confirmDrawn() {
    if (!canvasRef.current || !hasStroke) return;
    onConfirm(canvasRef.current.toDataURL('image/png'));
  }

  function confirmTyped() {
    if (!typedText.trim()) return;
    const offscreen = document.createElement('canvas');
    offscreen.width = 480;
    offscreen.height = 140;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = inkColor;
    ctx.font = 'italic 48px Georgia, "Times New Roman", serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(typedText.trim(), 20, 72, 440);
    onConfirm(offscreen.toDataURL('image/png'));
  }

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onConfirm(reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create visual signature">
      <div className="modal-card">
        <div className="panel-heading">
          <h2>Visual signature</h2>
          <button className="icon-button" aria-label="Close signature dialog" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
          Visual signatures place an image on the page and do not provide cryptographic identity verification. For certificate-based signing, use Digital Signature.
        </p>

        <div className="tool-tabs" style={{ marginBottom: 12 }}>
          <button className={`button ${tab === 'draw' ? 'primary' : 'secondary'} small`} onClick={() => setTab('draw')}><PenTool size={14} /> Draw</button>
          <button className={`button ${tab === 'type' ? 'primary' : 'secondary'} small`} onClick={() => setTab('type')}><Type size={14} /> Type</button>
          <button className={`button ${tab === 'upload' ? 'primary' : 'secondary'} small`} onClick={() => setTab('upload')}><Upload size={14} /> Upload</button>
          <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            Ink <input type="color" value={inkColor} onChange={e => setInkColor(e.target.value)} aria-label="Signature color" />
          </label>
        </div>

        {tab === 'draw' && (
          <>
            <canvas
              ref={canvasRef}
              width={460}
              height={160}
              className="signature-canvas"
              onPointerDown={startDraw}
              onPointerMove={moveDraw}
              onPointerUp={() => setDrawing(false)}
              onPointerLeave={() => setDrawing(false)}
            />
            <div className="tool-panel-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="button quiet small" onClick={clearCanvas}>Clear</button>
              <button className="button primary small" disabled={!hasStroke} onClick={confirmDrawn}>Place signature</button>
            </div>
          </>
        )}

        {tab === 'type' && (
          <>
            <input
              type="text"
              className="text-input-full"
              value={typedText}
              onChange={e => setTypedText(e.target.value)}
              placeholder="Type your name"
              aria-label="Typed signature text"
            />
            <div className="typed-sig-preview" style={{ color: inkColor }}>{typedText || 'Preview'}</div>
            <div className="tool-panel-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="button primary small" disabled={!typedText.trim()} onClick={confirmTyped}>Place signature</button>
            </div>
          </>
        )}

        {tab === 'upload' && (
          <div style={{ padding: '16px 0' }}>
            <button className="button secondary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Choose PNG or JPEG image</button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="visually-hidden" onChange={e => handleFile(e.target.files?.[0])} />
          </div>
        )}
      </div>
    </div>
  );
}
