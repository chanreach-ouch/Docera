# Dependencies and licensing evaluation

Reviewed 2026-11-12. Exact installed versions and transitive trees are recorded in `frontend/package-lock.json` and `backend/uv.lock` once generated. Preserve upstream license and notice texts in distributions. The application's own source license is undecided. This evaluation identifies engineering obligations and does not choose a commercial licensing model.

## M1 selections

| Dependency | License / redistribution | Runtime and platform | Maintenance/security approach |
|---|---|---|---|
| React / React DOM | MIT; retain copyright/license | Modern browsers, Node build; Windows/Linux | Current compatible releases, npm lock/audit |
| TypeScript / Vite | Apache-2.0 / MIT; retain notices/license | Node 24 selected; Windows/Linux | Strict checking, locked build tools |
| React Router / TanStack Query | MIT; retain notices | React, browser | Locked compatible versions; audit |
| PDF.js (`pdfjs-dist`) | Apache-2.0; retain license/NOTICE and bundled font/CMap notices | Modern browser worker, local assets | Pin current release; disable eval/XFA; track security advisories |
| Lucide React | ISC; retain notice | React SVG icons | Locked release; no competitor assets |
| @fontsource-variable/dm-sans | Font SIL OFL-1.1; retain font license | Self-hosted WOFF2 | No external font requests |
| FastAPI / Uvicorn | MIT / BSD-3-Clause; retain notices | Python 3.12, Windows/Linux | Isolated uv lock; pytest; dependency audit |
| Pydantic / pydantic-settings | MIT; retain notices | Python 3.12 | Typed env/config/schema validation |
| pypdf | BSD-3-Clause; retain notices; no endorsement | Pure Python; Windows/Linux | Lock maintained release, subprocess isolation; old global 5.9.0 not used |
| python-multipart | Apache-2.0; retain license/NOTICE | Python | Body limit before multipart parsing; locked release |
| SQLite | Public domain core (Python wrapper follows Python distribution) | Python stdlib, local disk | Single API process; migrate before scaling |
| Vitest / Testing Library / Playwright | MIT / MIT / Apache-2.0 | Node; browser E2E | Dev-only, locked; single browser worker |
| pytest / httpx | MIT / BSD-3-Clause | Python dev | Isolated test dependencies |
| nginx / Python / Node container images | BSD-like / PSF / MIT plus bundled software | Linux Docker | Pin release tags; production needs digest pinning and image scanning |

## Evaluated, deferred dependencies

| Dependency | License consideration | Need and adoption gate |
|---|---|---|
| PyMuPDF / MuPDF | AGPL-3.0 or commercial license; network/distribution obligations need explicit review | Advanced raster/edit/redaction engine; not installed for M1 |
| pikepdf / qpdf | MPL-2.0 / Apache-2.0; preserve notices and covered-source obligations | Structural optimization, encryption; install when needed |
| Pillow | HPND/PIL permissive license plus codec licenses | Images/compression; codec resource/bomb limits |
| LibreOffice | MPL-2.0 primary, components carry additional licenses | Headless Office conversion; substantial Linux runtime; isolated containers |
| Tesseract / language data | Apache-2.0 (check each data package) | English OCR adapter; native dependencies and training-data review |
| PostgreSQL | PostgreSQL License, permissive | Production metadata and durable job records |
| Redis | Version-specific: recent releases offer AGPLv3/RSALv2/SSPLv1 alternatives; older versions differ | Select supported release and terms when queue is needed; do not assume all Redis releases are BSD |
| Celery | BSD-3-Clause | Long-running export jobs; Linux worker, timeouts and cancellation |
| Fabric.js / Zustand / Tailwind | MIT / MIT / MIT | Add only if M2 interaction/state/styling needs justify them |
| PDF-to-Office engines | Vary, including AGPL/commercial | Format-specific fidelity and redistribution assessment before enabling |

## Primary references

- [PDF.js license](https://mozilla.github.io/pdf.js/)
- [pypdf license FAQ](https://pypdf.readthedocs.io/en/stable/meta/faq.html)
- [PyMuPDF licensing](https://pymupdf.readthedocs.io/en/latest/about.html)
- [LibreOffice license and bundled-license guidance](https://www.libreoffice.org/licenses/)
- [Redis version-specific licensing](https://redis.io/legal/licenses/)

Inspect installed package metadata and bundled license files before distributing. An npm/pip audit does not cover fonts, native engines, containers or every transitive license. Native tool availability and Docker runtime limits are recorded in DISCOVERY.md; do not describe deferred dependencies as installed.
