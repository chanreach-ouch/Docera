# Docera Repository Audit

**Audit date:** 2026-11-12  
**Auditor:** Antigravity Lead Engineering  
**Workspace:** `C:\Users\Chanreach\Documents\Docera`  
**Git state:** Initialized repository on branch `master` with **0 commits**; all existing files are untracked (`??`). Running `git` requires `-c safe.directory=C:/Users/Chanreach/Documents/Docera` because `.git` ownership belongs to `DESKTOP-35FO1S6/CodexSandboxOffline`.

---

## 1. Executive Summary

The repository contains an **incomplete M0/M1 foundation** created prior to handover. Substantial architectural planning (`DESIGN.md`, `PRODUCT.md`, `docs/`) and well-structured initial code for a session-scoped PDF upload and viewer app exist, **but neither the backend nor the frontend currently builds, starts, or runs tests**:

1. **Backend crashes on import:** `backend/app/repositories/files.py` defines a method named `list` on line 31, shadowing Python's built-in `list` inside `class FileRepository`, which causes `def expired(self, now: float) -> list[str]:` on line 42 to raise `TypeError: 'function' object is not subscriptable`.
2. **Frontend fails to build and test:** `frontend/package.json` has zero `devDependencies` (`typescript`, `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/*`, `jsdom`, `@playwright/test` are missing), `frontend/src/styles/app.css` (imported by `src/main.tsx`) does not exist, `frontend/src/test/setup.ts` (referenced in `vite.config.ts`) does not exist, and `frontend/public/pdf-assets/` has not been generated via `frontend/scripts/copy-pdf-assets.mjs`.
3. **Zero automated tests exist:** `backend/tests/` does not exist (`pytest` collects 0 items), and no `src/**/*.test.{ts,tsx}` or Playwright specs exist.
4. **M2–M12 features are unimplemented:** All PDF organization, editing, annotation, compression, conversion, OCR, forms, signatures, security/redaction, batch processing, and deployment artifacts are only listed as "Planned" in `frontend/src/features/dashboard/tools.ts` and `docs/FEATURE_MATRIX.md`.

---

## 2. Current Architecture & Stack

### Preserved Technology Choices (Suitable to Retain)
- **Frontend:** React `19.3.1`, TypeScript (strict mode in `frontend/tsconfig.json`), Vite, `@tanstack/react-query` `5.107.1`, `react-router-dom` `7.18.5`, `pdfjs-dist` `6.5.438`, `lucide-react` `1.72.0`, `@fontsource-variable/dm-sans` `5.3.0`.
- **Backend:** Python `3.12.10` (isolated in `backend/.venv`), FastAPI `>=0.140,<0.141`, Uvicorn `>=0.41,<1`, Pydantic Settings `>=2.10,<3`, `python-multipart`, `pypdf` `7.0.1`, SQLite (stdlib), local blob storage.
- **Design System:** Documented in `DESIGN.md` — pine navigation rail (`#163f3b`), warm pale workspace (`#f6f7f3`), white document surfaces, forest actions (`#23665a`), DM Sans Variable self-hosted typography.

### Existing Code Layout
- `backend/app/main.py` — `create_app()`, lifespan janitor task, global error handlers (`AppError`, `RequestValidationError`, `HTTPException`, `Exception`), `BoundaryMiddleware`, `TrustedHostMiddleware`.
- `backend/app/api/routes.py` — `/api/v1/health`, `/api/v1/session`, `/api/v1/files/upload`, `/api/v1/files`, `/api/v1/files/{file_id}`, `/api/v1/files/{file_id}/download`, `/api/v1/files/{file_id}` (`DELETE`).
- `backend/app/core/` — `config.py` (`Settings` with `DOCERA_` prefix), `errors.py` (`AppError`), `middleware.py` (`BoundaryMiddleware` enforcing upload concurrency, streaming body size limit, timeout, origin/fetch-site checks, and security headers), `session.py` (`Sessions` HMAC-SHA256 signed cookie `docera_session`).
- `backend/app/repositories/files.py` — SQLite WAL-mode repository (`files` table).
- `backend/app/services/files.py` — `FileService` with `safe_filename()`, atomic staged upload, quota enforcement, orphan recovery, and expiry cleanup.
- `backend/app/services/pdf/` — `inspection.py` & `inspect_worker.py` (isolated subprocess with `python -I` and Linux `rlimit`s using `pypdf.PdfReader`).
- `backend/app/services/storage/local.py` — `BlobStorage` protocol and `LocalStorage` enforcing canonical UUID directories and symlink checks.
- `frontend/src/` — `main.tsx`, `app/App.tsx`, `components/Brand.tsx`, `components/ErrorNotice.tsx`, `features/dashboard/{Dashboard,UploadArea,RecentDocuments,tools}.tsx|ts`, `features/pdf-viewer/{PdfViewer,PageCanvas,pdf}.tsx|ts`, `services/{api,format}.ts`, `types/files.ts`.

