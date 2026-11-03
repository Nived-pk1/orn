# Step 8.1 fact sheet: the inspector today (Part B)

Written before any inspector code changed. Paths are under `src/features/inspector/` unless a path says otherwise. "Both" = Study and
Studio; "Studio" = only when the host wires `editNames` (the Studio edition). Level numbers are the `LevelSection level=` of today's
code (2 to 5); "header" is the part above the levels.

## B1. Every line the inspector shows today

### Header (every kind) — `inspector.tsx`
| Line | From | Level | Edition |
|---|---|---|---|
| Back / Forward buttons | inspector.tsx:82-87 | header (phone: full part) | both |
| Title (record name) | inspector.tsx:112 | header | both |
| Kind word ("species", "named reaction"...) | inspector.tsx:116, model/describe.ts:14-37 | header | both |
| "Findings and checks" badge list (E/W/I counts, chemistry check word) | inspector.tsx:117-128, model/findings.ts | header | both |
| Edit / Edit names, Delete..., Duplicate, New specific reaction from this one | inspector.tsx:129-139 | header (phone: full part) | Studio |
| "Show its reactions" (species, class, reagent, named reaction) | inspector.tsx:140-146 | header (phone: full) | both |
| "Show in Reagents" | inspector.tsx:147-153 | header (phone: full) | both |
| "Show in Named reactions" | inspector.tsx:154-160 | header (phone: full) | both |
| "Show in Mechanisms" | inspector.tsx:161-167 | header (phone: full) | both |
| "How to make it" (species, class) | inspector.tsx:168-174 | header (phone: full) | both |
| Place actions: "Show on map", "Open family", "Show in family", "Open page" | model/places.ts:37-60, inspector.tsx:175-183 | header (peek) | both |
| Status line: canvas note, or "<name> has no place in this view." | inspector.tsx:98-99, 184-188, model/places.ts:30 | header | both |
| Arrow reactions block ("Reactions on this arrow") | arrow-reactions.tsx:38 | header | both |
| "In chapters: <links>" / "No chapter yet" (Study leaves out "No chapter yet") | in-chapters.tsx:32-48 | header (lazy chunk) | both |
| Pictures "Pictures of this <kind>" (PICTURE_KINDS) | view-pictures.tsx:91-102, views-other.tsx:23 | before L2 | both |
| "Show full equation" disclosure, one scheme per outcome group, "Names" switch | equation.tsx:21-50, view-reaction.tsx:143 | before L2 (reaction) | both |
| L5 "Provenance, findings and raw record": findings list, "No findings for this record.", Record ID, Origin, Created, Updated, Import batch, Legacy trace, Review, Lifecycle, Confidence, Reviewed, Why review is required, Raw record | provenance.tsx:17-90, inspector.tsx:196 | 5 | both |

### Reaction — `view-reaction.tsx`
| Line | From | Level |
|---|---|---|
| Scope | :148 | 2 |
| Example of <general> | :149-153 | 2 |
| Also called | :154 | 2 |
| Purposes | :155 | 2 |
| Equation (generalized text) | :156 | 2 |
| Reversibility; Reversibility note | :157-158 | 2 |
| Named reactions; Transformations | :159-160 | 2 |
| Mechanism (links, or "Mechanism class: ..." / "No mechanism recorded for this reaction") | :55-70, :161 | 2 |
| Reaction types | :162-166 | 2 |
| Examples (n) of a general reaction (closed disclosure) | reaction-examples.tsx:28 | 2 |
| Participants list (name, role, primary substrate, quantities, "as written") | :170-180 | 2 |
| Outcomes list (label, selectivity, products with role) | :181-188 | 2 |
| Stages (kind, conditions, As written, participants); Condition variants (label, conditions, stage, participants, note); Outcomes in full (selectivity, isomer group, regiochemistry, stereochemistry, note, yield, mechanism, why, concepts, variants, note, products) | :192-221, :99-132 | 3 |
| Related reactions (groups, "None found for: ...", "The list is cut at n of m reactions"), Relationships written by a person | related.tsx:52-134 | 3 |
| Regio/Stereo/Chemoselectivity, Limitations, Study notes, Notes, Difficulty, Mechanisms, Concepts, Prerequisites, Mechanism classes, Intermediates, Mapped reaction, Citations, Tags | :226-251 | 4 |
| Caveats that target the record | connections.tsx:18-20 | 4 |
| Curriculum: Topic mappings, "Scope under each exam version" | curriculum-facts.tsx:82-112 | 4 (via Connections) |

### Species — `view-substance.tsx`
Formula (entered), Formula (derived from the structure), IUPAC name, Common names, Also called, Kind, Charge, Classes (:29-37) L2;
Structure as entered, Stereo form, Stereochemistry note, Aromaticity, Isotopes, property rows, Acid-base notes (:41-55) L3;
"Reactions that use it (n)" + "No reaction takes it as a participant or makes it." (:86-89) L3; Study notes, Notes, citations/tags (:58-62) L4;
Caveats (connections.tsx) and Curriculum (curriculum-facts.tsx) L4.

