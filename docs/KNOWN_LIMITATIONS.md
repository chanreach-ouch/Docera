# Docera — Known Limitations & Honest Capability Disclosures

Docera prioritizes engineering honesty over marketing promises. Rather than faking features or hiding layout trade-offs, all platform boundaries and external runtime dependencies are documented here and surfaced directly inside the UI.

## 1. Native Existing PDF Text Editing
PDF files are fixed-layout vector instruction streams, not word-processing documents.
- **How Docera handles it:** Docera provides a surgical native stream editor (`/api/v1/tools/native-edit/*`) powered by `pikepdf` content stream tokenization (`Tj`/`TJ` text replacement and `Do` image XObject deletion), alongside a rich local overlay editor (`pdf-lib`).
- **Known limitation:** Replacing existing native text relies on the PDF's embedded font subset encoding. When replacement characters are absent from a subset font, when strings are split across kerning offsets, or when text is outlined as vector paths/images, exact-font in-place stream replacement may fail or require falling back to standard font overlays. Docera inspects streams upfront and reports supported vs. unsupported blocks clearly instead of placing opaque rectangles while claiming native deletion.

## 2. Office ↔ PDF Conversions
- **LibreOffice (`soffice`) Optionality:** When LibreOffice is installed on the host, Docera can route `.docx`/`.xlsx`/`.pptx` through LibreOffice for full native visual layout conversion. In environments without LibreOffice (such as lightweight Windows/local dev setups), Docera uses deterministic pure-Python fallbacks (`python-docx`, `openpyxl`, `python-pptx`, `reportlab`, `pdfplumber`).
- **PDF → Word / Excel / PowerPoint:**
  - `PDF → Word`: Supports both simplified editable paragraph/table extraction (`default`) and fixed-visual page-image wrapping (`page_images`). Complex multi-column magazine layouts or overlapping vector diagrams cannot map 1:1 to flowing `.docx` XML.
  - `PDF → Excel`: Uses `pdfplumber` table boundary detection; unstructured prose outside detected tables is omitted or placed on fallback text rows.
  - `PDF → PowerPoint`: Defaults to high-fidelity rendered slide images (`default`) or simplified editable text frames (`editable_text`).

## 3. OCR Availability & Language Engines
- **Tesseract Runtime Requirement:** Server-side OCR uses a pluggable `OCREngine` interface (`TesseractOCREngine` + `KhmerOCRAdapter` seam). If the `tesseract` binary is absent on the host PATH, scanned page detection (`pdfplumber`) still functions cleanly, and `/ocr/capabilities` reports `"available": false` alongside setup guidance rather than crashing or hanging.
- **Docker Container:** The provided `backend/Dockerfile` pre-installs `tesseract-ocr`, `tesseract-ocr-eng`, and `tesseract-ocr-khm` so full OCR works out of the box inside Docker.
- **Handwriting / Skewed Scans:** OCR accuracy depends on scan contrast, DPI (≥ 200 DPI recommended), and Tesseract language models.

## 4. Compression Expectations
- **Already-Optimized PDFs:** Compressing a PDF that already uses compressed streams and JPEG-encoded low-DPI images may produce negligible savings or even slight header overhead. Docera always compares original vs. output byte counts and displays honest telemetry (`was_reduced: false` when no reduction occurred).

## 5. HTML → PDF Security Restrictions
- To prevent SSRF, local file read, and arbitrary code execution, HTML-to-PDF strictly strips `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, event handlers, and external HTTP/HTTPS asset URLs (`<img>` remote links are excluded). It renders structured safe HTML tags via `reportlab`.

## 6. Forms & Cryptographic Signatures
- **Non-Interactive Flat Forms:** Interactive form filling supports genuine AcroForm widgets (`/Tx`, `/Btn`, `/Ch`). Flat paper scans without AcroForm dictionaries must be annotated visually via the Editor or Sign tab.
- **Self-Signed vs. CA-Trusted Certificates:** PAdES cryptographic signing (`pyhanko`) supports user-supplied PKCS#12 certificates or demo self-signed keys for workflow verification. Self-signed signatures establish tamper-evidence within Docera/verification tools, whereas legal trust in Adobe Acrobat requires a certificate chained to an approved root CA (AATL/EUTL).
