# Step 8.4c notes (map proportions back to the "peak" map)

## Start
- git clean; HEAD 2dcee03 (housekeeping, pushed to origin/master); `git stash list` empty. Speed (hrtime around `node -e 1`): 4 ms (loop) / 59 ms (execSync).
- Row "8.4c" to add under 8.4 in the plan table; the polish pass that was called 8.4c is now 8.4d.

## Part 0. Fact sheet

### 0.1 The old map, measured (build of tag `phase-7-done` = b130cbf, Studio, demo, 1389 x 868, Fit, Chromium; worktree `../orn-old`, removed after)
Toolbar of that build has Zoom out / Zoom in / Fit, rail item "Navigator". (`src/core/coverage` was untracked then; copied from HEAD to make it build.)

| | old map | HEAD before (8.4b) | after (8.4c) |
|---|---|---|---|
| box (screen px) | 83.3 x 38.9 | 166.4 x 77.6 | see Part D table |
| column pitch / row pitch | 224 / 139 | 256 / 154 | see Part D |
| column gap / box width | 1.69 | 0.54 | 1.40 |
| row gap / box height | 2.58 | 0.98 | 2.40 |
| stroke widths (computed) | 1.5 px (edges, scaling), 2 px, 3 px (hit paths 12 px) | 1.5 px non-scaling... | 2 to 4 px (heavy 3 to 5) |
| font sizes (screen) | 12.0, 9.7, 8.3 | 19.4, 16.6, 15.2 | 10.2 (title at 1280 x 800) |

The pitch (`arrange.ts`: column gap 2 x 96, row gap 1.5 x 96) is untouched since 5.5c (`git log --follow src/layout/grid/arrange.ts`: one commit). The old
map had NO box scale (1.0); the 1.8 scale (8.2b-fix, "bigger boxes", then 8.3b "from boxes only") is what took the air away.

### 0.2 Where the box scale is computed
`src/layout/grid/scale.ts` `boxScaleFor` (called from `layout/grid/index.ts` `layoutGrid` when `request.growBoxes`): largest factor 1..`BOX_SCALE_MAX` (1.8) with
at least `BOX_SCALE_MIN_GAP` (16 px) between any two boxes. A scale below 1.02 is no scale. `build-scene.ts` multiplies node width/height by it and
`SceneNode.scale` carries the text with it (`textSlots`).

### 0.3 How 8.4b drew a pair
Focus (a family selected or hovered): each direction is already ONE Scene edge with ONE visible path (+ one hit path): the demo shows, for Alcohols, 10 edge
groups of 2 paths (line + hit). The layout's port logic (`ports.ts`, `PORT_GAP` 12 map units) puts the two lines of a pair 12 units apart at both ends; 8.4b's
`separatePairs` only moved them when they were closer than 6 px. I could NOT reproduce "4 lines" on the demo (Alcohols, Aldehydes, Alkenes, Carboxylic acids,
Esters, Haloalkanes all show two paths per direction: line and invisible hit). In a CHAPTER with nothing selected `mergePairs` made ONE line with two heads, an
`extraChip` and two hit "halves". The bunch the user saw is most likely two lines 12 map units apart seen at Fit (zoom 0.64 gives 7.7 px between centres, 5.7 px
between 2-px edges, less with 3-px heavy lines) with chips 20 px tall placed on both: they touch. Cause of the bunching, in numbers: centre gap 12 x zoom.

### 0.4 "↻ n" and the box width
`render/svg/labels-layer.tsx` `Loops`: at `x = node.x + node.width - padX*k`, `y` of the FORMULA line (`sublabelY`), text-anchor end. The box width
(`render/scene/sizes.ts` `nodeSizes`) was computed from the title and formula only, so "↻ 2" lay over the end of a long formula.

