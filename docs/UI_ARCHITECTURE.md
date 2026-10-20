# UI Architecture

Package sections: **#11 Reaction Authoring Workbench**, **#12 Compound/Structure Authoring** (UI side), **#17 Graph Layout** (geometry), **#18 UI/UX**, **#19 Interaction Model**. Contracts: `src/render/scene/contracts.ts`, `src/layout/contracts.ts`, `src/core/commands/contracts.ts` (EditorSession).

## 1. Principles

- The UI is a **renderer and editor**. Components read canonical data through selectors and change it only by dispatching commands. No chemistry rule, reference handling or graph logic lives in a component.
- Every view is a projection (GRAPH_SEMANTICS.md). Switching views never changes data.
- Progressive disclosure: calm by default, depth on demand.
- Keyboard-complete, touch-capable, screen-reader-usable (§11).

## 2. Shell

```
┌ Top bar: search/palette (Ctrl K) · exam-scope selector · undo/redo · import/export menu ─────────┐
├ Mode rail ┬ Canvas (graph or list for the current view)                   ┬ Inspector          ┤
│ Navigator │                                                              │ (progressive, §9)  │
│ Reactions │                                                              │                    │
│ Precursors│                                                              │                    │
│ Reagents  │                                                              │                    │
│ Named     │                                                              │                    │
│ Mechanisms│                                                              │                    │
│ Syllabus  │                                                              │                    │
│ Workbench │                                                              │                    │
├ Status bar: save state · validation counts (E/W/I/Review) · read-only badge · truncation notice ┤
```

Breakpoints: ≥ 1280 px three panes (inspector 360–520 px, resizable); 900–1279 px inspector as an overlay drawer; < 900 px single pane, inspector as a bottom sheet, mode rail as a bottom bar. Diagnostics (findings, quarantine, snapshots, storage, performance) is a full-page view opened from the status bar.

## 3. Visual language

A textbook-and-journal aesthetic, not a dashboard. No gradients, glass effects, glow, emoji icons, or decorative illustration; square-ish corners (2–4 px; *2026-10-09, ADR-037: replaced by rounded corners, 8 px for cards and panels and 6 px for controls*); colour used sparingly and never as the only carrier of meaning.

- *2026-10-12 (step 5.9a review, follow-up c; planned for Phase 8, not built).* **Structure display: Skeletal / Show all atoms.** A setting saved in `uiState` (default Skeletal). "Show all atoms" writes every C and H through the chem worker's drawing options (the depiction options already given to the worker; no chemistry in the UI). Rings stay rings: benzene is never drawn as a chain. The depiction key includes the mode, so the two drawings of one structure are two cache entries and a switch never shows the wrong one.

| Token | Value | Use |
|---|---|---|
| paper | `#FCFCFB` | background |
| ink | `#16191D` | primary text, strokes |
| ink-2 | `#5A626B` | secondary text, minor edges |
| rule | `#D9DDE1` | dividers, grid |
| accent (selection) | `#2B4FD8` | selection, focus ring, active path |
| warning | `#B45309` | warnings |
| error | `#B42318` | errors |
| review | `#7A3FB0` | review-required markers |

Typography: IBM Plex Sans (UI and labels), IBM Plex Mono only for SMILES/formula inputs; bundled with Fontsource. Chemical formulas render with true subscripts from the FormattedText runs. Scale: 12/13/14/16/20/24 px; tabular numerals in counts.

Glyphs: **class hub** — text-forward block with a thick left rule and the generic formula; **species** — depiction (LOD ≥ 3) or name/formula; **reagent** — compact label chip; **reaction** — small junction dot (reaction-centric views) or the arrow itself (navigator); **concept** — italic outline label; **intermediate** — dashed brackets. Edges: major/exclusive heavy solid, minor dashed, trace light dotted, inferred dotted, relationship edges thin with a type label. Badges are small monochrome marks with text on hover/focus (caveat, mechanism, review, warning, outside scope, hidden neighbours).

Dark theme is ARCHITECTURALLY SUPPORTED via tokens; the required theme is light.

## 4. State ownership

| State | Owner | Persisted | Notes |
|---|---|---|---|
| Canonical records | `CanonicalStore` (core) | IndexedDB `records` | changed only by commands |
| Presentation records (anchors, schemes, presets, display) | `CanonicalStore` | `records` | canonical but layer 5 |
| Indexes, projections, findings, search index | derived services | never (caches only) | recomputable (INV-18) |
| Selection, focus, viewport, expansion, panel layout, filters, active exam version | Zustand UI stores | `uiState` (tolerant) | never in records (INV-10) |
| Authoring drafts | editor sessions | `editorSessions` | may be invalid |
| Hover, menus, transient input | component state | no | |

