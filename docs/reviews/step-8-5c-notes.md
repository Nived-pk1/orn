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
