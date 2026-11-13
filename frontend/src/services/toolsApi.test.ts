import { describe, expect, it } from 'vitest';
import { parseFilename } from './toolsApi';

describe('toolsApi parseFilename', () => {
  it('falls back when disposition is null or empty', () => {
    expect(parseFilename(null, 'default.pdf')).toBe('default.pdf');
    expect(parseFilename('', 'fallback.pdf')).toBe('fallback.pdf');
  });

  it('parses standard ASCII filename', () => {
    expect(parseFilename('attachment; filename="sample.pdf"', 'fallback.pdf')).toBe('sample.pdf');
    expect(parseFilename('attachment; filename=document.pdf', 'fallback.pdf')).toBe('document.pdf');
  });

  it('parses RFC 5987 / RFC 6266 Unicode filenames (e.g. Khmer, spaces, parentheses)', () => {
    const rawKhmer = 'កម្រងសំណួរ 111 (2) (1)-edited.pdf';
    const encoded = encodeURIComponent(rawKhmer);
    const header = `attachment; filename="111 2 1-edited.pdf"; filename*=UTF-8''${encoded}`;
    expect(parseFilename(header, 'fallback.pdf')).toBe(rawKhmer);
  });

  it('handles lowercase utf-8 prefix and quoted encoded values', () => {
    const rawName = 'ឯកសារ ពិសោធន៍.pdf';
    const encoded = encodeURIComponent(rawName);
    const header = `attachment; filename*=utf-8''"${encoded}"`;
    expect(parseFilename(header, 'fallback.pdf')).toBe(rawName);
  });
});
