import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  exportOrganizedPdf,
  mergePdfs,
  parsePageRanges,
  readOrganizePages,
  splitPdf,
} from './pdfOrganize';

async function makeTestPdf(sizes: [number, number][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const [w, h] of sizes) {
    doc.addPage([w, h]);
  }
  return doc.save();
}

describe('pdfOrganize (M2 browser-first PDF operations)', () => {
  it('validates 1-based page ranges and rejects out-of-bounds input', () => {
    expect(parsePageRanges('1-3, 5', 6)).toEqual([
      { start: 1, end: 3 },
      { start: 5, end: 5 },
    ]);
    expect(() => parsePageRanges('', 5)).toThrow();
    expect(() => parsePageRanges('0-2', 5)).toThrow(/out of bounds/i);
    expect(() => parsePageRanges('4-2', 5)).toThrow(/greater than end/i);
    expect(() => parsePageRanges('1, 7', 5)).toThrow(/out of bounds/i);
  });

  it('merges multiple PDFs preserving page dimensions and count', async () => {
    const a = await makeTestPdf([[612, 792], [500, 700]]);
    const b = await makeTestPdf([[842, 595], [400, 400]]);

    const merged = await mergePdfs([
      { name: 'a.pdf', bytes: a },
      { name: 'b.pdf', bytes: b, range: '2' },
    ]);

    expect(merged.pageCount).toBe(3);
    const reloaded = await PDFDocument.load(merged.bytes);
    expect(reloaded.getPageCount()).toBe(3);
    expect(reloaded.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(reloaded.getPage(2).getSize()).toEqual({ width: 400, height: 400 });
  });

  it('splits by ranges, every-N, and extracts pages accurately', async () => {
    const src = await makeTestPdf([
      [300, 400],
      [400, 500],
      [500, 600],
      [600, 700],
      [700, 800],
    ]);

    const byRanges = await splitPdf(src, 'sample.pdf', { mode: 'ranges', rangesExpr: '1-2, 4-5' });
    expect(byRanges).toHaveLength(2);
    expect(byRanges[0].pageCount).toBe(2);
    expect(byRanges[1].pageCount).toBe(2);
    expect((await PDFDocument.load(byRanges[1].bytes)).getPage(0).getSize()).toEqual({ width: 600, height: 700 });

    const byEvery = await splitPdf(src, 'sample.pdf', { mode: 'every', everyN: 2 });
    expect(byEvery.map(p => p.pageCount)).toEqual([2, 2, 1]);

    const extracted = await splitPdf(src, 'sample.pdf', { mode: 'extract', rangesExpr: '2, 5' });
    expect(extracted[0].pageCount).toBe(2);
    expect((await PDFDocument.load(extracted[0].bytes)).getPage(1).getSize()).toEqual({ width: 700, height: 800 });
  });

  it('reorders, rotates, duplicates, inserts blank, inserts from another PDF, and deletes pages', async () => {
    const primary = await makeTestPdf([[612, 792], [842, 595]]);
    const extra = await makeTestPdf([[300, 300]]);

    const primaryItems = await readOrganizePages(primary, 0, 'primary.pdf');
    const extraItems = await readOrganizePages(extra, 1, 'extra.pdf');

    // Reorder: [page 2 rotated 90, blank page, duplicate of page 1, extra page 1]
    const arranged = [
      { ...primaryItems[1], addedRotation: 90 as const },
      {
        id: 'blank-1',
        sourceIndex: -1,
        sourcePageIndex: -1,
        addedRotation: 0 as const,
        width: 595,
        height: 842,
        baseRotation: 0,
        label: 'Blank page',
      },
      { ...primaryItems[0] },
      { ...extraItems[0] },
    ];

    const result = await exportOrganizedPdf([primary, extra], arranged);
    expect(result.pageCount).toBe(4);
    const check = await PDFDocument.load(result.bytes);
    expect(check.getPageCount()).toBe(4);
    expect(check.getPage(0).getRotation().angle).toBe(90);
    expect(check.getPage(1).getSize()).toEqual({ width: 595, height: 842 });
    expect(check.getPage(3).getSize()).toEqual({ width: 300, height: 300 });
  });
});
