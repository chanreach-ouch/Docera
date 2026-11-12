# Docera — Security & Privacy Architecture

## 1. Core Threat Model & Privacy Principles

Docera is engineered to protect user confidentiality and prevent accidental disclosure or unauthorized data retention.

1. **Ephemeral Local-First Storage:**
   - Client-side workflows (Merge, Split, Extract, Reorder, Rotate, Annotate, Watermark, Visual Sign) occur entirely inside the browser's JavaScript sandbox.
   - When files are uploaded to the backend service for processing (Compression, OCR, AES-256 encryption, Office conversion), they are stored strictly within the user's isolated session folder.
2. **Deterministic File Retention:**
   - Files are automatically removed after their retention period (default: 24 hours, configured via `DOCERA_RETENTION_SECONDS`).
   - Session directories are cleaned up automatically upon expiry or explicit file removal.
3. **Session Boundary Isolation:**
   - Session identifiers are generated using cryptographically strong tokens (`secrets.token_urlsafe(32)`).
   - Session cookies are scoped with `HttpOnly`, `SameSite=Lax`, and path isolation.
   - Cross-session access is strictly forbidden; repository lookups always filter by `owner_session_id`.

---

## 2. Input Validation & Hardening

1. **Path Traversal Defense:**
   - Document identifiers are UUID-v4 validated.
   - Relative path references (`../`) are rejected.
   - All disk paths are canonicalized using `.resolve()` and verified to reside inside the configured `data_dir`.
2. **Denial of Service (DoS) & Memory Exhaustion Defenses:**
   - `BoundaryMiddleware` enforces maximum file upload limits (`DOCERA_MAX_UPLOAD_BYTES`, default 25 MB).
   - Session total storage quotas are enforced (`DOCERA_SESSION_QUOTA_BYTES`, default 250 MB).
   - Concurrent active multipart uploads are throttled to a maximum of 4 concurrent streams to protect host memory.
3. **SSRF & Script Injection Defense (HTML-to-PDF):**
   - HTML inputs are parsed with `xml.etree.ElementTree` / `BeautifulSoup` and sanitized.
   - `<script>`, `<iframe>`, `<object>`, `<embed>`, `<link>`, and event handlers (`onload`, `onerror`) are completely stripped.
   - External network fetches (e.g., `http://`, `https://`, `file://`) are strictly blocked during rendering.
4. **Verified Irreversible Redaction:**
   - Standard PDF redaction software often creates black rectangles that merely obscure visible text while leaving underlying text stream characters intact and extractable.
   - Docera performs **destructive rasterized redaction**:
     1. Clears text tokens from the affected page region.
     2. Renders the page bitmap at 200 DPI, burns opaque redaction boxes into the image buffer, and replaces the page stream.
     3. Executes a post-redaction scan with `pdfplumber` confirming that exactly **0 characters** exist inside the redacted bounding coordinates.

---

## 3. Cryptographic Standards

1. **AES-256 Encryption:**
   - PDFs are encrypted using standard PDF 2.0 / Adobe Extension Level 3 AES-256 (`R=6`, `V=5`).
   - Granular permissions flags for printing, copying, modifying, and annotating are enforced at the encryption dictionary level.
2. **Digital Signatures (PAdES):**
   - Cryptographic signatures comply with PAdES standards using `pyhanko` and `cryptography`.
   - Supports SHA-256 hashing and PKCS#12 (`.p12` / `.pfx`) or PEM key certificates.
   - Provides cryptographic signature verification validating certificate validity and document hash integrity.

---

## 4. Audit & Quality Gate Verification

- **pip-audit:** Executed across all Python dependencies (`0 vulnerabilities found`).
- **npm audit:** Executed across all Node.js / Vite / React packages (`0 vulnerabilities found`).
- **Nginx Security Headers:** Configured with `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection: 1; mode=block`, and `Referrer-Policy: strict-origin-when-cross-origin`.
