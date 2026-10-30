# Step 7.3a - fact sheet and content audit (Part B)

Written 2026-10-30 before Parts C, D and E; read only, no product code. `file:line` is as of HEAD 2d4c07e.

## B1 Generic and specific reactions

- **The field.** `instanceOfId: ReactionIdSchema.optional()` at `src/core/schema/reaction.ts:219`; a registered reference with
  `onDelete: 'detach'` at `src/core/schema/references.ts:119`. Rule RXN-013 at `src/core/validation/rules/reactions-more.ts:34-46`:
  only a specific reaction can be an instance, the target must be generic, no chains. A new "specific from generic" draft sets it
  (`src/core/editing/templates.ts:57`). The reverse lookup is `indexes.referrersOf(G)` filtered by `path === 'instanceOfId'`.
- **Where "Example of" and "Examples (n)" are drawn today (inspector only).** "Example of" is a fact row in
  `src/features/inspector/view-reaction.tsx:154-156`. "Examples (n)" is `src/features/inspector/reaction-examples.tsx:30` (a heading and
  a `RecordList`, open, sorted by folded name then id, line 21-26). No card, row or count outside the inspector mentions either.
- **Every list where a reaction's card or row appears** (all show an example as an ordinary card today):
  1. Family page sections ("Reactions of", "Preparation of"): `src/core/graph/family/study.ts:100-135` builds one `FamilyCard` per
     reaction per family group (`cardOf`, `card.ts:83`); cards sorted by folded name, then id (`study.ts:131`); rendered as items in
     `src/features/navigator/family-items.ts:44` and `family-page.tsx:149` (`FamilyCardView`).
  2. Reactions view, Cards and Compact: `src/features/reaction-explorer/results.tsx:40-70` (rows from the core filter
     `src/core/graph/reaction-filter/filter.ts`; Compact uses `reactionCard` + `compactEquationOf`, lines 50-51).
  3. Precursors "Made directly from": `src/features/precursor-explorer/direct-block.tsx:36-60` (groups from
     `src/core/graph/precursor/direct.ts:42`).
  4. An arrow's reaction list: the inspector of an overview arrow ("Open these n reactions in Reactions") and the arrow's family
     pair; the list itself is the Reactions view filtered by From + To family (ADR-042 E7).
  5. Route search results list reactions as steps (`src/features/precursor-explorer/model.ts:96-110`); unchanged by Part C.
- **Counts.** Map arrow chip, List view and accessible names count DISTINCT REACTIONS of a family pair: `reactionsOf(candidates)` at
  `src/core/graph/navigator/pairs.ts:50`, `EdgeBundle.reactions?` and `GraphNode.reactionCounts?` (`pairs.ts:55-74`,
  `NodeReactionCounts`); the rule is the 7.2a part A amendment (PROGRESS, "overview reaction counts"). A family section's count is
  `reactionCount: landing.size` (`study.ts:134`) and per group `cards.length` (`study.ts:144`); the page total is `seenReactions.size`
  (`study.ts:163`). The Reactions view count line is `countLine` (`src/features/reaction-explorer/model.ts:27`).

## B2 Arrow text

- **The function.** `arrowTextOf(reaction, context)` at `src/core/graph/arrow-text.ts:164`. It returns `{ above, below }` parts of kind
  name / formula / condition / separator / more. Placement of each participant: the scheme's placement, else the role default
  (`ROLE_POSITION`, line 77). The carried substrate and spectators are left out; a `reactant` is written ABOVE the arrow, first in its
  stage, only when `shownAsNode(ref)` is false (water, `entity_display`), lines 170-180 (`UNDRAWN_REACTANT_SIDE`, line 90).
- **Stages today.** Participants are ordered by stage index (`stageOf`, line 167), then rank, then record order. A "1." separator part is
  added ONLY when the scheme says `showStageNumbers` and there are 2+ stages (line 173, 190). Each stage's condition parts
  (`conditionPartsOf`, `condition-text.ts:89`) go on the BELOW side after the stage's own participants (loop at lines 196-203); a
  variant overrides one stage field by field only when the arrow has exactly one variant (`effectiveParameters`, line 145). Each side is
  capped at 3 participant parts and 3 condition parts, plus one "+n more" part (`cap`, line 117).
