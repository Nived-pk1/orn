# Step 8.5g notes: drawings, textbook polish

## Resume point

2026-11-27, after the reviewer ruling: 2-worker check GREEN (9,150 passed, 1 skipped). Committing, then deploy and push. The
text below is history.

PAUSED by the owner (2026-11-27). Wait for "continue".

DONE since the note below: check green (9,150 passed, 1 skipped; 2 workers) and the four files committed (35a4f7d). Full Chromium
run: chromium 484 passed, 40 skipped; chromium-serial 31, 1 skipped; 0 failed; no screenshot rewritten. build:smoke passed; audit 0.
Initial JS gzip Study 340,096 / Studio 344,201; worker-chem 72,970. PROGRESS "Step 8.5g Part B" and PROJECT_STATE written.

UNCOMMITTED: docs/PROGRESS.md, docs/PROJECT_STATE.json, this note. NOT deployed, NOT pushed.

BLOCKER: after those docs edits, `npm run check` failed twice (2 workers) on ONE test, src/search/palette/parse.test.ts "work grows
linearly" (82 ms against a bound of about 60). Not on the flaky list. Alone it passed 3 of 3; a temporary probe (removed) read 3 to
4 ms against a bound of 50, so it is load inside the full run; nothing under src/search changed in this step. A third run at DEFAULT
workers (what the 8.5g prompt asks for) was stopped by the pause: no result.

NEXT: (1) `npm run check` at default workers. Red: report and ask the owner; do not edit the test. (2) Add the check results of
2026-11-27 after the full Chromium run (the two failures above and the last run) to the PROGRESS "Checks" and REVIEW REQUIRED
lines. (3) Commit. (4) Deploy per RELEASE.md: Study, live specs by exact file names (Chromium; WebKit one worker), Studio, Access
check; then record versions in PROGRESS and PROJECT_STATE, commit, push, report.

RESUMED 2026-11-27: check at default workers: 9,146 passed, 4 failed (no-exam-name-in-product-strings, exam-window and
review-grouping timed out at 5 s; phone-precursors-window did not find its region; the last three are on the flaky list). Those four
files plus parse.test.ts alone: 40 of 40 passed. Waiting for the owner's decision (restart and re-run, or deploy on the earlier green
check). Nothing committed or deployed.

The older text below is history up to 2026-11-26.

PAUSED by the owner (2026-11-26) during the full Chromium run (stopped, no result; its processes ended by PID). Wait for "continue".
Part A is closed. Part B code is committed locally as d3cbb14 (check green: 9,150 passed, 1 skipped); not pushed, not deployed.
UNCOMMITTED: tests/e2e/size-rule-kit.ts, size-rule.spec.ts, size-rule-owner.spec.ts, and this note.

3-engine round: DONE. First pass Chromium 60 passed, 6 skipped, 2 failed; Firefox 37 / 28 / 3; WebKit 44 / 22 / 2. The failures:
size-rule and size-rule-owner (all engines) still required the plain standards in Full mode (stale: the Full standard is 1.4 x); updated
to require the 1.4 x range exactly in Full, the plain range for a drawing that says "shown condensed". Firefox family-header-look: the
listed flake "Firefox cold first double click". Re-run of size-rule, size-rule-owner, size-rule-extra, family-header-look: Chromium 13
passed; Firefox 6, 7 skipped; WebKit 6, 7 skipped; 0 failed. Speed check 1.39 s (first reading 2.73, one-off; laptop on battery).

LAST CHECK (end of 2026-11-26): `npm run check` NOT green, so the four files above are still uncommitted: 9,144 passed, 6 failed, all
timeouts at about the 5 s limit (review-grouping on the flaky list; no-exam-name-in-product-strings; publish-dataset x 3). Alone, two
still failed (5.2 s and 6.8 s; speed check 0.55 s, so not the CPU). They passed in the three earlier checks today and none of the
uncommitted files can affect them. Cause not found (suspect: slow disk or antivirus). FIRST THING: restart the laptop if possible, run
`npm run check`; green: commit these four files; still red: report it to the owner. Do not raise a timeout.

Left to do, in order:
1. ONE full Chromium run, restarted from the beginning: `--project=chromium --workers=2`, then `--project=chromium-serial --workers=1`
   (background). Afterwards check `git status` for screenshots the run rewrote and restore the ones that are not this step's.
2. `npm run build:smoke`, `npm audit --omit=dev`, final sizes (initial JS and worker-chem).
3. PROGRESS "Step 8.5g Part B" (facts, RED, factor, B3 counts, sizes, checks, the stale size-rule checks as REVIEW REQUIRED, screenshot
   lines, disclosures); PROJECT_STATE (next 8.6). Plan row 8.5g is already marked DONE; UI_ARCHITECTURE, Amendments,
   full-mode-crowding.md are written.
4. `npm run check`, commit, deploy per RELEASE.md (Study, live specs by exact paths Chromium + WebKit one worker, Studio, Access check),
   push, report.

## Part B so far

START: 54f8f71 (clean, pushed). Initial JS gzip Study 339,787 / Studio 343,884; worker-chem 71,930.
BEFORE screenshots: `screenshots/8.5g/before-full-*` (owner data). AFTER: `after-full-*` (all opened; retake only if drawing code changes).
FACTS B1: Full = `add_hs()` then RDKit's layout with the hydrogens present (draw.ts, modes.ts); glucose and pinacol knot because that
layout puts atoms on each other (4 pairs closer than half a bond each). CoordGen on the same molecule: 0 (coordinates rescaled to 1.5).
FACTS B2: the box was measured against its shrink-wrapped parent (`useMeasuredWidth('parent')`, `.products` is as wide as its content),
so a first narrow measure stuck.
RED (2026-11-26 19:36): crowding, full-mode, depiction-binding, family-structure-size, size-rule: 12 failed, 24 passed, `./crowding` did
not load (4.1 s). One of the new crowding cases had a wrong expectation (bonded atoms 0.14 apart ARE crowded): corrected.
Built: chem/rdkit/crowding.ts, full-mode.ts; factor 1.4; fallback line; scheme-wide measure; thin scroll bar token; tests/e2e/full-mode.spec.ts
(Chromium 2 passed). Owner five: all clean in Full. B3: 622 species, 619 clean, 3 fallback.
Seen, to report: Pixel 7 family tiles shrink wide drawings to the tile (older phone CSS), labels can go under 11 px; a molecule crowded even
condensed is shown as is.

