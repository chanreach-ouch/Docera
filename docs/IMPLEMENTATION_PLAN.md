# Implementation plan

| Milestone | Scope and acceptance gate | Status |
|---|---|---|
| M0 | Discovery, public capability research, architecture, dependency and license evaluation, threat model, risks and roadmap committed as reviewable source files | Implemented |
| M1 | Dashboard with enabled viewer only; signature/structure validation; bounded private uploads; session authorization; original download; deletion and expiry; multi-page selectable/searchable PDF viewer; API, UI and browser tests | In progress |
| M2 | Structured editing model; text/image insertion and selection; geometry; properties; annotation interoperability; transaction undo/redo; save/reopen; validated exports | Planned |
| M3 | Merge/split/rotate/reorder/extract/delete/duplicate/insert; preserve mixed sizes and rotated pages; preview then validate output | Planned |
| M4 | Real compression size/quality reports; PDF↔PNG/JPEG; isolated Office→PDF; evaluate ambiguous PDF→Office output and commercial dependencies | Planned |
| M5 | English OCR adapter; scan detection; text and searchable PDF export; geometry validation; Khmer adapter seam | Planned |
| M6 | Form discovery/filling/flattening; drawn/typed/image visual signatures; explicit distinction from certificate signing | Planned |
| M7 | Authorized encryption/decryption, permissions, tested content-removing redaction, metadata selection; native text research | Planned |
| M8 | Production accounts/authorization, PostgreSQL, deployment isolation, security/a11y/browser audits, resource/performance baselines, recovery and retention operations | Planned |

Do not start later milestones until the previous milestone's relevant tests and output checks pass. Infrastructure needed for a feature belongs in that milestone, not in an idle M1 service.

## M1 files and verification plan

- `frontend/`: app/router, API client, dashboard/tool registry, upload flow, PDF viewer, CSS tokens; component/unit tests and Playwright end-to-end tests.
- `backend/app/`: configuration/errors/middleware, schemas, routes, metadata repository, local storage/file services, isolated inspector. `backend/tests/`: generated valid, malformed, encrypted, rotated, scanned and mixed-page fixtures; verify originals byte-for-byte.
- `docker-compose.yml`, Dockerfiles, nginx config, environment example, setup/dev scripts, lockfiles and CI.
- Tests cover authorization, expiry and cleanup, upload/body/quota limits, hostile names, parser failures/timeouts, restart persistence, viewer navigation/search/zoom/rotation, empty/error/planned states and responsive UI.
- Run only bounded tests given low available RAM. Record actual outcomes and Docker/browser verification gaps explicitly.
