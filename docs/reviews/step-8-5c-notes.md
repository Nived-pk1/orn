# Step 8.5c notes (C0 map arrows off their boxes; C1 labels; C2 hydrogen letters; C3 size rule; C4 content)

Resume point: C0 fixed + tests green; check/round/deploy of the hotfix next, then C1, C3, C4, close.

## START
HEAD 305b190 clean, stash empty, in sync with origin. Section 0 = 319495d (8.5b review in PROGRESS). C2 test commit f85579e.
Speed check (3e8 loop) 1.407 s (over 1.2): the load was the owner's own Edge browser windows (msedge, several processes, not mine); not stopped
(it is the user's browser). Disclosed; no timing assertion is part of C0.

## C0. Arrows that start or end away from their family boxes (owner, live site)
### 1. Reproduction (owner's real data: ..\fable-work\inputs\ORN-real-data-2026-11-15.ornpkg, 2026-11-15 17:54, the newest package)
Check: `tests/e2e/map-arrow-ends.spec.ts` (every drawn arrow's first and last point against the box of its from / to family, in map units; an end whose
family is not a drawn box is a failure; the old arrows.spec `endsOf` skipped such arrows silently). Views: overview, each family selected (All chapters),
after zoom, pan and a window resize, bucket shown, each of six chapters (+ each family), phone 412 x 915.
Failing arrows on 305b190 (Chromium, real data), all in a TWO-WAY PAIR:
| view | arrow | end | off by |
|---|---|---|---|
| Carboxylic acids selected (and bucket hidden or shown) | bnd_01192b9887e5cddf Arenes -> Carboxylic acids | start | 67.8 px |
| | same | end | 10.2 px |
| | edg_46081225f9d41f0a Carboxylic acids -> Arenes | start | 67.9 px |
| Ketones selected, bucket shown | bnd_16ac59278e6785f6 Not in a family yet -> Ketones | start / end | 94.6 / 130.7 px |
| | bnd_b7864983fb4061de Ketones -> Not in a family yet | start / end | 89.6 / 130.8 px |
(the owner's two screenshots; the second is the "Not in a family yet" box SHOWN. With the bucket hidden no arrow to it is drawn: `usable` filters on
drawn boxes, so "an arrow to a family that is not drawn" does not occur: it is not drawn at all. No off-map marker is needed.)
Everything else: 0 off in every view, including after pan, zoom and resize and on the phone.

### 2. Cause
`pairUp` in `src/features/navigator/map-view.ts` (8.4c, C): a two-way pair is drawn as two parallel lines. Each line is moved sideways by half the
difference between how far apart the two lines' middles are and the wanted gap (8-16 px). For a pair whose two arcs bow to OPPOSITE sides (the grid
layout bows an arrow and its reverse by up to 160 px each, to clear other boxes) that move is up to ~100 px for a whole curve; `snapEnds` then slides
each end along its own first or last segment to the box border, but a curve's first segment runs nearly along the box side, so it meets no border and
"an end that meets no border keeps where it is": both ends float in empty space beside their boxes (and the head points at nothing). Not stale layout,
not a missing box, not routing or clipping in the layout engine (the layout's own routes end on the borders: unpaired arrows are all 0 off).
First bad commit: by code history, ace5d5d "phase-8.4c ... a two-way pair is two parallel lines" (`git log -S snapEnds`: the function and the call were
added there). NOT confirmed by a build bisect (each step needs a production build and a real-data run; the cause is read from the code and reproduced
and removed by the fix below). Disclosed.

### 3. Red first
RED: `npx vitest run src/features/navigator/map-arrow-ends.test.ts` -> 33 failed / 12 passed (0.69 s) before the source edit
("ab end: expected 9.73 to be less than or equal to 3", focus and chapter, zoom 0.4 / 1 / 2, arcs bowed 0-160 px, three layouts; the 12 passing are the
unbowed ones). e2e: `map-arrow-ends.spec.ts` on the owner's package, Chromium, red on 305b190 with the 3 + 4 failing ends above.
The e2e on the DEMO is not red on 305b190 (the demo has no pair with far-bowed arcs): only the owner's package (ORN_ARROW_DATA=<file>) and the unit test
are red; the committed e2e runs on the demo by default and on any package by the variable.

### 4. Fix
`map-geometry.ts`: `borderDistance`, `endsOnBorders`, `shiftedMiddle` (the sideways move fades as sin(pi t) along the line, so both ends stay where the
layout put them, on the borders). `pairUp` keeps the old shift + snap when it leaves both ends within 1.5 px of their borders (every existing
test and the straight pairs are unchanged) and uses `shiftedMiddle` otherwise. The chip moves with the middle. Green: the new test 45/45, map-view,
map-geometry tests 70/70; e2e on the real package: 0 off in every view, Chromium desktop and phone.

## C0 close
Deployed 2026-11-24 from 3a7e897: Study c89ccd22, Studio 902e4512 (Studio deploy ran twice by mistake with one build; 4f2930f8 was the first). Live specs Chromium 45 / WebKit 44 passed. Round: 41 passed, 1 failed (WebKit arrows.spec:183, Key dialog toHaveCount, passed 3 of 3 re-runs).

## C2
tests/integration/hydrogen-letter-positions.test.ts: 15 cases, green on the first run, no code change (no red to show). Measured glyph orders (RDKit 2026.03): HO- = H, O, minus (O is index 1); HS- = H, S; H2O = H, 2, O (O index 2); NH3 = N, H, 3; NH4+ = N, H, 4, plus; H3O+ = H, 3, O, plus; NH2- = N, H, 2, minus; a bonded N/O/S with the bond on its left is drawn letter first (OH, SH, NH3+); with the bond on its right the hydrogen comes first (HO, H2N).

## C1
Glyph boxes: Depiction.glyphs (worker, labelGlyphsOf in chem/rdkit/svg-positions.ts) -> DrawnSpecies.glyphs -> composeStep -> layoutArrows ctx.glyphs. Red: label-clearance.test.ts 19 failed / 3 passed; arrows.test.ts 3 failed / 16 passed. Rules: dot or end direction (nearest free of 14 turns, not near a bond), bond anchor = middle of the visible part, curve = preferred side, other side, higher bulge (within MAX_BULGE), else least crossings with crossings reported on the arrow. A first version rotated an end that was only near a bond; the 8.5b R1 e2e (mechanism-drawing.spec:74, 3 engines) caught it; fixed by keeping the preferred direction when it is clear.
Not shown anywhere yet: an arrow with crossings > 0 is not marked in the picture (no demo step needs it); the fixture in arrows.test.ts proves the branch and the number.

## C3 NOT DONE: facts for the next prompt (row 8.5d)
- The owner two cut-off cards (Pyrolysis of esters, Dieckmann condensation) are FAMILY-PAGE boxes: features/navigator/family-structure.tsx draws an img at width/height STRUCTURE_AREA in a fixed box (family-scheme.module.css .structure, overflow hidden; text boxes widen to min(100%, 22rem) and break only at spaces). The depiction is asked to FIT that area (env.keyOf, the depiction manager), not at a fixed bond length, so a long molecule is shrunk; changing it changes the depiction request and its cache keys.
- Equation (render/equation): already a fixed bond length (EQUATION_BOND_PX 54), but drawingSizeOf scales a drawing down WHOLE beyond MAX_DRAWING_WIDTH 220 / MAX_DRAWING_HEIGHT 160 (stacked 140): the shrink the owner saw. Rows wrap between terms already (.row flex-wrap). Inspector hero: fitHero (hero-fit.ts) scales the row down to MIN_DRAWING_PX 80 then stacks.
- Map cards (render/svg/nodes-layer.tsx): the picture is an image with preserveAspectRatio meet in a fixed area from the layout (core layout, so a growing box is a layout change).
- Mechanism step (render/mechanism): fixed scale, wide steps scroll sideways (data-drawing-scroll).
- Text formulas: family-text.tsx BoxFormula / FormulaText; names use overflow-wrap anywhere (breaks mid-word; B3 wants spaces, after dash and comma).
- Size: the shared module plus CSS plus the depiction change is expected to need more than the +600 byte limit; decide the limit first.
- Not reproducible on the demo (no Pyrolysis or Dieckmann there): use the real package, ORN_ARROW_DATA style import.
