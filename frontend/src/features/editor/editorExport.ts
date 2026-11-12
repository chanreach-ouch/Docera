import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import type { EditorObject, FontFamilyOption } from './editorModel';
import { expandRangesToIndices, parsePageRanges } from '../organize/pdfOrganize';

function hexToRgbValues(hex: string | undefined, fallback = '#1c302e'): [number, number, number] {
  const raw = (hex || fallback).replace('#', '').trim();
  const normalized = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw.padEnd(6, '0').slice(0, 6);
  const num = Number.parseInt(normalized, 16);
  if (Number.isNaN(num)) return [0.11, 0.19, 0.18];
  return [((num >> 16) & 255) / 255, ((num >> 8) & 255) / 255, (num & 255) / 255];
}

function hexToRgb(hex: string | undefined, fallback = '#1c302e') {
  const [r, g, b] = hexToRgbValues(hex, fallback);
  return rgb(r, g, b);
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; isPng: boolean } {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error('Image must be a PNG or JPEG data URL.');
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, isPng: match[1].toLowerCase() === 'png' };
}

function addPdfAnnotation(
  doc: PDFDocument,
  page: PDFPage,
  dictEntries: Record<string, string | number | boolean | unknown[] | PDFName | unknown>,
) {
  const annotDict = doc.context.obj(dictEntries as Parameters<typeof doc.context.obj>[0]);
  const ref = doc.context.register(annotDict);
  let annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
  if (!annots) {
    annots = doc.context.obj([]);
    page.node.set(PDFName.of('Annots'), annots);
  }
  annots.push(ref);
}

/**
 * Export edited PDF with placed text, images, shapes, signatures, and standards-compatible
 * PDF /Annots annotations (/Highlight, /Underline, /StrikeOut, /Text, /Stamp).
 */
