# Step 7.6 fact sheet (Part B; docs only, no product code)

Line numbers are those of HEAD 5b9c6f4 plus the Part A work of this step. Nothing here needs a schema change. No STOP condition holds (see the end).

## B1. The curriculum records
- `ExamSchema` `src/core/schema/curriculum.ts:22-30`: `name`, `shortName?`, `authority?`, `notes?`.
- `ExamVersionSchema` `:54-67`: `examId`, `label`, `year?`, `status` (`official | provisional | draft`, `EXAM_VERSION_STATUS` :52), `effectiveFrom?`, `effectiveTo?` (ISO dates), `units[]` (max 200, `LIMITS.syllabusUnits` `primitives.ts:35`), `notes?`.
- `SyllabusUnitSchema` `:42-50`: `id`, `code?`, `title`, `officialText?` (rich text), `topicCoverage[]` (max 500, `LIMITS.topicCoverage` :36). `TopicCoverageSchema` `:36-40`: `topicId`, `coverage` (`included | partial | excluded`, `COVERAGE_LEVELS` :33), `note?`.
- `TopicSchema` `:72-85`: `name`, `aliases[]`, `parentId?` (tree, HIER-001), `topicKind` (subject, chapter, section, topic, subtopic; :70), `order` (sibling order, fractional), `summary?`, `notes?`.
- `TopicMappingSchema` `:91-99`: `topicId`, `target` (any record ref), `role` (core, supporting, enrichment), `note?`. `ExamRelevanceSchema` `:106-117`: an explicit override of the derived scope.
- Rules that apply (`docs/VALIDATION_RULES.md:115-119`): CUR-001 effectiveFrom after effectiveTo (ERROR); **CUR-002 a topic appears twice in one version's coverage (WARNING)**; CUR-003 relevance versions not of the exam (ERROR); CUR-005 an `official` version needs a citation (REVIEW_REQUIRED). HIER-001: the topic tree has no cycle.