### System Environment Observations
- **Available:** Python 3.12.10, Node 24.12.0, `npm.cmd` 11.6.2 (PowerShell execution policy blocks `npm.ps1`), `uv` 0.11.26, Git, Docker CLI (engine pipe not verified running).
- **Not available on PATH:** `soffice`/`libreoffice`, `tesseract`, `qpdf`, `pdftoppm`, `gs`.

---

## 3. Existing vs. Verified Working Features

| Area | Implementation Status | Verification Status | Notes |
|---|---|---|---|
| Planning & Threat Model (`docs/`, `DESIGN.md`, `PRODUCT.md`) | Present | Reviewed | Well-reasoned M0 architecture and security boundaries; missing `README.md`, `DEPLOYMENT.md`, `PROGRESS.md`, `KNOWN_LIMITATIONS.md`. |
| Backend API & Session Auth | Written, broken on import | **Failed** | `FileRepository.list` shadows builtin `list`, raising `TypeError` on `main.py` import. |
| PDF Inspection Subprocess | Written | **Untested** | Not yet executed; potential bug if `/UserUnit` or `/Rotate` is an indirect PDF object (`IndirectObject` needs `.get_object()`). |
| Frontend Dashboard & Viewer | Partially written | **Failed** | `src/styles/app.css` missing; devDependencies missing (`tsc`/`vite`/`vitest` not installed); `public/pdf-assets` missing. |
| Automated Tests (Backend/Unit/E2E) | Missing | **Failed** | `pytest` collects 0 items; `vitest` and `playwright` not installed and no test files exist. |
| Organization (Merge/Split/Rotate/Reorder/Extract/Delete) | Not started | — | Listed as Planned (`M3` in `tools.ts`). |
| Editor (Text/Image/Shapes/Undo/Redo) | Not started | — | Listed as Planned (`M2` in `tools.ts`). |
| Annotations, Watermarks, Headers/Footers | Not started | — | Listed as Planned (`M2`/`M3`). |
| Compression & Optimization | Not started | — | Listed as Planned (`M4`). |
| Conversions (PDF↔Images, Office, HTML) | Not started | — | Listed as Planned (`M4`). |
| OCR (English + Khmer seam) | Not started | — | Listed as Planned (`M5`). |
| Forms & Signatures | Not started | — | Listed as Planned (`M6`). |
| Security (Encrypt/Unlock/Redaction/Metadata) | Not started | — | Listed as Planned (`M7`). |
| Batch Processing & ZIP Export | Not started | — | Not yet wired. |
| Docker / CI / Deployment | Missing | — | `docker-compose.yml`, Dockerfiles, nginx config, and CI workflows are absent. |

---

## 4. Known Defects & Technical Debt

1. **[Critical / Blocker] Built-in `list` shadowing in `backend/app/repositories/files.py` (line 31):** `def list(self, ...)` causes `-> list[str]` on line 42 to crash at import time with `TypeError: 'function' object is not subscriptable`. Same naming pattern exists in `backend/app/services/files.py` line 65 (`def list`). Fix by using `from typing import ...` or renaming method (`list_for_owner` / `list_files`).
2. **[Critical / Blocker] Missing frontend stylesheet `frontend/src/styles/app.css`:** Imported by `frontend/src/main.tsx`, blocking Vite build and leaving the entire UI unstyled.
3. **[Critical / Blocker] Missing frontend `devDependencies`:** `frontend/package.json` omits `typescript`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, and `@playwright/test`. `node_modules/.bin` does not exist.
4. **[High] Missing PDF.js static assets:** `frontend/scripts/copy-pdf-assets.mjs` has not been executed and is not wired into `npm run build` / `npm run dev`, so `public/pdf-assets/{cmaps,standard_fonts,wasm}` are missing at runtime.
5. **[High] Missing `frontend/src/test/setup.ts`:** Referenced by `frontend/vite.config.ts` `test.setupFiles`.
6. **[Medium] `PdfViewer.tsx` keyboard listener & page input bugs:**
   - `useEffect` on lines 65–79 has no dependency array, re-registering `window` `keydown` listeners on every state update.
   - Page `<input key={page} ...>` (line 115) remounts on scroll-triggered page changes, stealing focus while typing.
