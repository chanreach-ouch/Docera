# Docera — Complete Professional PDF Platform

Docera is a privacy-first, full-stack web PDF editor and document productivity platform built with **React 19 + TypeScript + Vite**, **PDF.js + pdf-lib**, and **Python FastAPI + pikepdf + pypdfium2 + pdfplumber + pyhanko**.

Designed around a hybrid execution architecture, Docera executes everyday document organization, viewing, editing overlays, and standards-compliant annotations **locally inside your browser**, while delegating compute-intensive optimization, format conversion, cryptographic signing, OCR, and verified irreversible redaction to a **session-isolated backend**.

---

## Core Capabilities

### 1. PDF Viewer (`/documents/:id`)
- Crisp multi-page HTML5 canvas rendering via PDF.js v6 with native text selection
- Full-text search across pages with jump-to-match highlights
- Thumbnail navigation, custom zoom / Fit Width / Fit Page, view rotation, fullscreen, print stylesheet, and document metadata inspection

### 2. Advanced 3-Pane PDF Editor & Annotations (`/documents/:id/edit`)
- **Insert & Style:** Custom text boxes (font family, size, color, alignment, line spacing), PNG/JPEG images, vector shapes (rectangles, circles, lines, arrows), and smooth freehand ink paths
- **PDF Standard Annotations:** Generates genuine PDF `/Annots` dictionaries (`/Highlight`, `/Underline`, `/StrikeOut`, `/Text` sticky notes, `/Stamp`) rather than flattening page vectors
- **Object Management:** Selection, drag positioning, resize handles, multi-select alignment tools, duplication, and full undo/redo history
- **Native Stream Editing:** Server-side `pikepdf` stream inspection, direct `Tj`/`TJ` text replacement, subset font safeguarding, and embedded image XObject deletion with transparent limitation reporting

### 3. Organize PDF (`/tools/organize` — 100% Browser-Local)
- Merge multiple PDFs in custom order
- Split PDFs by page ranges, every *N* pages, or single-page extraction packaged into ZIP
- Visual page grid supporting drag/button reordering, clockwise/counter-clockwise rotation, duplication, blank page insertion, reverse order, and page deletion

### 4. Customize PDF (`/tools/customize` — Browser-Local)
- Diagonal text and image watermarks with opacity, color, and font sizing
- Automatic page numbering and custom header/footer stamps
- Page margin cropping with exact point measurements

### 5. Compress & Optimize (`/tools/compress`)
- Three presets: **Lossless structural** (object stream compaction + SHA-256 image deduplication), **Balanced (150 DPI)**, and **Compact (96 DPI)**
- Optional DocInfo & XMP metadata stripping with honest byte-savings reporting

### 6. Multi-Format Conversion (`/tools/convert`)
- **PDF → Images:** Render selected or all pages to PNG/JPEG (96–300 DPI)
- **Images → PDF:** Package PNG/JPEG/WebP batches into A4, US Letter, or auto-fitted PDFs
- **PDF → Documents:** Export to Word (`.docx` text or visual page images), Excel (`.xlsx` table extraction), PowerPoint (`.pptx`), Plain Text (`.txt`), and HTML (`.html`)
- **Office / HTML → PDF:** Convert `.docx`/`.xlsx`/`.pptx` (via LibreOffice if present or pure-Python structural engines) and SSRF/script-sanitized HTML to clean PDFs

### 7. OCR & Scanned Document Detection (`/tools/ocr`)
- Automated scanned-page detection via text density heuristics (`pdfplumber`)
- Pluggable OCR architecture (`TesseractOCREngine` + `KhmerOCRAdapter` seam) injecting invisible searchable text layers (`render_mode=3`)

### 8. Forms & Digital Signatures (`/tools/forms-sign`)
- Inspect, create, fill, and flatten interactive AcroForm fields (`/Tx`, `/Btn`, `/Ch`)
- Visual signature modal supporting freehand drawing, typed calligraphy preview, or image upload
- Cryptographic PAdES digital signatures & verification via `pyhanko` + PKCS#12, with tamper-detection

### 9. Security & Verified Redaction (`/tools/security`)
- **AES-256 Encryption (`R=6`):** Separate user open password, owner permissions password, and granular print/copy/annotate/modify flags
- **Unlock & Clean:** Authorized decryption plus DocInfo, XMP metadata, JavaScript, and embedded active-content sanitization
- **Irreversible Redaction:** Permanently strips tokens, purges `/StructTreeRoot`, and rasterizes affected page regions at 200 DPI, followed by automated `pdfplumber` verification confirming **0 remaining text characters** inside every redacted region

### 10. Batch Workflows & Document Management (`/tools/batch`, `/`)
- Multi-file server batch execution (Compress, Rotate, Header/Footer, PDF→Images) returning a unified ZIP archive with a structured `batch_report.json`
- Session workspace search, sorting (recent, filename, size), inline document renaming, and automatic 24-hour file expiry

---

## Quality Assurance & Automated Testing

Docera maintains a comprehensive, multi-tiered automated testing suite:
- **Pytest (Backend):** 15 / 15 tests passing across API endpoints, session isolation, stream modification, and cryptographic operations.
- **Vitest (Frontend):** 14 / 14 tests passing across component integration, workspace rendering, and browser-local export engines.
- **Playwright E2E:** 10 / 10 end-to-end browser scenarios passing in headless Chromium, verifying real user flows, file downloads, and byte-level document headers.
- **Security Scans:** 0 known vulnerabilities via `pip-audit` and `npm audit`.

---

## Quick Start

### Local Development
1. **Backend:**
   ```bash
   cd backend
   uv sync
   .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Open `http://localhost:5173`.

### Docker Compose
```bash
cp .env.example .env
docker compose up -d --build
```
Open `http://localhost:8080`.

---

## Architecture & Documentation
- [Production Readiness Report](docs/PRODUCTION_READINESS_REPORT.md)
- [System Architecture](docs/ARCHITECTURE.md)
- [Feature Matrix & Verification](docs/FEATURE_MATRIX.md)
- [Security & Threat Model](docs/SECURITY.md)
- [Deployment & Operations](docs/DEPLOYMENT.md)
- [Known Limitations](docs/KNOWN_LIMITATIONS.md)
- [Milestone Progress Log](docs/PROGRESS.md)
- [Original Repository Audit](docs/REPOSITORY_AUDIT.md)
