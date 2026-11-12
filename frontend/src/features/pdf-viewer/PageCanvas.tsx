import { useEffect, useRef, useState } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import type { PageInfo } from '../../types/files';
import { pageDimensions } from './pdf';
import 'pdfjs-dist/web/pdf_viewer.css';

function markMatches(container: HTMLDivElement, search: string) {
  for (const span of container.querySelectorAll('span')) {
    if (span.querySelector('span')) continue;
    const text = span.textContent ?? '';
    span.textContent = '';
    const query = search.trim().toLocaleLowerCase();
    let start = 0;
    let index = query ? text.toLocaleLowerCase().indexOf(query) : -1;
    while (index >= 0) {
      span.append(document.createTextNode(text.slice(start, index)));
      const mark = document.createElement('mark');
      mark.textContent = text.slice(index, index + query.length);
      span.append(mark);
      start = index + query.length;
      index = text.toLocaleLowerCase().indexOf(query, start);
    }
    span.append(document.createTextNode(text.slice(start)));
  }
}

export function PageCanvas({ pdf, info, scale, rotation, thumbnail = false, search = '', onActive }: {
  pdf: PDFDocumentProxy; info: PageInfo; scale: number; rotation: number; thumbnail?: boolean; search?: string; onActive?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [rendered, setRendered] = useState(0);
  const [error, setError] = useState(false);
  const dimensions = pageDimensions(info.width, info.height, rotation);
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  const activeCallback = useRef(onActive);
  activeCallback.current = onActive;

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) setNear(entry.isIntersecting);
    }, { rootMargin: thumbnail ? '160px' : '500px' });
    const active = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) activeCallback.current?.(info.index);
    }, { threshold: 0, rootMargin: '-12% 0px -65% 0px' });
    observer.observe(element);
    if (!thumbnail) active.observe(element);
    return () => { observer.disconnect(); active.disconnect(); };
  }, [info.index, thumbnail]);

  useEffect(() => {
    if (!near || !canvas.current) return;
    const canvasElement = canvas.current;
    const textElement = text.current;
    let disposed = false;
    let task: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    setError(false);
    setRendered(0);
    async function render() {
      try {
        const page = await pdf.getPage(info.index + 1);
        if (disposed) return;
        const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
        const density = Math.min(window.devicePixelRatio || 1, thumbnail ? 1 : 1.5, Math.sqrt(8_000_000 / (viewport.width * viewport.height)), 16384 / Math.max(viewport.width, viewport.height));
        canvasElement.width = Math.max(1, Math.floor(viewport.width * density));
        canvasElement.height = Math.max(1, Math.floor(viewport.height * density));
        task = page.render({ canvas: canvasElement, viewport, transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0] });
        await task.promise;
        if (disposed) return;
        if (textElement && !thumbnail) {
          textElement.replaceChildren();
          textElement.style.setProperty('--total-scale-factor', String(scale));
          textLayer = new TextLayer({ textContentSource: await page.getTextContent(), container: textElement, viewport });
          if (disposed) return;
          await textLayer.render();
        }
        if (!disposed) setRendered(value => value + 1);
      } catch (cause) {
        if (!disposed && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) setError(true);
      }
    }
    void render();
    return () => {
      disposed = true;
      task?.cancel();
      textLayer?.cancel();
      textElement?.replaceChildren();
      // Drop the backing pixel allocation when a page leaves the render window.
      canvasElement.width = 0;
      canvasElement.height = 0;
    };
  }, [pdf, info.index, near, scale, rotation, thumbnail]);

  useEffect(() => { if (text.current && rendered) markMatches(text.current, search); }, [search, rendered]);

  return <div ref={host} className={`pdf-page ${thumbnail ? 'thumbnail-page' : ''}`} style={{ width, height }} data-page={info.index + 1} data-rendered={rendered > 0} aria-label={thumbnail ? undefined : `Page ${info.index + 1}`} role={thumbnail ? undefined : 'region'}>
    {near && <><canvas ref={canvas} style={{ width, height }} aria-hidden="true" />{!thumbnail && <div ref={text} className="textLayer" />}</>}
    {error && <div className="page-message" role="alert">Page could not render. Try reopening the PDF.</div>}
    {!rendered && !error && !thumbnail && <div className="page-message" role="status">{near ? `Rendering page ${info.index + 1}…` : `Page ${info.index + 1}`}</div>}
    {!thumbnail && <span className="page-dimensions">{Math.round(dimensions.width)} × {Math.round(dimensions.height)} pt</span>}
  </div>;
}
