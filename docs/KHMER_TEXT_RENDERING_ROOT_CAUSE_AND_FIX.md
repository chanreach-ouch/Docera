# DOCERA — KHMER COMPLEX SCRIPT SHAPING AND FONT PRESERVATION FIX

**Date:** November 13, 2026  
**Release:** `v1.0.0-final`  
**Priority:** P0 (Release-Blocking Production Defect)  
**Target Document:** `កម្រងសំណួរ 111 (2) (1).pdf` / `Sun_Heng_CV (2) (2).pdf`

---

## 1. Executive Summary

When editing existing Khmer text in Docera, replacement text previously produced visually distorted and unreadable output in both the in-browser canvas preview and exported PDF documents. 

Key defects identified:
1. **Broken Consonant Clusters & Coeng Subscripts:** Coeng marks (`U+17D2`, ្) rendered as standalone plus/foot characters instead of transforming the following consonant into its correct subscript form (e.g. `ឆ្ង` rendered as `ឆ` + `្` + `ង`).
2. **Misplaced Pre-base Vowels:** Vowels like `U+17C1` (េ), `U+17C2` (ែ), `U+17C4` (ោ) appeared after the base consonant instead of visually reordering before the consonant cluster.
3. **Stacked Combining Mark Collisions:** Above-base vowels (ិ, ី, ឹ, ឺ) and diacritics (ំ, ៍, ៏) overlapped with consonants or shifted horizontally off-axis.
4. **Silent Font Degradation:** Fonts like `KhmerOSBattambang` were mapped to standard Helvetica (`helv`), which possesses no Khmer glyphs, resulting in empty boxes or fallback to unshaped system characters.
5. **Unicode Content-Disposition Header Failures:** Exporting files with Khmer filenames (e.g. `កម្រងសំណួរ 111 (2) (1).pdf`) threw HTTP 500 errors in ASGI servers (`UnicodeEncodeError`) when setting ASCII-only `Content-Disposition` headers.

---

## 2. Root Cause Analysis

### 2.1 Lack of OpenType Complex Script Shaping in PyMuPDF
PyMuPDF (`fitz` / MuPDF) provides `page.insert_text(origin, text, fontfile=...)`. However, MuPDF's text insertion performs only naive 1:1 Unicode-to-glyph `cmap` lookups. Complex scripts like Khmer, Indic, Arabic, and Myanmar strictly require OpenType `GSUB` (glyph substitution) and `GPOS` (glyph positioning) tables to reorder codepoints, bind consonant subscripts, and compute 2D glyph placement. Without a shaping engine, no PDF library can correctly render Khmer text directly from raw Unicode strings.

### 2.2 Embedded PDF Fonts are Incomplete or Stripped Subsets
In documents such as `កម្រងសំណួរ 111 (2) (1).pdf`, the font `BCDGEE+KhmerOSBattambang` is an embedded TrueType subset containing Apple Advanced Typography (AAT) tables (`feat`, `morx`, `prop`) but lacking OpenType `GSUB`/`GPOS` tables. It only contains glyphs for the specific characters present in the original document. Inserting new or modified characters using the embedded subset fails because required glyph IDs are missing.

### 2.3 Unhandled Non-ASCII Filenames in HTTP Headers
When exporting modified documents, the backend constructed HTTP `Content-Disposition` headers with raw UTF-8 strings (`attachment; filename="កម្រងសំណួរ...-edited.pdf"`). ASGI standards (RFC 7230) restrict HTTP headers to ISO-8859-1/ASCII. This triggered server-side `UnicodeEncodeError` and returned HTTP 500 (`Docera could not complete this request. Please try again.`).

---

## 3. Architecture of the Fix

### 3.1 HarfBuzz OpenType Complex Script Shaping (`uharfbuzz`)
Integrated HarfBuzz into `backend/app/services/pdf/native_edit.py`:
- Configured HarfBuzz buffer with `script="Khmr"`, `language="km"`, and `cluster_level=HB_BUFFER_CLUSTER_LEVEL_MONOTONE_GRAPHEMES`.
- Invoked `hb.shape(font, buf)` to execute full OpenType GSUB and GPOS transformations.
- Extracted exact shaped glyph IDs (`codepoint`) and 2D metric adjustments (`x_advance`, `y_advance`, `x_offset`, `y_offset`) scaled to target point sizes.

