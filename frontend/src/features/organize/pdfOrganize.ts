import { PDFDocument, degrees } from 'pdf-lib';
import JSZip from 'jszip';

export interface PageRange {
  start: number; // 1-based inclusive
  end: number;   // 1-based inclusive
}

export interface OrganizePageItem {
  id: string;
  sourceIndex: number; // 0 = primary, >0 = inserted docs, -1 = blank
  sourcePageIndex: number; // 0-based
  addedRotation: 0 | 90 | 180 | 270;
  width: number;
  height: number;
  baseRotation: number;
  label: string;
}

export interface SplitPart {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

/**
 * Parse a 1-based page range expression such as "1-3, 5, 7-9" into validated PageRange entries.
 */
export function parsePageRanges(expr: string, totalPages: number): PageRange[] {
  const cleaned = expr.trim();
  if (!cleaned) {
    throw new Error('Enter at least one page number or range (for example: 1-3, 5).');
  }
  if (totalPages < 1) {
    throw new Error('The document has no pages.');
  }

  const parts = cleaned.split(',').map(p => p.trim()).filter(Boolean);
  if (!parts.length) {
    throw new Error('Enter at least one page number or range.');
  }

  const ranges: PageRange[] = [];
  for (const part of parts) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) {
      throw new Error(`Invalid page range "${part}". Use numbers like 1-3 or 5.`);
    }
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : start;
    if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
      throw new Error(`Page range "${part}" is out of bounds (1–${totalPages}).`);
    }
    if (start > end) {
      throw new Error(`Page range "${part}" has start greater than end.`);
    }
    ranges.push({ start, end });
  }
  return ranges;
}

export function expandRangesToIndices(ranges: PageRange[]): number[] {
  const indices: number[] = [];
  for (const r of ranges) {
    for (let p = r.start; p <= r.end; p++) {
      indices.push(p - 1);
    }
  }
  return indices;
}

/**
 * Inspect a PDF buffer with pdf-lib to build initial OrganizePageItem entries.
 */
export async function readOrganizePages(bytes: Uint8Array, sourceIndex = 0, prefix = ''): Promise<OrganizePageItem[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  return doc.getPages().map((page, index) => {
    const { width, height } = page.getSize();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    return {
      id: `${sourceIndex}-${index}-${crypto.randomUUID()}`,
      sourceIndex,
      sourcePageIndex: index,
      addedRotation: 0,
      width,
      height,
      baseRotation: rot,
      label: prefix ? `${prefix} · p.${index + 1}` : `Page ${index + 1}`,
    };
  });
}

/**
 * Merge multiple PDFs (with optional per-file 1-based range string) into a single verified PDF.
 */
export async function mergePdfs(
  inputs: { name: string; bytes: Uint8Array; range?: string }[],
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (inputs.length < 2) {
    throw new Error('Select at least two PDF files to merge.');
  }
  const output = await PDFDocument.create();
  let expectedPages = 0;

  for (const item of inputs) {
    const src = await PDFDocument.load(item.bytes, { ignoreEncryption: false });
    const count = src.getPageCount();
    const indices = item.range?.trim()
      ? expandRangesToIndices(parsePageRanges(item.range, count))
      : src.getPageIndices();
    if (!indices.length) {
      throw new Error(`No pages selected from "${item.name}".`);
    }
    const copied = await output.copyPages(src, indices);
    for (const page of copied) {
      output.addPage(page);
      expectedPages++;
    }
  }

  const outBytes = await output.save();
  const verify = await PDFDocument.load(outBytes);
  if (verify.getPageCount() !== expectedPages) {
    throw new Error('Merged PDF verification failed: unexpected page count.');
  }
  return { bytes: outBytes, pageCount: verify.getPageCount() };
}

/**
 * Split a PDF by explicit ranges or fixed page chunks.
 */