- **Reactants that are NOT the carried substrate.** In the demo Grignard (CH3MgBr + ethanal, then H3O+) the carried substrate is the
  ethanal; CH3MgBr is a second reactant. It is written on the arrow only if the card does not draw it as a node. The card draws every
  reactant that `shownAsNode` accepts as a node on the left (`family-card.tsx`, equation from `fullEquationOfGroup`), so CH3MgBr is a
  structure, not arrow text; it is not on the arrow. H3O+ (workup_reagent) is above the arrow in stage 2.
- **Callers (every one goes through `arrowTextOf`, so one change reaches all):**
  1. Family card and the Reactions/Precursors card: `src/core/graph/family/groups.ts:55` (`arrowText` of each outcome group), drawn by
     `src/features/navigator/family-card.tsx:32-60` (`DownArrow` on a phone, `Arrow` on desktop) and `:74` (the condition line).
  2. Heading of a group with several groups: `headingOf` and `conditionWordsOf` (`groups.ts:20-32`) read only the `condition` parts of
     `below`.
  3. "Elsewhere" condition words on a card: `src/core/graph/family/study.ts:113-119` (condition parts of `below`, joined).
  4. Full equation: `src/core/graph/full-equation.ts:171` (`omitReactants: true`, `omitRefs`, `omitFormulas`); the sentence form
     `arrowWords` (`full-equation.ts:84`) reads ALL parts except `more`; drawn by `src/render/equation/scheme-arrow.tsx:18` and
     `scheme-down-arrow.tsx:33`. The inspector uses `fullEquationsOfReaction` (`full-equation.ts:197`, `src/features/inspector/equation.tsx`).
  5. Route step conditions line: `src/features/precursor-explorer/model.ts:96-110` (takes the group's `arrowText` from the card; the
     local `arrowTextOf` there only joins the parts as text) drawn at `route-card.tsx:27-31`.
  6. Reactions compact row and Precursors compact row: equation text only (`compactEquationOf`, `family/compact.ts`), no arrow text.
  7. The navigator overview scene: the port is stubbed (`src/features/navigator/scene-ports.ts:42`, `arrowTextOf: () => undefined`), so
     the map has no arrow text (ADR-037); `build-scene.ts:75` and `label-sizes.ts:44` would draw it.
- **Which participants a card draws as nodes.** `shownAsNode` (the entity-display port): everything except records whose
  `entity_display` says never a node; the card draws the carried substrate and the other reactants as structures on the left
  and the products on the right.

## B3 Review page, imports, topic mappings

- **Review page.** `src/features/review/review-page.tsx`; rows and order from `queueRows` in `src/core/editing/review-queue.ts`
  (every record whose status is not "verified"; one compact row each). Today's groups: by KIND (the kinds list is built at line ~63 from
  the rows); filters: kind, status, has errors, has warnings, origin, tag (state at lines 38-43). Row fields: `ref`, `kindWords`,
  `origin`, `tags`, findings counts.
- **Record meta.** `provenance: { origin ('user'|'seed'|'import'|'legacy_import'|'generated'), createdAt, updatedAt, importBatchId?,
  legacy? }` (`src/core/schema/primitives.ts:156-172`). `importBatchId` EXISTS in the schema but nothing writes it into a RECORD: the only
  writers of `importBatchId` are the quarantine rows (`src/io/import-apply.ts:87`, `import-ports.ts:33`) and `duplicate.ts:25` removes it
  from a copy. An imported record keeps the `origin`, `createdAt` and `updatedAt` of the FILE it came from (the demo's records are
  `origin: seed`, all dated 2026-09-26).
- **Import journal.** `ImportBatchRow { id, createdAt, report }` (`src/persistence/contracts.ts:122-126`); the report keeps `fileName`,
  `appliedAt`, `format`, `mode`, counts per kind, conflicts, excluded and `snapshotId` (`src/io/import-apply.ts:50-78`) and is saved by
  `storeImportReport` (`import-apply.ts:95`) into the `importBatches` store; `listImportBatches()` is newest first
  (`src/persistence/aux-stores.ts:100`). The report holds COUNTS and the id maps of copies and conflicts, NOT the ids of the records an
  import added, and the records carry no batch id, so today a record CANNOT be tied to the import that added it (the pre-import snapshot
  could be compared, but only for the newest batch and only while the snapshot is kept). Retention: no pruning of batch rows was found in
  IndexedDB; the session-only memory store keeps at most `limit` batches and drops the oldest (`src/app/services/memory-store.ts:42-47`).
  Undo import restores the `pre_import` snapshot of the newest batch (`restore-service.ts:76-96`).
