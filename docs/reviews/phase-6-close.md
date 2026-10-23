# Phase 6 close - the authoring workbench (Gate D packet)

Written by the implementing agent for the reviewer. It records no verdict, marks nothing passed, and nothing is tagged or deployed.

## 1. What Phase 6 built

- Row 6.1: editor sessions (draft store, persistence, local undo, commit, conflicts, periodic snapshots), the Names editor, the conflict view.
- Row 6.2: species, class and reagent editors, the live structure panel, the duplicate check.
- Row 6.3: the reaction editor (identity, participants, stages, live preview). Row 6.4: stage conditions with the parsed-field confirm, condition variants, outcomes and products, a reaction from scratch.
- Row 6.5: the mechanism editor (variants, steps, species, bond changes, electron movements) and the user's own mechanism pictures.
- Row 6.6: sources, classification, concepts, named reactions, transformations, relationships, caveats, topics, topic mappings, exam relevance and map families, with the Syllabus topics / Exam relevance / Relationships lists in every editor.
- Exams step: exam and exam-version editors, exam-generic wording, the grouped scope selector.
- Row 6.7: quick entry and "Create new" (the nested editor), duplicate a reaction, a specific reaction from a generic one.
- Row 6.8: delete and merge with impact dialogs; the review queue with bulk Mark verified / Needs review; multi-selection and the marquee on the map (Studio only).
- Row 6.9 (this step): the 6.8b fixes (merge wording, phone Select bar), entry room (Studio entry 394.99 -> 391.03 kB gzip), the coverage plan, the authoring driver, the Gate D runs.
- Two editions (ADR-041): Study has no editor module (`scripts/check-edition.mjs`); Studio is behind Cloudflare Access.

## 2. Definition of Done ("Gate D; no authoring path writes invalid data to the canonical store")

| Item | Evidence |
|---|---|
| No authoring path writes invalid data | `tests/adversarial/phase6-no-invalid-writes.test.ts`, 20 tests. For each of the 17 editor kinds, 60 random mutated drafts go through `commitDraft`. A refused commit leaves the state object and the revision untouched; an accepted one is re-validated from scratch and has no L1-L3 ERROR. A tally test shows both outcomes occur. Seen red: the same property against a store with a broken gate FAILS (the last test asserts it). |
| Every demo reaction can be authored from scratch through the UI | `tests/e2e/author-demo-all.spec.ts`, project `gate-d`: 27 of 27 passed (section 4). The coverage set `author-demo.spec.ts` ran in three browsers and on both phones (section 5). |
| Edits go through commands (exact undo) | unchanged since 6.1: one `store.dispatch` per save (`commit.ts`); Undo e2e in the editor specs. |
| Editors are lazy, the entry stays under the line | Studio 391.03 kB, Study 387.11 kB gzip (budget 400, line 395). |
| Accessibility | axe 0 serious / critical in the editor specs (section 7). |
| CSP | 0 policy violations in every spec (the `watch` / `expectClean` kit). CSP, `_headers` and the SVG sanitiser are unchanged. |

## 3. Coverage table and set

The 27-reaction x 24-family table is in docs/PROGRESS.md, "Step 6.9, part 1" (`node scripts/demo-coverage.mjs plan`). There are 106 feature families, and the exact minimum covering set has **14** reactions (not the 8-10 expected; the reasons are in PROGRESS): alcohol1-to-aldehyde-pcc, ethanol-to-ethanal-pcc, ethanol-conc-h2so4, ethanal-aldol, benzene-nitration-draft, benzene-friedel-crafts-acylation, propene-hbr-peroxide, cyclohexanone-oxime-beckmann, propene-hbr, ethene-hydration, ethanol-to-ethanal-dichromate, but-2-yne-lindlar, haloform-ethanol, methylmgbr-ethanal.
Not authorable and left out of the comparison: `mappedReaction`, `intermediates` (no editor, none in the demo), and the routes and schemes that point at reactions (Phase 7 / presentation).

## 4. Gate D results (all 27 reactions, Chromium, `npm run e2e:gate-d`)

**27 passed, 0 failed.** Each reaction is authored in a fresh app from the demo-without-reactions data set. Three records are made from scratch through the nested editor (3-Hydroxybutanal, epsilon-Caprolactam, Lindlar's catalyst). The records that point at the reaction are entered through their own editors (topic mappings, exam relevance, relationships, caveats; a relationship's other end is authored too). The result is read back through Export and compared.

Differences from the demo are all fields no editor can set (Gate D findings; the demo is NOT edited):

| Field | Reactions | Note |
|---|---|---|
| outcome `label` | 10 | no editor field |
| participant `originalText` | 7 | shown ("Written in the source as"), not editable |
| outcome `conceptIds` | 3 | no editor field |
| condition variant `note` | 1 reaction (2 variants) | no editor field |
| variant solvent character | 1 reaction (2 variants) | not offered on purpose (it does not reach the arrow) |
| participants present only under a variant | 1 | the editor only counts them |
| stage `originalText` | 1 | shown, not editable |
| participant `note` | 1 | no editor field |
| EQUIVALENT: variant `stageId` | 2 variants | the editor names stage 1; the demo leaves the default (first reaction stage) |

Every other field of every reaction and pointer record compared equal (ids, nested ids, provenance and review ignored; references compared by name).

