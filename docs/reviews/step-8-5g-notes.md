# Step 8.5g notes: drawings, textbook polish

## Resume point

Part A CLOSED: deployed and pushed 2026-11-26 (code 5900005). Part B not started: it starts from Part A's pushed deploy commit
("phase-8.5g: Part A deployed ..."), with its own fresh START sizes and BEFORE screenshots.

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
