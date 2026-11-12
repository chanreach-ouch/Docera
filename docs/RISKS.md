# Technical risk assessment

| Risk | Impact | Decision / evidence gate |
|---|---|---|
| Native PDF text editing | High: font encoding, shaping and coordinates can corrupt content | M2 adds new objects; native replacement requires font/encoding-specific round-trip evidence |
| Engine license obligations | High: PyMuPDF/MuPDF dual AGPL/commercial terms | M1 uses BSD pypdf and Apache PDF.js; defer PyMuPDF adoption until distribution/source model is decided |
| PDF→Office fidelity | High: PDF lacks original semantic structure | Prototype each format against representative fixtures; publish measured limitations; consider commercial engines |
| Secure redaction | Critical: visual hiding can leak content | Require object and extraction checks plus independent review before enabling |
| Untrusted native/Office parsers | Critical: code execution and resource exhaustion | Isolated, non-network workers with enforced OS/container budgets; never enable macros |
| Browser memory on large scans | High on current machine | Lazy canvases, bounded resolution and cleanup; measure actual representative documents |
| Docker unavailable | Compose cannot be runtime-verified here | Validate config where possible; run build/healthchecks after Docker Desktop engine starts |
| Low free RAM | Test and build processes can compete | One browser worker; no parallel heavy services; document observed rather than invented performance |
| Anonymous session loss | Documents become inaccessible without cookie | Clear expiry UX; no persistence promise across browser clearing; account support later |
| Windows sandbox | No native parser memory isolation yet | Explicit local-development boundary; Linux container limits before public deployment |

No significant architectural decision blocks M1. The application's own source license and a future PyMuPDF license path remain open; neither is silently selected for the user.