export async function exportEditedPdf(
  sourceBytes: Uint8Array,
  objects: EditorObject[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const fontMap: Record<FontFamilyOption, PDFFont> = {
    Helvetica: await doc.embedFont(StandardFonts.Helvetica),
    TimesRoman: await doc.embedFont(StandardFonts.TimesRoman),
    Courier: await doc.embedFont(StandardFonts.Courier),
  };

  const pages = doc.getPages();

  for (const obj of objects) {
    const page = pages[obj.pageIndex];
    if (!page) continue;
    const { width: pw, height: ph } = page.getSize();
    // Convert top-left UI points to bottom-left PDF points
    const pdfX = obj.x;
    const pdfY = ph - obj.y - obj.height;
    const strokeRgb = hexToRgb(obj.color);
    const [cr, cg, cb] = hexToRgbValues(obj.color);
    const opacity = Math.max(0.05, Math.min(1, obj.opacity ?? 1));

    if (obj.kind === 'text') {
      const font = fontMap[obj.fontFamily || 'Helvetica'];
      const size = Math.max(6, obj.fontSize || 14);
      const lineGap = size * (obj.lineHeight || 1.25);
      const lines = (obj.text || '').split(/\r?\n/);
      let cursorY = ph - obj.y - size;
      for (const line of lines) {
        let drawX = pdfX;
        const textWidth = font.widthOfTextAtSize(line, size);
        if (obj.align === 'center') drawX = pdfX + Math.max(0, (obj.width - textWidth) / 2);
        else if (obj.align === 'right') drawX = pdfX + Math.max(0, obj.width - textWidth);
        page.drawText(line, {
          x: drawX,
          y: cursorY,
          size,
          font,
          color: strokeRgb,
          opacity,
          rotate: obj.rotation ? degrees(-obj.rotation) : undefined,
        });
        cursorY -= lineGap;
      }
    } else if ((obj.kind === 'image' || obj.kind === 'signature') && obj.imageDataUrl) {
      const { bytes, isPng } = dataUrlToBytes(obj.imageDataUrl);
      const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      page.drawImage(img, {
        x: pdfX,
        y: pdfY,
        width: obj.width,
        height: obj.height,
        opacity,
        rotate: obj.rotation ? degrees(-obj.rotation) : undefined,
      });
    } else if (obj.kind === 'rect') {
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: obj.width,
        height: obj.height,
        borderColor: strokeRgb,
        borderWidth: obj.strokeWidth ?? 2,
        color: obj.fillColor && obj.fillColor !== 'transparent' ? hexToRgb(obj.fillColor) : undefined,
        opacity,
        borderOpacity: opacity,
      });
    } else if (obj.kind === 'circle') {
      page.drawEllipse({
        x: pdfX + obj.width / 2,
        y: pdfY + obj.height / 2,
        xScale: obj.width / 2,
        yScale: obj.height / 2,
        borderColor: strokeRgb,
        borderWidth: obj.strokeWidth ?? 2,
        color: obj.fillColor && obj.fillColor !== 'transparent' ? hexToRgb(obj.fillColor) : undefined,
        opacity,
        borderOpacity: opacity,
      });
    } else if (obj.kind === 'line' || obj.kind === 'arrow') {
      const x1 = pdfX;
      const y1 = ph - obj.y;
      const x2 = pdfX + obj.width;
      const y2 = ph - (obj.y + obj.height);
      const thickness = obj.strokeWidth ?? 2;
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: strokeRgb, opacity });
      if (obj.kind === 'arrow') {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = Math.max(8, thickness * 4);
        const a1 = angle + Math.PI * 0.82;
        const a2 = angle - Math.PI * 0.82;
        page.drawLine({
          start: { x: x2, y: y2 },
          end: { x: x2 + Math.cos(a1) * head, y: y2 + Math.sin(a1) * head },
          thickness,
          color: strokeRgb,
          opacity,
        });
        page.drawLine({
          start: { x: x2, y: y2 },
          end: { x: x2 + Math.cos(a2) * head, y: y2 + Math.sin(a2) * head },
          thickness,
          color: strokeRgb,
          opacity,
        });
      }
    } else if (obj.kind === 'ink' && obj.points && obj.points.length > 1) {
      const thickness = obj.strokeWidth ?? 2.5;
      for (let i = 1; i < obj.points.length; i++) {
        const p0 = obj.points[i - 1];
        const p1 = obj.points[i];
        page.drawLine({
          start: { x: p0.x, y: ph - p0.y },
          end: { x: p1.x, y: ph - p1.y },
          thickness,
          color: strokeRgb,
          opacity,
        });
      }
    } else if (obj.kind === 'highlight' || obj.kind === 'underline' || obj.kind === 'strikeout') {
      const subtype = obj.kind === 'highlight' ? 'Highlight' : obj.kind === 'underline' ? 'Underline' : 'StrikeOut';
      const x1 = pdfX;
      const y1 = pdfY;
      const x2 = pdfX + obj.width;
      const y2 = pdfY + obj.height;
      // Standards-compatible PDF text markup annotation
      addPdfAnnotation(doc, page, {
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of(subtype),
        Rect: [x1, y1, x2, y2],
        QuadPoints: [x1, y2, x2, y2, x1, y1, x2, y1],
        C: [cr, cg, cb],
        CA: PDFNumber.of(obj.kind === 'highlight' ? Math.min(0.45, opacity) : opacity),
        Contents: PDFString.of(obj.text || `${subtype} annotation`),
        F: PDFNumber.of(4),
      });
      // Also render clean visual stroke for viewers that ignore markup appearance regeneration
      if (obj.kind === 'highlight') {
        page.drawRectangle({ x: x1, y: y1, width: obj.width, height: obj.height, color: strokeRgb, opacity: 0.28 });
      } else if (obj.kind === 'underline') {
        page.drawLine({ start: { x: x1, y: y1 + 1 }, end: { x: x2, y: y1 + 1 }, thickness: 1.5, color: strokeRgb, opacity });
      } else {
        page.drawLine({ start: { x: x1, y: y1 + obj.height / 2 }, end: { x: x2, y: y1 + obj.height / 2 }, thickness: 1.5, color: strokeRgb, opacity });
      }
    } else if (obj.kind === 'note') {
      addPdfAnnotation(doc, page, {
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Text'),
        Rect: [pdfX, pdfY, pdfX + 24, pdfY + 24],
        Name: PDFName.of('Comment'),
        C: [cr, cg, cb],
        Contents: PDFString.of(obj.text || 'Note'),
        T: PDFString.of('Docera User'),
        Open: false,
        F: PDFNumber.of(4),
      });
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: 22,
        height: 22,
        color: strokeRgb,
        borderColor: rgb(0.1, 0.15, 0.14),
        borderWidth: 1,
        opacity: 0.9,
      });
    } else if (obj.kind === 'stamp') {
      const label = (obj.stampLabel || obj.text || 'APPROVED').toUpperCase();
      addPdfAnnotation(doc, page, {
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Stamp'),
        Rect: [pdfX, pdfY, pdfX + obj.width, pdfY + obj.height],
        Name: PDFName.of(label.replace(/\s+/g, '')),
        Contents: PDFString.of(label),
        C: [cr, cg, cb],
        F: PDFNumber.of(4),
      });
      page.drawRectangle({
        x: pdfX,
        y: pdfY,
        width: obj.width,
        height: obj.height,
        borderColor: strokeRgb,
        borderWidth: 2,
        opacity,
      });
      const font = fontMap.Helvetica;
      const fontSize = Math.max(10, Math.min(24, obj.height * 0.45));
      const tw = font.widthOfTextAtSize(label, fontSize);
      page.drawText(label, {
        x: pdfX + Math.max(4, (obj.width - tw) / 2),
        y: pdfY + (obj.height - fontSize) / 2 + 2,
        size: fontSize,
        font,
        color: strokeRgb,
        opacity,
      });
    }
    // Keep page bounds referenced cleanly
    void pw;
  }

  const outBytes = await doc.save();
  const verify = await PDFDocument.load(outBytes);
  if (verify.getPageCount() !== pages.length) {
    throw new Error('Exported PDF verification failed.');
  }
  return outBytes;
}

