# DOCERA — NATIVE PDF TEXT EDITING & ENGINE RELIABILITY REPORT

**Date:** November 13, 2026  
**Release:** `v1.0.0-final`  
**Target Document Tested:** `Sun_Heng_CV (2) (2).pdf` (Multi-page embedded subset Type0 fonts)

---

## 1. Executive Summary

During testing of `Sun_Heng_CV (2) (2).pdf` on Docera's OCR and PDF Editor engines, two critical production issues were diagnosed, resolved, and verified:

1. **OCR Engine Gateway Failure (Reported in Screenshot):**
   - **Symptom:** User uploaded `Sun_Heng_CV (2) (2).pdf` to OCR & Scan Detection workspace, clicked "Run OCR & Build Searchable PDF", and was presented with the error banner: *"Docera could not complete this operation."*
   - **Root Cause:** Upstream Nginx reverse proxy crashed with `502 Bad Gateway` (`upstream sent too big header while reading response header from upstream`) because the backend serialized the entire document's OCR recognized text and detailed page arrays into the `X-Docera-Report` HTTP header (12,719 bytes), exceeding Nginx's default 8KB buffer.
   - **Resolution:** Enlarged Nginx proxy buffer capacity (`proxy_buffer_size 128k; proxy_buffers 4 256k;`), bounded the HTTP header preview in `_binary_response` to safe limits, and improved frontend diagnostic error decoding.
   - **Verification:** `Sun_Heng_CV (2) (2).pdf` processed successfully through Docker port 8080 with 93.83% OCR confidence, generating a verified 146,669-byte searchable PDF.

2. **Real Native PDF Text Editing (Directive Milestone):**
   - **Symptom:** Previous editor versions only supported text overlays and annotations; existing text embedded within the PDF could not be clicked, modified in place, or removed from the content stream.
   - **Implementation:** Implemented dual-strategy native text editing engine:
     - **Strategy A (pikepdf Operator Stream Rewriter):** Operates on standard PDF fonts with lossless content stream token replacement.
     - **Strategy B (PyMuPDF Transparent Redaction & Text Reconstruction):** Safely handles embedded subset Type0 fonts (`AAAAAA+TimesNewRomanPSMT`, `Identity-H` CIDs) and Unicode scripts (Khmer / Latin) by executing text glyph purging (`add_redact_annot(rect, fill=False)`) followed by clean vector font text insertion at identical coordinates.
     - **Canvas UI Integration:** Added dedicated "Edit Existing PDF Text (E)" mode, interactive span bounding boxes, inline double-click editing, Right Rail inspector with real-time text/font/size/color controls, and undo/redo stacks.
   - **Verification:** Independent parser (`pdfplumber`) verified that original text strings are genuinely purged from the exported document stream rather than concealed beneath white overlays.

---

## 2. Root Cause Analysis: OCR Gateway Failure

### 2.1 Failure Trace
When executing OCR on multi-page documents like `Sun_Heng_CV (2) (2).pdf`:
```
Client Browser -> Nginx (port 8080) -> FastAPI (uvicorn port 8000)
FastAPI completes Tesseract OCR -> constructs HTTP Response:
  - Binary Body: Searchable PDF
  - Header "X-Docera-Report": JSON-encoded report with 'pages' array + 'text'
```

In the container logs:
```
docera-web | 2026/11/13 08:44:45 [error] 22#22: *78 upstream sent too big header while reading response header from upstream, client: 192.168.112.1, server: localhost, request: "POST /api/v1/tools/ocr/process HTTP/1.1", upstream: "http://192.168.112.2:8000/api/v1/tools/ocr/process"
docera-web | 192.168.112.1 - - [13/Nov/2026:08:44:45 +0000] "POST /api/v1/tools/ocr/process HTTP/1.1" 502 559
```

Because Nginx returned a standard 502 HTML error page, `toolsApi.ts` received non-JSON data and fell back to the generic message:
`Docera could not complete this operation.`

### 2.2 Fix Implementation
1. **Nginx Configuration (`frontend/nginx.conf`):**
   ```nginx
   location /api/ {
       proxy_pass http://api:8000/api/;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection 'upgrade';
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_buffer_size 128k;
       proxy_buffers 4 256k;
       proxy_busy_buffers_size 256k;
       proxy_read_timeout 300s;
       proxy_connect_timeout 300s;
       proxy_send_timeout 300s;
       client_max_body_size 100M;
   }
   ```
2. **Backend Header Capping (`backend/app/api/tools_routes.py`):**
   In `_binary_response`:
   - Stripped redundant `pages` array from the HTTP header.
   - Capped text preview length at 4,000 characters to keep headers under 4.5 KB.
3. **Frontend Diagnostic Resilience (`frontend/src/services/toolsApi.ts`):**
   - Handled standard FastAPI `detail` errors.
   - Provided informative error messages for HTTP 502 (Bad Gateway) and HTTP 504 (Gateway Timeout).

---

## 3. Real Native PDF Existing-Text Editing

### 3.1 Architectural Pipeline
```
PDF Document
     │
     ├── 1. POST /api/v1/tools/native/text-spans
     │      PyMuPDF `page.get_text("dict")` extracts structured spans:
     │      [id, bbox (x0, y0, x1, y1), origin, text, font, font_size, color, flags, is_subset]
     │
     ├── 2. React Canvas Interaction Layer
     │      Renders transparent span hitboxes precisely aligned with PDF points.
     │      Hover highlight, selection border, double-click inline input, inspector controls.
     │      Maintains nativeEdits state: { [spanId]: { original_text, new_text, font_name, font_size, color } }
     │
     └── 3. Export Pipeline: POST /api/v1/tools/native/apply-edits
            For each edited span:
              - page.add_redact_annot(rect, fill=False)
              - page.apply_redactions(images=PDF_REDACT_IMAGE_NONE)  <-- Purges glyphs from content stream!
              - page.insert_text(origin, new_text, fontname=..., fontsize=..., color=...)
            Overlays & annotations applied on top of the genuinely edited PDF base.
```

