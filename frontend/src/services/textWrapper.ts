/**
 * Docera Intelligent Multilingual Word Wrapping Engine
 *
 * Provides:
 * 1. Natural word wrapping for English, Khmer, and multilingual text.
 * 2. Uses Intl.Segmenter with Khmer linguistic word boundaries.
 * 3. Exact 2D Canvas or character-ratio metric measurement against page right margins.
 * 4. Preserves explicit newlines and paragraph structure.
 */

export interface WrapTextOptions {
  maxWidthPt: number;
  fontSizePt: number;
  fontFamily: string;
}

/**
 * Wraps text into lines separated by \n when exceeding maxWidthPt.
 */
export function wrapTextToWidth(
  text: string,
  options: WrapTextOptions,
): string {
  const { maxWidthPt, fontSizePt, fontFamily } = options;
  if (!text || !maxWidthPt || maxWidthPt <= 0) return text;

  const paragraphs = text.split('\n');
  const wrappedParagraphs: string[] = [];

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = canvas?.getContext('2d');
  if (ctx) {
    ctx.font = `${fontSizePt}px '${fontFamily}', sans-serif`;
  }

  function measure(str: string): number {
    if (ctx) return ctx.measureText(str).width;
    // Fallback: estimation based on average glyph advance
    return str.length * fontSizePt * 0.58;
  }

  let segmenter: Intl.Segmenter | null = null;
  try {
    segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  } catch {
    segmenter = null;
  }

  for (const para of paragraphs) {
    // If the whole paragraph already fits within maxWidthPt, keep it as a single line
    if (!para.trim() || measure(para) <= maxWidthPt) {
      wrappedParagraphs.push(para);
      continue;
    }

    // Segment into words / tokens
    const tokens: string[] = segmenter
      ? Array.from(segmenter.segment(para), s => s.segment)
      : para.split(/(\s+)/);

    const lines: string[] = [];
    let currentLine = '';

    for (const token of tokens) {
      if (!currentLine) {
        if (!token.trim()) continue; // Skip leading whitespace on fresh line
        currentLine = token;
        continue;
      }

      const candidate = currentLine + token;
      if (measure(candidate) <= maxWidthPt) {
        currentLine = candidate;
      } else {
        // Line exceeded maxWidth: push currentLine and wrap token to next line
        lines.push(currentLine.trimEnd());
        currentLine = token.trimStart();
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    wrappedParagraphs.push(lines.join('\n'));
  }

  return wrappedParagraphs.join('\n');
}
