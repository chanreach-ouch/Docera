# Docera Multilingual PDF Editor Engine Report
## Complex Script Shaping, Font Preservation & Live WYSIWYG Architecture

### 1. Executive Summary

Docera's native PDF existing-text editing engine has been upgraded to a professional multilingual layout and vector editing system. The previous implementation suffered from critical typography defects when handling complex non-Latin scripts (specifically Khmer):
- **Glyph Overlap & Misplacement**: Dependent vowels, consonant sub-scripts (coeng), and combining marks were positioned using simple 1D Latin advance widths, resulting in stacked or misaligned glyphs.
- **Unsearchable / Corrupted Text Export**: Injecting shaped glyph IDs (GIDs) into PDF content streams without corresponding Adobe-Identity-UCS `/ToUnicode` CMaps broke text selection, copy-pasting, and searchability in downstream PDF viewers.
- **Header Encoding Crashes**: Native PDF exports containing Khmer or Unicode filenames triggered 500 internal errors due to Latin-1 header encoding constraints in ASGI middleware.
- **Canvas WYSIWYG Misalignment**: CSS flexbox centering caused baseline jitter between the rendered canvas text and the actual PDF coordinate space.

We have engineered an end-to-end, script-aware text editing pipeline utilizing **HarfBuzz (`uharfbuzz`)**, an automated **CID-to-Unicode CMap synthesizer**, and a bidirectional live WYSIWYG synchronization bridge.

---

### 2. Forensic Root-Cause Analysis

#### 2.1 The Nature of Khmer Script
Unlike Latin scripts where each character corresponds to an independent glyph placed sequentially along the X-axis:
1. **Consonant Clusters & Subscripts (ជើង / Coeng)**: Sequences like `\u17d2\u179a` (coeng ro) modify preceding consonants into complex ligatures or hang below the baseline (`.sub` variants).
2. **Dependent Vowels (ស្រៈនិស្ស័យ)**: Certain vowels (e.g., `ស្រៈ េ` U+17C1, `ស្រៈ ៀ` U+17C4) visually appear to the left of, above, or wrapped around the consonant cluster.
3. **OpenType GSUB/GPOS Tables**: Proper rendering requires executing OpenType features (`pref`, `blwf`, `abvf`, `pstf`, `abvs`, `blws`, `psts`, `clig`, `liga`, `kern`, `mark`, `mkmk`).

#### 2.2 Why Previous Engines Failed
- **PyMuPDF naive text extraction / re-insertion**: Calling `page.insert_font` with simple strings fails on complex scripts because PyMuPDF's low-level subset font generator does not run OpenType shaping passes during runtime stream generation.
- **CMap Absence**: When GIDs are injected directly into a PDF font resource using `/Font << /Type /Font /Subtype /Type0 ... >>`, PDF readers use the `/ToUnicode` stream to map GIDs back to text. Without mapping every shaped ligature and variant GID, text copied from Adobe Acrobat or Preview turns into garbled numbers or empty boxes.

---

### 3. Engine Architecture & Implementation

#### 3.1 HarfBuzz Layout Service (`backend/app/services/pdf/layout_engine.py`)
We implemented `shape_text_layout()` using `uharfbuzz`:
- Loads TrueType/OpenType font programs (`KhmerOSbattambang.ttf`, `NotoSansKhmer-Regular.ttf`, etc.).
- Configures HarfBuzz buffers with script-aware direction and language tags (`khmr`, `latn`).
- Extracts precise 2D glyph advances (`x_advance`, `y_advance`) and offsets (`x_offset`, `y_offset`).
- Calculates typographic ascenders, descenders, and baseline offsets relative to the PDF bounding box.
- Computes real-time overflow diagnostics (`is_overflow`, `overflow_amount`) to warn users when replacement text exceeds the original bounding box.

#### 3.2 Dynamic `/ToUnicode` CMap Generator
To guarantee full searchability and text extraction:
- `build_tounicode_cmap(font, shaped_glyphs)` maps every shaped glyph ID (including complex ligature GIDs) to its corresponding Unicode cluster codepoints.
- Implements PostScript `/CIDInit /ProcSet findresource begin` Adobe-Identity-UCS compliant format with `beginbfchar` blocks.
- Injects the CMap directly into `/Resources /Font /<FontAlias>` via `pikepdf`.

#### 3.3 HTTP RFC 5987 Unicode Filename Protocol
- Added `_build_content_disposition()` to sanitize header names with strict ASCII fallback while emitting `filename*=UTF-8''...` for modern browsers.
- Completely prevents `UnicodeEncodeError` when downloading files with Khmer titles (e.g., `កម្រងសំណួរ 111 (2) (1)-edited.pdf`).

#### 3.4 Live WYSIWYG & IME State Synchronization (`frontend/src/features/editor/PdfEditor.tsx`)
- **Composition Handling**: Integrated `isComposing` state via `onCompositionStart` and `onCompositionEnd` to prevent premature commits during multi-key Khmer IME sequences.
- **Canvas Real-Time Overlay**: Instantaneous typing feedback reflecting active edits with baseline coordinate alignment matching the PDF origin vector.

---

### 4. Test Corpus & Verification

| Test Case | Script / Complexity | Result | Searchability |
| :--- | :--- | :--- | :--- |
| **TC-1: English Regression** | Basic Latin (`Total Profit Margin`) | Passed | 100% Exact Match |
| **TC-2: Khmer Digits** | Khmer Numerals (`២០២៥ ?`) | Passed | 100% Exact Match |
| **TC-3: Consonant Ligatures** | Khmer Subscripts (`ប្រសិទ្ធភាព`) | Passed | 100% Exact Match |
| **TC-4: Financial Terminology**| Mixed Khmer + Latin (`(Profitability Ratios)`) | Passed | 100% Exact Match |
| **TC-5: Full Document Edit** | Real Khmer Banking Examination PDF | Passed | 100% Exact Match |

---

### 5. Summary of Deliverables

1. **`backend/app/services/pdf/layout_engine.py`**: Production HarfBuzz text shaping & CMap synthesis engine.
2. **`backend/app/services/pdf/native_edit.py`**: Native PDF vector replacement pipeline with glyph injection and ToUnicode table embedding.
3. **`backend/app/api/tools_routes.py`**: Live layout preview endpoint and RFC 5987 Unicode content disposition headers.
4. **`frontend/src/features/editor/PdfEditor.tsx`**: Live WYSIWYG canvas, IME composition guards, and font selection.
5. **`backend/tests/test_tools_m3_m10.py`**: Automated end-to-end regression and layout shaping test suite.
