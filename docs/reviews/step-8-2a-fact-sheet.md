# Step 8.2a, Part B: fact sheet (map clean-up). Read from the code, 2026-11-04, HEAD 004a558

Paths are under `src/` unless written otherwise.

## 1. How the overview map is built

- Model: `features/navigator/pipeline.ts` (`createNavigatorModel`). `requestOf()` (:104) makes the `ProjectionRequest` (view `navigator`,
  `filters` from `ports.ui.filters`, limits `NAVIGATOR_MAX_NODES` / `NAVIGATOR_MAX_EDGES`); `buildOnce()` (:112) calls
  `navigatorProjection.build` (`core/graph/navigator/build.ts:46`) with `scopeLens` (`scope-lens.ts:58`) as the exam lens.
  Then sizes (`nodeSizes`, :146), `buildLayoutRequest` (:150), the layout service (:158), `buildScene` (`render/scene/build-scene.ts:106`).
- Family boxes: hubs = anchored species/classes (`navigator_anchor` records; `core/indexes/navigator-rollup.ts`, `arrangementsOf` in
  `core/graph/navigator/nodes.ts:66`). Every real hub is admitted up to maxNodes (`build.ts:77-81`), with or without arrows.
- Edge model: the roll-up holds one `NavigatorPair` per ORDERED (from hub, to hub) with all its candidates (`pair-table.ts:28`,
  `rollup.pairs()` `navigator-rollup.ts:248`). A candidate = reaction id + outcome + product + the two hubs (`pair-table.ts:11`).
  The projection draws ONE bundle per pair with 2 or more arrows (`build.ts:131`, `EdgeBundle.total`, `.reactions` = distinct cards,
  `.examples`); `drawnPaths` (`render/scene/paths.ts:33`) turns a bundle or a lone edge into one path; `buildScene` (:154-188) makes ONE
  `SceneEdge` per path: `{id, from, to, points, bundleSize?, ariaLabel}`. So: one drawn edge per (from family, to family), carrying its
  count. The Scene edge does NOT carry reaction ids; the projection's `GraphEdge` carries `reactionId` but only for the materialised
  arrows of a pair (up to `DEFAULT_DEGREE_CAP`, `pairs.ts:materialise`), so per-reaction facts need the filtered request, not the Scene.
- Self-loop: a pair with `from === to`. It is a path with `loop: true` (`paths.ts:29`); `loopGeometry` (`render/scene/loops.ts`) draws it
  beside its box; `bundleSize` = reactions in it. Per-node counts: `nodeReactionCounts` (`pairs.ts:67`) gives `{out, in, loops, outAll, inAll}`
  and travels on `SceneNode.reactionCounts` (`build-scene.ts:140`) (so "4 within the family" needs no new core data: `loops`).
- Unclassified: the virtual hub `UNCLASSIFIED_HUB_ID` (`core/indexes/navigator-rollup.ts`, re-exported `core/graph/navigator/hubs.ts`).
  Added as a node only when some arrow touches it (`build.ts:71-79`, `unclassifiedNode` `nodes.ts`), box `unclassified`. Reactions that reach
  no hub at all are `unanchoredReactionIds` (separate; the "Unanchored reactions (n)" button). The candidates INTO Unclassified carry
  `product: RecordRef` (`pair-table.ts:24`), so "which compounds lead there, how many reactions each" is computable from
  `rollup.candidatesTo(UNCLASSIFIED_HUB_ID)` with no new index.
- Filters: `reactionFilter` (`core/graph/navigator/select.ts:54`). A filtered request scans every hub's candidates (`build.ts:60-64`); counts
  and bundles then count only passing reactions. `ViewFilters.topicIds` (union, transitive through `recordsInTopic`) is in the schema and
  UNUSED by any UI (grep: only `core/graph/kit.ts:33` and the search facets), so a chapter can use it with no schema change.

## 2. How it is drawn

- `features/navigator/navigator-canvas.tsx`: toolbar (:140-175), legend (:188), `ViewportScene` (:203), List mode (`list-view.tsx`).
  `ViewportScene` (`render/viewport/viewport-scene.tsx`) -> `SceneSvg` (`render/svg/scene-svg.tsx`) with layers in this order
  (:43-49): edges, nodes, labels, badges, overlay. Edges layer: `render/svg/edges-layer.tsx:14` (one `<g data-edge-id>` per edge; stroke dash
  from `edge.stroke`, width from `edge.weight`, marker from `edge.arrowHead`; one ink colour; hit path `EDGE_HIT_WIDTH`).
  Count chips: `render/svg/badges-layer.tsx:60-80` (every edge with `bundleSize`, at `edge.labelAt`; lone single-reaction arrows have none).
  Arrowheads: markers in `render/svg/defs.tsx:47-55` (filled, accent, open), `orient="auto"`, user-space size.
