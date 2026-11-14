/**
 * Docera Khmer Unicode Normalization & Legacy Visual Encoding Repair Service
 *
 * Provides:
 * 1. Canonical Unicode reordering and normalization (NFC) for Khmer script.
 * 2. High-precision detection and repair of legacy Limon/ABC keyboard mapping artifacts
 *    commonly found in older Cambodian institutional PDFs.
 */

/**
 * Common legacy visual keyboard mappings (Limon / ABC / pre-Unicode conventions)
 * where visual glyphs were mapped to non-standard or decomposed codepoints in ToUnicode CMaps.
 */
const LEGACY_REPLACEMENTS: [RegExp, string][] = [
  // Specific compound word patterns (checked first)
  [/គប្រើប្បាស់/g, 'ប្រើប្រាស់'],
  [/គប្រើ/g, 'ប្រើ'],
  [/ប្បាស់/g, 'ប្រាស់'],
  [/គប្កាយ/g, 'ក្រោយ'],
  [/គនេះ/g, 'នេះ'],
  [/គតើ/g, 'តើ'],
  [/គោក/g, 'លោក'],
  [/គពេល/g, 'ពេល'],
  [/គលើ/g, 'លើ'],
  [/គរៀន/g, 'រៀន'],
  [/ដផ្អក/g, 'ផ្អែក'],
  [/ឆ្្ុំ/g, 'ឆ្នាំ'],

  // Double subscript coengs
  [/\u17D2\u17D2/g, '\u17D2'],

  // Visual prefix គ (key 'c' in Limon which represented visual left vowel េ / ើ / ោ)
  [/គ([ក-អ])ើ/g, '$1ើ'],
  [/គ([ក-អ])(េ[ះ]?|ោ|ៅ)/g, '$1$2'],
  [/គ([ក-អ])(្រ|្ល|្យ|្ន|្ម|្ង)/g, '$1$2'],

  // Visual prefix ដ (key 'd' in Limon which represented visual left vowel ែ)
  [/ដ([ក-អ])្([ក-អ])ក/g, '$1្$2ែក'],

  // Frequent Limon / pre-Unicode institutional vocabulary artifacts
  [/ប្ទព្យ/g, 'ទ្រព្យ'],
  [/ប្បាក់/g, 'ប្រាក់'],
  [/ររស់/g, 'របស់'],
  [/កនញង/g, 'ក្នុង'],
  [/រគញ្ញើ/g, 'បញ្ញើ'],
  [/រងាហ្ញ/g, 'បង្ហាញ'],
  [/វិភារ/g, 'វិភាគ'],
  [/ទិនន័យ/g, 'ទិន្នន័យ'],
  [/ហិរញ្ញវតថញ/g, 'ហិរញ្ញវត្ថុ'],
  [/អនុាសន៍/g, 'អនុសាសន៍'],
  [/ប្រសិទធភាព/g, 'ប្រសិទ្ធភាព'],
  [/ោ ្ងដូច្/g, 'យ៉ាងដូចម្តេច'],
];

/**
 * Returns true if the text contains Khmer legacy encoding or visual keyboard mapping artifacts.
 */
export function detectLegacyKhmerArtifacts(text: string): boolean {
  if (!text) return false;
  for (const [pattern] of LEGACY_REPLACEMENTS) {
    if (pattern.test(text)) return true;
  }
  // Generic pattern check: គ followed by consonant and vowel
  return /គ[ក-អ][ើេោ]/.test(text) || /\u17D2\u17D2/.test(text);
}

/**
 * Repairs legacy Limon / ABC visual typing artifacts into clean standard Unicode Khmer.
 */
export function repairLegacyKhmerArtifacts(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of LEGACY_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return normalizeKhmerUnicode(result);
}

/**
 * Canonical Khmer Unicode Normalization:
 * - Recombines split vowels (e.g. េ + ា -> ោ, េ + ី -> ើ)
 * - Eliminates duplicate coengs
 * - Ensures NFC normalization
 */
export function normalizeKhmerUnicode(text: string): string {
  if (!text) return text;

  let norm = text.normalize('NFC');

  // Strip errant whitespace before combining vowel marks or diacritics (e.g. 'សុ ី' -> 'ស៊ី')
  norm = norm.replace(/\s+([\u17B6-\u17D3])/g, '$1');

  // Fix accidental double/misplaced vowel combinations: u (U+17BB) + ii (U+17B8) -> ii (U+17B8)
  norm = norm.replace(/\u17BB\u17B8/g, '\u17B8');
  norm = norm.replace(/\u17B8\u17BB/g, '\u17B8');

  // De-duplicate coengs: ្ + ្ -> ្
  norm = norm.replace(/\u17D2{2,}/g, '\u17D2');

  // Combine split vowels:
  // េ (U+17C1) + ា (U+17B6) -> ោ (U+17C4)
  norm = norm.replace(/\u17C1\u17B6/g, '\u17C4');

  // េ (U+17C1) + ី (U+17B8) -> ើ (U+17BE)
  norm = norm.replace(/\u17C1\u17B8/g, '\u17BE');

  // េ (U+17C1) + ើ (U+17BE) -> ើ (U+17BE)
  norm = norm.replace(/\u17C1\u17BE/g, '\u17BE');

  // េ (U+17C1) + ៅ (U+17C5) -> ៅ (U+17C5)
  norm = norm.replace(/\u17C1\u17C5/g, '\u17C5');

  return norm;
}
