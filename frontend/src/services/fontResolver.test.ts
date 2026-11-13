import { describe, expect, it } from 'vitest';
import {
  cleanPdfFontName,
  hasKhmerText,
  resolveEditorFontFamily,
  REGISTERED_FONTS,
} from './fontResolver';

describe('Font Resolver Service', () => {
  it('detects Khmer Unicode codepoints accurately', () => {
    expect(hasKhmerText('សួស្តី')).toBe(true);
    expect(hasKhmerText('២០២៥')).toBe(true);
    expect(hasKhmerText('English Text')).toBe(false);
    expect(hasKhmerText('12345')).toBe(false);
    expect(hasKhmerText('Mixed ប្រសិទ្ធភាព and Text')).toBe(true);
  });

  it('strips ISO 32000 subset prefixes from font names', () => {
    expect(cleanPdfFontName('BAAAAA+KhmerOSBattambang')).toBe('KhmerOSBattambang');
    expect(cleanPdfFontName('ABCDEF+TimesNewRoman')).toBe('TimesNewRoman');
    expect(cleanPdfFontName('KhmerOSBattambang')).toBe('KhmerOSBattambang');
    expect(cleanPdfFontName(null)).toBe('');
  });

  it('resolves correct high-fidelity font families for Khmer and Latin text', () => {
    // Khmer font resolution
    expect(resolveEditorFontFamily('KhmerOSBattambang', 'សួស្តី')).toBe('KhmerOSBattambang');
    expect(resolveEditorFontFamily('BAAAAA+KhmerOSBattambang', '')).toBe('KhmerOSBattambang');
    expect(resolveEditorFontFamily('KhmerOSMuol', '')).toBe('KhmerOSMuol');
    expect(resolveEditorFontFamily('NotoSansKhmer', '')).toBe('Noto Sans Khmer');
    expect(resolveEditorFontFamily('NotoSerifKhmer', '')).toBe('Noto Serif Khmer');
    expect(resolveEditorFontFamily('KhmerOS', '')).toBe('KhmerOS');

    // Default Khmer font when script is Khmer
    expect(resolveEditorFontFamily('UnknownFont', '២០២៥')).toBe('KhmerOSBattambang');

    // Latin fonts
    expect(resolveEditorFontFamily('Times-Roman', 'Hello')).toContain('Times');
    expect(resolveEditorFontFamily('Courier-Bold', 'Hello')).toContain('Courier');
    expect(resolveEditorFontFamily('Helvetica', 'Hello')).toContain('Helvetica');
  });

  it('has valid registered font definitions', () => {
    expect(REGISTERED_FONTS['KhmerOSBattambang'].url).toBe('/fonts/KhmerOSbattambang.ttf');
    expect(REGISTERED_FONTS['Noto Sans Khmer'].url).toBe('/fonts/NotoSansKhmer-Regular.ttf');
    expect(REGISTERED_FONTS['KhmerOSMuol'].url).toBe('/fonts/KhmerOSmuol.ttf');
  });
});