Zustand stores are small and sliced (selection, viewport, panels, filters, palette). Canonical data reaches React through `useSyncExternalStore` selectors with structural sharing, so unrelated edits do not re-render.

## 5. Views

| Mode | Purpose |
|---|---|
| Navigator | *2026-10-09 (ADR-037): three levels of detail.* (1) Overview map: families as hubs and plain arrows with their count, no arrow text, no expansion; (2) family page: one family as a readable page, a card per reaction with structures, reagents and conditions; (3) reaction detail: the inspector (steps 5.6a, 5.6b). Unclassified is a family; the Unanchored list stays |
| Reactions | Reaction-centric bipartite explorer around a focus |
| Precursors | "How can I make X?": backward exploration + route search panel |
| Reagents | Reagent → profiles → reactions; filter by family |
| Named | Named-reaction families, each with its reactions, mechanism and traps |
| Mechanisms | Mechanism variants and steps; which outcomes use them |
| Syllabus | Topic tree for the active exam version with derived scope, counts and gaps |
| Workbench | Authoring (§7, §8) and the review queue |

## 6. Rendering architecture

```
Projection (core, memoised) ──► LayoutRequest (sorted, seeded) ──► layout worker (ELK | fallback)
          │                                                              │
          └──────────────► Scene builder (pure, memoised) ◄──────────────┘
                                   │
                    SVG renderer (React, layered)   SVG/PNG export (same Scene)
```

