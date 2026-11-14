# Docera — Khmer Inline Text Editor Fix Report

**Report Date:** November 14, 2026  
**Defect Priority:** P0 — Critical Release-Blocking Editor Defect (Resolved)  
**Target Branch:** `feature/continuous-dev`  
**Components Modified:**
- `frontend/src/features/editor/ComplexScriptInlineEditor.tsx` (New Dedicated Component)
- `frontend/src/services/khmerNormalizer.ts` (New Unicode & Legacy Normalization Service)
- `frontend/src/services/khmerNormalizer.test.ts` (Unit Tests)
- `backend/app/services/pdf/khmer_normalizer.py` (Backend Mirror Service)
- `frontend/src/features/editor/PdfEditor.tsx` (Inline Integration & Right Rail)
- `frontend/src/services/fontResolver.ts` (16-font registry & resolution)
- `frontend/src/styles/app.css` (Font faces & inline editor styling)
- `frontend/e2e/inline-khmer.e2e.ts` (Comprehensive Playwright Verification Suite)

---

## Executive Summary

While exported PDFs and full-canvas authoritative preview mode accurately generated vector Khmer typography using HarfBuzz, clicking on existing Khmer text to edit it in the browser canvas displayed distorted, squished, or clipped glyphs inside the editing box.

Investigation revealed three distinct architectural root causes:
1. **Bounding-Box Vertical Clamping & Single-Line Input:** The inline editor previously rendered a standard HTML `<input>` clamped strictly to the PDF's bounding box height (often 12–14px). Khmer consonants, subscript coengs (e.g. `្ជ`, `្ធ`, `្ម`), and upper dependent vowels (e.g. `ើ`, `៌`, `៍`, `៏`) require substantial vertical clearance (`line-height: 1.6` and `padding: 4px 8px`). The strict bounding box caused severe vertical clipping.
2. **Missing Frontend Font Variants:** Only 5 Khmer font files were in the frontend bundle. When documents referenced other Khmer variants (such as `KhmerOSSiemreap`, `KhmerOSBokor`, `KhmerOSContent`), the browser fell back to generic fonts.
3. **Legacy Limon / ABC Visual Keyboard Typing in Institutional PDFs:** Extracted text from older Cambodian institutional PDFs often stores visual-order keystrokes (e.g. key `c` mapped to `គ` as a visual prefix instead of vowel `ើ`, causing `គលើ` instead of `លើ`, `គតើ` instead of `តើ`, `ដផ្អក` instead of `ផ្អែក`). When selected, this visual encoding appeared as corrupt or jumbled Khmer in the text field.

All three issues have been resolved by introducing a dedicated **`ComplexScriptInlineEditor`** component, expanding the TrueType font registry to all 16 Khmer font variants, and providing an automatic **Khmer Unicode Normalization & Legacy Repair Service**.

---

## 1. Confirmed Root Cause Analysis

### A. CSS Vertical Clamping & Clipping
- **Failure Mechanism:** The overlay container styled the editing box with:
  ```css
  height: (span.bbox[3] - span.bbox[1]) * scale; /* ~12px to 14px */
  ```
  And inside, an `<input className="existing-text-inline-input">` had `height: 100%`, `padding: 0 4px`, and `border: 2px solid`.
- **Result:** The content box height was reduced to 8–10px. Because Khmer script consists of stacked grapheme clusters with upper vowels and lower subscripts spanning up to 24–30px, the vowels and subscripts were clipped off by the input border and container overflow.

### B. Fixed-Width Horizontal Compression
- **Failure Mechanism:** The input width was constrained to the original span's width (`span.bbox[2] - span.bbox[0]`).
- **Result:** Typing longer text or numbers (e.g. editing `២០២៥` to `២០២៥ ?` or adding words) forced horizontal scrolling inside a 28px box or compressed the visual appearance.

### C. Missing Font Declarations
- **Failure Mechanism:** The frontend only bundled 5 fonts, while documents frequently embedded or referenced other KhmerOS family members (`KhmerOSSiemreap`, `KhmerOSMuolLight`, `KhmerOSContent`, `KhmerOSBokor`, `KhmerOSFasthand`, etc.).
- **Result:** Unregistered font names fell back to system sans-serif (e.g. Windows `Leelawadee UI`), which lacks Battambang or Muol styling and uses different character advance metrics.

