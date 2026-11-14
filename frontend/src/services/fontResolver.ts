/**
 * Docera Font Resolver & Eager Font-Loading Service
 * Synchronizes frontend font selection and metrics with the backend HarfBuzz layout engine.
 * Strips PDF subset prefixes (e.g. "BAAAAA+KhmerOSBattambang" -> "KhmerOSBattambang")
 * and guarantees fonts are loaded into the browser font cache before measuring or rendering.
 */

export interface FontDefinition {
  family: string;
  url: string;
  weight?: string;
  style?: string;
  isKhmer?: boolean;
}

export const REGISTERED_FONTS: Record<string, FontDefinition> = {
  KhmerOSBattambang: {
    family: 'KhmerOSBattambang',
    url: '/fonts/KhmerOSbattambang.ttf',
    isKhmer: true,
  },
  KhmerOS: {
    family: 'KhmerOS',
    url: '/fonts/KhmerOS.ttf',
    isKhmer: true,
  },
  KhmerOSMuol: {
    family: 'KhmerOSMuol',
    url: '/fonts/KhmerOSmuol.ttf',
    isKhmer: true,
  },
  KhmerOSMuolLight: {
    family: 'KhmerOSMuolLight',
    url: '/fonts/KhmerOSmuollight.ttf',
    isKhmer: true,
  },
  KhmerOSMuolPali: {
    family: 'KhmerOSMuolPali',
    url: '/fonts/KhmerOSmuolpali.ttf',
    isKhmer: true,
  },
  KhmerOSSiemreap: {
    family: 'KhmerOSSiemreap',
    url: '/fonts/KhmerOSsiemreap.ttf',
    isKhmer: true,
  },
  KhmerOSBokor: {
    family: 'KhmerOSBokor',
    url: '/fonts/KhmerOSbokor.ttf',
    isKhmer: true,
  },
  KhmerOSContent: {
    family: 'KhmerOSContent',
    url: '/fonts/KhmerOScontent.ttf',
    isKhmer: true,
  },
  KhmerOSFasthand: {
    family: 'KhmerOSFasthand',
    url: '/fonts/KhmerOSfasthand.ttf',
    isKhmer: true,
  },
  KhmerOSFreehand: {
    family: 'KhmerOSFreehand',
    url: '/fonts/KhmerOSfreehand.ttf',
    isKhmer: true,
  },
  KhmerOSMetalChrieng: {
    family: 'KhmerOSMetalChrieng',
    url: '/fonts/KhmerOSmetalchrieng.ttf',
    isKhmer: true,
  },
  KhmerOSSys: {
    family: 'KhmerOSSys',
    url: '/fonts/KhmerOSsys.ttf',
    isKhmer: true,
  },
  'Noto Sans Khmer': {
    family: 'Noto Sans Khmer',
    url: '/fonts/NotoSansKhmer-Regular.ttf',
    isKhmer: true,
  },
  'Noto Serif Khmer': {
    family: 'Noto Serif Khmer',
    url: '/fonts/NotoSerifKhmer-Regular.ttf',
    isKhmer: true,
  },
};

/**
 * Check if text contains any Khmer Unicode code points (U+1780-U+17FF or U+19E0-U+19FF)
 */
export function hasKhmerText(text: string): boolean {
  if (!text) return false;
  return /[\u1780-\u17ff\u19e0-\u19ff]/.test(text);
}

/**
 * Clean PDF font name by stripping ISO 32000 subset prefix (e.g. "ABCDEF+FontName" -> "FontName")
 */
export function cleanPdfFontName(fontName: string | null | undefined): string {
  if (!fontName) return '';
  let cleaned = fontName.trim();
  const plusIdx = cleaned.indexOf('+');
  if (plusIdx >= 0 && plusIdx <= 7) {
    cleaned = cleaned.substring(plusIdx + 1);
  }
  return cleaned;
}

/**
 * Resolve the optimal frontend font family matching the backend layout_engine.py logic.
 */
export function resolveEditorFontFamily(fontName: string | null | undefined, text: string = ''): string {
  const isKhmer = hasKhmerText(text);
  const cleanName = cleanPdfFontName(fontName).toLowerCase().replace(/[\s\-_]+/g, '');

  if (isKhmer || cleanName.includes('khmer') || cleanName.includes('battambang') || cleanName.includes('muol') || cleanName.includes('moul')) {
    if (cleanName.includes('muollight')) {
      return 'KhmerOSMuolLight';
    }
    if (cleanName.includes('muolpali')) {
      return 'KhmerOSMuolPali';
    }
    if (cleanName.includes('muol') || cleanName.includes('moul')) {
      return 'KhmerOSMuol';
    }
    if (cleanName.includes('siemreap')) {
      return 'KhmerOSSiemreap';
    }
    if (cleanName.includes('bokor')) {
      return 'KhmerOSBokor';
    }
    if (cleanName.includes('content')) {
      return 'KhmerOSContent';
    }
    if (cleanName.includes('fasthand')) {
      return 'KhmerOSFasthand';
    }
    if (cleanName.includes('freehand')) {
      return 'KhmerOSFreehand';
    }
    if (cleanName.includes('metalchrieng')) {
      return 'KhmerOSMetalChrieng';
    }
    if (cleanName.includes('sys')) {
      return 'KhmerOSSys';
    }
    if (cleanName.includes('notoserif') || cleanName.includes('serifkhmer')) {
      return 'Noto Serif Khmer';
    }
    if (cleanName.includes('notosans') || cleanName.includes('noto') || cleanName.includes('kantumruy')) {
      return 'Noto Sans Khmer';
    }
    if (cleanName.includes('khmeros') && !cleanName.includes('battambang')) {
      return 'KhmerOS';
    }
    return 'KhmerOSBattambang';
  }

  // Latin fallbacks
  if (cleanName.includes('times') || cleanName.includes('serif')) {
    return 'Times New Roman, Times, serif';
  }
  if (cleanName.includes('courier') || cleanName.includes('mono')) {
    return 'Courier New, Courier, monospace';
  }
  return 'Helvetica, Arial, sans-serif';
}

const loadedFontsCache = new Set<string>();

/**
 * Ensures the specified font family is fully loaded and ready in document.fonts.
 */
export async function ensureFontLoaded(family: string): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document)) return true;
  if (loadedFontsCache.has(family)) return true;

  const fontDef = REGISTERED_FONTS[family];
  if (!fontDef) {
    await document.fonts.ready;
    return true;
  }

  try {
    const isLoaded = document.fonts.check(`12px "${family}"`);
    if (isLoaded) {
      loadedFontsCache.add(family);
      return true;
    }

    const fontFace = new FontFace(family, `url(${fontDef.url})`, {
      style: fontDef.style || 'normal',
      weight: fontDef.weight || 'normal',
      display: 'block',
    });

    const loadedFace = await fontFace.load();
    document.fonts.add(loadedFace);
    await document.fonts.ready;
    loadedFontsCache.add(family);
    return true;
  } catch (err) {
    console.warn(`[fontResolver] Failed to dynamically load font ${family}:`, err);
    return false;
  }
}

/**
 * Eagerly preload all bundled Khmer OpenType fonts to eliminate visual shifts.
 */
export async function preloadAllKhmerFonts(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const promises = Object.keys(REGISTERED_FONTS).map(family => ensureFontLoaded(family));
  await Promise.allSettled(promises);
}
