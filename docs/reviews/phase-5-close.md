# Phase 5 close - UI and rendering

Gate E: PASS (reviewer, 2026-10-14; conditions met in 5.11a, 5.11b and this close). Tag `phase-5` at the commit "phase-5: complete".
Packet: docs/reviews/gate-e-packet.md. Verdict text: docs/PROGRESS.md, "Step 5.11b review and Gate E verdict".

## 1. What Phase 5 built

The offline-first shell and the navigator over the chemistry data: the family map (canvas of families and arrows with pan, zoom,
fit, roving focus and spatial arrow keys), the family page (virtualised groups and reaction cards with structure depictions), the
inspector (record detail with links, back and forward), the List view, search and the command palette, the exam scope selector,
and the status line (saving, findings, workers, records set aside). Data comes in and out through the import screen (preview,
apply with a progress view for long applies, undo import, quarantine of bad records) and the export screen. Keyboard-only and touch
walks, axe checks and the Content-Security-Policy are exercised end to end in Chromium, Firefox and WebKit against the production
build. The UI makes no canonical edit except import and Undo import; authoring is Phase 6.

## 2. Gate E result and final e2e counts

Full e2e, production build, one run, Chromium + Firefox + WebKit, 31.7 min: 369 tests, 351 passed, 18 skipped, 0 failed.

| Browser | Passed | Skipped | Failed |
|---|---|---|---|
| Chromium | 119 | 4 | 0 |
| Firefox | 115 | 8 | 0 |
| WebKit | 117 | 6 | 0 |

Skips (each states its reason in its spec): the WebKit long-apply test in Chromium and Firefox; the WebKit small-import test in
WebKit; the lifecycle reload test (skipped in all three; see its spec); the renderer-crash
tests (lifecycle, ADV-038) in Firefox and WebKit; the private-window tests by engine (the WebKit ones in Chromium and Firefox,
the Chromium/Firefox one in WebKit); the quarantine-status test in Firefox and WebKit (Chromium is enough); the touch walk in Firefox.
Initial JS 386.93 kB gzip (budget 400). `npm run build:smoke`: passed. `npm run check`: 393 test files, 5487 tests.
The WebKit keyboard-walk flake was a missing wait in the test (PROGRESS, "closing session, part 1"); 60 of 60 in WebKit.

## 3. Carry list into Phase 6 (PROJECT_STATE openItems; one line each)

- Row 6.1: multi-selection (Shift-click) and the marquee, built with the first bulk action (openItem 1, 5.7).
- -> step 6.1: a quiet-machine `bench:compare` is the first action (5.11b review).
- -> step 6.1: the search sync analyses a remote ChangeSet like a commit, before authoring (openItem 22).
- -> step 6.1: draft recovery must not depend on an unload-time write; offer drafts whenever sessions exist at boot (132, 131, 135).
- -> step 6.1: periodic snapshots through the worker's `snapshotBuild` (118).
- -> step 6.1: a promoted follower keeps its own boot's quarantine count; another tab's import is not followed (170).
- Phase 6: Undo and Redo are unavailable with reasons until editing exists (155).
- Phase 6: an Abort that rolls back the one apply transaction, if real Safari shows applies of minutes (169).
- Phase 6 (row 6.5): the user's own mechanism images as assets, shown first in the mechanism view (154).
- Phase 6: `strength` of a legacy condition has no field; decide at authoring (73).
- Phase 6: linking a reaction's legacy reagentFamily to the reagents it uses is an authoring question (80); reusing an existing
  reagent or species is an authoring merge (76).
- Phase 6: a WARNING for the same substance listed twice in the same role and stage (38).
- Phase 6 watch: main-thread parts of an import apply at the design tier, and the whole-state send to the worker (20, 36).
- Phase 8: Fit with a single node zooms far past 100%; fit should never zoom above 100% (new, this session).
- Phase 9: the Gate B exceptions (45) and the Gate E exception list of the packet section 11.

## 4. Standing rules

- Phase 6 editors are lazy chunks (React.lazy per editor).
- When the entry passes 395 kB gzip, the measured lazy candidates of the packet section 8.1 are done.
- `bench:compare` runs in every phase-closing step (TEST_STRATEGY section 6).
- The first action of step 6.1 is a `bench:compare` on a quiet machine (71 and 216 of 470 entries over +20% on unchanged code in
  5.11b were read as machine noise; no baseline change).
- No chunk may import a worker entry chunk (check-build rule 7).

## 5. Release items (before release, not before Phase 6)

- Import a 2 MB file in real Safari (macOS or iOS), Confirm to Imported, and decide the write remedy; no schema change before that.
- The WebKit warm-boot trace is folded into the same real-Safari check.
- A release-preview step (hosting) comes before 6.1 (reviewer's prompt).