- **Topic mappings and derived scope.** `TopicMapping { topicId, target: RecordRef, role core|supporting|enrichment }`
  (`src/core/schema/curriculum.ts:91-100`); ANY record kind can be a mapping target (`RecordRefSchema`). Topics are a tree
  (`TopicSchema`, `parentId`, `topicKind` subject|chapter|section|topic|subtopic, line 72). An exam version has `units[]` with
  `topicCoverage[] { topicId, coverage }` (`curriculum.ts:42-50`, unit has `title`). Exam scope of a record:
  `createScopeOf` (`src/core/graph/scope.ts:96`): explicit `exam_relevance` override, else `mappedScope` (the record's OWN mappings, each
  topic plus its ancestors, checked against the version's coverage, `scope.ts:50-66`), else a one-hop prerequisite rule for CONCEPTS only
  (`scope.ts:69-80`), else `unmapped`. No kind inherits scope from another kind (the family scope reads its reactions,
  `navigator/family-scope.ts`). In the demo only reactions are mapped (31 mappings, all targets reactions; 27 topics; two exam versions,
  each with 11 units).

## B4 Content audit (for the reviewer)

a. **Observations for tests (colour, precipitate, gas, smell).** No field. An outcome has `label`, `selectivity`, `products`, `regiochemistry`,
   `stereochemistry`, `yieldText`, `rationale`, `note` (`src/core/schema/reaction.ts:153-170`). The text would go in `rationale` or `note`
   (rich text), shown in the inspector's outcome list (`view-reaction.tsx`); nothing shows it on a card. A caveat or a concept could
   also carry it.
b. **Polymers and biomolecule projections.** Structures are CXSMILES or molfile in the RDKit worker (`src/chem/rdkit/`). A bare RDKit
   probe (2026-10-30, `@rdkit/rdkit` 2026.3.6) read `*CC* |Sg:n:1,2:n:ht|` and drew it; the app has no test or UI for repeat units, so
   what the sanitiser keeps and whether the bracket and `n` show is unproven. Fischer, Haworth, chair and Newman are NOT drawable (RDKit draws
   a skeletal 2-D graph only); they would be pictures (`PICTURE_KINDS` records: species, class, reagent, reaction, transformation, named
   reaction, concept, caveat, mechanism; the inspector shows them, step 7.1a).
c. **Pictures vs the 25 MiB publish limit.** The published file is ONE file, `dataset.orn.json` (pictures embedded as base64) or
   `dataset.ornpkg`; `MAX_PUBLISH_BYTES = 26,214,400` is checked on that whole file (`src/io/publish.ts:32,52`). The demo is 333,492 bytes
   (`data/seed/demo.orn.json`, no pictures). Room for about 25.9 MB: roughly 64 pictures of 300 kB in the embedded JSON (base64 adds a third:
   400 kB each) or roughly 86 in an `.ornpkg` (pictures stored raw), less the records. A single picture is capped at 20 MiB
   (`MAX_ASSET_BYTES`, `src/core/schema/assets.ts:21`).
d. **Charges, radicals, carbocations, carbanions, resonance.** Charges and radicals in a structure are drawn by RDKit (the probe drew `C[CH2+]`,
   `C[CH2]` and `C[CH2-]`). Intermediates are modelled as `reaction.intermediates[]` with kinds carbocation, carbanion, radical, carbene,
   nitrene, benzyne, enol, enolate, tetrahedral, ylide, complex, isolable_intermediate (`reaction.ts:173-`), optionally with a structure; and
   in mechanism steps (`src/core/schema/mechanism.ts`). Resonance forms: no model; they can only be several species or a picture.
e. **LIMITS** (`src/core/schema/primitives.ts:10-40`): name 300; label 200; shortText 2,000; richText 50,000; tag 64; inlineStructure
   20,000; molfile 1,000,000; url 2,048; aliases 64; tags 64; citations 64; idList 256; properties 64; participants 64; stages 16;
   conditionVariants 16; outcomes 32; products 32; intermediates 32; mechanismVariants 16; mechanismSteps 200; stepSpecies 24;
   electronMovements 64; routeSteps 64; syllabusUnits 200; topicCoverage 500; attachments 64; embeddedAssetBase64 28,000,000;
   reviewReasons 32. Import (`src/io/contracts.ts:10-25`): JSON 50 MiB; package 200 MiB; asset 20 MiB; records per import 200,000;
   package entries 65,535; JSON depth 64; string 1,000,000; quarantine raw 64 KiB; preview findings 2,000.
f. **Trends and orders (basicity, acidity, boiling point).** No record kind holds an ordered list. A `concept` (rich text) or a `caveat`
   can state it in words; a `relationship` is pairwise only (`alternative_to`, `competing_with`, `reverse_of`, `commonly_confused_with`,
   `mechanistically_related`, `prerequisite_of`, `follows`, `contrasts_with`, `related_to`; `relationship.ts:11-21`), so an order of n
   items would be n-1 pairs with no notion of "more than".
g. **Stereo.** Drawings: RDKit draws wedges and E/Z from the structure given (the probe drew `C[C@H](O)CC` and `C/C=C/C`); there is no
   wedge editing. R/S and E/Z labels are not drawn on a structure; CIP counts are computed for checks (`src/chem/contracts.ts:10-33`).
   Names: a species `stereo` text field (`species` schema, "2R", "E", "cis") must agree with the structure (CHEM-006); outcome stereochemistry is
   `OutcomeStereoSchema` (`reaction.ts:142`: retention, inversion, racemisation, syn/anti addition, diastereomeric mixture ...).
h. **One species under two names.** Aliases (`aliases` up to 64) on the species. The editor's duplicate check CHEM-009 finds two species with
   the same canonical SMILES from the worker (`src/chem/checks/duplicates.ts`, `src/app/services/duplicate-check.ts`; it is a
   finding, with a "Merge" flow); an import does not compare structures against existing records (it keys on ids and the import
   report's conflicts), though the checks that run afterwards will report CHEM-009 once both species are in.
i. **A generic reaction whose product class depends on the substrate class (RMgX + HCHO / RCHO / R2CO).** Today: one generic reaction per
   substrate class (three generic reactions, each with `class` participants and a product class: primary / secondary / tertiary alcohol),
   linked with `related_to` or `commonly_confused_with`, or one generic reaction with three outcomes whose `conditionVariantIds` is
   empty, which cannot say "outcome 1 only for HCHO". A condition variant lists participants it applies to (`appliesTo`,
   `arrow-text.ts:100`), so a variant per substrate with the matching participant is possible but a variant means "conditions", not "which
   substrate". The clean way is three generic reactions.

## B5 Browsing by chapter (for 7.3b "Chapters view")

Without search a student reaches: a **reaction** through the family page cards (Navigator), the Reactions list, Precursors, and the
inspector links; a **species** or **class** through the overview hubs (a class or species that is a family), the Reactions/Precursors
pickers (those are searches in a box), and links in the inspector; a **reagent** only through links in a reaction's inspector and the
Reactions filter "Substance"; a **named reaction** through the Reactions filter "Named reaction" and links; a **concept**, **caveat**,
**mechanism** and **transformation** only through the inspector links of a record that names them (reaction: mechanism place, concepts;
no list anywhere). The modes Reagents, Named, Mechanisms and Syllabus are placeholders marked "Phase 7" (`src/app/window/modes.ts:26-30`);
the `src/features/syllabus`, `named-reactions`, `mechanisms` and `reagent-explorer` folders are empty. What exists for Syllabus: the
core projection `syllabus` (`src/core/graph/syllabus/build.ts`, a bounded topic tree with records under each topic, a cross-mapped record
once under each topic), the exam version -> units -> topic coverage data (`curriculum.ts:42-50`), the exam-scope selector, derived scope
and `outside` marks; counts and gaps are not drawn anywhere. Topic mappings can target ANY record kind; only reactions are mapped in the
demo. Derived scope exists for any kind from its own mappings, with the one-hop prerequisite rule for concepts. The Study edition starts on
the Navigator overview on desktop (the default mode, `src/app/window/window.tsx:148`) and on the "Families" tab on a phone (ADR-039); a
visitor with no data first sees "Load the study dataset" (`src/app/window/first-run.tsx`, `dataset-info.tsx:39`).