## 5. E2E, ONE run, production builds

652 passed, 133 skipped by profile (each with its reason in its spec), 1 failed, 1.3 h.

| Browser | Passed | Skipped | Failed |
|---|---|---|---|
| Chromium | 231 | 30 | 1 |
| Firefox | 196 | 66 | 0 |
| WebKit | 225 | 37 | 0 |

The one failure was `author-demo.spec.ts`, `rxn_ethanol-conc-h2so4`, Chromium: a test bug in the new card screenshot (the reaction's card appears twice on its family page, so the locator matched two elements). It is fixed (`.first()`) and re-run alone: passed, with its Pixel 7 twin. No timeout and no other failure. The coverage set (14 reactions x 3 browsers; 2 reactions on the Pixel 7 and iPhone 14) passed otherwise.

## 6. Sizes, benches, timing

- Initial JS gzip: Study 387.11 kB, Studio 391.03 kB (6.8b close: 387.76 / 394.99). `npm run build:smoke` passed for both editions and the edition check passed (Study 0 editor modules, Studio 176).
- Speed check 0.615 / 0.611 / 0.590 s (median 0.611). No measurement is pending.
- `npm run bench:compare`: 480 entries compared, no budget breach. 237 entries are over +20% p99 against the Gate E baseline, nearly all by 25-50% with the whole suite moving together (the 5.11b / 6.1a picture, read as workstation noise); no baseline change.
- Phase 6 WATCH items: 'navigator overview, every hub expanded' (design/dense) 16.11 ms p99 against 16 (just over, as in 6.1a: 16.2-22.0); 'projection: reaction_explorer, focused on the hub' (design/dense) 12.49 ms (under 16); 'validateTouched: like water hub, review lifecycle changed' is not among the 237.

## 7. Accessibility (axe 0 serious / critical)

Editors covered: species, class, reagent, reaction (identity, participants, stages, conditions, variants, outcomes, products), mechanism (steps, pictures), source, concept, named reaction, transformation, relationship, caveat, topic, topic mapping, exam relevance, map family, exam and exam version; the nested editor, quick entry, the conflict view, the drafts list, the delete and merge dialogs, the review queue and its confirm, and the phone editors. Specs: editor, species-editor, class-editor, reagent-editor, reaction-editor, reaction-conditions, outcome-groups, reaction-from-scratch, mechanism-editor, mechanism-pictures, knowledge-editors, curriculum-editors, exam-editors, shared-fields, quick-entry, create-new, conflict, delete-merge, review-queue and the phone-* editor specs. All passed in the ONE run.

## 8. Open items that point beyond Phase 6 (PROJECT_STATE openItems)

- Phase 7: the reagent explorer shows a profile's conditions beside the reaction; the ROUTE editor with the precursor explorer.
- Phase 8: bond choices in the mechanism editor; Fit never above 100%; narrow-screen notices.
- Phase 9: the Firefox font console error; unused picture cleanup (storage diagnostics); a pointer-path bench; the Gate B / Gate E exception lists.
- Later / schema v3 candidates: pictures on a single mechanism step; structured species property values; an exam kind for the grouped scope selector; merging reagents that have profiles; the Review page on a phone.
- NEW from this step: the findings of section 4 need a decision (add the editor field, or accept the field as read-only).

## 9. REVIEW REQUIRED departures still open

- The coverage set has 14 reactions, not 8-10.
- Quick entry is not part of the driver (`quick-entry.spec.ts` covers it).
- The Z3 controller split was written before its test.
- The section 4 findings.
- 237 of 480 bench entries are over +20% (noise reading, no budget breach).
- Part 1's "docs-only" claim missed that `scripts/demo-coverage.mjs` is linted; fixed in Part 2.
- Earlier steps' items were decided in their reviews (docs/PROGRESS.md).

## 10. Screenshot index (git-ignored `screenshots/`)

author-demo-ethanol-conc-h2so4-1280x800.png (an authored reaction's card), merge-dialog-1280x800.png (Z1, fresh), phone-select-mode-pixel7.png (Z2, fresh; the e2e now asserts no button is behind the bar), phone-select-mode-iphone14.png, review-queue-1280x800.png, review-confirm-1280x800.png, map-multiselect-1280x800.png, and the Phase 6 editor set (species, class, reagent, reaction, mechanism, curriculum and exam editors; the from-scratch family card and full equation; the nested editor; the duplicate dialog; the phone editors).

## Reviewer review, round 1 (2026-10-23)

Gate D NOT YET PASSED. Accepted: 27 of 27 authored; the adversarial test; sizes; axe; CSP; the coverage set of 14 (exact minimum); quick entry covered by its own spec; the Z3 test order (recorded); the Part 1 lint slip (recorded); the bench reading as noise; the WATCH item 'navigator overview, every hub expanded' at 16.11 ms against 16 (new Phase 9 openItem).
NOT accepted (G1): the eight fields no editor can set (outcome label, outcome conceptIds, variant note, participant note, participant and stage originalText, variant solvent character, participants present only under a variant). Phase 6's promise is that any reaction can be entered completely.
The variant stageId difference is an EQUIVALENT default (G2): the comparator treats "no stageId" and "the first reaction stage" as equal.
Step 6.9b adds the editors and re-runs the proof (round 2 below once it is run).

Reviewer verdict: (pending)
