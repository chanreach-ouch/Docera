# Docera — Deployment & Operations Guide

## 1. Local Development Setup

### Prerequisites
- Python 3.12+ with `uv` (recommended) or `pip`
- Node.js 20+ (22 or 24 LTS recommended) with `npm`
- Optional system packages (installed automatically inside Docker images):
  - `tesseract-ocr` + `tesseract-ocr-eng` / `tesseract-ocr-khm` (for full server-side OCR)
  - `libreoffice` (`soffice`) (for full native Office formatting fidelity; Python fallbacks activate when absent)

### Backend Startup
```bash
cd backend
uv sync
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
On Linux/macOS:
```bash
cd backend
uv sync
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend Startup
```bash
cd frontend
npm install
npm run dev
```
The frontend dev server listens on `http://localhost:5173` and proxies `/api/*` requests directly to `http://127.0.0.1:8000`.

---

## 2. Production Container Deployment (Docker Compose)

Docera ships with multi-stage production Dockerfiles for both the FastAPI backend (`backend/Dockerfile`) and the Nginx-served React frontend (`frontend/Dockerfile`), orchestrated via `docker-compose.yml`.

### Quick Start
1. Copy the environment template and adjust limits as needed:
   ```bash
   cp .env.example .env
   ```
2. Build and launch the stack:
   ```bash
   docker compose up -d --build
   ```
3. Verify service health:
   ```bash
   docker compose ps
   curl -f http://localhost:8000/api/v1/health
   ```
4. Open Docera in your browser at `http://localhost:8080`.

### Container Details
- **`api` container:** Runs as non-root user `docera` (`UID 1001`) on `python:3.12-slim-bookworm`. Includes `poppler-utils`, `qpdf`, `tesseract-ocr`, `tesseract-ocr-eng`, `tesseract-ocr-khm`, and core fonts. Persists session storage in the `docera-data` volume mounted at `/app/data`.
- **`web` container:** Runs `nginxinc/nginx-unprivileged:1.27-alpine-slim` on port `8080`. Serves compressed static bundles with immutable caching on `/assets/`, security headers, SPA history fallback, and `/api/` reverse proxy with `client_max_body_size 100M`.

### Host Environment Notes
- Ensure Docker Desktop or the Docker daemon engine is running on your host machine before executing `docker compose up`. If running on Windows, verify that the Docker Linux engine service (`com.docker.service`) is active.

---

## 3. Environment Variables

All backend environment variables use the `DOCERA_` prefix (`backend/app/core/config.py`):

| Variable | Default | Description |
|---|---|---|
| `DOCERA_DATA_DIR` | `.docera-data` (`/app/data` in Docker) | Root storage path for SQLite metadata and uploaded PDFs |
| `DOCERA_MAX_UPLOAD_BYTES` | `26214400` (25 MB) | Per-file upload size limit (max configurable: 100 MB) |
| `DOCERA_MAX_PAGES` | `500` | Maximum allowed page count per PDF upload |
| `DOCERA_RETENTION_SECONDS` | `86400` (24 hours) | Automatic retention period before session files expire |
| `DOCERA_SESSION_QUOTA_BYTES` | `262144000` (250 MB) | Total per-session upload storage budget |
| `DOCERA_MAX_SESSION_FILES` | `100` | Maximum stored files per browser session |
| `DOCERA_ALLOWED_HOSTS` | `["localhost","127.0.0.1","testserver","api"]` | Trusted HTTP `Host` header allowlist |
| `DOCERA_ALLOWED_ORIGINS` | `["http://localhost:5173", ...]` | CORS allowlist |

---

## 4. Automated CI & Testing

Run the complete test suite locally:
```bash
# Backend unit & integration tests (15/15 passing)
cd backend && .venv/bin/python -m pytest -v

# Frontend unit & component tests (14/14 passing)
cd frontend && npm run build && npm test

# Full-stack 10-scenario Playwright E2E suite (10/10 passing)
cd frontend && npx playwright test
```

See `.github/workflows/ci.yml` for the automated GitHub Actions quality gate covering `pip-audit`, `npm audit`, `pytest`, `tsc`/`vite build`, `vitest`, and `playwright`.