### Class — `view-substance.tsx`
Formula, General formula, Kind, Parents, Examples, Description (:124-130) L2; SMARTS, R-group note, Also called (:135-137) L3;
Members (n) + "No species is listed as a member.", "Reactions that use this class or its members (n)" + "No reaction names this class...", "n members were not scanned" (:106-113) L3;
Study notes, Notes (:143-145) L4; Caveats, Curriculum L4.

### Reagent — `view-substance.tsx`
Formula, Families, Species, Classes, Description (:159-167) L2; Component (role), Profile: <label> (conditions, Behaviour) (:171-183) L3;
Study notes, Notes (:189-190) L4; Caveats, Curriculum L4.

### Named reaction, concept, transformation, caveat — `view-knowledge.tsx`
- Named reaction: Also called, Family parents, kinds, Difficulty, Summary (:75-79) L2; Typical conditions, Concepts, Prerequisite concepts, Reactions (+ "No reaction is listed here.", "under its children"), Children (:84-88, :26-32, :56) L3; Study notes, Notes (:92-93) L4.
- Concept: Kind, Also called, Parents, Difficulty, Summary (:115-120) L2; Reactions that use it (:124) L3; Study notes, Notes (:128-129) L4.
- Transformation: Also called, From, To, Equation, Carbon chain, Bonds changed, Description (:146-152) L2; Reaction SMARTS, Concepts, Reactions (:157-160) L3; Study notes, Notes L4.
- Caveat: Kind, Importance, The rule, The exception, When it applies (:180-184) L2; Trigger conditions, Explanation, Concepts, Targets / "It names no target." (:189-198) L3; Notes L4.
- All four also carry Curriculum L4.

### Mechanism — `view-mechanism.tsx`
Also called, Mechanism classes, Summary, Variants list / "No variant is written." (:163-178) L2; per variant: When it applies, Rate law, Note, steps (Kinds, Description, Species, Bonds formed, Bonds broken, Electron movements, Rate-determining, Reversible, Stereochemical event, Note) (:57-85, :112-127), "Reactions without a variant" (:195) L3; Concepts, Study notes, Notes (:201-203) L4.

### Route, topic, relationship, reference — `view-organisation.tsx`
Route: Purpose, Target, Description, steps (:25-46) L2; Concepts (:57) L3; Notes L4. Topic: Kind, Also called, Parent, Order among its siblings, Summary, Children (:83-94) L2; records mapped (:98) L3; Notes L4. Relationship: Type, From, To, Read both ways, Kind of reverse, Note (:117-128) L2; Sources L4. Reference: Kind, Authors, Year, Edition, Publisher, Identifier, Address, Notes (:159-170) L2; Cited by (:175) L3; Sources L4.

### Exam things, assets, presentation — `view-curriculum.tsx`, `view-asset.tsx`, `view-presentation.tsx`
Exam: Short name, Authority, Notes, Versions (:31-42) L2. Exam version: Exam, Status, Year, Effective from/to, Notes, Units (:61-69) L2; Coverage per unit (:73-89) L3. Topic mapping: Topic, Record, Role, Note (:110-117) L2. Exam relevance: Record, Exam, Versions, Scope (override), Importance, Note (:133-151) L2. Asset: Role, Alt text, Caption, Attached to (:60-71) L2; Media type, Size, Width, Height, File name, SHA-256 (:77-82) L3. Navigator anchor: Family, Label, Order, Cell, Group, Tone (:20-27) L2. Reaction scheme: Reaction, Condition variant, Stage numbers, Attached image drawn instead, placements (:42-72) L2. Saved view: View, Exam, Exam version, Scopes, Topics, Reagent families, Text filter, Anchors (:85-100) L2. Display choice: Record, As a node, Label mode, Abbreviation (:111-116) L2. Every one also has L5.

All of these are shown in both editions today. In 8.1 Study shows only the new layout; every line above is kept in Studio under "For authors".

## B2. Today's phone sheet
`ui/shell/phone-sheet.tsx` (142 lines) with `phone-sheet.module.css`. Three heights: closed, PEEK (`height: auto`, `max-height: 35dvh`, `min-height: 7.5rem`, css:26-31), FULL (`top: var(--top-bar-height)`, css:34). The inspector marks what the peek hides with `data-sheet-full` (css:80 hides `[data-sheet-full]` at peek); today the peek therefore shows: title, kind, badges, place actions, the status line. Drag: pointer down/up on the head, a vertical move of at least `SWIPE_PX = 40` (`heightAfterSwipe`, :25-29, :107-122); the handle button and a tap on the record name toggle peek/full (:123-130, :138-142); Escape closes (:103-105); focus in/out (:70-83). No CSS transition exists today on the sheet. **The new peek needs no drag change**: the peek content is only a matter of which parts carry `data-sheet-full`. Opening/snapping animation: 8.1 adds a 200 ms transform/opacity transition (none under `prefers-reduced-motion`). STOP condition not triggered.

