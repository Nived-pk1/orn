# Dependencies

Runtime dependencies of the shipped app: version as pinned in `package.json` / installed, licence, and the step that added it.
Phase 10's documentation sweep keeps this list current. Each new dependency is recorded here in the step that adds it, with
`npm audit` at 0 vulnerabilities and, for code that runs in a worker, the `eval(` / `new Function` scan (ADR-035).

| Package | Version | Licence | Added | Notes |
|---|---|---|---|---|
| @rdkit/rdkit | 2026.3.6 | BSD-3-Clause | step 4.3a | Chem worker only; the only dependency allowed `new Function` (ADR-035) |
| d3-selection | 3.0.0 | ISC | step 5.4b | `src/render/viewport/zoom-binding.ts` only (the selection d3-zoom attaches to); no eval, no new Function in its sources |
| d3-zoom | 3.0.0 | ISC | step 5.4b | `src/render/viewport/zoom-binding.ts` only: gestures become viewports, d3 never writes the DOM transform; dblclick zoom off; inline style removed (CSP) |
| dexie | 4.4.6 | Apache-2.0 | (before 4.x) | IndexedDB adapter |
| elkjs | 0.12.0 | EPL-2.0 OR GPL-3.0-or-later (EPL-2.0 used) | step 4.4 | Layout worker only (`src/layout/elk/`); bundled build, our worker |
| fflate | 0.8.3 | MIT | (before 4.x) | Zip for snapshots and exports |
| immer | 10.2.0 | MIT | (before 4.x) | Command store |
| minisearch | 7.2.0 | MIT | step 4.5 | Search worker only (`src/search/engine/`); scanned: no eval, no new Function |
| @fontsource/ibm-plex-mono | 5.3.0 | OFL-1.1 | step 5.2 | Latin 400 only, served from the origin (ADR-014); SMILES and formula inputs |
| @fontsource/ibm-plex-sans | 5.3.0 | OFL-1.1 | step 5.2 | Latin 400 and 600, served from the origin (ADR-014) |
| @radix-ui/react-dropdown-menu | 2.1.25 | MIT | step 5.2 | `src/ui/primitives/menu.tsx`, ALWAYS `modal={false}` (a modal Radix layer injects a `<style>`, CSP note E3); spiked clean in three engines |
| @radix-ui/react-tooltip | 1.3.0 | MIT | step 5.2 | `src/ui/primitives/tooltip.tsx`; spiked clean in three engines |
| react | 19.3.0 | MIT | (before 4.x) | UI |
| react-dom | 19.3.0 | MIT | (before 4.x) | UI |
| zod | 4.6.5 | MIT | (before 4.x) | Schemas (jitless in workers, ADR-035) |
| zustand | 5.0.15 | MIT | step 5.2 | UI stores (`src/ui/state`); no middleware, no `localStorage` |
| @tanstack/react-virtual | 3.14.13 | MIT | step 5.5b | VirtualList primitive (`src/ui/primitives`): the family page's cards. Pulls `@tanstack/virtual-core` 3.17.11 (MIT; locked by the lockfile, not a direct pin). Scanned: no `eval(`, `new Function`, `Function(`; it positions items through style props (CSSOM, allowed by the CSP) |

## Dev dependencies (not shipped)

Exact pins, added in the step that first uses them (note E12); `npm audit` 0 vulnerabilities after each.

| Package | Version | Licence | Added | Notes |
|---|---|---|---|---|
| cmdk | 1.1.1 | MIT | step 5.8 | The palette's list, keyboard and roles inside our native Dialog (it filters nothing: our search worker ranks). CSP spike: zero `securitypolicyviolation` events and no injected `<style>` in Chromium, Firefox and WebKit. Brings @radix-ui/react-dialog, -id, -primitive, -compose-refs as its own dependencies (its `Command.Dialog` is not used) |
| @types/d3-selection | 3.0.12 | MIT | step 5.4b | Types of d3-selection |
| @types/d3-zoom | 3.0.9 | MIT | step 5.4b | Types of d3-zoom |
| @testing-library/react | 16.3.3 | MIT | step 5.1d | Component tests (jsdom), roles and names (note E13) |
| @testing-library/dom | 10.4.2 | MIT | step 5.1d | Peer dependency of @testing-library/react |
| jsdom | 30.1.1 | MIT | step 5.1d | Opt-in per test file with `// @vitest-environment jsdom` |
| @axe-core/playwright | 4.13.0 | MPL-2.0 | step 5.2 | axe in the e2e of every UI step (note E13) |
| @playwright/test | 1.63.0 | Apache-2.0 | step 5.1d | `npm run e2e` against the production build (note E10); browsers: chromium, firefox, webkit |