### 0.5 The square "R" badge
It is the REVIEW badge (`BADGE_MARK.review`: square, mark "R", title "Review required"), drawn by `render/svg/badges-layer.tsx` `NodeBadges` for the node flag
`review_required` at LOD 2 and up, centred on the box's top edge (`translate(node.x, node.y - BADGE_SIZE/2)`), right-aligned: half outside the box. It duplicates
nothing (the family page's review dot is a different place), so it stays, now INSIDE the box on the title row (8.4c, A3).

## Red lines (before source)
- `src/layout/grid/scale.test.ts`: "7 failed | 4 passed" (new exports `BOX_SCALE_CEILING`, `COLUMN_GAP_RATIO`, `ROW_GAP_RATIO` missing).
- `src/render/scene/title-row.test.ts`: "TypeError: titleRowExtra is not a function" (4 failed); `title-row-geometry.test.ts`: "titleRowExtra/titleRowRight is not a function" (3 failed).
- `src/render/svg/mark-scale.test.ts`: "Cannot find module './mark-scale'"; `chip-place.test.ts` (chips grow): "expected true to be false".
- `src/features/navigator/map-view.test.ts`: 8 failed (pair tests: not merged, `paired`, separation).
- `src/layout/grid/grid.test.ts` (column gap from the widest box): "expected 192 to be greater than or equal to 224".
- e2e `map-proportions.spec.ts` against the OLD build (port 4182, dist-studio built at 8.4b source): 6 failed, 1 passed
  (columns "Expected >= 1.38, Received 0.3086"; chip/stroke checks; pair "Received length: 1").
- Disclosed: the heavy-stroke separation tests (`mark-scale.test.ts`, `map-view.test.ts`) were written in the same edit as `pairSeparationMap(zoom, stroke)`; no
  separate red run. The e2e specs edited for the pair (map-focus, map-selection, map-marks) were edited after the source.

## Decisions and changes (smallest, with reasons)
- A1 `boxScaleFor`: largest scale >= 1 at which, for boxes beside each other, gap >= 1.4 x the wider box and, above each other, gap >= 2 x the taller box
  (plus the old 16 px). Upper limit 1.8 gone; `BOX_SCALE_CEILING` = 3 only ends the search for boxes with nothing beside them.
- A2 (consequence, not a new algorithm): at scale 1 the demo's widest boxes (144 px, because of A3) gave 192 / 144 = 1.33. With `growBoxes` the column gap is now
  also at least 1.4 x the widest box + 6 px (`arrange.ts` `COLUMN_GAP_AIR`); narrow boxes (120 px) keep the stated 192.
- A3 title row: `nodeSizes` adds `titleRowExtra` (gap + width of "↻ n" + badges) to the title width; "↻ n" is drawn at the right end of the title row, left of
  the badges; the badges are inside the box on the title row (`badgeOrigin`, `loopsAnchor`). `badges.ts` moved out of `build-scene.ts` (to share).
- B marks grow: CSS clamps on `--map-k` (`scene-svg.module.css`) mirrored by `render/svg/mark-scale.ts` (a test reads the CSS): stroke clamp(2, 2k, 4) (heavy 3..5),
  head 10..16, chip factor 1..4/3 (20 to 26.7 px, text 12 to 16), hit = stroke + 14 (touch + 26), pair gap 8.5..16. `chip-place.ts` places chips at the grown size.
- C pairs (user decision 2026-11-08): `mergePairs`, the pair role, `startHead`, `extraChip`, `pair-direction.ts` and its test are removed. `mapView.pairUp`
  moves the two lines to `pairSeparationMap(zoom, mean stroke)` apart (edges 8.5 to 16 px), keeping each on its side; nothing selected: both ink; a pair line has a
  hit path as wide as the distance between the centres (class `edgeHitPaired`) so the nearer line is hit; each pair chip is a button for its own line.
- `PORT_GAP` 12 -> 16 map units so lines that share a box side are at least 8 px apart (edges) at Fit (zoom about 0.6 or more).

## Tests changed, and why (only where this prompt changes a number or a rule)
- `scale.test.ts` (rewritten: Part A.1 ratios replace the 1.8 cap); `ports.test.ts` "wide chip" (1.8 -> 312/288), "crowded layout" (stack of rows), PORT_GAP 12 -> 16 cases;
  `pipeline-arranged.test.ts` (scale is 1 or just above, all alike); snapshots `demo-navigator-lod2/expanded-lod1.svg.txt` (new box sizes, port gap, light-weight class).
- `map-view.test.ts`, `map-view-busy.test.ts` (a pair is two lines: 16 lines are busy), `legend.test.tsx` (words), `scene-svg-marks.test.tsx` (pair), `chip-place.test.ts` (added).
- e2e: `map-marks-kit.ts` / `map-marks.spec.ts` (8.4b sizes become floors with ceilings; pair test rewritten), `map-focus.spec.ts`, `map-selection.spec.ts` (pair = two lines),
  `map-room.spec.ts` and `exam-first-run.spec.ts` (box title at 1280 x 800: 12 -> 10 px, reviewer decision A.4), `map-focus-kit.ts` (no extra chip).

## Close (2026-11-08)
- Sizes (exact gzip of the initial chunk): Study 382,768, Studio 386,597 (ceilings 382,800 / 386,600). `strokePx` lost its light branch to stay under (3 bytes to spare).
- `npm run check` default workers: 753 files, 8359 tests green. e2e: see PROGRESS "Step 8.4c".
- Disclosed: `snapEnds` tests and the chip-for-every-pair-line test were written after their source; the e2e specs map-marks, map-focus, map-selection, arrows, canvas-touch were adjusted after the source.
- Not deployed, not pushed: REVIEW REQUIRED (see PROGRESS).