7. **[Medium] `PageCanvas.tsx` text search highlight selector:** `markMatches` queries `span[role="presentation"]`, which may not match all `TextLayer` DOM elements in `pdfjs-dist` v6 (`span` elements without `role="presentation"`), and runs destructively on `textContent`. Must be verified against real PDF.js 6.5.438 DOM output.
8. **[Medium] `inspect_worker.py` indirect PDF objects:** `page.get("/UserUnit", 1)` and `page.get("/Rotate", 0)` may return `IndirectObject` in valid PDFs; calling `.get_object()` before `float(...)` prevents false `invalid_pdf` rejections.
9. **[Medium] Milestone numbering discrepancy:** Existing `docs/IMPLEMENTATION_PLAN.md` uses M0–M8, whereas the Master Development Directive defines M0–M12. Docs should be harmonized to M0–M12 while keeping all technical gates intact.
10. **[Low] Uncommitted repository & missing `README.md`:** Initial work was never committed to Git; `README.md` does not exist yet.

---

## 5. Security Risks & Observations

- **Positive existing controls:**
  - `BoundaryMiddleware` buffers/bounds multipart upload bytes before Starlette parses multipart data, enforces `active_uploads <= 2`, `Origin` + `Sec-Fetch-Site` CSRF checks, and sets `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.
  - `Sessions` issues random 32-byte owner IDs signed with HMAC-SHA256 stored in `HttpOnly`, `SameSite=Strict` cookies; file access checks both `owner` and `expires`.
  - `LocalStorage` enforces canonical UUID directory names and symlink checks.
  - `inspect_worker.py` runs with `python -I` (isolated mode) and sets Linux `RLIMIT_AS`, `RLIMIT_CPU`, `RLIMIT_FSIZE`.
- **Open security gaps:**
  - **Windows subprocess memory limit:** `inspect_worker.py` has no OS memory cap on Windows (`sys.platform == "win32"`), only timeout.
  - **No `secure_cookie` auto-HTTPS detection or rate limiting** beyond `active_uploads >= 2`.
  - **No password-protected PDF unlocking, encryption, or content-removing redaction yet** (will require careful `pikepdf`/`pypdf` verification in M9).
  - **No dependency audit executed yet** on frontend (`npm audit`) or complete backend (`pip-audit`).

---

## 6. Recommended Next Milestones

1. **Stabilize & Verify M1 Foundation (Immediate):**
   - Fix `FileRepository` / `FileService` `list` shadowing and indirect object handling in `inspect_worker.py`.
   - Install frontend `devDependencies` (`typescript`, `vite`, `@vitejs/plugin-react`, `@types/*`, `vitest`, `@testing-library/react`, `jsdom`, `@playwright/test`), wire `copy-pdf-assets.mjs` into `predev`/`prebuild`, create `src/test/setup.ts`.
   - Implement the complete `frontend/src/styles/app.css` matching `DESIGN.md` tokens (dark pine rail, warm workspace, white document paper, responsive mobile layout, accessible focus rings, dark theme support).
   - Fix `PdfViewer.tsx` listener/input issues and verify `PageCanvas.tsx` text search highlighting against `pdfjs-dist` 6.5.438.
   - Write comprehensive backend `pytest` suite (with generated valid/malformed/encrypted/rotated/mixed-size PDF fixtures), frontend Vitest tests, and Playwright E2E verification against running FastAPI + Vite servers.
2. **M2 — Core PDF Organization (Browser-first with `pdf-lib` + Backend validation/fallback):**
   - Merge, Split, Extract, Delete, Rotate, Reorder, Duplicate, Insert pages (blank or from another PDF), Reverse order — preserving page dimensions and rotations, with independent output verification.
3. **M3 — Professional PDF Editor:**
   - Versioned PDF-point document model, undo/redo command history, text insertion/styling, image insertion/transform, shapes/freehand, selection/alignment, and supported native PDF text inspection/modification with clear support boundaries.
4. **M4–M10 — Annotations, Compression, Conversions, OCR (with Khmer adapter seam), Forms & Signatures, Security & Redaction, Batch Processing.**
5. **M11–M12 — Production Hardening & Deployment Readiness.**
