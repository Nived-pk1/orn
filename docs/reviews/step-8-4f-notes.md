# Step 8.4f notes

START: HEAD 71ff193 clean, stash empty. Speed check (5e7 loop): 228 ms (start).

## Part 1

### M1

- RED 2026-11-12 `npx playwright test tests/e2e/map-phone-first-view.spec.ts --project=chromium` (speed 227 ms) -> 4 failed, before any source edit.
  BEFORE (left margin px, whole columns): Pixel 7 fixture 132 / 1; Pixel 7 demo 124 / 1; iPhone 14 fixture 24 / 2; iPhone 14 demo 144 / 1. Stack 65 x 216 (round 48 px buttons).
- RED 14:41 `npx vitest run src/features/navigator/phone-fit.test.ts` (speed 227 ms) -> 3 failed (phoneFit missing), before the source edit. Old test 'the slide is only to the right' replaced by the zoom test (M1 changes the rule: left or right, margin <= 24).
- prettier --write on touched files reformatted whole files (not prettier-clean at HEAD): diff noise, per the 'prettier --check on every file you touch' rule.
- GREEN M1: map-phone-first-view 4 passed. AFTER (left margin px / whole columns): Pixel 7 fixture 24 / 2; Pixel 7 demo 24 / 2; iPhone 14 fixture 16 / 2; iPhone 14 demo 16 / 2. Stack now 48 x 196 (one card, 40 px buttons, 44 px hit area). phone-fit.test 18 passed. `phoneFit` returns {box, clear}; FreeAreas writes data-stack-clear on the map area (fallback case: none seen in these four).
  Old unit test "the slide is only to the right" replaced (M1 allows left or right; reason: new rule). Select uses the existing list-checks icon (an own icon name cost initial bytes).

### M2 / M3 / M4

- RED 14:54 `npx playwright test tests/e2e/map-phone-stack-clear.spec.ts --project=chromium` (speed 232 ms) -> Pixel 7 + iPhone 14 landscape 'family selected, panel open' failed (words under the stack); portrait and the first views pass; before the M2 source edit.
- RED 15:09 `npx vitest run src/features/navigator/free-areas-rule.test.ts` -> (see below) before the source edit. CAUSE (M2): measured by probe: the landscape panel (394 x 272, as tall as the map) is classed as a BOTTOM bar by shape (w >= h), so insets.bottom = 280 and the free height is negative: phoneFit returned the whole content unchanged (clear = true). Also the stack/pane moved after the measure (data-inspector, a transition): measure again on data-inspector and transitionend/animationend.
- RED 15:18 free-areas-rule.test 'a control that sits right beside such a column' (stack at the panel edge classed LEFT by its middle: insets.left 407 + right 408 -> negative width -> phoneFit returned the content unchanged) before the source edit.
- GREEN M2: map-phone-stack-clear 4 passed; free-areas-rule.test 16 passed (3 new red-first cases; the 'bar beside the column' case was added after the e2e showed the bar pulled right by my first fix: disclosed). Fixes: isColumn (panel is a side control), besideColumn (stack hugging the panel = right side), remeasure on data-inspector + transitionend/animationend.
- RED 15:29 map-landscape-icons.spec (pixel check) -> 'Chapters: the icon paints more than one colour' Received 1, both phones, before any source edit (computed styles and mask files are fine: the icon is not painted).
- CAUSE M3 (probe, screenshot): landscape.css '> nav > button > span' (meant for the label) also hit the icon span (aria-hidden): width/height 1px + clip-path: the icon never painted (computed styles, mask file and box size looked fine; only pixels showed it).
- GREEN M3 (map-landscape-icons 2 passed) and M4 (map-landscape-panel-head 2 passed; data-chip-row / data-head-text attributes added in study-inspector.tsx + map-views.tsx, CSS in landscape.css). RED lines above (M3 pixel check Received 1; M4 title y 100 < 123.8 / 102.6 < 136.2).

### L