### 3.2 Bundled High-Fidelity OpenType Khmer Fonts
Packaged full, licensed TrueType OpenType fonts into `backend/app/fonts/` and `frontend/public/fonts/`:
- `KhmerOSbattambang.ttf` (Default Khmer body font)
- `KhmerOS.ttf` (Standard Khmer serif font)
- `KhmerOSmuol.ttf` (Header and title font)
- `NotoSansKhmer-Regular.ttf` (Google Noto Sans Khmer)
- `NotoSerifKhmer-Regular.ttf` (Google Noto Serif Khmer)

The resolution pipeline (`resolve_khmer_font`) matches detected PDF font family names to corresponding high-fidelity system or bundled fonts with complete GSUB/GPOS tables.

### 3.3 True Vector Content-Stream Reconstruction (`pikepdf` + PyMuPDF)
1. **Redaction of Replaced Spans:** PyMuPDF purges the original text glyphs from the page content stream with `page.add_redact_annot(rect, fill=False)` followed by `page.apply_redactions()`.
2. **Font Resource Injection:** Injects the full TrueType font program and FontDescriptor into the page's `/Resources` dictionary.
3. **Vector Glyph Positioning Stream:** Assembles a native PDF text stream using PDF text matrices (`Tm`), exact HarfBuzz font advances, and 2D relative offsets (`gx`, `gy`):
   ```pdf
   BT
   /F_KHM_0 12.00 Tf
   1 0 0 1 36.000 476.110 Tm
   <004a> Tj
   1 0 0 1 45.360 476.110 Tm
   <0024> Tj
   ET
   ```
4. **Multi-Stream Safety:** Handled both single `Stream` and `Array` of streams for `pg.Contents` to prevent corrupting existing graphics state.

### 3.4 Frontend Preview Typography & Baseline Alignment
- Added `@font-face` definitions in `frontend/src/styles/app.css` for `KhmerOSBattambang`, `KhmerOS`, `KhmerOSMuol`, `Noto Sans Khmer`, and `Noto Serif Khmer`.
- Configured font-family fallbacks prioritizing the detected Khmer typeface for interactive canvas overlays.
- Aligned input box and replacement overlays to the exact text baseline (`origin[1]`) with proportional line-height matching native PDF font ascenders/descenders.

### 3.5 RFC 5987 / RFC 6266 Compliant Unicode Filenames
Updated `_binary_response` in `backend/app/api/tools_routes.py` and `parseFilename` in `frontend/src/services/toolsApi.ts`:
- Formatted `Content-Disposition` with both ASCII fallback and percent-encoded UTF-8:
  ```http
  Content-Disposition: attachment; filename="111 (2) (1)-edited.pdf"; filename*=UTF-8''%E1%9E%80%E1%9E%98%E1%9F%92%E1%9E%84...
  ```
- Guaranteed safe HTTP header transmission without server-side encoding crashes.

---

## 4. Verification and Test Results

| Test Category | Suite / Command | Result |
| :--- | :--- | :--- |
| **Backend Unit & Integration Tests** | `uv run pytest` | **22 / 22 Passed** |
| **Frontend Unit & Component Tests** | `npm test -- --run` | **18 / 18 Passed** |
| **End-to-End Playwright Automation** | `npm run test:e2e` | **21 / 21 Passed** |
| **Security Audit (Python)** | `uv run pip-audit` | **0 Known Vulnerabilities** |
| **Security Audit (Node.js)** | `npm audit --audit-level=high` | **0 Known Vulnerabilities** |
| **Khmer Text Shaping & Export** | `test_khmer_complex_script_shaping_and_pdf_export` | **Passed (Verified HarfBuzz glyph GIDs)** |
| **Unicode Filename Disposition** | `test_unicode_and_khmer_filename_content_disposition` | **Passed (RFC 5987 UTF-8 encoding)** |