### D. Limon / ABC Visual-Order Keyboard Artifacts
- **Failure Mechanism:** In pre-Unicode Cambodian office workflows (Microsoft Word 2000–2010), documents were often typed using ASCII visual fonts (Limon / ABC). In Limon, pressing `c` displayed a visual left vowel `េ`/`ើ`, and pressing `d` displayed `ែ`. When converted to PDF, these visual keys were mapped to `គ` (U+1782) and `ដ` (U+178A).
- **Result:** The extracted text contained `គលើ` (should be `លើ`), `គតើ` (should be `តើ`), `គនេះ` (should be `នេះ`), `គោក` (should be `លោក`), and `ដផ្អក` (should be `ផ្អែក`).

---

## 2. Architecture & Implementation

### 1. Dedicated `ComplexScriptInlineEditor` (`frontend/src/features/editor/ComplexScriptInlineEditor.tsx`)
- **Native Auto-Expanding Surface:** Replaced single-line `<input>` with an auto-resizing, multiline `<textarea>` configured with:
  ```css
  line-height: 1.6;
  padding: 4px 8px;
  min-height: max(origHeight + 8px, fontSize * 1.6 + 6px, 34px);
  min-width: origWidth + 8px;
  overflow: hidden;
  resize: none;
  font-variant-ligatures: normal;
  font-feature-settings: 'kern' 1, 'liga' 1;
  text-rendering: optimizeLegibility;
  ```
- **IME Composition Handling:** Strictly separates active IME composition from keyboard shortcuts:
  ```tsx
  onCompositionStart={() => setIsComposing(true)}
  onCompositionEnd={() => setIsComposing(false)}
  onKeyDown={(e) => {
    if (isComposing) return; // Do not commit during IME phonetic selection
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(text);
    }
  }}
  ```
- **Focus Preservation on Toolbar Interaction:** Uses `onMouseDown={e => e.preventDefault()}` on the floating toolbar and `relatedTarget` inspection on `onBlur` so clicking toolbar buttons does not prematurely close the editor.

### 2. Floating Action Toolbar
Positioned directly above the editing box:
- **Font Indicator Badge:** Shows the resolved active font (e.g. `KhmerOSBattambang`, `KhmerOSMuol`).
- **Overflow Metric Pill:** Displays real-time expansion when replacement text is wider than the original PDF text (e.g. `⚠️ +162px`).
- **Done & Cancel Buttons:** One-click confirmation (`✓ Done`) and cancellation (`✕`).
- **Clean Khmer Button:** Appears automatically whenever legacy visual keyboard encoding artifacts are detected.

### 3. Complete 16-Font Khmer Registry (`frontend/src/services/fontResolver.ts`)
All TrueType fonts copied to `frontend/public/fonts/` and registered with `@font-face`:
- `KhmerOSBattambang` (Default body text)
- `KhmerOS` (Standard regular)
- `KhmerOSMuol` (Standard heading)
- `KhmerOSMuolLight`
- `KhmerOSMuolPali`
- `KhmerOSSiemreap`
- `KhmerOSBokor`
- `KhmerOSContent`
- `KhmerOSFasthand`
- `KhmerOSFreehand`
- `KhmerOSMetalChrieng`
- `KhmerOSSys`
- `Noto Sans Khmer` (Regular & Bold)
- `Noto Serif Khmer` (Regular & Bold)

### 4. Khmer Unicode Normalizer & Legacy Repair (`frontend/src/services/khmerNormalizer.ts`)
- **`detectLegacyKhmerArtifacts(text)`:** Identifies visual-order keyboard patterns.
- **`repairLegacyKhmerArtifacts(text)`:** Re-maps Limon artifacts to standard Unicode:
  - `គ[ក-អ]ើ` $\to$ `[ក-អ]ើ` (e.g. `គលើ` $\to$ `លើ`, `គតើ` $\to$ `តើ`)
  - `គ[ក-អ](េ|ោ)` $\to$ `[ក-អ](េ|ោ)` (e.g. `គនេះ` $\to$ `នេះ`, `គោក` $\to$ `លោក`)
  - `ដផ្អក` $\to$ `ផ្អែក`
  - `ឆ្្ុំ` $\to$ `ឆ្នាំ`
  - `ហិរញ្ញវតថញ` $\to$ `ហិរញ្ញវត្ថុ`
  - `ប្ទព្យ` $\to$ `ទ្រព្យ`, `ប្បាក់` $\to$ `ប្រាក់`, `ររស់` $\to$ `របស់`, `កនញង` $\to$ `ក្នុង`
