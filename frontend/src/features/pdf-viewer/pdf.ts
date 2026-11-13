import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// 1. Configure the worker URL with explicit cache buster so stale cached octet-stream responses are bypassed
GlobalWorkerOptions.workerSrc = `${workerUrl}?v=1.0.1`;

// 2. Pre-register the worker message handler on globalThis.
// If the browser environment blocks Web Workers or encounters network module import failure,
// PDF.js's internal fake worker mechanism immediately uses this handler in-memory without
// having to issue a dynamic import() fetch for an external script.
if (typeof window !== 'undefined') {
  (window as unknown as { pdfjsWorker?: unknown }).pdfjsWorker = pdfjsWorker;
}

export function loadPdf(url: string) {
  return getDocument({
    url, withCredentials: true, enableXfa: false,
    cMapUrl: '/pdf-assets/cmaps/', cMapPacked: true,
    standardFontDataUrl: '/pdf-assets/standard_fonts/', wasmUrl: '/pdf-assets/wasm/',
    maxImageSize: 16_000_000, canvasMaxAreaInBytes: 32_000_000,
  });
}

export function pageDimensions(width: number, height: number, rotation: number) {
  return rotation % 180 ? { width: height, height: width } : { width, height };
}

export function fitScale(width: number, height: number, viewportWidth: number, viewportHeight: number, mode: 'width' | 'page'): number {
  const availableWidth = Math.max(160, viewportWidth - 64);
  const availableHeight = Math.max(160, viewportHeight - 48);
  return Math.max(0.1, Math.min(3, mode === 'width' ? availableWidth / width : Math.min(availableWidth / width, availableHeight / height)));
}

export function formatPdfLoadError(err: unknown): Error {
  if (typeof err === 'object' && err !== null) {
    const e = err as { name?: string; message?: string; status?: number };
    if (e.name === 'PasswordException' || e.message?.toLowerCase().includes('password')) {
      return new Error('This PDF is password-protected. Please unlock it using the Protect & Redact tool before opening.');
    }
    if (e.name === 'InvalidPDFException' || e.message?.toLowerCase().includes('invalid pdf')) {
      return new Error('The document appears to be corrupted or is not a valid PDF file.');
    }
    if (e.name === 'MissingPDFException' || (e.name === 'UnexpectedResponseException' && e.status === 404)) {
      return new Error('The document was not found or has expired. Please re-upload your document.');
    }
    if (e.name === 'UnexpectedResponseException' && (e.status === 401 || e.status === 403)) {
      return new Error('Your session has expired. Please refresh the page or upload your file again.');
    }
    if (e.name === 'UnexpectedResponseException' && e.status && e.status >= 500) {
      return new Error(`Server error (${e.status}) while retrieving the PDF. Please retry.`);
    }
    if (e.message && !e.message.toLowerCase().includes('worker was destroyed')) {
      return new Error(`Could not load PDF in editor: ${e.message}`);
    }
  }
  return new Error('Could not load PDF in editor. It may have expired or use unsupported PDF features.');
}
