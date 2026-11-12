# Docera — Implementation Progress Log (M0–M12)

| Milestone | Scope | Status | Verification Summary |
|---|---|---|---|
| **M0** | Repository Audit & Planning | **DONE** | Audited baseline repo, created `docs/REPOSITORY_AUDIT.md`, identified broken imports, missing assets/deps, and roadmap. |
| **M1** | Core Stability, Viewer & Session Security | **DONE** | Fixed repository naming bug, indirect PDF `/Rotate`/`/UserUnit` resolution, middleware upload bounds, TypeScript/Vite build, Viewer info/print/fullscreen/search. |
| **M2** | Local Organize Workflows | **DONE** | Built browser-local Merge, Split (ranges, every N, extract), Rotate, Reorder, Duplicate, Blank page insertion, Reverse order, ZIP export (`pdf-lib` + `JSZip`). |
| **M3** | Advanced 3-Pane Editor & Annotations | **DONE** | Built 3-pane workspace with undo/redo, alignment, text/images/shapes/freehand ink, standards-compliant `/Annots` (`/Highlight`, `/Text`, `/Stamp`), and server-backed native stream text/image editing (`pikepdf`). |
| **M4** | Document Customization | **DONE** | Implemented Watermarks (text/image, diagonal opacity), Headers/Footers & Page Numbering, and Page Crop/Margin adjustments. |
| **M5** | Compression & Multi-Format Conversion | **DONE** | Built `compression.py` (lossless SHA-256 image deduplication + balanced/compact JPEG resampling) and `conversion.py` (PDF↔Images/Text/HTML/DOCX/XLSX/PPTX + SSRF-safe HTML→PDF). |
| **M6** | OCR & Scanned Document Detection | **DONE** | Implemented `ocr.py` with pluggable `OCREngine`, `TesseractOCREngine`, `KhmerOCRAdapter` seam, scanned-page detection, and invisible text layer injection (`render_mode=3`). |
| **M7** | Interactive Forms & Digital Signatures | **DONE** | Implemented AcroForm inspection, field creation, filling, widget flattening (`pikepdf`), canvas signature pad (draw/type/upload), and cryptographic PAdES signing/verification (`pyhanko`). |
| **M8** | Security & Verified Irreversible Redaction| **DONE** | Implemented AES-256 (`R=6`) password encryption, unlock, DocInfo/XMP/active-content sanitization, and destructive rasterized redaction verified by `pdfplumber` (0 remaining chars). |
| **M9** | Batch Processing & Workspace Management | **DONE** | Implemented multi-file batch operations (`/batch` returning ZIP + `batch_report.json`) and Recent Documents search, sort, and inline rename (`PATCH /files/{id}`). |
| **M10** | Full UI Routing & Deep Linking | **DONE** | Wired all 10 workspaces into React Router lazy routes, updated Dashboard quick-actions and tool directory (`Ready` badges + deep query params), responsive + dark-mode CSS tokens. |
| **M11** | Automated Testing & Security Audits | **DONE** | Backend Pytest suite, Frontend Vitest unit/component integration suites, live headless Chrome Playwright E2E suite, `pip-audit` (0 CVEs), and `npm audit` (0 CVEs). |
| **M12** | Containerization, CI/CD & Documentation | **DONE** | Created `backend/Dockerfile`, `frontend/Dockerfile`, `nginx.conf`, `docker-compose.yml` (validated via `docker compose config`), `.github/workflows/ci.yml`, and complete docs suite. |
