# Step 8.5 notes (arrow-pushing drawings, ADR-038)

Resume point: START done; FACTS next.

## Size check (START)
Fresh builds (2026-11-22, HEAD d62575f): Study 338,360 bytes gzip, Studio 342,382 (`node scripts/initial-js-size.mjs`,
and `check-build.mjs dist ... study` / `dist-studio ... studio` print the same two numbers: 338.36 / 342.38 kB).
The step T "342.39 twice" was NOT reproduced: both scripts read the folder they are given and the two
editions differ by 4 kB. Probable cause: a stale or interrupted smoke at the T close (not provable now). No script fix needed.
Base sizes for this step: Study 338,360; Studio 342,382. Hard limit +100 bytes each.

## FACTS (partial; STOPPED at D1 as the prompt orders)
- Depiction path: `StructureToolkit.depict` (src/chem/contracts.ts:92-118) returns `{key, svg (sanitised text), width, height}` only;
  no coordinates. Drawing: src/chem/rdkit/draw.ts. With `showAtomMaps: false` and a mapped structure, `drawMol` (draw.ts:63-76)
  REDRAWS from the canonical SMILES with `:n` stripped, so the drawn layout is RDKit's own fresh 2D layout of the stripped SMILES.
- RDKit 2026.03.6 MinimalLib (node_modules/@rdkit/rdkit/dist/RDKit_minimal.d.ts): a mol from SMILES has NO conformer
  (get_json shows no coordinates); the 2D layout exists only inside the drawer during `get_svg_with_highlights`. The API has
  `set_new_coords()` / `get_new_coords()` (a molblock with fresh coordinates, in molecule units) but nothing returns the drawer's
  molecule-to-SVG transform (scale, offset, label-widened extents). `get_coords` is in the d.ts but is not a function on a mol.
- So D1 as written (coordinates from the same 2D coordinates RDKit draws, never by parsing the SVG) is NOT available.

## Reviewer decision on D1 (2026-11-22): option 1, conditions 1-6 (see the commit message of M1)
Resume point: M1 committed; next M2 (sides, D2) then M3 (arrow geometry), tests first.

## M1 (worker: atom positions and bonds by map number)
- RED: `npx vitest run tests/integration/chem-positions.test.ts` -> 13 failed | 3 passed (1 s), before any source edit.
- Built: `src/chem/rdkit/positions.ts` (draws twice at one fixed scale: shown + highlighted), `svg-positions.ts` (similarity fit by
  class, checked), contract fields in `src/chem/contracts.ts`, option check in `depiction-options.ts`, cache keys, service table.
- Findings that shaped it: (1) highlighting widens the canvas and RDKit rounds it, so the two drawings differ by a translation AND a
  scale of up to ~1 %: a pure shift check failed on the ring (0.3 unit); fixed by a least-squares similarity fit, checked at 0.35.
  (2) bond lines coloured at a hetero atom are two paths in the shown drawing and one in the highlighted: pairs are the first
  line's start and end (chain of continuing paths), never the second half. (3) Highlight ellipses are the atom's circle (a carbon)
  or the label box (O, N, Br, a charge, an explicit H); rx/ry returned so arrows can stop outside a label.
- Conditions: 1 SVG read only inside the worker, recorded in ADR-038 + Amendments. 2 map -> index recorded from RDKit's SMILES
  before stripping; the molecule is built from the stripped text (token k = atom k), atom count checked; test "drawn atom order".
  3 labelled atoms = centre of the label box. 4 every failure is `refused` "no atom positions: ..." (missing classes, repeated
  map, no fit, molfile). 5 tests: neutral, charged, wedge+amine, ring, lone Br-, explicit mapped H; a test that fails loudly if the
  classes go (real RDKit) and one that breaks them (refused). 6 table cached with the drawing (worker LRU key + service LRU).
