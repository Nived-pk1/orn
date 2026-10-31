# Step 7.3b fact sheet (Part B; docs only, no product code)

Line numbers are those of commit e8e906a.

## B1. Topics, exam versions
- Topic: `src/core/schema/curriculum.ts:72-85`. Fields: `parentId` (tree, :78), `topicKind` (:79), `order` (:81, fractional siblings), `summary`.
- `TOPIC_KINDS = subject | chapter | section | topic | subtopic` (:70). Nothing forces a chapter under a subject; the chapters core
  (`src/core/chapters/build-index.ts`) takes "the nearest topic of kind chapter at or above a mapped topic", else the top-level topic.
- Demo topics: `src/test-support/demo/curriculum.ts:61-63` (one subject "Organic chemistry", `CHAPTERS` as `chapter`, `SECTIONS` as `section`).
- Exam version: `curriculum.ts:54-67`; `units: SyllabusUnit[]` (:42-50) each with `topicCoverage[] = { topicId, coverage: included|partial|excluded }`
  (:35-40, `COVERAGE_LEVELS` :33). CUR-002: a topic covered twice, the later entry wins (`src/core/graph/syllabus/build.ts:38`).
  Coverage of a chapter = the best coverage among its units' entries (`src/core/chapters/list.ts` `coverageOf`).

## B2. Topic mapping
- `TopicMappingSchema` `curriculum.ts:90-101`: `topicId`, `target: RecordRef` (any kind), `role` = core | supporting | enrichment (:88).
- A record may map to many topics (cross-chapter). CUR-006 (`src/core/validation/rules/curriculum.ts:146`): a duplicate mapping
  (same target and topic) is a warning on the higher ID only. The chapters core keeps the STRONGEST role per record per chapter.

## B3. `src/core/graph/syllabus/build.ts`
- It is the `syllabus` GRAPH projection (nodes and membership edges, a closure around focused topics, bounded by INV-22 truncation).
  Not reusable for a chapter list or page: the page needs counts and ordered groups, not a graph. The chapters core reads the indexes
  directly (`recordsInTopic`, ancestors) and is its own pure module (`src/core/chapters/`). The graph projection stays untouched.

## B4. Summary renderers a chapter-page card can reuse (all injected by the app, features never import each other)
| kind | existing renderer | where |
|---|---|---|
| concept, named reaction, transformation, caveat | text: `RichText` (`features/inspector/rich-text.tsx:108`); pictures: `RecordPictures` (`view-pictures.tsx:90`); fields: concept `summary` (knowledge.ts:109), named `summary` (:72), transformation `description` (:56), caveat `rule` + `statement` (:134-136) | inspector |
| reaction | `ReactionCardHost` (`features/navigator/reaction-card-host.tsx`, family card with folded examples, full equation) | navigator |
| mechanism | none as a card; `MechanismLevels` (`view-mechanism.tsx:136`) is the inspector view; the card is built new (title, variants, step count, Open) | new |
| species, class | `Structure` (`features/navigator/family-structure.tsx`, needs the FamilyEnv the card host supplies) | navigator |
| reagent | none; name and `families` (substances.ts:180) are plain text | new |
| route | `RouteCard` (`features/precursor-explorer/route-card.tsx:44`) draws a `RouteView`; `savedRoutesFor` (model.ts:142) builds one from a stored route; a by-id export is added | precursors |

## B5. Modes, phone tabs, first screen
- Mode list: `src/app/window/modes.ts:25-33`; the placeholder is `{ id: 'syllabus', label: 'Syllabus', unavailable: 'Phase 7' }` (:30).
- The mode is plain window state `useState(NAVIGATOR_MODE)` (`window.tsx:148`); it is NOT remembered across reloads. Default mode: Navigator
  in both editions. Canvas switch: `canvas.tsx:~60-90`.
- Phone: `PhoneTab = 'families' | 'map' | 'explore'` (`src/ui/state/navigator-stores.ts:210`); tabs drawn in `features/navigator/phone-tabs.tsx`;
  the saved tab omits the default (`navigator-persist.ts:212`). `window.tsx:149-157`: tab Explore = Reactions/Precursors mode, else Navigator.
- First screen: first run (no data) shows FirstRun (`canvas.tsx`); with data: desktop Navigator map, phone Families. No edition difference today.
