import { describe, expect, it } from 'vitest';
import {
  detectLegacyKhmerArtifacts,
  normalizeKhmerUnicode,
  repairLegacyKhmerArtifacts,
} from './khmerNormalizer';

describe('Khmer Unicode Normalizer & Legacy Repair', () => {
  it('detects legacy Limon/ABC visual keyboard artifacts accurately', () => {
    expect(detectLegacyKhmerArtifacts('គលើការ')).toBe(true);
    expect(detectLegacyKhmerArtifacts('ដផ្អក')).toBe(true);
    expect(detectLegacyKhmerArtifacts('ឆ្្ុំ')).toBe(true);
    expect(detectLegacyKhmerArtifacts('ហិរញ្ញវតថញ')).toBe(true);
    expect(detectLegacyKhmerArtifacts('លើការ')).toBe(false);
    expect(detectLegacyKhmerArtifacts('ផ្អែក')).toBe(false);
    expect(detectLegacyKhmerArtifacts('ឆ្នាំ ២០២៥')).toBe(false);
  });

  it('repairs legacy Limon visual prefixes into standard Unicode Khmer', () => {
    expect(repairLegacyKhmerArtifacts('គលើ')).toBe('លើ');
    expect(repairLegacyKhmerArtifacts('គតើ')).toBe('តើ');
    expect(repairLegacyKhmerArtifacts('គនេះ')).toBe('នេះ');
    expect(repairLegacyKhmerArtifacts('គោក')).toBe('លោក');
    expect(repairLegacyKhmerArtifacts('ដផ្អក')).toBe('ផ្អែក');
    expect(repairLegacyKhmerArtifacts('ឆ្្ុំ')).toBe('ឆ្នាំ');
    expect(repairLegacyKhmerArtifacts('ហិរញ្ញវតថញ')).toBe('ហិរញ្ញវត្ថុ');
    expect(repairLegacyKhmerArtifacts('ប្រសិទធភាព')).toBe('ប្រសិទ្ធភាព');
    expect(repairLegacyKhmerArtifacts('គប្រើប្បាស់')).toBe('ប្រើប្រាស់');
    expect(repairLegacyKhmerArtifacts('ប្ទព្យ')).toBe('ទ្រព្យ');
    expect(repairLegacyKhmerArtifacts('ប្បាក់')).toBe('ប្រាក់');
    expect(repairLegacyKhmerArtifacts('ររស់')).toBe('របស់');
    expect(repairLegacyKhmerArtifacts('កនញង')).toBe('ក្នុង');
  });

  it('normalizes split vowels and deduplicates coengs', () => {
    // េ + ា -> ោ
    expect(normalizeKhmerUnicode('\u17C1\u17B6')).toBe('\u17C4');
    // េ + ី -> ើ
    expect(normalizeKhmerUnicode('\u17C1\u17B8')).toBe('\u17BE');
    // Double coeng
    expect(normalizeKhmerUnicode('\u1780\u17D2\u17D2\u1781')).toBe('\u1780\u17D2\u1781');
  });

  it('handles mixed Khmer/Latin text safely without mangling', () => {
    const mixed = 'គលើ Profitability Ratios (ROA) ក្នុងឆ្នាំ ២០២៥ ?';
    const repaired = repairLegacyKhmerArtifacts(mixed);
    expect(repaired).toBe('លើ Profitability Ratios (ROA) ក្នុងឆ្នាំ ២០២៥ ?');
  });

  it('repairs the legacy bank heading with invalid coeng-vowel sequences and errant whitespace', () => {
    const raw = 'ផ្នែកទី១៖ ផ្សែងយល់អំពីស្ថានភាពទូទៅរបស់ ធនាគា ហ្ែីលីព ភីអិលសុ ី';
    const repaired = repairLegacyKhmerArtifacts(raw);
    expect(repaired).toBe('ផ្នែកទី១៖ ស្វែងយល់អំពីស្ថានភាពទូទៅរបស់ ធនាគា ហ្វីលីព ភីអិលស៊ី');
  });

  it('repairs the line with multiple dotted circles (cages, coengs, and spaces) from the user complaint', () => {
    const raw = 'គយើងខ្ញុំសូមគោរព និងសូមដលលងអុំណររុណជាមុនច្ុំគ េះកដីអនុគប្ោេះ កតីសហការលអ និង គពលគវោដ៏មានតនមលររស់';
    const repaired = repairLegacyKhmerArtifacts(raw);
    expect(repaired).toBe('យើងខ្ញុំសូមគោរព និងសូមថ្លែងអំណរគុណជាមុនចំពោះក្ដីអនុគ្រោះ ក្ដីសហការល្អ និង ពេលវេលាដ៏មានតម្លៃរបស់');
    expect(repaired).not.toContain('\u25CC'); // zero dotted circle symbols
    expect(repaired).not.toMatch(/\u17D2(?=[^\u1780-\u17A2]|$)/); // zero orphan coengs
  });
});