- RED 15:40 `npx vitest run src/app/window/exam-scope-selector.test.tsx` before the source edit (chip + menu expected; native select present).
- L1 exam chip: unit red above (exam-scope-selector.test 5 failed) then 12 passed; window tests updated (exam-window, scope-window, phone-window, study-chrome-window, window.test: the native select -> the menu, old LOOK, same behaviour). e2e specs moved to kit helpers chooseExam/examChoices/expectExamId/examChip (13 files). exam-chip.spec written after the source (disclosed); break-and-restore (chip class removed) -> desktop test failed, restored. Removed the lazy phone ExamChip + its tests ('Change exam' dialog look): the phone bar now has the menu chip in both editions, More keeps Show/Version/provisional (part='rest'). pick() also sets asked(true).
- RED 15:57 `npx vitest run src/features/search` -> palette-look.test (module missing) + rows.test (48 > 36) before the source edit (L2).
- L2 palette: unit red above, then search tests 60 passed (palette-look table, rows 36 px, RowLook/CommandRow in palette.tsx). palette-rows.spec written after the source (the rows.test red covered the height; disclosed), green.
- RED 16:01 `npx playwright test tests/e2e/reactions-look.spec.ts --project=chromium` (speed 229 ms) -> 'a pill' Received 0 (filter buttons were boxes) before the source edit (L3).
- GREEN L3 reactions-look.spec 1 passed; reaction-explorer unit 38 passed (one test changed: the dot is now first in the row's inner line).
- RED 16:05 family-header-look.spec -> 'no tinted block' Received rgb(230, 244, 234) (speed 232 ms) before the source edit (L4).
- GREEN L4 family-header-look.spec 1 passed; navigator-family.test changed (the group is now 'Family · <group>' in the label: new header pattern). L5: More = quiet IconButton (more-horizontal), same name 'More' and dialog.
- RED 16:10 `npx vitest run src/ui/primitives/toast-folded.test.tsx` before the source edit (L6 toast action icon).
- RED 16:13 rail-weights.spec -> 'the other labels' Expected 400 Received 500 before the CSS edit (L6).
- GREEN L6: toast icon (toast-folded.test 5 passed), rail-weights.spec passed (item labels 400, active 500, Collapse 400; group labels were already --text-2 12/600).
- M1: Select icon = list-checks; its tooltip title dropped for bytes (the accessible name stays 'Select').
- SIZES (fresh builds): Study 383,414 / Studio 387,369 (limits 383,510 / 387,380). Reached by: no test-only data attributes (expectExamId reads the chip text), no extra tooltips, Select = list-checks icon, chip look by CSS selector (no new Menu prop), inspector header by structural CSS (no data attributes), simpler pick(), no setAsked/no-exam guard in the chip. The phone chip is shown even when the data has no exam (the desktop select always was).
- RULE CONFLICT (CLAUDE.md §10) 'prettier --check on every file you touch' vs 'files at most 400 lines': the repo has NO prettier config and its files are not prettier-clean at HEAD (0 of 6 sampled files clean at any print width); default prettier expanded 7 files past 400 lines (window.test 337->599, palette.tsx 216->419, kit.ts 276->466 ...). Resolution used (smallest): prettier on NEW files only; existing files keep their dense style (my first prettier --write was undone by a three-way merge: base = prettier(HEAD), ours = HEAD, theirs = mine; 88 local conflict hunks resolved to my side, so those hunks only are prettier-shaped). REVIEW REQUIRED: say whether the rule should be dropped or a prettier config adopted in its own step.
- check #1 (default workers, 773 files, 8525 tests, 9m59s): 2 failed css-scale (raw values 50% / 3px / 10px / 2px 5px): fixed with tokens + one reasoned exception (phone float card 3px; the old round-button 50% exception removed).
- check #5 green (773 files, 8525 tests, 9m43s). 3-engine e2e started 16:57, speed 230 ms, 63 spec files.
- 3-engine e2e done: 69 failed / 610 passed (2.3h). Chromium 17 failed; most are tap timeouts 'waiting for visible, enabled and stable' on a family box (suspect M2 re-measure loop in free-areas.tsx). STOP before deploy until diagnosed.
- speed check before rerun: see line above
- fixes after e2e: examChoices waits for menu closed (race); exam-first-run chip name + chooseExam replaces the old Change-exam card; compare-8.4d phone header locator .first() (cards' headers are on the page).
- phone-family (Pixel 7) 'PCC card above the peek' FAILS AT HEAD 71ff193 too (baseline worktree ../orn-base): not caused by 8.4f; reported.
- speed 232 ms; rerun of Chromium failures (compare-8.4d, compare-8.4e, exam-first-run, exam-editors, fluid-feel, full-map, map-free-areas, map-landscape, map-phone-marks, map-room, review-queue)
- map-landscape Pixel 7: hint pill centred in full map width ran under the panel (hidden at HEAD by timing); fixed in landscape.css (centred in the free part). review-queue: second family re-read after the first tap.
- speed 231 ms; rerun Firefox: compare-8.4e family-header-look family fluid-feel full-map-table full-map landscape-storage-line map-free-areas map-landscape map-phone-fit map-phone-marks map-phone-titles; WebKit: compare-8.4d compare-8.4e exam-first-run fluid-feel frame full-map-table full-map map-fit map-free-areas map-landscape map-phone-marks map-phone-titles review-queue
- BASELINE (HEAD worktree) run of the still-failing FF/WK specs; speed 227 ms
- Firefox: the 15 still-failing specs fail identically at HEAD baseline (pre-existing). WebKit: 13 of 17 match baseline; map-fit has 2 extra (checking).
- Remaining failures (Chromium 1: phone-family; Firefox 15; WebKit 15 incl. map-fit 1280/1920) are IDENTICAL at the HEAD baseline: pre-existing, not 8.4f. Two WebKit map-fit failures of the first run (1366, demo) were a count() race; spec now waits for either button.
- speed 235 ms before the full Chromium run
- full Chromium: 433 passed, 10 failed; 6 (mechanism-pictures x2, narrow-width, outcome-groups, record-pictures x2) + phone-family fail identically at HEAD baseline. Re-running exam-editors, map-focus, map-fit.
- map-focus phone spec tapped family 01 by coordinates: now phoneFamily (passes). exam-editors/map-fit flaky in full run, pass on rerun.
- menu.module.css: the chosen-item tick was a broken character ('¹3' in HEAD, shown by the exam chip menu): now content '\2713'.

## Part 1 screenshots (screenshots/compare-8.4f/, each opened)

- phone-first-view-fixture.png: one compact float card (4 icon buttons, 48 px wide) at the right; first column at a 24 px margin; the bar holds the chip "All exams", search and ⋯.
- phone-first-view-demo.png: same card; the demo's first column at 24 px (Alkynes, Ethers, Ketones, Esters), no box text under the card.
- phone-landscape-panel-beside-map.png: icon column shows icons; the panel head is chip row (Class, review chip, prev/next), then "Family 02" on its own line, then the summary; the hint pill sits in the free part of the map, not under the panel.
- exam-chip-desktop.png: the exam chip is a pill with a chevron, beside File and the bell; the reference puts its chip at the right too (no breadcrumb in ours: unchanged).
- exam-menu-desktop.png: "All exams / JEE Advanced / JEE Main" radio menu, the chosen one bold with a tick at the right (the tick was a broken character in HEAD, fixed here).
- exam-menu-phone.png: the same menu under the phone chip; this fixture has no exams, so it holds "All exams" only.
- palette.png: rows are 36 px with an icon at the left, a group header "Go to" (12/600), the focus ring on the first row; the reference menu has key hints at the right, the palette shows them only on rows that have a key.
- reactions-cards.png: pill filter chips, cards with the review mark and caveat chip beside the title; the toast covers the lower card (its normal place).
- reactions-compact.png: rows with the review mark first, name and one equation line, kind and examples below, a chevron at the right; denser than cards.
- family-header.png: label "Family · Oxygen compounds" with its group dot, title and formula, one summary line, type chips, then "Made from" and "Turns into" as labelled chip groups with dots; no tinted block.
- phone-top-bar.png: mark, title, Studio badge, exam chip, search and ⋯ in one row (the reference has no Studio badge; ours is the author build).
- Study deployed: reaction-navigator version 59d9ef19-dec1-4af3-8b6f-631ff0bde339; live curl 200 (index and chem worker); speed 231 ms before the live specs.
- LIVE Chromium (Study 59d9ef19): 40 passed, 4 failed (equation x2, structures x2: drawings 'Drawing the structure...' not finished); re-runs: the same specs failed repeatedly for a few minutes, then passed 5/5 with NO code change; a probe showed first drawing at 3-325 ms and the same Study build passes locally. Treated as a transient live condition after the deploy; disclosed.

## STATE AT STOP (2026-11-12, user closed the session)

- Part 1 committed: 779be49 (on master, NOT pushed). Docs (PROGRESS, plan row, PROJECT_STATE) are in that commit and say "deploy pending".
- Study DEPLOYED: reaction-navigator 59d9ef19-dec1-4af3-8b6f-631ff0bde339.
- Live specs on Study: Chromium 40 passed + 4 transient failures that cleared on re-run (see above); WebKit 43 passed, 12 skipped, 0 failed.
- STILL TO DO for Part 1 (in this order): (1) `npm run build:studio` then `npm run deploy:studio`; (2) Access check: curl -sI the studio URL must redirect to cloudflareaccess.com (not 200 with the app), and the Study URL must answer 200; (3) record both Worker versions in docs/PROJECT_STATE.json (`releasePreview` Study = 59d9ef19..., `studioPreview` = the new one) and in PROGRESS; set the plan row to "Part 1 done, deployed"; (4) commit those docs; (5) `git push origin master`; (6) add the line "Part 2 next" here and write the Part 1 report. Then STOP (break). Part 2 (D1-D7) is a later session.
- Housekeeping: a git worktree of HEAD 71ff193 lives at ../orn-base (node_modules there is a junction to ../orn/node_modules). Remove with `git worktree remove --force ../orn-base` (the junction is removed with it; do not recursively delete through it).
- Baseline failures (identical at 71ff193, not 8.4f): see PROGRESS "Step 8.4f, Part 1", Checks.

- Part 2 next. Part 1 finished 2026-11-13: Studio c37e39e2-53d1-4a1d-b127-efbf2e0d5a04 deployed, Access check 302, Study 200.
