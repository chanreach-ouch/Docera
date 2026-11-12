import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

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