- GREEN: chem-positions 17 tests, svg-positions unit 7, cache.test +1, depiction service +3 (all pass).
- M2 RED: sides.test.ts -> 'Cannot find module ./sides' (1 s) before the source; GREEN 22 tests (mechanisms dir).
- M3 RED: `npx vitest run src/layout/mechanism` -> 'Cannot find module ./arrows' (1 s) before the source; GREEN 14 tests
  (property tests 200 runs; one found that vitest's expect() returns false inside fc.property: compare JSON instead).
- D2 CONFLICT FOUND IN FACTS (extension built, reviewer to confirm): the rule as worded ("intermediate/TS before when it holds a movement
  atom") puts the enolate that demo step 1 MAKES on the before side. Built: before only if some atom of it is not already shown by the
  before side (smallest first); written in sides.ts, tested (22 tests), to be recorded in ADR-038 "As built 8.5".
- Demo FACTS: 3 mechanisms, 5 variants, 10 steps; 7 steps have atom-mapped structures, electron movements and bonds; 3 steps (aldol acid
  variant 4, 5, 7) have label-only species (no drawing). Movement kinds in the demo: lone_pair->bond 7, bond->bond 5, bond->lone_pair 7, all
  2-electron (NO fishhook, no atom site, no radical in the demo: those screenshots come from a fixture). Species repeat map numbers across
  sides (same atom before and after). LIMITS: 24 species, 64 movements per step. CHEM-008: the demo has no finding.
Resume point: M3 committed (Part 1, not deployed). Next M4 component in src/render/mechanism, then M5 wiring, M6 editor preview, M7.
- M4 (layout part) RED: compose.test.ts -> 'Cannot find module ./compose' (1 s); GREEN 8 tests.
- M4 (render part) RED: step-model.test.ts and step-drawing.test.tsx -> 'Cannot find module ./step-model' / 'Failed to resolve import ./step-drawing' (1-2 s)
  before the source; GREEN 24 tests (render/mechanism) + 22 (layout/mechanism). Lint caught `innerHTML` read in a test: replaced by querySelector checks.
  Files: src/render/mechanism/{contracts,step-model,use-step-drawing,step-drawing,index}.ts(x) + css; tokens --mech-arrow/--mech-dot (light, dark, media dark).
- M5 RED: mechanisms.test.ts 'a step also carries what a drawing needs' -> expected undefined to deeply equal [...] (1 s); GREEN after StepView gained roleKeys + electronMovements.
- M5 wiring: StepView (+roleKeys, electronMovements), MechanismPorts.drawing, NavigatorPorts/InspectorPorts.stepDrawing, app/window/step-drawing-port.ts,
  explorer Step = heading + marks + drawing + "Step details" (details open unless a drawing is shown; reader's choice stays), inspector StepRow likewise (column layout).
  DISCLOSED ORDER BREAK: the explorer and inspector wiring was written BEFORE their tests (mechanism-drawing.test.tsx, 23 tests incl. the STEP_KINDS table;
  one inspector test); they were green at first run except a test-id typo ("Invalid ID body for mvr"), so no red line exists for those two files.
Resume point: M5 committed; next M6 (Studio editor live preview + bond choices), then M7, then close.
- M6 RED: step-preview.test.tsx -> 5 failed | 2 passed (the preview and the bonded-first order missing; 'Expected container to be an Element' / order [1-2,1-3,2-3]) (2 s), before the source.
- M6 GREEN: step-preview.test.tsx 7 tests (preview under the movements, updates after the 400 ms settle, incomplete movements counted, no port = no preview, bonded-first order for
  bond choices and bond sites; the old order when the tool reports no bonds). Files: workbench/step-preview.tsx, step-maps.ts (bonded), StructurePort.stepDrawing, editor-port/editor-session.
Resume point: M6 committed; next M7 (two WebKit failures), then e2e specs for the new layout, screenshots, sizes, docs, deploy.

## M7 (the two WebKit failures; both were TEST faults, the product is right; ~25 min each)
- app.spec.ts:74. RED in WebKit alone: "Check unavailable" never found (60 s). Probe: both wasm requests ARE blocked in WebKit ("Blocked by Web Inspector"), the app
  says "Workers: chem unavailable", but the notice band shows ONE notice and WebKit never grants persistent storage, so its storage warning is the one shown and the
  chem notice is behind "+1 more" (not in the DOM until opened). Fix (test): open "+n more" when the check notice is not in the band, then the same assertions; Escape after.
  GREEN: webkit, chromium, firefox (7-8 s each).
- arrows.spec.ts:152. RED in WebKit alone: the overlay DID appear; the failure was `commits - before` = 6, expected 1. Probe: the map's layers are still committing in WebKit
  after the arrows are in the DOM (commits 25 -> 30 with no pointer involved) and the arrow can move meanwhile (a probe move landed on the svg, not the arrow). Fix (test): wait until
  two reads of the commit counter 300 ms apart agree before measuring the point and counting. GREEN: webkit 9.0 s, chromium, firefox. Neither engine "does not hover".
- Spacing: SPECIES_GAP 36 -> 52 after the first screenshots (the lone-pair dots touched the plus sign).

## SIZES (first measure after M6): Study 338,738 (+378), Studio 342,768 (+386) over 338,360 / 342,382: OVER the +100 limit, so the rule says STOP.
Cause (grep of the entry chunk): `createStepDrawingPort` (app/window, built in the entry), the `depictionDetails` additions, the service's key and table, the ports.
The step does not need to stop for a cut that stays inside the step's own contract: move the port's code into the lazy chunks that use it (built from the navigator's
`depictions` port, which already reaches them), validate `atomPositions` in the worker only, and shorten the service. Re-measured below; if still over, STOP and report.