export interface CustomizeOptions {
  pageRangeExpr?: string;
  watermarkText?: string;
  watermarkColor?: string;
  watermarkOpacity?: number;
  watermarkRotation?: number;
  watermarkFontSize?: number;
  watermarkPosition?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'tiled';
  watermarkImageDataUrl?: string;
  watermarkImageScale?: number;
  pageNumbers?: {
    enabled: boolean;
    position: 'bottom-center' | 'bottom-right' | 'bottom-left' | 'top-center' | 'top-right';
    format: 'number' | 'of_total';
    startAt: number;
    fontSize: number;
  };
  headerText?: string;
  footerText?: string;
  cropMarginPt?: number;
  backgroundTint?: string;
}

export async function customizePdf(sourceBytes: Uint8Array, opts: CustomizeOptions): Promise<Uint8Array> {
  const doc = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();
  const total = pages.length;

  const targetIndices = opts.pageRangeExpr?.trim()
    ? new Set(expandRangesToIndices(parsePageRanges(opts.pageRangeExpr, total)))
    : new Set(pages.map((_, i) => i));

  let embeddedWatermarkImg: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (opts.watermarkImageDataUrl) {
    const { bytes, isPng } = dataUrlToBytes(opts.watermarkImageDataUrl);
    embeddedWatermarkImg = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  }

  pages.forEach((page, index) => {
    if (!targetIndices.has(index)) return;
    const { width, height } = page.getSize();

    if (opts.backgroundTint && opts.backgroundTint !== 'none') {
      // Paint subtle background tint behind existing content? Actually pdf-lib draws on top unless low opacity
      page.drawRectangle({
        x: 0,
        y: 0,
        width,
        height,
        color: hexToRgb(opts.backgroundTint),
        opacity: 0.08,
      });
    }

    if (opts.cropMarginPt && opts.cropMarginPt > 0) {
      const m = Math.min(opts.cropMarginPt, Math.min(width, height) / 3);
      page.setCropBox(m, m, width - 2 * m, height - 2 * m);
    }

    if (opts.watermarkText?.trim()) {
      const txt = opts.watermarkText.trim();
      const size = Math.max(10, Math.min(96, opts.watermarkFontSize ?? 42));
      const opacity = Math.max(0.05, Math.min(1, opts.watermarkOpacity ?? 0.25));
      const rot = opts.watermarkRotation ?? -35;
      const color = hexToRgb(opts.watermarkColor || '#163f3b');
      const tw = font.widthOfTextAtSize(txt, size);

      if (opts.watermarkPosition === 'tiled') {
        for (let y = 80; y < height; y += 180) {
          for (let x = 40; x < width; x += Math.max(160, tw + 60)) {
            page.drawText(txt, { x, y, size: size * 0.65, font, color, opacity, rotate: degrees(rot) });
          }
        }
      } else {
        let x = (width - tw) / 2;
        let y = (height - size) / 2;
        if (opts.watermarkPosition === 'top-left') { x = 36; y = height - size - 36; }
        else if (opts.watermarkPosition === 'top-right') { x = width - tw - 36; y = height - size - 36; }
        else if (opts.watermarkPosition === 'bottom-left') { x = 36; y = 36; }
        else if (opts.watermarkPosition === 'bottom-right') { x = width - tw - 36; y = 36; }
        page.drawText(txt, { x, y, size, font, color, opacity, rotate: degrees(rot) });
      }
    }

    if (embeddedWatermarkImg) {
      const scale = Math.max(0.1, Math.min(1, opts.watermarkImageScale ?? 0.35));
      const iw = embeddedWatermarkImg.width * scale;
      const ih = embeddedWatermarkImg.height * scale;
      page.drawImage(embeddedWatermarkImg, {
        x: (width - iw) / 2,
        y: (height - ih) / 2,
        width: iw,
        height: ih,
        opacity: Math.max(0.05, Math.min(1, opts.watermarkOpacity ?? 0.3)),
      });
    }

    if (opts.headerText?.trim()) {
      const hTxt = opts.headerText.trim();
      const tw = font.widthOfTextAtSize(hTxt, 10);
      page.drawText(hTxt, { x: (width - tw) / 2, y: height - 24, size: 10, font, color: rgb(0.25, 0.3, 0.29) });
    }

    if (opts.footerText?.trim()) {
      const fTxt = opts.footerText.trim();
      page.drawText(fTxt, { x: 36, y: 20, size: 10, font, color: rgb(0.25, 0.3, 0.29) });
    }

    if (opts.pageNumbers?.enabled) {
      const numVal = (opts.pageNumbers.startAt || 1) + index;
      const label = opts.pageNumbers.format === 'of_total'
        ? `Page ${numVal} of ${total + (opts.pageNumbers.startAt || 1) - 1}`
        : String(numVal);
      const sz = Math.max(8, Math.min(24, opts.pageNumbers.fontSize || 10));
      const tw = font.widthOfTextAtSize(label, sz);
      let nx = (width - tw) / 2;
      let ny = 20;
      if (opts.pageNumbers.position === 'bottom-right') nx = width - tw - 36;
      else if (opts.pageNumbers.position === 'bottom-left') nx = 36;
      else if (opts.pageNumbers.position === 'top-center') ny = height - sz - 20;
      else if (opts.pageNumbers.position === 'top-right') { nx = width - tw - 36; ny = height - sz - 20; }
      page.drawText(label, { x: nx, y: ny, size: sz, font, color: rgb(0.15, 0.2, 0.19) });
    }
  });

  const outBytes = await doc.save();
  const verify = await PDFDocument.load(outBytes);
  if (verify.getPageCount() !== total) {
    throw new Error('Customized PDF verification failed.');
  }
  return outBytes;
}
