# Step 8.3 fact sheet (Part B, no code)

Written from the tree at 219994a plus the Part A working changes. File:line are from that tree.

## 1. How the edition is decided and where it already branches

- Build: `vite.config.ts:70-71` reads `ORN_EDITION` (default `study`; `studio` under vitest), `vite.config.ts:142` defines the
  literal `__ORN_EDITION__`. `scripts/edition.mjs:15` sets `ORN_EDITION` for `build` / `preview` / `dev`.
- Runtime: `src/app/edition.ts:11` `EDITION` ('studio' only when the literal is exactly 'studio'), `edition.ts:13` `EDITING`
  (a constant the bundler folds). `pageTitleOf` / `editionMarker` (`edition.ts:20-23`).
- Places that already branch on it:
  - `src/app/window/modes.ts:50-51` Workbench and Review rail items only when `EDITING`.
  - `src/app/window/window.tsx:293` `{...(EDITING ? { history: services.store } : {})}` (top bar and phone bar history).
  - `src/app/window/dataset-info.tsx:58` `base = EDITING ? undefined : app?.dataset` (Study only: published dataset).
  - `src/app/window/dataset-info.tsx:133-136` `studyUpdateDue` (`!editing`); `study-update.tsx` (Study only notice).
  - `src/features/inspector/model/study-model.ts:201` `forAuthors = edition === 'studio'` (author section of the inspector).
  - `src/features/inspector/model/map-inspector-view.ts:131` bucket `authorsLine` only for `studio`.
  - `src/app/window/{editors-access,editor-commands,drafts-ui,canvas,palette-commands}.ts*` editing entry points.
- There is NO existing "what chrome does a student see" rule: every author piece in item 2 is shown in both editions today.

## 2. Author / developer pieces a Study visitor sees today

Desktop (D) and phone (P). All come from `window.tsx` (shell slots) unless noted.