## For the new session (everything the PROGRESS entry and report still need)

Prompt: `Claude outputs/ORN_SONNET_8.5g_PROMPT.md` (Part B, PART B CLOSE and REPORT sections). Say to the owner's "continue".
Nothing needed is in a temporary folder (the scratchpad held only logs and helper scripts). The stash is empty.

Full factor: 1.4 (kept after looking at the screenshots). Owner five: all CLEAN in Full (none falls back). Sweep: 622 / 619 / 3.

Screenshot lines (`screenshots/8.5g/`, all opened):
- before-full-* (light, dark): glucose is a knot of O and H labels; hexane sits in a narrow box that cuts it off beside free card
  width; pinacol and the cyanohydrin pile H on H.
- after-full-glucose-hexane-*: glucose is an open zigzag chain with every H and OH apart; hexane shows whole, no scroll box.
- after-full-propanone-hcn-*: the cyanohydrin's hydrogens are separate and readable (tight but not touching).
- after-full-grignard-*: 2-methylpropan-2-ol, each CH3 with its own room.
- after-full-pinacol-*: both OH groups and four CH3 groups readable, nothing on top of anything.
- after-full-fallback.png (test data): the crowded molecule is condensed with the line under it; hexane beside it in full.
- after-full-phone-family.png (Pixel 7, test data): the line shows, nothing clipped; hexane is shrunk to the tile.

Disclosures / REVIEW REQUIRED for Part B:
1. size-rule-kit, size-rule.spec, size-rule-owner.spec changed: in Full they now require 1.4 x the range (plain range after fallback).
2. The two salts (MgBr2, ZnI2) fall back although Full, Condensed and Skeletal are the same picture with touching ion labels.
3. A molecule crowded even condensed is shown as is (the test molecule tetra-tert-butylmethane is visibly tangled condensed).
4. Pixel 7 family tiles shrink wide drawings to the tile (older phone CSS): labels can go under 11 px.
5. Fallback exists only for drawings with a bond standard; map, compound, editor and duplicate pictures only get the better layout.
6. The sweep ran in a Node test over the file, not through a Studio window.
7. "Shared fairly" is done by the row wrapping: each term may use the whole scheme width.
8. Machine speed check 1.39 s (line 1.3), laptop on battery.
Part A's own report is above under "REPORT, Part A".

## START (Part A)

0eac983, clean, stash empty, pushed. Fresh builds: initial JS gzip Study 339,762 / Studio 343,839 (after d00c6de, docs only).
Mechanism chunk: mechanisms-host 4,590 (Study) / 4,705 (Studio), mechanism-pictures 10,053 (Studio). Worker: worker-chem 71,443.
BEFORE screenshots: `screenshots/8.5g/before-*.png` (`ORN_SHOTS=before`, review project). Speed check 1.39 s (line: 1.3).

## FACTS for G3

- Species are laid out in `src/render/mechanism/geometry/compose.ts:61-95` (rows with "+", then the arrows in the before side's frame,
  compose.ts:105-121); sides come from `core/mechanisms/sides.ts` through `step-model.ts`; drawn by `step-drawing.tsx` as `<image>`s.
- Each species is drawn by the chem worker, `src/chem/rdkit/positions.ts` (`drawWithPositions`): an unmapped copy from RDKit's SMILES,
  drawn twice, positions read by `svg-positions.ts`.
- The worker CAN draw changed 2D coordinates: a molblock with rotated or mirrored x/y read back by `get_mol` is drawn with those
  coordinates and the positions are read as before (probe with RDKit MinimalLib, 2026-11-26). Mirroring a wedged molblock keeps the wedge
  flags, so the configuration flips (`CC[C@@H](C)Br` became `CC[C@H](C)Br`): never mirror a wedged species.

## RED

`npx vitest run src/render/equation/size-rule.test.ts src/render/mechanism tests/integration/mechanism-placement.test.ts` (2026-11-26
18:17): 10 failed, 73 passed, `orient.test.ts` did not load (4.8 s). SN2 angle 82.1 (wanted >= 150); aldol step 1 hydroxide arrow 203.4
units (wanted <= 142.4); arrow stroke 1.8 against bonds 2; no turn option.

Second RED (2026-11-26 18:24): the unspecified double bond was drawn crossed (slope difference 0.306, wanted < 0.05).

## REPORT, Part A

Commits: d00c6de (8.5f review), 5900005 (code), plus the deploy commit. FACTS and RED: above. Weights: arrow stroke 2 (was 1.8), heads 9
(was 8), "+" 22 units, ink #000000. SN2 angle 82.1 -> 163.6 degrees; aldol step 1 hydroxide arrow 200.4 -> 61.7 units. G4: 3 mechanisms,
10 steps, 6 drawn, 4 not (mechanisms-survey.md). Sizes: initial JS Study +31, Studio +53; mechanism chunk 6,371 -> 8,074 (Study); worker
+487. Check 9,131 passed. Study a7e32947, Studio fa104d32; live specs 45 / 44 passed, 0 failed; Access ok. REVIEW REQUIRED: see PROGRESS.
