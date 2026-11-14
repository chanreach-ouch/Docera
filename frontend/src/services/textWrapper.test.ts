import { describe, expect, it } from 'vitest';
import { wrapTextToWidth } from './textWrapper';

describe('Intelligent Multilingual Word Wrapper', () => {
  it('keeps short text on a single line when within width', () => {
    const text = 'កម្រងសំណួរ ២០២៦';
    const result = wrapTextToWidth(text, { maxWidthPt: 300, fontSizePt: 14, fontFamily: 'KhmerOSMuol' });
    expect(result).toBe(text);
    expect(result).not.toContain('\n');
  });

  it('automatically wraps English text at word boundaries when reaching the margin', () => {
    const text = 'Docera is a professional next-generation PDF editor competitive with Adobe Acrobat and iLovePDF.';
    const result = wrapTextToWidth(text, { maxWidthPt: 150, fontSizePt: 12, fontFamily: 'DM Sans' });
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.trim().length).toBeGreaterThan(0);
    }
    // Should preserve full words
    expect(result).toContain('professional');
    expect(result).toContain('editor');
    expect(result).toContain('competitive');
  });

  it('automatically wraps Khmer text at natural linguistic word boundaries', () => {
    const text = 'យើងខ្ញុំសូមគោរព និងសូមថ្លែងអំណរគុណជាមុនចំពោះក្ដីអនុគ្រោះ ក្ដីសហការល្អ និង ពេលវេលាដ៏មានតម្លៃរបស់លោកប្រធានសាខា';
    const result = wrapTextToWidth(text, { maxWidthPt: 180, fontSizePt: 12, fontFamily: 'KhmerOSBattambang' });
    const lines = result.split('\n');
    expect(lines.length).toBeGreaterThan(1);
    // Lines should break at clean Khmer words
    expect(result).toContain('យើងខ្ញុំសូមគោរព');
    expect(result).toContain('ថ្លែងអំណរគុណ');
    expect(result).toContain('ចំពោះ');
    expect(result).toContain('ក្ដីអនុគ្រោះ');
  });

  it('preserves user explicit newlines', () => {
    const text = 'Line 1\nLine 2\nLine 3';
    const result = wrapTextToWidth(text, { maxWidthPt: 500, fontSizePt: 12, fontFamily: 'DM Sans' });
    expect(result).toBe('Line 1\nLine 2\nLine 3');
  });
});
