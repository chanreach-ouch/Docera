# Discovery — 2026-11-12

- Workspace: `C:\Users\Chanreach\Documents\Docera`, initially empty including hidden entries. No incumbent conventions, code, dependencies, test infrastructure, or Git repository. Initialized Git without committing or adding a remote.
- Windows NT 10.0.26200, x64; 16 logical processors. Python 3.12.10, Node 24.12.0, npm 11.6.2, uv 0.11.26, Git available.
- PowerShell execution policy blocks npm.ps1. Use `npm.cmd`, without changing machine policy.
- RAM: 15.2 GiB total, approximately 1.2 GiB available at discovery; disk free approximately 15.0 GiB. These are observations, not performance benchmarks. WMI inspection was denied; Python psutil supplied resource figures.
- Docker CLI 29.1.2 present; engine pipe unavailable. Docker config cannot be read in this sandbox. Compose runtime validation requires a running Docker Desktop engine.
- LibreOffice, Tesseract, qpdf and Poppler commands unavailable on PATH. Do not install them for M1.
- Global Python has many unrelated packages, including older pypdf. Use an isolated `.venv` and a committed uv lockfile; do not mutate global packages.
- No project assets, license selection, authentication provider or production deployment target supplied.

## Initial scope

Finish M0 before implementing M1. M1 has genuine PDF inspection and viewing, private browser-session access, downloads of unchanged originals and retention cleanup. M2–M8 remain planned. Treat this as a local development foundation, not a public multi-tenant deployment.