## B3. Hero material per kind
| Kind | Existing drawing | Where | Note |
|---|---|---|---|
| reaction | The card (`reactionCard` core + `FamilyCardView`) lives in `features/navigator` (`reaction-card-host.tsx`), which the inspector may not import (no cross-feature imports). The inspector's own `EquationScheme` (`render/equation`) draws the same equation from `fullEquationsOfReaction` | equation.tsx:21 | Hero = the first full-equation scheme, compact ("Show full equation" stays below it). Using the card itself would need a render slot passed by the host (not built) — see REVIEW REQUIRED in the report |
| species | `DepictionPort` (`ports.depictions`) via `createDepictionBinding`; formula text `formulaOf` (model/describe.ts:56) | render/svg | Formula under the picture through the existing formula formatter |
| class | general formula text (`generic.generalFormula`), plus a drawing if `generic.structure` exists | view-substance.tsx:125-126 | |
| reagent | `formulaText`, `families` | view-substance.tsx:159-160 | |
| named reaction | none of its own; the first GENERAL reaction of the named reaction | view-knowledge.tsx:26 | else no hero |
| mechanism | its pictures, else the species of step 1 (the 7.7 boxes, view-mechanism.tsx:61-67) | | |
| concept, caveat, transformation | `PICTURE_KINDS` first picture (`core/editing/picture-kinds`) | view-pictures.tsx | "tap to enlarge" = the existing `Dialog` + `FullPicture` |

Formula formatter with subscripts: the term view of `render/equation` (`term-view.tsx`) and the formatter used by `rich-text.tsx`.
No hero needs data the app cannot read. STOP condition not triggered.

## B4. The inspector in the initial chunk (Study build, `build-report/study.json`)
In `assets/index-*.js`: arrow-reactions 2.5 kB, env 0.4, inspector.module.css 2.2, inspector.tsx 9.9, lazy-views 2.1, levels 1.7, model/describe 1.3, findings 1.3, focus 1.4, places 1.5, provenance 4.4, rich-text 2.9, use-bridge 2.5, views 0.2: **34.4 kB rendered** (about a third of that gzipped). In their own lazy chunks: `views-other` (17 modules: every kind view), `view-pictures` (4), `in-chapters`, `standalone`, `conditions`. Author-only parts that can move out if room is needed: `provenance.tsx` (4.4 kB) and `levels.tsx`.

## B5. Tests that read inspector headings/labels (to update first)
69 files match the pattern list of the step prompt (`Level n`, `What happens`, `Show full equation`, `Findings and checks`, `Pictures of this`, `In chapters`, `Show its reactions`, `How to make it`, `Open family`, `Open page`, `Edit names`, `data-sheet-full`, `Related reactions`, `None found for`, `Reaction summary`, `Species identity`, `has no place`):

- unit: src/app/window/{curriculum,editor,inspector,knowledge,navigator-family,navigator-interaction,navigator-keyboard,new-reaction,phone-family,profile-conditions,reaction-editor,shared-fields}-window.test.tsx; src/core/editing/schema-words.test.ts; src/core/graph/family/groups.test.ts; src/core/graph/related/related.test.ts; src/features/chapters/chapters-view.test.tsx; src/features/inspector/{chapters-lazy,equation,in-chapters,inspector-knowledge,inspector-pages-entry,inspector-place-line,inspector-precursors-entry,inspector-reaction-words,inspector-reactions-entry,inspector-reagents-entry,view-pictures,view-record-pictures}.test.ts(x), model/focus.test.ts; src/features/{mechanism-explorer,named-explorer,navigator,workbench}/*.test.tsx; src/ui/shell/phone-sheet.test.tsx; tests/property/related-reactions.test.ts.
- e2e: tests/e2e/{as-written,canvas-keyboard,canvas-touch,chapters,equation-long-name,equation,exam-editors,examples-fold,follower-search,full-equation-group,inspector-views,inspector,knowledge-editors,mechanism-pictures,navigator,outcome-groups,phone-editor,phone-equation,phone-outcome-groups,phone-precursors,phone-sheet,phone,precursor-explorer,reaction-editor,reaction-explorer,reaction-from-scratch,record-pictures,shared-fields,species-editor,stages-arrow,study-edition}.spec.ts and author-kit.ts.

Many of these match only on words the new layout keeps ("Show its reactions", "Open family", "Edit names"). The exact lines are found by running the unit suite after the layout change and by grepping the specs for the old headings before any e2e run (the 8.1 close part).