## B2. Derived exam scope today, and what "covered" means
- `createScopeOf(indexes, examId, examVersionId)` `src/core/graph/scope.ts:88`; the mapping step `mappedScope` `:46-67`: the topics a record maps to PLUS ALL THEIR ANCESTORS (`ancestorsOf('topic', ...)`) are checked against the version's coverage; one covered topic (included OR partial) anywhere in that set makes the record `official` (`enrichment` when every mapping is an enrichment mapping). **Coverage is therefore inherited downward**: a covered chapter covers its sections and their records. An `excluded` entry only counts as "not covered"; it does NOT remove a record whose other topic or ancestor is covered.
- Two units, one topic: `coverageMap` `scope.ts:39-43` keeps the LATER entry (the CUR-002 case, a warning). The Chapters list differs: `coverageOf` `src/core/chapters/list.ts:34-48` skips `excluded` and keeps the STRONGER of included/partial across units. Part C follows the Chapters list (also the brief's rule: included > partial; an excluded row only when no unit covers the topic). The two differ only for a topic listed twice, and only when an `excluded` entry comes last; `partial` and `included` give the same scope answer (both "official"). The demo has no such case.
- The syllabus projection (row 2.6, `src/core/graph/syllabus/build.ts`, GRAPH_SEMANTICS §7) is the topic tree plus the records mapped DIRECTLY to each topic; it carries no coverage and no counts. This step does not use it (it is a canvas graph; this view is rows).
- The active exam scope: `uiState.exam` (`navigator-persist.ts:74,153-156`), `ActiveExamStore` (`ui/state`), `{ examId, examVersionId } | null`. The explorers' "Only <exam version>" keeps a record that is not `outside` (`createScopeOf`).
- Agreement check: a topic the syllabus lists as covered has `official` records by `mappedScope`; a topic under a covered ancestor has `official` records although no unit lists it (inherited). The view counts records "at the topic or below", the same closure. Edge case: a topic listed `excluded` under a covered chapter still gives `official` by the scope, while the view lists it under "Not in this syllabus" (naming the topic, with no count). The demo has no such case (its only excluded row is a whole chapter). Recorded as REVIEW REQUIRED, not a STOP.

## B3. The chapters core: how it counts
- `buildChapterIndex(state)` `src/core/chapters/build-index.ts:36`: a record's chapter is the NEAREST topic of kind chapter at or above each topic it maps to (`chapterOfTopic` :41-51, depth capped by `MAX_TOPIC_DEPTH = 32` :9); an unmapped concept takes the chapters of what it is a prerequisite of, one hop, as supporting.
- `chaptersOf(state, index, options)` `list.ts:55`: study records only (`studyRecords` :27, the nine groups of `CHAPTER_GROUPS` in `types.ts`); a concept with no text is NOT counted (`isUnwrittenConcept`, `written.ts`; Studio counts it apart); reactions are counted as CARDS (`foldExamples`: an example folds under its general reaction within one list); each record once per chapter; counts per group split core and other. Words: `countsWords` `src/features/chapters/model.ts:28-38` ("2 concepts · 6 reactions · 1 named reaction", "Nothing mapped yet").
- It cannot count for an arbitrary topic as it is (it counts per chapter through `chapterOfTopic`). **Function to reuse:** `studyRecords`, `isUnwrittenConcept`, `foldExamples` and the group keys are reusable; Part C adds `topicCounts` in the new `src/core/syllabus` with the SAME rule for any topic: a record counts for topic T when one of its mappings is at T or below it (the ancestor closure of its mapped topics), plus the unmapped-concept fallback. The count words move into `core/chapters` (`countsWords`, re-exported by the feature's model) so both views say them the same way. For a chapter topic the numbers equal the Chapters list's (a test checks every demo chapter). One difference, nested chapters: the Chapters list counts a record for the nearest chapter only; the closure also counts it for an outer chapter. The demo has no chapter inside a chapter.

## B4. The demo's curriculum shape
- Exams: JEE Main, JEE Advanced. One version each: "JEE Main 2026 (provisional)" and "JEE Advanced 2026 (provisional)", status provisional, year 2026, no effective dates. 11 units each, no `code`, no official text. Every unit covers exactly ONE topic, always a CHAPTER (e.g. "Hydrocarbons" -> `top_hydrocarbons`).
- Coverage: Main: 9 included, Polymers partial, Molecular rearrangements EXCLUDED. Advanced: 9 included, Polymers and Molecular rearrangements partial. No topic listed twice. No coverage note.
- Topics: 27 (1 subject, 11 chapters, 15 sections). Covered by no unit: the subject and all 15 sections (they inherit from their chapter). Chapters with no record at or below them: Biomolecules, GOC, Polymers: three gap rows in the demo (Main and Advanced alike).
- Mappings: 31, all of reactions (27 core, 4 supporting); 13 section topics and 2 chapter topics are mapped to directly. 1 `exam_relevance`.
- The demo has one version per exam: the compare tests and specs build a second version as their own data.

## B5. Sizes
- Up to 200 units x 500 coverage rows = 100,000 rows in one version; the tree depth is capped at 32 in the chapters core. Real curricula are tens of units. The view pages: units 20 at a time, rows 60 per unit ("Show 60 more"), 60 rows per group in the compare section; the totals and counts always cover everything, never only the visible part. Every walk is bounded by the depth cap.

## B6. Modes, rail, phone, palette, uiState
- `MODES` `src/app/window/modes.ts:42-52`: "Syllabus" is added after "Mechanisms" (`SYLLABUS_MODE`), both editions. The phone Explore select (`explore-switch.tsx`, `EXPLORER_MODES` modes.ts, `ExplorerKind` `ui/state/explorer-state.ts:13`) gets a sixth choice. Palette: `palette-commands.ts:137-140` pattern, a new "Open Syllabus". Lazy chunk: `canvas.tsx`.
- uiState: `navigator-persist.ts:44,98,171,197,263`: a sibling key `syllabus`, tolerant parse, `damaged` names (`syllabus.versionId`, `syllabus.compareId`, `syllabus.gapsOnly`), like `chapters`, `named`, `mechanisms`.

## B7. Chapter links
- The Chapters view opens a chapter by id: `openChapter` `src/app/window/chapters-entry.ts` (`ChaptersState.open(chapterId)`, `ui/state/chapters-state.ts`). The state has no section or anchor field and the page groups by KIND, so **opening at a section needs new state: not built**. A row for a lower topic links to its chapter (`chapterOfTopic`), as the brief allows.

## STOP conditions checked
- Showing coverage or a diff needs a schema change: NO.
- A record's topics cannot be read from the data: NO.
- The derived scope and the coverage give two answers the user would see for the same record: NO for the demo and ordinary data. Two edge cases (a topic listed twice with `excluded` last; an excluded topic below a covered chapter) are listed under REVIEW REQUIRED.
