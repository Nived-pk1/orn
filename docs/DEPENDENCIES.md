# Dependencies

Runtime dependencies of the shipped app: version as pinned in `package.json` / installed, licence, and the step that added it.
Phase 10's documentation sweep keeps this list current. Each new dependency is recorded here in the step that adds it, with
`npm audit` at 0 vulnerabilities and, for code that runs in a worker, the `eval(` / `new Function` scan (ADR-035).

| Package | Version | Licence | Added | Notes |
|---|---|---|---|---|
| @rdkit/rdkit | 2026.3.6 | BSD-3-Clause | step 4.3a | Chem worker only; the only dependency allowed `new Function` (ADR-035) |
| dexie | 4.4.6 | Apache-2.0 | (before 4.x) | IndexedDB adapter |
| elkjs | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later (EPL-2.0 used) | step 4.4 | Layout worker only (`src/layout/elk/`); bundled build, our worker |
| fflate | 0.8.3 | MIT | (before 4.x) | Zip for snapshots and exports |
| immer | 10.2.0 | MIT | (before 4.x) | Command store |
| minisearch | 7.2.0 | MIT | step 4.5 | Search worker only (`src/search/engine/`); scanned: no eval, no new Function |
| react | 19.3.0 | MIT | (before 4.x) | UI |
| react-dom | 19.3.0 | MIT | (before 4.x) | UI |
| zod | 4.6.5 | MIT | (before 4.x) | Schemas (jitless in workers, ADR-035) |

## Dev dependencies (not shipped)

Exact pins, added in the step that first uses them (note E12); `npm audit` 0 vulnerabilities after each.

| Package | Version | Licence | Added | Notes |
|---|---|---|---|---|
| @testing-library/react | 16.3.3 | MIT | step 5.1d | Component tests (jsdom), roles and names (note E13) |
| @testing-library/dom | 10.4.2 | MIT | step 5.1d | Peer dependency of @testing-library/react |
| jsdom | 30.1.1 | MIT | step 5.1d | Opt-in per test file with `// @vitest-environment jsdom` |
| @playwright/test | 1.63.0 | Apache-2.0 | step 5.1d | `npm run e2e` against the production build (note E10); browsers: chromium, firefox, webkit |