### 3.2 Font Handling & Subset Protection
Real-world PDFs like `Sun_Heng_CV (2) (2).pdf` embed subset Type0 fonts with custom CID-to-GID maps (`Identity-H`). Attempting to inject new characters into these subset fonts directly corrupts the document because unmapped glyphs render as missing boxes or garbled symbols.

Docera resolves this:
1. Recognizes font flags and subset prefixes (`AAAAAA+`).
2. Transparently maps fonts to clean standard PostScript / TrueType fonts (`helv`, `times-bold`, `courier`).
3. For Khmer script characters (`\u1780-\u17FF`), dynamically loads TrueType Khmer fonts (`fonts-khmeros` / `KhmerOS.ttf` in Docker, `daunpenh.ttf` / `KhmerUI.ttf` on Windows).

---

## 4. Verification & Test Evidence

### 4.1 Backend Pytest Suite
Command: `pytest backend/`
```
======================= 20 passed, 1 warning in 48.12s ========================
```
- `backend/tests/test_api_m1.py`: 7 passed
- `backend/tests/test_tools_m3_m10.py`: 13 passed (including `test_native_text_spans_and_true_editing`)

### 4.2 Frontend Vitest Unit Suite
Command: `npm --prefix frontend test`
```
 Test Files  5 passed (5)
      Tests  14 passed (14)
   Duration  48.25s
```

### 4.3 Docker Live Production Integration Suite
Command: `python backend/tests/test_docker_live.py` (via port 8080 proxy)
```
[1/10] Initializing HTTP Client with CookieJar...
[2/10] Establishing session via Nginx proxy... Session active.
[3/10] Uploading sample PDF via multipart/form-data...
[4/10] Verifying session file listing...
[5/10] Testing Server-side Lossless Compression...
[6/10] Testing AES-256 Encryption...
[7/10] Testing Authorized Password Unlocking...
[8/10] Testing Irreversible Redaction in Docker... Verified: 'TOP-SECRET-998811' purged.
[9/10] Testing Cryptographic Digital Signature & Verification in Docker... Verified intact.
[10/10] Testing Clean Document Deletion... Document cleanly deleted (HTTP 204).

SUCCESS: All 10 Docker live environment verification steps passed flawlessly!
```

### 4.4 Playwright E2E End-to-End Test Suite
Command: `npm --prefix frontend run test:e2e`
```
Running 21 tests using 1 worker

  ok  1 Upload, view, zoom, rotate, search and document info (5.9s)
  ok  2 Organize PDF: merge, split by range, and page reorder/rotate (2.1s)
  ok  3 3-Pane Editor: insert text, shapes, notes, and verify export (5.9s)
  ok  4 Customization: apply watermark and page numbers (1.5s)
  ok  5 Optimization & Multi-format conversion (2.9s)
  ok  6 Security: protect, unlock, metadata clean, and verified redaction (2.2s)
  ok  7 Forms & Signatures: create/fill fields and cryptographic digital signature (1.8s)
  ok  8 Batch processing workflow and ZIP audit report (1.6s)
  ok  9 Document management: search filter, sort, inline rename, and clean delete (5.2s)
  ok 10 Error handling: invalid files, oversized notice, and navigation fallback (3.5s)
  ok 11 UI/UX & Interaction: theme switching, category filtering, and editor keyboard shortcuts (6.1s)
  ok 12 Responsive viewports & WCAG accessibility audit across mobile, tablet, and desktop (3.9s)
  ok 13 Upload PDF -> Open Editor directly from Dashboard (4.8s)
  ok 14 Upload PDF -> Open Viewer -> Navigate to Editor (4.4s)
  ok 15 Direct URL navigation, page reload, and back-and-forth viewer navigation (6.0s)
  ok 16 Multi-page (5 pages) and scanned image PDF documents (7.5s)
  ok 17 Non-existent or expired document displays clear error with retry option (1.9s)
  ok 18 Password-protected document produces clear actionable error (4.9s)
  ok 19 Edit document, export, and verify binary PDF output (4.4s)
  ok 20 Native PDF existing text editing and content-stream replacement (5.2s)
  ok 21 OCR & Scan Detection runs and produces searchable PDF without gateway buffer error (3.6s)

  21 passed (1.5m)
```

---

## 5. Artifacts and Code References

- [tools_routes.py](file:///C:/Users/Chanreach/Documents/Docera/backend/app/api/tools_routes.py#L96-L115): Bounded `_binary_response` header serialization and native editing endpoints.
- [native_edit.py](file:///C:/Users/Chanreach/Documents/Docera/backend/app/services/pdf/native_edit.py#L1-L260): PyMuPDF text span extraction and content-stream replacement.
- [nginx.conf](file:///C:/Users/Chanreach/Documents/Docera/frontend/nginx.conf#L21-L38): High-capacity proxy buffers (128k) and timeouts.
- [toolsApi.ts](file:///C:/Users/Chanreach/Documents/Docera/frontend/src/services/toolsApi.ts#L26-L45): Hardened API error translation with HTTP 502/504 detection.
- [PdfEditor.tsx](file:///C:/Users/Chanreach/Documents/Docera/frontend/src/features/editor/PdfEditor.tsx#L430-L465): In-editor existing-text interaction overlay, span selection, and inspector integration.
- [editor-regression.e2e.ts](file:///C:/Users/Chanreach/Documents/Docera/frontend/e2e/editor-regression.e2e.ts#L187-L245): Playwright regression tests for native editing and OCR.