- LOD: `render/scene/contracts.ts:15` thresholds 0.35 / 0.6 / 0.9; edges `minLod` 0 (structural 1); `visibleAt` in `svg/geometry.ts`;
  RENDER_BUDGET 400 nodes / 800 edges forces LOD <= 1.
- Parallel edges: the `grid` layout (used for the arranged overview) routes an arrow and its reverse as arcs that bow apart
  (`layout/grid/route.ts` ARC_OFFSETS, `ports.ts` PORT_GAP between an arrow and its reverse). Count chips: `layout/grid/chips.ts` reserves room
  for the chip of the reverse arrow. ELK/fallback layouts give the reverse arrow its own route too.
- Legend: `navigator-legend.tsx:52` (group swatches from `legend.ts:114 legendOf`; mark explanations from `legend.ts:142 keyOf`: chip,
  loop, unclassified, outside-scope). The legend row is not shown on a phone; there it is the "Legend" dialog (`phone-map-controls.tsx:56`).
- Node fade: `SceneNode.state.dimmed` (`opacity: 0.5`, `scene-svg.module.css:182`) is the exam-scope mark; it also drives the outside-scope
  legend line (`navigator-canvas.tsx:114`). The focus fade must NOT reuse it (different meaning); it needs its own prop.

## 3. Arrangement

Canonical: `navigator_anchor` records (`cell {column,row}`, `group`, `tone`, `order`); `arrangementsOf` picks the best anchor per target
(`nodes.ts:66`). Automatic: boxes with no `cell` ask `grid` for an automatic cell (`layout/grid/auto.ts`, LayoutNodeInput.cell/auto). Studio's
manual arrangement edits those anchor records through commands. Positions are never stored as drawn coordinates (derived). The viewport per
view is saved in `uiState` (`navigator.viewports`). This step changes none of it (D6).

## 4. Input today

`features/navigator/use-canvas-input.ts`, keys `canvas-keys.ts`, hit test `render/svg/hit.ts`, pointer machine `render/viewport/pointer-machine.ts`.
- Click on a box or an edge: `ui.selection.select(hit)` (:245) and DOM focus on the drawing; after the 300 ms window `onConfirm` calls
  `selection.reveal()` (:256-259) which shows it in the inspector (desktop pane / phone sheet peek). Click on empty map: `select(null)`.
- Double-click on a family: `ui.family.openFamily(id)` (:252). Long press / right click: context menu (`canvas-menu.ts`).
- Keyboard (drawing is one tab stop, `aria-activedescendant`): arrows = nearest family in that direction (`neighbourInDirection`), Tab /
  Shift+Tab reading order, Enter = inspect, Enter again = open page, O = page, +/-/0 zoom, F centre, Space = toggle (Studio multi),
  Esc = clear multi, else clear selection (:201-211), `.`/menu key = menu.
