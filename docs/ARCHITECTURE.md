# Docera — Architectural Design Record (ADR) & System Architecture

## 1. System Overview

**Docera** is a production-grade, privacy-first PDF and document productivity platform. It delivers browser-based PDF editing, multi-document organization, standards-compliant annotations, high-efficiency compression, multi-format conversion, OCR capabilities, interactive forms & signatures, AES-256 security & verified redaction, and batch processing.

Docera is engineered under a **strict hybrid processing model**:
- **Browser-Local Tier:** High-interactivity, high-frequency tasks execute entirely on the client using WebAssembly/JavaScript engines (`pdf-lib`, `PDF.js`, `JSZip`). Documents modified locally never leave the user's browser memory unless explicitly saved to workspace session storage.
- **Backend Service Tier:** Operations requiring deterministic low-level stream restructuring, cryptographic signatures, font embedding, image downsampling, or cross-format translation execute via Python micro-services backed by audited libraries (`pikepdf`, `PyMuPDF`/`pypdfium2`, `pdfplumber`, `reportlab`, `pyhanko`, `Pillow`, `python-docx`, `openpyxl`, `python-pptx`, `cryptography`).

---

## 2. Architecture Diagram

```
                     +-------------------------------------------------+
                     |                 Browser Client                  |
                     |  React 19 + TypeScript + Vite + PDF.js + pdf-lib|
                     +-----------------------+-------------------------+
                                             |
                  Local Operations           | REST / multipart/form-data
             (Merge/Split/Organize/Edit)     | (Compression/Conversion/Security)
                                             v
                     +-------------------------------------------------+
                     |              Docera API (FastAPI)               |
                     |  - BoundaryMiddleware (Upload & size limiter)   |
                     |  - SessionMiddleware (Isolated cookies)         |
                     |  - RateLimiter / Concurrency bounds             |
                     +-----------------------+-------------------------+
                                             |
         +-----------------------------------+-----------------------------------+
         |                                   |                                   |
         v                                   v                                   v
+------------------+               +-------------------+               +-------------------+
|  Core Services   |               |   PDF Toolsets    |               |  Security Engine  |
| - FileStorage    |               | - pikepdf (Stream)|               | - AES-256 R=6     |
| - SQLite Repos   |               | - pypdfium2/Pillow|               | - pyhanko PAdES   |
| - Session Quotas |               | - python-docx/etc |               | - pdfplumber Redac|
+------------------+               +-------------------+               +-------------------+
```

---

## 3. Tiered Processing Breakdown

| Feature Domain | Execution Mode | Engine / Library | Privacy Guarantee |
|---|---|---|---|
| **PDF Viewing** | Local Client | PDF.js v6.5, HTML5 Canvas | Zero server contact after initial stream fetch |
| **PDF Reorder, Rotate, Split, Merge** | Local Client | `pdf-lib` v1.17, `JSZip` v3.10 | Operates in-memory on client; instant download |
| **PDF Editor & Annotations** | Local Client + Optional Save | `pdf-lib` (Native `/Annots`, `/Text`, `/Highlight`, `/Stamp`) | Vector-accurate output without flattening page graphics |
| **Native Stream Text/Image Edit** | Server API | `pikepdf` tokenized content streams (`Tj`/`TJ`/`Do`) | Surgical stream replacement without opaque overlay hacks |
| **Compression & Optimization** | Server API | `pikepdf` + `Pillow` (SHA-256 dedupe, JPEG resample) | Honest size calculation; never inflates pre-optimized files |
| **Office & HTML Conversion** | Server API | `pypdfium2`, `pdfplumber`, `python-docx`, `openpyxl`, `python-pptx`, `reportlab` | Native Python fallbacks when LibreOffice is uninstalled |
| **OCR Text Recognition** | Server API | Pluggable `OCREngine` (Tesseract + Khmer OCR adapter seam) | Invisible text layer injected via ReportLab PDF overlay |
| **Forms & Signatures** | Client + Server | `pdf-lib` (visual) + `pikepdf` (AcroForm) + `pyhanko` (PAdES) | Cryptographic SHA-256 CMS signatures with validation |
| **AES-256 Encryption & Redaction** | Server API | `pikepdf` (AES-256 `R=6`) + `pypdfium2` / `pdfplumber` | Verified redaction with 0 remaining characters confirmation |
| **Batch Processing** | Server API | Multi-document worker returning unified ZIP + `batch_report.json` | Atomic batch execution with structured per-file status |

---

## 4. Frontend Architecture

### 4.1 State Management & Routing
- **Routing:** `react-router-dom` v7 with lazy chunk-splitting (`React.lazy` + `Suspense`) for each workspace.
- **Server Cache:** `@tanstack/react-query` v5 for session metadata, file listing, and optimistic deletions/renames.
- **Workspace State:** Lightweight scoped React state hooks and immutable action reducers (`undoHistory`, `redoHistory`).

### 4.2 Interactive Canvas Model
- **Viewer:** Canvas rendering scaled to device pixel ratio with full text layer overlay for native browser selection and search highlighting.
- **Editor:** Multi-layer architecture:
  1. Background PDF rendered canvas.
  2. Interactive vector overlay tracking pointer events, coordinates, selections, and bounding box resize handles.
  3. Direct export serialization into PDF standard objects.

---

## 5. Security & Boundary Architecture

1. **Storage Sandboxing:** Files are stored under UUID filenames in session-isolated directories (`.docera-data/sessions/{session_id}/files/`). Path traversal (`..`) is strictly blocked by path resolution checks.
2. **Resource Boundaries:**
   - Maximum upload: 25 MB (configurable via `DOCERA_MAX_UPLOAD_BYTES`).
   - Session storage quota: 250 MB (`DOCERA_SESSION_QUOTA_BYTES`).
   - Concurrency limit: Maximum 4 concurrent active multipart uploads via `BoundaryMiddleware`.
   - Automatic expiry: Files are deleted after 24 hours (`DOCERA_RETENTION_SECONDS`).
3. **SSRF & Script Sanitization:** HTML-to-PDF conversion strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, and external network references (`http://`, `https://`, `ftp://`).
4. **Verified Redaction:** Redaction removes underlying text tokens and rasterizes affected page regions at 200 DPI. Before returning the document, `pdfplumber` scans the target bounding boxes to cryptographically verify 0 remaining text characters.
