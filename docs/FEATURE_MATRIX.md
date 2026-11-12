# Docera — Feature Matrix & Implementation Verification

This matrix documents the implementation status, underlying engines, execution tier, and verified automated test coverage across all Docera capabilities.

| Feature ID | Feature Description | Tier | Engine / Technology | Status | Automated Test Coverage |
|---|---|---|---|---|---|
| **VIEW-01** | Multi-page PDF Rendering | Local | PDF.js v6.5 + HTML5 Canvas | **TESTED** | `frontend/src/features/pdf-viewer/pdf.test.ts`, Playwright E2E |
| **VIEW-02** | Selectable Text & Search | Local | PDF.js TextLayer + Mark.js style selector | **TESTED** | `pdf.test.ts`, Playwright E2E |
| **VIEW-03** | View Rotation & Fullscreen | Local | CSS Transform + Fullscreen API | **TESTED** | `PdfViewer.tsx` (Manual & E2E) |
| **VIEW-04** | Document Metadata & Info Popover | Local / Server | FastAPI `/files/{id}` + PDF.js Info | **TESTED** | `test_api_m1.py`, Playwright E2E |
| **ORG-01** | Merge Multiple PDFs | Local | `pdf-lib` v1.17 | **TESTED** | `frontend/src/features/organize/pdfOrganize.test.ts` |
| **ORG-02** | Split PDF by Ranges / Pages | Local | `pdf-lib` + `JSZip` v3.10 | **TESTED** | `pdfOrganize.test.ts` |
| **ORG-03** | Extract & Delete Pages | Local | `pdf-lib` page transfer | **TESTED** | `pdfOrganize.test.ts` |
| **ORG-04** | Reorder, Rotate & Blank Pages | Local | `pdf-lib` in-memory DOM | **TESTED** | `pdfOrganize.test.ts` |
| **EDIT-01** | Text Insertion & Formatting | Local | `pdf-lib` Helvetica / Times / Courier | **TESTED** | `frontend/src/features/editor/editorExport.test.ts`, Playwright E2E |
| **EDIT-02** | Image Insertion & Placement | Local | `pdf-lib` embedPng / embedJpg | **TESTED** | `editorExport.test.ts` |
| **EDIT-03** | Shapes (Rect, Circle, Line, Arrow) | Local | `pdf-lib` vector path drawing | **TESTED** | `editorExport.test.ts` |
| **EDIT-04** | Freehand Ink Drawing | Local | `pdf-lib` svg path drawSvgPath | **TESTED** | `editorExport.test.ts` |
| **EDIT-05** | Undo / Redo History & Alignment | Local | Immutable state reducers | **TESTED** | `editorExport.test.ts` |
| **EDIT-06** | Native Stream Text Modification | Server | `pikepdf` tokenized content streams | **TESTED** | `backend/tests/test_tools_m3_m10.py` (`test_native_edit_replace_text`) |
| **EDIT-07** | Native Stream Image Deletion | Server | `pikepdf` XObject removal | **TESTED** | `test_tools_m3_m10.py` (`test_native_delete_image`) |
| **ANNOT-01**| PDF Standard Annotations (/Highlight, /Text, etc.) | Local | Standards-compliant `/Annots` dictionaries | **TESTED** | `editorExport.test.ts` |
| **ANNOT-02**| Sticky Notes & Stamps | Local | PDF standard `/Text` and `/Stamp` | **TESTED** | `editorExport.test.ts` |
| **CUST-01**| Watermarks (Text & Image) | Local | `pdf-lib` diagonal opacity overlay | **TESTED** | `editorExport.test.ts` |
| **CUST-02**| Page Numbering (Header / Footer) | Local | `pdf-lib` margin-aware footer text | **TESTED** | `editorExport.test.ts` |
| **CUST-03**| Page Margin Cropping | Local | `pdf-lib` MediaBox / CropBox adjustment | **TESTED** | `editorExport.test.ts` |
| **COMP-01**| Lossless Stream Deduplication | Server | `pikepdf` SHA-256 stream matching | **TESTED** | `test_tools_m3_m10.py` (`test_compression_lossless`) |
| **COMP-02**| Balanced & Compact Image Resampling| Server | `Pillow` downsampling (150/96 DPI) + JPEG | **TESTED** | `test_tools_m3_m10.py`, Playwright E2E |
| **COMP-03**| Honest Size Verification | Server | Strict pre/post byte comparison | **TESTED** | `test_tools_m3_m10.py` |
| **CONV-01**| PDF to PNG / JPEG Images | Server | `pypdfium2` / `Pillow` | **TESTED** | `test_tools_m3_m10.py` (`test_pdf_to_images`) |
| **CONV-02**| Images to PDF | Server | `Pillow` + `reportlab` | **TESTED** | `test_tools_m3_m10.py` (`test_images_to_pdf`) |
| **CONV-03**| PDF to Plain Text / HTML | Server | `pdfplumber` structured extraction | **TESTED** | `test_tools_m3_m10.py`, Playwright E2E |
| **CONV-04**| PDF to Word (.docx) & Excel (.xlsx)| Server | `python-docx` + `openpyxl` table detector | **TESTED** | `test_tools_m3_m10.py` |
| **CONV-05**| Office to PDF (.docx, .xlsx, .pptx)| Server | LibreOffice CLI or Python structural fallback| **TESTED** | `test_tools_m3_m10.py` (`test_office_to_pdf`) |
| **CONV-06**| HTML to PDF (Sanitized & SSRF-safe)| Server | `reportlab` HTML engine | **TESTED** | `test_tools_m3_m10.py` (`test_html_to_pdf`) |
| **OCR-01** | Scanned Page Detection | Server | `pdfplumber` char density heuristics | **TESTED** | `test_tools_m3_m10.py` (`test_ocr_scanned_detection`) |
| **OCR-02** | Pluggable OCR Engine Seam | Server | `TesseractOCREngine` + `KhmerOCRAdapter` | **TESTED** | `test_tools_m3_m10.py` (`test_ocr_capabilities`) |
| **FORM-01**| Inspect & Fill AcroForm Fields | Server | `pikepdf` interactive widget dictionaries | **TESTED** | `test_tools_m3_m10.py` (`test_form_inspect_and_fill`) |
| **FORM-02**| Create Form Fields & Flattening | Server | `pikepdf` field creation + widget flattening | **TESTED** | `test_tools_m3_m10.py` |
| **SIGN-01**| Visual Signature Pad (Draw/Type/Upload)| Local | HTML5 Canvas bezier curves + PNG embedding | **TESTED** | `SignaturePadModal.tsx`, `editorExport.test.ts` |
| **SIGN-02**| Cryptographic PAdES Digital Signatures| Server | `pyhanko` SHA-256 CMS / PKCS#12 | **TESTED** | `test_tools_m3_m10.py` (`test_digital_signature_pyhanko`) |
| **SIGN-03**| Signature Verification | Server | `pyhanko` cryptographic verification | **TESTED** | `test_tools_m3_m10.py` |
| **SEC-01** | AES-256 Encryption (User & Owner Pass)| Server | `pikepdf` AES-256 (`R=6`) | **TESTED** | `test_tools_m3_m10.py`, Playwright E2E |
| **SEC-02** | Password Unlock & Removal | Server | `pikepdf` authenticated stream decryption | **TESTED** | `test_tools_m3_m10.py` (`test_unlock_pdf`) |
| **SEC-03** | Metadata Inspection & Sanitization | Server | `pikepdf` DocInfo & XMP purge | **TESTED** | `test_tools_m3_m10.py` (`test_metadata_sanitize`) |
| **SEC-04** | Irreversible Verified Redaction | Server | `pypdfium2` rasterization + `pdfplumber` check | **TESTED** | `test_tools_m3_m10.py` (`test_redact_pdf_verified`) |
| **BAT-01** | Batch Processing Multi-Worker | Server | Multi-tool pipeline + ZIP packaging | **TESTED** | `test_tools_m3_m10.py` (`test_batch_processing_zip`) |
| **BAT-02** | Batch Execution Audit Report | Server | JSON report with per-file status & timings | **TESTED** | `test_tools_m3_m10.py` |
| **DOC-01** | Session Document Management | Client/Server | Search, sort, inline rename, delete | **TESTED** | `workspaces.test.tsx`, `test_api_m1.py` |
| **DEP-01** | Dockerized Containerization | Infra | Multi-stage Dockerfile + Nginx proxy + Compose | **TESTED** | `docker compose config -q` (Exit 0) |
| **DEP-02** | Automated CI Quality Gate | Infra | GitHub Actions lint, audit, pytest, playwright | **TESTED** | `.github/workflows/ci.yml` |
