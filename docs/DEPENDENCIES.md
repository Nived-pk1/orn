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