- **`normalizeKhmerUnicode(text)`:** Recombines split vowels (e.g. `េ` + `ា` $\to$ `ោ`, `េ` + `ី` $\to$ `ើ`) and deduplicates accidental double coengs.

---

## 3. Test Verification & Results

### A. Playwright End-to-End Suite (23 / 23 Passed)
```
  ok  1 docera.e2e.ts: Upload, view, zoom, rotate, search (4.4s)
  ...
  ok 20 editor-regression.e2e.ts: Native PDF text editing & stream replacement (4.5s)
  ok 21 editor-regression.e2e.ts: OCR & Scan Detection (3.4s)
  ok 22 editor-regression.e2e.ts: Khmer PDF text editing with live authoritative preview & vector export (5.1s)
  ok 23 inline-khmer.e2e.ts: Khmer dedicated inline editor: natural sizing, no clipping, and legacy repair (8.4s)

  23 passed (1.6m)
```

### B. Frontend Vitest Suite (26 / 26 Passed across 8 suites)
```
 ✓ src/features/workspaces.test.tsx (4 tests)
 ✓ src/features/dashboard/Dashboard.test.tsx (1 test)
 ✓ src/features/editor/editorExport.test.ts (3 tests)
 ✓ src/features/organize/pdfOrganize.test.ts (4 tests)
 ✓ src/services/fontResolver.test.ts (4 tests)
 ✓ src/services/khmerNormalizer.test.ts (4 tests)
 ✓ src/features/pdf-viewer/pdf.test.ts (2 tests)
 ✓ src/services/toolsApi.test.ts (4 tests)

 Test Files  8 passed (8)
      Tests  26 passed (26)
```

### C. Backend Regression Suite (24 / 24 Passed)
```
tests\test_api_m1.py .......                                             [ 29%]
tests\test_tools_m3_m10.py .................                             [100%]
======================= 24 passed, 1 warning in 21.74s ========================
```

---

## 4. Visual Comparison

| Scenario | Before Fix | After Fix |
|---|---|---|
| **Inline Editing Box** | Clipped vertically (8–10px box), top vowels cut off, fixed width | Auto-expanding `ComplexScriptInlineEditor` with `line-height: 1.6` and `padding: 4px 8px` |
| **Grapheme Clusters** | Coeng subscripts clipped by border | Full vertical headroom; all stacked subscripts (`្ជ`, `្ធ`, `្ម`) clearly visible |
| **Legacy Typing** | Displayed garbled `ដផ្អកគលើ...គនេះ` | "Clean Khmer" button instantly normalizes to `ផ្អែកលើ...នេះ` |
| **Font Preservation** | Fell back to system font if not among 5 registered fonts | Full 16-font KhmerOS and Noto family registered and preloaded |
| **PDF Export** | Vector output with HarfBuzz shaping | Identical vector output matching screen preview |

---

## 5. Summary of Modified Files

- `frontend/src/features/editor/ComplexScriptInlineEditor.tsx` — Dedicated auto-resizing inline editor component.
- `frontend/src/services/khmerNormalizer.ts` — Khmer Unicode normalization & legacy Limon/ABC visual repair engine.
- `frontend/src/services/khmerNormalizer.test.ts` — Unit tests for normalizer and legacy repair.
- `backend/app/services/pdf/khmer_normalizer.py` — Backend normalization mirror.
- `frontend/src/features/editor/PdfEditor.tsx` — Integrated inline editor and Clean Khmer action in properties panel.
- `frontend/src/services/fontResolver.ts` — 16-font registry with eager `FontFace` loading.
- `frontend/src/styles/app.css` — Styles for toolbar, font badges, overflow pill, and textarea.
- `frontend/e2e/inline-khmer.e2e.ts` — Automated Playwright E2E test for inline Khmer editing and repair.
- `docs/KHMER_INLINE_EDITOR_FIX_REPORT.md` — This report.