- **Layers**: edges, nodes, labels, badges, overlay (selection, focus ring, marquee). Each layer is a memoised component keyed by Scene revision.
- **Viewport**: d3-zoom writes a single `transform` on the root `<g>` imperatively (ref + requestAnimationFrame). Pan and zoom never re-render React (60 fps budget).
- **LOD**: `LOD_THRESHOLDS` decide what each element shows (0 glyphs, 1 labels, 2 badges + condition text, 3 structures). Above `RENDER_BUDGET` visible elements, LOD is capped at 1 automatically (v6's "simplify mode" without a toggle).
- **Culling**: a uniform-grid spatial index over Scene bounds returns visible IDs for the viewport; only those mount.
- *2026-10-07 (step 5.4b review):* Phase 5 mounts the whole bounded Scene (at most 400 nodes / 800 edges). The grid index feeds the LOD budget and the depiction candidates. Mounting only the visible ids is the remedy if the 5.10b frame-rate measurement misses.
- **Depictions**: requested lazily from the chem worker for visible species at LOD 3, cached in `derivedCache`, shown via `<image href>` (SECURITY.md §2).
- *2026-10-02 (Phase 5 contract decisions):* Phase 5 keeps depictions in a memory LRU only; the persistent depiction cache in `derivedCache` is Phase 9.
- **Layout stability**: previous positions are sent as ordering hints; expansion adds nodes without reshuffling the rest; transitions animate 200 ms (none with reduced motion). Layout requests are cancelled when superseded.
- **Direction**: navigator and reaction explorer lay out left→right; precursor explorer right→left with forward arrowheads (GRAPH_SEMANTICS.md §5).
- *2026-10-07 (step 5.3, Scene contract amendment; Phase 5 contract decisions Q4, Q5):* `selected` and `focused` leave `SceneNode.state` (the overlay draws selection and the focus ring from UI state; `dimmed` and `onPath` stay). `Scene.truncation` is added and `Scene.revision` is the store revision of the projection it was built from (informational; memos key on object identity). `SceneEdge.labelAt` is added (arrow text and count sit at the route midpoint). A self-loop is a `SceneEdge` with `from === to`, drawn by the builder beside its node; it is not in the `LayoutRequest`. A bundle is one `SceneEdge` (id = bundle id) with `bundleSize` = its TOTAL. `depictionKey` comes from an injected port; names, formulas and arrow text come through ports as text, and `src/render/scene` never imports `src/chem` at run time. The text measurer is injected (note E6); `NodeSizes` travel from `buildLayoutRequest` to `buildScene`.

## 7. Reaction authoring workbench (#11)

- Editing opens an **editor session**: a draft copy that may be temporarily invalid, persisted every 2 s while dirty, with its own local undo/redo. The canonical store changes only on **Commit**, which runs L1–L3; ERRORs keep the dialog open with findings linked to fields. If the record changed in the meantime (`baseRevision` mismatch) the user sees a field-level comparison and chooses.
- Sections (collapsible, keyboard-navigable): Identity (name, aliases, scope, instance-of, purposes) · Participants (table: substance picker, role, coefficient, phase, strength, dry, quantity, profile, flags, stage) · Stages · Conditions and variants · Outcomes (per outcome: variants, selectivity, products with roles, regio/stereo, mechanism link, rationale) · Mechanism links · Classification (reaction types, mechanism classes, transformations, named reactions, concepts) · Curriculum (topic mappings, exam relevance) · Caveats · Relationships · Notes and citations · Presentation (scheme placements).
- **Editor sessions (ADR-040, step 6.1a):** the rules above are built in `src/core/editing` (pure) and kept by the app's session manager. Local undo/redo is bounded to 200 steps and coalesces edits to the same field within 1,000 ms; a conflict is decided per field by canonical text, not by the store's revision; one commit is one global history entry; every stored session is offered again at boot.
- **Live validation panel** beside the form; L4 results stream in as the chem worker finishes.
- **Quick entry**: a one-line text such as `ethanol + PCC (CH2Cl2) -> ethanal` is parsed into a draft (participants matched by folded name; unmatched names offered for creation; conditions marked `parsedFields`). It never commits without review.
- **Pickers** search by name, alias, formula and structure; they show kind, class and scope; "create new" opens a nested species/reagent editor session.
- **Templates and duplication**: "New specific reaction from this generic one" pre-fills `instanceOfId` and participants; "Duplicate" regenerates all nested IDs through the reference engine.
- **Review queue**: all REVIEW_REQUIRED findings grouped by reason, with bulk "mark verified" (an undoable command).
- *Step 6.3a (ADR-040 addendum, 2026-10-19):* the reaction editor builds Identity, Participants, Stages and Review (D1-D4); the other sections above stay read-only summaries until 6.4 (conditions, variants, outcomes), 6.5 (mechanism links, classification) and 6.6 (the rest). "Duplicate" and "New specific reaction from this generic one" move to step 6.7 (D7).
- *Step 6.3b (ADR-040 addendum, 2026-10-19):* participants are summary lines with an Edit toggle (one row open at a time; a finding opens its row); beside the findings (a collapsible "Preview" at the top on a phone, closed by default) the editor shows the reaction as its card shows it, built from the draft by the core 400 ms after the last edit; words instead of a drawing while the draft cannot be read; "No products yet" without outcomes.
- *Step 6.4a (ADR-040 addendum, 2026-10-20):* each stage shows one summary line of its conditions (the arrow's own builder) and opens a conditions form with every schema field (values as entered, "Not stated" absent); a field read from text says so and has Confirm (editing it also confirms it); condition variants are expandable summary lines that hold only their overriding fields; a variant an outcome names cannot be removed (outcomes: step 6.4b).

## 8. Compound and structure authoring (#12)

- Species editor: names (canonical, IUPAC, common, aliases, qualifier), kind, structure, formula, charge, stereo, aromaticity claim, classes, properties, notes, citations.
  *Step 6.2a (ADR-040 addendum):* the species editor has the sections Names, Identity, Structure, Formula and charge, Stereo, Aromaticity claim, Classes (search by name, kind and scope shown, SMARTS suggestions as chips) and Review (lifecycle editable, status read-only until 6.8); properties, notes and citations are shown read-only ("Editing arrives in step 6.6"). Entry points: "Edit" in the inspector, "New species" in the palette, in More on a phone and on the Workbench page; classes and reagents keep "Edit names" until 6.2b.
  *Step 6.2b (ADR-040 addendum):* the class editor has the sections Names, Identity (class kind; a family on the map is shown read-only), Parents (cycle-safe: the picker refuses the class itself and its descendants with the reason), Generic representation (generic formula and general formula with formula typography, a generic structure drawn from R-labelled CXSMILES by the structure panel with no formula derived, the membership SMARTS checked by the chem worker), Examples and Review; notes, description, tags and citations are read-only ("Editing arrives in step 6.6"). The record picker is one component for species, classes and reagents (kind and scope shown, count announced, a refused record shows its reason). Entry points: "Edit" in the inspector for classes, "New class" in the palette, More on a phone and the Workbench page.
  *Step 6.2b, reagents (ADR-040 addendum D3):* the reagent editor has the sections Names, Identity (ONE backing species through the species picker, OR components: species, classes or reagents with a role and an optional amount, never both, a component that would close a cycle refused with the reason), Families (the schema's 17 values as checkboxes), Classes, Profiles (named usage conditions with their own aliases: add, remove, reorder, edit label and aliases; their conditions are read-only until 6.6) and Review; description, notes, tags and citations are read-only. Entry points: "Edit" in the inspector for reagents, "New reagent" in the palette, More on a phone and the Workbench page.
- **Structure panel**: SMILES/CXSMILES text field (Plex Mono) or pasted molfile → debounced parse in the chem worker → depiction + derived formula/charge/stereo shown **beside** the entered values; "Use derived formula" is an explicit button. A drawing editor is ARCHITECTURALLY SUPPORTED behind `StructureEditor` (`src/features/workbench/structure-editor/`, Ketcher adapter, lazy-loaded).
- On save: duplicate check by folded name and canonical structure with "use existing / merge / keep both".
- Class assignment shows SMARTS-based suggestions (CHEM-007) as chips the user can accept; nothing is assigned automatically.
- Class editor: names, kind, parents (cycle-safe picker), generic formula/structure/SMARTS, examples.

## 9. Inspector and progressive disclosure

| Level | Shows |
|---|---|
| L1 | Name, kind, scope badge, one-line equation or formula, review/finding badges |
| L2 | Participants with conditions, outcomes with selectivity, stages |
| L3 | Mechanism, caveats and traps, relationships, related reactions (derived) |
| L4 | Curriculum mappings, exam relevance, references and citations |
| L5 | Provenance, legacy trace, findings detail, raw record (read-only JSON) |

The chosen level persists per user (uiState). Every record reference in the inspector is a link that focuses it in the current view.

## 10. Interaction model (#19)

Pointer state machine on the canvas: `idle → pressed → (moved > 4 px) panning | (500 ms still) context-menu | (released) click`. A click selects immediately (no double-click delay); a second click within 300 ms is a double-click and expands/collapses. Shift-click toggles multi-selection; drag on empty canvas with Shift draws a marquee.

| Key | Action |
|---|---|
| Arrow keys | move focus to the spatially nearest node in that direction |
| Tab / Shift+Tab | cycle focus through nodes in reading order; then out of the canvas |
| Enter | open in inspector; Enter again expands |
| Esc | close the topmost layer (menu → palette → inspector detail → selection) |
| + / − / 0 | zoom in / out / fit |
| F | focus the selection (centre and zoom) |
| E / C | expand / collapse the focused node |
| Ctrl/⌘ K | command palette |
| Alt+← / Alt+→ | back / forward through focus history |
| Ctrl/⌘ Z, Ctrl/⌘ Shift Z | undo / redo |
| Shift+F10 or context-menu key | context menu |

Touch: one-finger pan, pinch zoom, tap select, double-tap expand, long-press (500 ms) context menu. Focus history (Alt+←/→) is UI state and survives view switches.
- *2026-10-07 (step 5.4a, additive):* `SceneNode.box` (`BoxKind`: hub, species, reagent, member, overflow, unclassified) is added, because a member of a hub and a species outside one share a glyph but not a box, and the renderer needs the box for fonts and shape. `src/render/svg` draws the Scene in five memoised layers (edges, nodes, labels, badges, overlay) inside ONE root `<svg>` and ONE world `<g>`; selection and focus are props drawn by the overlay only; a depiction is only an `<image href>` served by a bounded LRU manager (500 keys) that is injected with its fetch, URL and timer functions.
- *2026-10-08 (step 5.5a review, items a, b, f, g).* (a) A layout edge may carry ONE label size and the result gives the label position; the Scene's `labelAt` comes from it (the fallback layout has no labels and keeps the route midpoint, said in its notice). (b) A layout that answered a request with no previous positions is followed once by a second request with that result as previous; only the second answer is drawn. (f) Arrow text and count badges have a paper-coloured outline under the glyphs (CSS class, no style attribute). (g) Until the inspector exists (5.6a) the inspector pane starts closed by default (a saved choice wins); the line naming the selection sits next to the canvas toolbar.

- *2026-10-11 (step 5.7, adapted to ADR-037; the reviewer's prompt).* The canvas is the overview of FAMILIES and arrows; the family page and the inspector are HTML and already keyboard-reachable. So: "expand / collapse" (E / C, double-click) now OPENS THE FAMILY PAGE (double-click, and `O`; `E` is an alias; `C` is not bound); Enter on a focused family shows it in the inspector, Enter again or `O` opens its family page. A click selects at once and the inspector PANE opens only when the 300 ms double-click window passes with no second click (the pointer state machine's own window; it replaces the 350 ms delay of step 5.6b). The keyboard moves between FAMILIES (arrow keys: the spatially nearest family in that direction; Tab / Shift+Tab: reading order, then out of the canvas); the arrows of a family are reached from its context menu ("To Aldehydes (3 reactions)", "From Alcohols (1 reaction)", each selecting that arrow). Focus mechanism: the drawing is ONE tab stop and keeps the DOM focus; the focused family is `aria-activedescendant` of the drawing (it must not re-render the node layer; measured in docs/PROGRESS.md). Esc closes, in order, the menu (Radix), the inspector drawer or sheet when focus is in it, then the selection. Multi-selection and the marquee (Shift-click, Shift-drag) move to Phase 6, where a bulk action first exists: nothing in Phase 5 is a silent no-op. One polite live region says the selection, an opened page and the zoom level in words.

## 11. Accessibility

- The graph canvas is a composite widget with a roving tabindex over nodes; each node exposes `SceneNode.ariaLabel` ("Ethanol, species, 3 reactions out, 1 hidden neighbour"). Edges are reachable from a focused node's context menu and inspector.
- A **List** toggle presents the current projection as an accessible, virtualised table (same data, same filters) — the fallback for screen readers and very large views.
- Status changes (saved, validation counts, truncation) are announced through a polite live region.
- WCAG 2.2 AA contrast; 2 px focus ring in the accent colour; hit targets ≥ 24 px (44 px on touch); `prefers-reduced-motion` disables animation; no information by colour alone (line style, shape and text always accompany colour).

## 12. Empty, loading and error states

First run offers "Load demo dataset", "Import v6 export" and "Start empty". Loading states are skeletons, never spinners over blank canvases longer than 300 ms. Truncated projections say what was cut and how to see more. Panels have error boundaries with "Reload panel" (PERSISTENCE.md §12).

- *2026-10-13 (step 5.10a review, REVIEW REQUIRED 1).* After the first-run screen, and after any import ends, focus moves to the page title (the `h1`), not to a heading inside the main region. This is the one focus target for those two moments.

## 13. Phone layout

*2026-10-16 (ADR-039, reviewer decisions).* Supersedes the < 900 px rules of §2 for phones only; the desktop and tablets (>= 700 px wide) render exactly as before.

- **Mode**: one hook, `useLayoutMode()` -> `'desktop' | 'phone'`, from `matchMedia`: phone when `(max-width: 699px)`, or `(pointer: coarse) and (max-height: 499px)` (a phone in landscape). The CSS uses the same two queries.
- **Shell**: one slim top bar (title "ORN", search button, "More" menu button). More holds File items, Exam scope, Dataset counts, About this preview, Status. No Undo / Redo on the bar (since step 6.1a they are in More: "Undo <label>", "Redo <label>"), no mode list, no keyboard hints. The status line shows only a one-line alert when something needs the user (save failed, storage not persistent, worker down, records set aside, quarantine); a tap opens Status. Notices and banners fold into one line ("2 notices") that expands on tap.
- **Home**: bottom tab bar "Families | Map | Search" (48 px, labelled icons, current tab marked), default Families, last tab remembered in `uiState`. Families = the List projection as cards grouped by family colour group (Hydrocarbons, Halogen compounds, Oxygen compounds, Nitrogen compounds, Unclassified, "Unanchored reactions (N)"): name, general formula, "N reactions"; a tap opens the family page. Search opens the existing palette full-screen.
- **Map**: no toolbar row, no permanent legend; round floating Fit and Legend (i) buttons (Legend opens a sheet). Pinch zoom, minimum = `FIT_FLOOR`. One tap on a family selects it and opens the sheet at peek; double tap opens the family page; long press keeps the context menu; a tap on an arrow opens the sheet with its reactions.
- **Inspector sheet**: a bottom sheet with peek (~35%: name, kind, key line, large main-action buttons such as "Open family", "Show on map"), full (all inspector content) and closed. Drag handle, swipe up / down, Close button, Escape closes; focus moves in on open and back to the tapped item on close; a non-modal region labelled by the record's name; the content above stays visible at peek. The same inspector content as the desktop.
- **Next (not built here)**: the family page on phone (single column, vertical reaction scheme); load-time fixes.