- Hover: `SceneSvg` reports ONLY the arrow under the pointer (`scene-svg.tsx:26-38`, `SceneSvgProps.onSceneHover`, "edge" kind), drawn
  accented by the overlay. There is NO node hover today (needed for D1's 150 ms preview: one additive prop).
- Phone: tap = click; no hover. Studio multi-select (`use-multi-select.tsx`) only where the window provides it; Shift/marquee/Select mode.
- Selection line: `navigator-selection.tsx`. Inspector/peek for a family: the study/author inspector of the hub record (8.1).

## 5. Phone Map tab

`phone-tabs.tsx` (Chapters | Families | Map | Explore | Search; `overview.phoneTab` saved). Map tab shows the same `NavigatorCanvas` with
`phone` true: no toolbar row, no legend row; two floating round buttons Fit and Legend (+ Studio's Select) `phone-map-controls.tsx:47-55`;
Legend opens a `Dialog` with the same `NavigatorLegend`. List mode is not offered (Families tab is the list). minScale = FIT_FLOOR.

## 6. uiState

One entry `navigator` (`ui/state/navigator-persist.ts`, `NAVIGATOR_UI_KEY`). Parsed tolerantly part by part (`parseNavigatorUi` :99), unusable
parts reset and named in `damaged`; fields this version does not know are kept (`extra`, :170) and written back (`flush` :215-225).
There is no version number on this entry: explorer (7.1b), precursors (7.2a), chapters (7.3b), reagents, named, mechanisms, syllabus were each
ADDED as new optional parts with a defaults-when-missing parser. So two new fields (map chapter, Unclassified shown) are an additive optional
part `map` with its own parser and store: NO schema change, NO version, NO migration. File is 283 lines; the new part goes in a new
`ui/state/map-state.ts` (as chapters-state.ts did). `NavigatorUiStores` has two creators only (`navigator-stores.ts:280`, `navigator-persist.ts:176`).
Not saved: filters (`createFiltersStore`), so focus (hover/selected-for-focus) stays out of uiState, as D1 asks. (Selection IS saved today;
the focus is derived from the selected family, so a saved selected family would restore a focus. See REVIEW REQUIRED in the report.)

## 7. Chapters

Chapter of a record: `buildChapterIndex(state).membershipsOf(ref)` (`core/chapters/build-index.ts:46`): the nearest topic of kind `chapter`
at or above each topic the record is mapped to (`chapterOfTopic`, :56), else its top-level topic; a record may be in several chapters.
The Chapters view records the open chapter in `ui.chapters` (`ui/state/chapters-state.ts`: `open(chapterId)` sets `chapterId`; saved as
`navigator.chapters.chapterId`; "none" = No chapter yet). That `open` call is the hook for D7.
Difference to note: a `topicIds` filter (`recordsInTopic` transitive) equals the 7.3b rule except where a chapter topic sits inside another
chapter (then the outer chapter's filter also takes the inner chapter's reactions). DECISION: the chapter filter uses `ViewFilters.topicIds = [chapterId]` (no contract or schema change); a unit test checks it equals the 7.3b membership on a flat tree; the nested case is a REVIEW REQUIRED item.

## 8. Phase 5 map budgets and readability

Budgets: `tests/perf/budgets-navigator.mjs` (projection build 16 ms per pair row: design dense 60 hubs/7,492 arrows/1,702 pairs; hub_explosion;
stress 32 ms informal), `budgets-scene.mjs`, `budgets-viewport.mjs` (pan/zoom, commit counts), `tests/perf/navigator-overview.bench.ts`.
`npm run check:bench-budgets` (222 benches, 248 entries). Readability: `tests/e2e/readability.ts` writes
`screenshots/readability-overview-lod2.json`, `-with-conditions.json`, `-expanded-lod2.json`; specs `readability.spec.ts`, `arrangement.spec.ts`,
`arrows.spec.ts`. This step draws FEWER edges; no budget changes.

## 9. Specs and tests that expect arrows with nothing selected, legend text or edge counts

E2E (will change in Part D; the specs that count `svg [data-edge-id]`, read `data-count-of`, the legend's marks, or the drawing's aria name
"Navigator: n hubs, m arrows"): `navigator.spec.ts` (:19 NAVIGATOR regex, :62 edge count = projection paths, :287-290 busiest pair label),
`arrows.spec.ts` (13 hits: chips, loops, hover), `arrangement.spec.ts` (5), `readability.spec.ts` + `readability.ts` (edge crossings/overlap
numbers), `canvas-keyboard.spec.ts` (4), `canvas-touch.spec.ts` (4), `keyboard-walk.spec.ts` (5), `family.spec.ts` (2), `phone.spec.ts` (10).
Unit: `features/navigator/legend.test.tsx` (legend lines), `phone-map-controls.test.tsx`, `render/svg/scene-svg*.test.tsx`
(renderer; unchanged: the Scene shape is unchanged), `render/scene/build-scene.test.ts` (unchanged). `pipeline.test.ts` and
`pipeline-arranged.test.ts` assert the model's Scene edges (unchanged: the focus is a derived view over the full Scene).

## 10. Groups and colour

A hub's group and tone come from its `navigator_anchor` (`group` text, `tone` in blue/green/amber/violet/teal/rose/slate:
`arrangementsOf` `nodes.ts:66` -> `SceneNode.group/tone`). Box colour: `scene-svg.module.css:73-150` (`.hubBlock[data-tone]`, `.hubRule[data-tone]`),
legend swatch `navigator.module.css` `[data-tone]`. Group names are data (the demo uses Hydrocarbons, Halogen compounds, Oxygen compounds,
Nitrogen compounds); no code names them.

## Verdict on the STOP conditions

- Edge model is "one drawn edge per (from family, to family) with its count and reactions": yes. No new layout engine needed.
- Item 6 needs no schema/version change: additive optional uiState part, tolerant parser, precedent in 7.1b to 7.6.
- No ADR contradicts the decisions (ADR-037 "overview does not expand" is untouched; ADR-044 will supersede nothing, it adds).
- Carry on.

## Design consequences (the smallest set)

1. Focus view is DERIVED (pure, `features/navigator/map-view.ts`): `mapView(scene, nodesCounts, {focusId, chapterMode, ...})` returns the edges
   to draw, each with a role (`makes`/`madeFrom`/`pair`), faded node ids, loop lines, pair merges. The Scene itself (layout, export parity) is unchanged.
2. Renderer additions (additive optional props of `SceneSvgProps` and `ViewportScene`, recorded as an Amendment): `edgeMarks` (tone, made-from dash,
   decorative flag), `fadedIds`, `onNodeHover`. The `Scene` / `SceneEdge` contract is untouched.
3. Chapter: a `map` store (chapter id, show-Unclassified), saved in `navigator.map`; the pipeline merges the chapter into the request filters (`topicIds`); chapter list from `chaptersOf`.
4. "See those compounds": core function over `candidatesTo(UNCLASSIFIED)`; Studio-only lazy dialog.