| Piece | Source | D | P |
| --- | --- | --- | --- |
| Status bar "Saved (revision n)", "Findings: E/W/I/Review", "Workers: ...", "Storage: not persistent", "Automatic snapshots: ..." | `status-parts.tsx:20-45` (`StatusLine`), words in `banners.ts:160-210`; mounted `window.tsx:340-346` (footer, `shell.tsx:149`) | yes (footer) | inside More > Status dialog (`phone-parts.tsx:170-181`) and the one-line alert (`PhoneAlert`) |
| Storage WARNING "The browser did not grant persistent storage ... Export a backup" | `banners.ts:139-141` (`storage_refused`), dismiss state `panels.storageNoticeDismissed`; shown by `Banners` (`status-parts.tsx:50-`); the text itself comes from `services/flows-core.ts:66` | yes | counted in the "n notices" bar |
| "Layout note: ..." | `banners.ts:126`, set at `services/chem-layout.ts:94` | yes | counted in "n notices" |
| "Imported n records from <file>." (first load of the published dataset, auto import) | `features/data-exchange/words.ts:150`, shown as a toast by `ImportNotices` (`data-exchange/notices.tsx`); the auto import is `use-import-actions.tsx:56` (`auto: true`) | toast | folded in the "n notices" bar (`phone-parts.tsx:135`) |
| Phone "n notices" bar | `phone-parts.tsx:128-146` (`PhoneNotices`), count = banners + boot lines + drafts + update + toasts | - | yes |
| Phone More sheet "Dataset: species: ..." counts | `phone-parts.tsx:92-95` + `record-counts.tsx` | - | yes |
| Phone Status dialog "Storage: not persistent" line | `phone-parts.tsx:170` mounts `StatusLine` | - | yes (More > Status) |
| Rail item "Dataset" | `modes.ts:49` (`MODES`), shell rail `ui/shell/shell.tsx` | yes | not a tab |
| "Unanchored reactions (n)" | `features/navigator/navigator-canvas.tsx:263` (desktop button), `families-tab.tsx:62-69` (phone Families tab section), panel `unanchored-panel.tsx:37`; palette command `palette-commands.ts:146` | yes | yes |
| Map line "Selected: Alcohols, class hub, ..." | `features/navigator/navigator-selection.tsx:18-21` (`found.ariaLabel` from `render/scene/aria.ts`, kind words `aria.ts:16` "class hub", counts); live region follows it | yes | the line is not drawn on phone (`family-page.tsx:177` is the family page's own line) |
| "Exam scope: All (no exam scope)" | label `app/window/exam-scope-selector.tsx:47`, first option `exam-scope.ts:8` (`ALL_LABEL`), option labels `exam-scope.ts:44` (name + status words) | top bar | More > Exam scope (`phone-parts.tsx:88-91`) |
| Review pill "Not yet reviewed" | `features/navigator/family-card.tsx:20-23` (`REVIEW_MARK`) drawn at `family-card.tsx:125-` (every reaction card, the family page, the inspector card, the arrow rows' cards); author facts `inspector/provenance.tsx:85` (Studio only: author section) | yes | yes |
| Outcome words "exclusive" / "major" / "minor" | made in core: `core/graph/selectivity-word.ts:16`, `family/groups.ts:53`, `family/card.ts:71`, `full-equation.ts:159`; drawn by `navigator/family-card.tsx:93` (caption under a product), `render/equation/term-view.tsx:91` (equation words; quantifier "both/all"), `inspector/view-reaction.tsx:96,113` (author view) | yes | yes |
| Rail "Navigator" vs phone tab "Map" | `modes.ts:48` ('Navigator'), `features/navigator/phone-tabs.tsx:16` ('Map') | rail | tab |
| Other things found | `PanelsStatus` / `NavigatorStatus` notices ("Selection, expansion and zoom are not saved ...", `panels-status.tsx`, `navigator-status.tsx:21-45`) inside the status bar; `BootLines` (boot notices, `banners.ts:146-155`); `StudyUpdateNotice` (a Study feature for the visitor, kept); "Open the Unanchored reactions" palette entry | | |

## 3. Telling a visitor's OWN imported data from the published dataset

- The published load is an AUTO import: `use-import-actions.tsx:56` calls `model.openBlob(..., { auto: true, onApplied })`
  (`import-model.ts:62,148,174,290`). A visitor's own file goes through `openFile` (`import-model.ts:295`, `auto: false`,
  from the picker or a drop, `use-import-actions.tsx`).
- What is persisted today: `uiState.studyDataset` `{ sha256 }` (`dataset-info.tsx:112`), the sha of the last PUBLISHED dataset loaded.
  It is written only by the auto import, and is NOT cleared by a later own import, so it cannot tell the two apart.
- Records carry `provenance.importBatchId`, and the import batches store holds the reports, but neither names the source as "published".
- Answer: add ONE new tolerant `uiState` key `studyOwnData` `{ at }` (no schema, import format or persistence version change: `uiState`
  keeps unknown keys, `persistence/boot-checks.ts:16`, `uiStateValidators` is optional) written when a non-auto import is applied
  (`import-model.ts:148` path), and cleared when the published dataset is loaded over it ("Load the study dataset", auto import).
  A tab-level mirror makes it true at once. This is not a schema change, so no STOP. (A decision of mine: listed under REVIEW REQUIRED.)

## 4. Where review status is read and every place the pill is drawn

- Read: `FamilyCard.reviewStatus` (built in `core/graph/family/card.ts`) from the record's `review.status`; `REVIEW_MARK` maps it
  (`family-card.tsx:20-23`).
- Drawn: only `family-card.tsx:125` (`FamilyCardView`), which every card uses (family page, inspector reaction card, arrow rows, examples).
  The Studio author facts (`provenance.tsx:85`, "Review: Not yet reviewed") are in the author section and stay.
- Lists and pages that name a reaction (Reactions list rows, search results) do not draw a review mark today; "Review status" is a filter
  facet only (`reaction-explorer/reactions-view.tsx:104`).

## 5. Specs that read a string from item 2

Study build: `tests/e2e/study-edition.spec.ts` (the only spec on port 4174; first-load notice, status, storage).
Studio build (renames only, plus anything reading "Navigator", "Exam scope", "All (no exam scope)"): found by grepping `tests/e2e` and `src`
for each string at the time of the edit (see the PROGRESS entry for the exact list of changed specs and reasons).
