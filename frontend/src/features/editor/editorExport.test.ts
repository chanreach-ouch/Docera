import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import {
  alignEditorObjects,
  commitHistory,
  createHistory,
  duplicateEditorObjects,
  redoHistory,
  reorderZIndex,
  undoHistory,
  type EditorObject,
} from './editorModel';
import { customizePdf, exportEditedPdf } from './editorExport';

async function makeBlankPdf(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return doc.save();
}

describe('editorModel and editorExport (M3/M4)', () => {
  it('supports undo, redo, duplication, and alignment commands', () => {
    const objA: EditorObject = {
      id: 'a',
      kind: 'rect',
      pageIndex: 0,
      x: 40,
      y: 50,
      width: 100,
      height: 40,
      rotation: 0,
      opacity: 1,
      color: '#163f3b',
    };
    let hist = createHistory([]);
    hist = commitHistory(hist, [objA]);
    expect(hist.present).toHaveLength(1);

    const dup = duplicateEditorObjects(hist.present, new Set(['a']));
    hist = commitHistory(hist, dup.next);
    expect(hist.present).toHaveLength(2);

    const aligned = alignEditorObjects(hist.present, new Set(hist.present.map(o => o.id)), 'left');
    expect(aligned[0].x).toBe(40);
    expect(aligned[1].x).toBe(40);

    // Test Z-order manipulation
    const objB = hist.present[1];
    const toBack = reorderZIndex(hist.present, new Set([objB.id]), 'sendToBack');
    expect(toBack[0].id).toBe(objB.id);
    const toFront = reorderZIndex(toBack, new Set([objA.id]), 'bringToFront');
    expect(toFront[toFront.length - 1].id).toBe(objA.id);

    hist = undoHistory(hist);
    expect(hist.present).toHaveLength(1);
    hist = redoHistory(hist);
    expect(hist.present).toHaveLength(2);
  });

  it('exports text, shapes, ink, and standards-compatible PDF /Annots annotations', async () => {
    const src = await makeBlankPdf(1);
    const objects: EditorObject[] = [
      {
        id: 't1',
        kind: 'text',
        pageIndex: 0,
        x: 72,
        y: 80,
        width: 240,
        height: 30,
        rotation: 0,
        opacity: 1,
        color: '#1c302e',
        text: 'Docera Contract',
        fontFamily: 'Helvetica',
        fontSize: 16,
      },
      {
        id: 'h1',
        kind: 'highlight',
        pageIndex: 0,
        x: 72,
        y: 120,
        width: 160,
        height: 18,
        rotation: 0,
        opacity: 0.4,
        color: '#f5c542',
        text: 'Highlighted clause',
      },
      {
        id: 'n1',
        kind: 'note',
        pageIndex: 0,
        x: 300,
        y: 120,
        width: 24,
        height: 24,
        rotation: 0,
        opacity: 1,
        color: '#f5c542',
        text: 'Check signature date',
      },
      {
        id: 's1',
        kind: 'stamp',
        pageIndex: 0,
        x: 360,
        y: 200,
        width: 120,
        height: 36,
        rotation: 0,
        opacity: 1,
        color: '#23665a',
        stampLabel: 'APPROVED',
      },
    ];

    const out = await exportEditedPdf(src, objects);
    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(1);

    const annots = reopened.getPage(0).node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    expect(annots).toBeDefined();
    expect(annots!.size()).toBe(3);

    const subtypes = [];
    for (let i = 0; i < annots!.size(); i++) {
      const dict = annots!.lookup(i, PDFDict);
      subtypes.push(dict.get(PDFName.of('Subtype'))?.toString());
    }
    expect(subtypes).toEqual(['/Highlight', '/Text', '/Stamp']);
  });

  it('applies watermarks, page numbers, headers/footers, and crop margins cleanly', async () => {
    const src = await makeBlankPdf(2);
    const out = await customizePdf(src, {
      watermarkText: 'CONFIDENTIAL',
      watermarkPosition: 'center',
      headerText: 'Docera Audit Copy',
      footerText: 'Internal Only',
      pageNumbers: { enabled: true, position: 'bottom-right', format: 'of_total', startAt: 1, fontSize: 10 },
      cropMarginPt: 20,
    });

    const reopened = await PDFDocument.load(out);
    expect(reopened.getPageCount()).toBe(2);
    const crop = reopened.getPage(0).getCropBox();
    expect(crop.x).toBe(20);
    expect(crop.width).toBe(612 - 40);
  });
});