export async function splitPdf(
  bytes: Uint8Array,
  baseName: string,
  options: { mode: 'ranges'; rangesExpr: string } | { mode: 'every'; everyN: number } | { mode: 'extract'; rangesExpr: string },
): Promise<SplitPart[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const total = src.getPageCount();
  const stem = baseName.replace(/\.pdf$/i, '') || 'document';

  if (options.mode === 'extract') {
    const indices = expandRangesToIndices(parsePageRanges(options.rangesExpr, total));
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    copied.forEach(p => out.addPage(p));
    const outBytes = await out.save();
    const verify = await PDFDocument.load(outBytes);
    if (verify.getPageCount() !== indices.length) {
      throw new Error('Extracted PDF verification failed.');
    }
    return [{ name: `${stem}-extracted.pdf`, bytes: outBytes, pageCount: indices.length }];
  }

  const groups: { label: string; indices: number[] }[] = [];
  if (options.mode === 'ranges') {
    const ranges = parsePageRanges(options.rangesExpr, total);
    for (const r of ranges) {
      const indices: number[] = [];
      for (let p = r.start; p <= r.end; p++) indices.push(p - 1);
      groups.push({
        label: r.start === r.end ? `p${r.start}` : `p${r.start}-${r.end}`,
        indices,
      });
    }
  } else {
    const n = Math.floor(options.everyN);
    if (!Number.isFinite(n) || n < 1 || n > total) {
      throw new Error(`Chunk size must be between 1 and ${total}.`);
    }
    for (let start = 0; start < total; start += n) {
      const end = Math.min(total, start + n);
      const indices = Array.from({ length: end - start }, (_, i) => start + i);
      groups.push({
        label: start + 1 === end ? `p${start + 1}` : `p${start + 1}-${end}`,
        indices,
      });
    }
  }

  const parts: SplitPart[] = [];
  for (const group of groups) {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, group.indices);
    copied.forEach(p => out.addPage(p));
    const outBytes = await out.save();
    const verify = await PDFDocument.load(outBytes);
    if (verify.getPageCount() !== group.indices.length) {
      throw new Error(`Split part "${group.label}" failed verification.`);
    }
    parts.push({
      name: `${stem}-${group.label}.pdf`,
      bytes: outBytes,
      pageCount: group.indices.length,
    });
  }
  return parts;
}

/**
 * Build a reorganized PDF from page descriptors across one or more source PDFs.
 */
export async function exportOrganizedPdf(
  sources: Uint8Array[],
  items: OrganizePageItem[],
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (!items.length) {
    throw new Error('At least one page must remain in the document.');
  }
  const loadedDocs = await Promise.all(
    sources.map(bytes => PDFDocument.load(bytes, { ignoreEncryption: false })),
  );
  const out = await PDFDocument.create();

  for (const item of items) {
    if (item.sourceIndex < 0) {
      const blank = out.addPage([item.width, item.height]);
      if (item.addedRotation) {
        blank.setRotation(degrees(item.addedRotation));
      }
      continue;
    }
    const src = loadedDocs[item.sourceIndex];
    if (!src || item.sourcePageIndex < 0 || item.sourcePageIndex >= src.getPageCount()) {
      throw new Error(`Missing source page ${item.sourcePageIndex + 1}.`);
    }
    const [copied] = await out.copyPages(src, [item.sourcePageIndex]);
    const finalAngle = ((item.baseRotation + item.addedRotation) % 360 + 360) % 360;
    copied.setRotation(degrees(finalAngle));
    out.addPage(copied);
  }

  const outBytes = await out.save();
  const verify = await PDFDocument.load(outBytes);
  if (verify.getPageCount() !== items.length) {
    throw new Error('Organized PDF verification failed.');
  }
  return { bytes: outBytes, pageCount: verify.getPageCount() };
}

export async function packageZip(files: { name: string; bytes: Uint8Array }[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();
  for (const file of files) {
    let candidate = file.name;
    let counter = 2;
    while (usedNames.has(candidate)) {
      const dot = file.name.lastIndexOf('.');
      candidate = dot > 0
        ? `${file.name.slice(0, dot)}-${counter}${file.name.slice(dot)}`
        : `${file.name}-${counter}`;
      counter++;
    }
    usedNames.add(candidate);
    zip.file(candidate, file.bytes);
  }
  return zip.generateAsync({ type: 'blob' });
}

export function triggerDownload(blobOrBytes: Blob | Uint8Array, filename: string, mime = 'application/pdf') {
  const blob = blobOrBytes instanceof Blob
    ? blobOrBytes
    : new Blob([blobOrBytes.buffer.slice(blobOrBytes.byteOffset, blobOrBytes.byteOffset + blobOrBytes.byteLength) as ArrayBuffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
