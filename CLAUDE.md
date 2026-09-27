# CLAUDE.md — Organic Reaction Navigator

Offline-first TypeScript/React app for JEE organic chemistry. Architecture is fixed in `docs/`.
**Every session: read this file and `docs/PROJECT_STATE.json`, then only the docs in the read map (§8).**

## 1. Non-negotiables
1. Chemistry data is canonical. Graphs, indexes, scopes, findings, layouts, depictions are derived and never stored as canonical data.
2. Reactions are records (participants, stages, condition variants, outcomes). Selectivity lives on outcomes only.
3. Layers: foundation → chemistry → curriculum → attachments → presentation. References point down only.
4. The UI renders and edits; it never contains chemistry logic. All changes go through commands (exact undo).
5. Nothing silent: no silent data loss, fixes or truncation. Ambiguity → `review_required`.
6. Everything bounded (traversals, imports, rendering) and deterministic (injected clock/IDs/RNG).
7. No reaction-specific hacks: never branch on record IDs or names. Special behaviour is data.
8. Build what the current phase requires; FUTURE items stay unbuilt (docs/ARCHITECTURE.md §A).

## 2. Invariants
INV-01…INV-30 in `docs/ARCHITECTURE.md §26`. Break none. Test the ones you touch.

## 3. Forbidden shortcuts
Full list: `docs/SONNET_HANDOFF.md §18`. Most common: storing derived data; reactions as edges; name-based logic;
`innerHTML`/`dangerouslySetInnerHTML`/`eval`; localStorage; unbounded recursion; mutating state outside commands;
dropping unknown legacy fields; chemistry in components; files > 400 lines; cross-feature imports; weakening tests.

## 4. Commands
`npm install` · `npm run dev` · `npm run build` · `npm run preview` · `npm test` · `npm run check` (must pass before every commit)
Details: `docs/SONNET_HANDOFF.md §19`.

## 5. Module rules
`app → features → ui | render → layout | chem | search | io | persistence | workers → core`.
`src/core` imports only core, zod, immer; no DOM, storage, network, `Date.now`, `Math.random`.
Inside `src/core` use relative imports; elsewhere import via `@/…`. Enforced by `npm run lint:deps` + ESLint.

## 6. Conventions
- Files ≤ 400 lines (warning > 300); one responsibility per file; named exports; no `any`.
- Tests colocated (`x.ts` + `x.test.ts`); property/integration/adversarial/perf/e2e under `tests/`.
- Errors across module boundaries are values (`{ ok: false, … }`); exceptions only for programmer errors.
- Commits: `phase-<N>.<S>: <summary>`. At a gate, the implementing agent writes the packet and its
  self-review, then stops. It never marks a gate passed and never tags. The human reviewer's verdict
  is recorded in PROGRESS.md first; a separate session then tags phase-<N>.
- Update `docs/PROGRESS.md` and `docs/PROJECT_STATE.json` at the end of every step.

## 7. Architecture amendment procedure
Contracts (`**/contracts.ts`), schemas (`src/core/schema`), invariants and ADRs change only like this:
1. State the problem and the smallest change that solves it.
2. Schema change → bump `CURRENT_SCHEMA_VERSION`, add a migration step, freeze the previous fixtures (docs/MIGRATION.md §1–§3).
3. Update the affected docs in the same commit; add an ADR if a decision changes (supersede, never delete).
4. Record it in `docs/PROGRESS.md` under "Amendments" with the reason.
If unsure whether a change needs this, it does.

## 8. Read map (read only what the phase needs)
Single source of truth: `docs/IMPLEMENTATION_PLAN.md §4` (kept in sync with the phase table in §2 of the
same file). Do not keep a second copy of the per-phase read map here.
Step list: `docs/IMPLEMENTATION_PLAN.md §2`. Master prompt: `docs/SONNET_HANDOFF.md §21`.

## 9. Token discipline
- Do not read whole large files when a slice answers the question (`grep -n`, line ranges).
- Never open `Organic_Reaction_Navigator_v6*.html` or `data/fixtures/legacy/*.json` in full; inspect with
  `node -e` summaries. The legacy app is a requirements reference only — do not port its code except the
  v4→v5 normaliser specified in docs/MIGRATION.md §4.3.
- Prefer the contracts and schema files over prose docs when they answer the question.

## 10. When blocked
If the docs contradict each other or the task is impossible as specified, stop and report the conflict with
the smallest proposed amendment. Do not improvise around the architecture.
