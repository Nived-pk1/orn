# Step 8.4g notes (current; says where to resume)

START ok (2026-11-17): HEAD 0599d63 == origin/master, clean, stash empty. Part A session.

## FACTS (Part A)
- Views: `mode` is `useState` in `WindowContent` (src/app/window/window.tsx:186); ids in modes.ts (navigator, chapters, dataset,
  reactions, precursors, reagents, named, mechanisms, syllabus, settings, workbench, review). The phone tabs drive the mode
  (phone-tab-mode.ts) and `useFirstScreen` (first-screen.ts) may switch Map to Chapters once, when data arrives.
- Pages: chapters/reagents/named/mechanisms stores hold the open id (`chapterId`, `reagentId`, `openId`); openers exist:
  `openChapter`, `openReagent`, `usePageEntries().onNamed/onMechanism`. Family page: `navigator.ui.family.open` (hub class id);
  `openFamily` / `closeFamily`. Record selection: `inspectorPorts.ui.inspector` (history, `open(ref)`, `currentOf`).
- Record opening today: the palette's `show(ref,title)` in window.tsx (setMode map, inspector.open, openPane, then
  `placeOf(...).actions[0].run()` which focuses a family / opens a reaction's family page). The inspector's own history is separate.
- The record's "More actions" menu is `GoNext` (features/inspector/study-parts.tsx:115), only when the buttons overflow; the
  study inspector header is `study-inspector.tsx` (a lazy chunk). Studio uses the same layout plus `headerExtras`.
- Settings: `SETTINGS_MODE`, lazy `settings-host.tsx`; the pane stays open beside it today (the 8.4f Part 2 note).
- Error boundary: src/ui/primitives/error-boundary.tsx ("<label> stopped working: <detail>", "Reload panel").
- Toast: ToastProvider `docked` (desktop) / `folded` (phone) in window.tsx:139.

## LOG
- G1 address text: RED: `npx vitest run src/ui/state/address.test.ts` -> failed, module missing (1.8 s); green after src/ui/state/address.ts.
- G1 address and state: RED: `npx vitest run src/app/window/address-state.test.ts` -> failed, module missing (0.6 s); green after address-state.ts.
- G1 hook: RED: `npx vitest run src/app/window/use-address.test.tsx` -> failed, module missing (1.3 s); green after use-address.ts.
- G7 screens: RED: `npx vitest run src/ui/primitives/error-boundary.test.tsx src/app/window/not-found.test.tsx` -> 2 failed + file failed (2 s); green after the sources.
- G6 mail + menu: RED: `npx vitest run src/features/inspector/report-mail.test.ts src/features/inspector/record-menu.test.tsx` -> 2 files failed, modules missing (3 s); green after report-mail.ts, record-menu.tsx.
- Test setup: window-setup.ts clears the address before each test (each test is a fresh visit; the window now writes `#/...`). Not a loosened test.
- Address design (ADR-045): `#/<view>`, `#/<view>/<id>` (page of chapters/reagents/named/mechanisms; a reaction in Reactions), `#/<view>/<kind>/<id>` (map, reactions,
  precursors; `family` = class kind), `#/family/<id>`. Hook: ONE push per change (effect after the render that holds the new mode and the new store values),
  first address and addresses after Back/Forward/reload REPLACE. A bad/unknown address leaves the hash alone and shows NotFound until the reader goes elsewhere.
- G10 pane/crumb: RED: `npx vitest run src/app/window/settings-pane.test.tsx` -> 1 failed, expected 'closed' got 'open' (2 s); green after window.tsx/use-frame.ts.
- G12 Fit: RED: `npx vitest run src/features/navigator/map-toolbar.test.tsx` -> 2 failed (aria-pressed null; no tooltip words) (3 s); green after map-toolbar.tsx, button.tsx tip.
  (Desktop toolbar only; the phone's round Fit button is unchanged.)
- G8 Review find: RED: `npx vitest run src/core/editing/review-find.test.ts src/features/review/review-page.test.tsx` -> finder file failed (module missing) + 2 page tests failed (3 s);
  green after review-find.ts, review-page.tsx. The Kind filter already existed; its option words are now plural ("Reactions", "Compounds", "Classes").
- G9 Open placement: RED: `npx vitest run src/features/workbench/curriculum-lists.test.tsx` -> 1 failed (no "Open placement" button; checked by stashing the source) (3 s); green after curriculum-lists.tsx.
- G9 palette: RED: `npx vitest run src/app/window/placement-commands.test.ts` -> file failed, module missing (2 s); green after placement-commands.ts, palette-commands.ts.
  CONFLICT (REVIEW REQUIRED): SEARCH §1 says topic mappings are NOT indexed and a document never carries another record's text. So the placements are
  palette COMMANDS ("> Ethanol in Alcohols and phenols"), derived from canonical records, not search results of a plain query. Smallest amendment if plain
  search is wanted: SEARCH §1 allows a topic-mapping document titled from its two names, refreshed by fanout when either name changes.
- G1 Back to a plain view: e2e RED (app-essentials 'a record opened is one entry', Chromium, 1.6 min run: Back stayed on #/map/family/..); unit RED then green: address-state.test 'a plain view address shows no record'. G11 e2e test PASSED on the old source (NOT red): toast did not move the key rects with a family selected; not reproduced (needs the Imported toast on owner data) -> REVIEW REQUIRED, CSS left unchanged.
- CHECK A: npm run check green (default workers): 812 files, 8718 tests (after fixing a no-control-regex lint error in address.ts).

## STOP (2026-11-17): size over budget, nothing committed, nothing deployed
- `node scripts/initial-js-size.mjs` on fresh builds: Study 338,766 (was 335,677, +3,089), Studio 342,877 (was 339,636, +3,241). Budget +1,500 per edition. OVER by about 1,600.
- Rule: over -> STOP and report. Not done: size trim, 3-engine rounds, full Chromium run, screenshots, docs (PROGRESS, plan row, PROJECT_STATE, ADR-047), commit, deploy.
- Uncommitted work: everything above (address, use-address, address-state, show-record, use-window-address, use-title-focus, not-found, error boundary, record-menu,
  report-mail, menu href, IconButton tip, Fit state, review find, placement commands, curriculum-lists button, window-setup reset, app-essentials.spec.ts).
- Entry suspects for a trim: error-boundary now pulls EmptyState + Button (could be a lazy chunk with the old plain text as fallback); `@/app/env` import in window.tsx
  (move REPORT version to a constant); use-address + address-state (could be one lazy chunk loaded after first paint, keeping only parse/format in the entry).
- Open: G11 not reproduced (see above). G7 error-screen screenshot needs a way to trigger the boundary.

## TRIM (reviewer decision after the STOP). Study entry bytes (initial-js-size, fresh build), start 338,766
- c. no `@/app/env` in window.tsx (`__ORN_VERSION__` from the build `define`): 337,749 (-1,017).
- a. error boundary: tiny plain fallback + native Reload in the entry, full screen = lazy chunk error-screen.tsx: 337,744 (-5). EmptyState and Button were already in the entry, so a. saves nothing; kept (the reviewer's fail-safe: a failed chunk keeps the plain text).
  RED: `npx vitest run src/ui/primitives/error-boundary.test.tsx` -> 1 failed ('keeps the plain fallback when the full screen cannot be loaded') before the source change.
- b. address code lazy (address-gate.tsx in the entry; address-driver chunk = parse/format, hook, address-state; fetched at boot when the URL has a hash, on the first view change, or when idle):
  336,564 (-1,180). RED: `npx vitest run src/app/window/address-gate.test.tsx src/app/window/use-address.test.tsx` -> gate file failed (module missing) + 1 hook test failed (new signature).
  Study total now 336,564 = +887 over 335,677 (budget +1,500). Studio measured at the close.
- G12 phone Fit: RED: phone-map-controls.test.tsx 1 failed (aria-pressed null) before the source; green after (tooltip is the native title).
- G7 chunk failure: boundary Reload reloads the page when the code could not be loaded (RED: error-boundary.test 'a screen whose code could not be loaded' failed first). e2e: app-essentials 'a view whose code cannot be loaded' (page.route abort of settings-host chunk), screenshots error-screen-{light,dark}.png.
- WebKit quirk (unproved cause): after a chunk fails and Reload reloads the page, WebKit's persistent profile fails the same Settings file again even with the route removed/continued; the e2e proves the reload (load event) there and the recovery in Chromium/Firefox. Message there is 'TypeError: Importing a module script failed.'
- Part A close: sizes Study 336,625 (+948), Studio 340,716 (+1,080); check green 813/8730; build:smoke passed; audit 0. Next: commit, deploy.

Part A deployed; Part B next. Study 05f85da9, Studio 8f47f39f, pushed (2df7287), live specs Chromium 44/WebKit 43 green, Access check passed.

## PART B LOG
- P1 one menu: RED: `npx vitest run src/features/inspector/go-next-overflow.test.tsx` -> 2 failed (no onOverflow, no extra) (2.9 s); green after study-parts.tsx, record-menu.tsx, study-inspector.tsx.
- P3 screens: RED: `npx vitest run src/ui/primitives/error-boundary.test.tsx src/app/window/not-found.test.tsx src/app/window/frame-title.test.ts` -> failed (no kind, no onFailChange, no screenCrumb) (3 s); green after EmptyState primary, error-screen, error-boundary, frame-title, window.
- P4 first address: RED: `npx vitest run src/app/window/address-gate.test.tsx src/app/window/use-address.test.tsx` -> 4 failed (no boot write; boot address carried over a chosen view) (3 s); green after address-gate.tsx, use-address.ts, address-driver, use-window-address.ts.
- P4b: boot address '#/map' must not close a saved family: RED navigator-interaction 'saved view comes back in a new window' + phone-family-window failed after the gate wrote the address; unit address-state.test 'a plain view address at the START' added; fix = applyAddress atStart keeps saved selection.
- P2 phone header: RED: `npx playwright test tests/e2e/app-essentials-b.spec.ts --project=chromium -g P2` -> failed: title y 737 above the menu's bottom 765 (2.2 s run, after a build); P1, P3, P4 e2e passed at once (their unit REDs came first; source was already in place).
- P5 phone-family:175: cause found. With the pre-P2 CSS the PCC-card line PASSES and the spec fails LATER at the tap on #inspector-record-title ('element is not visible', width squeezed to nothing): the record menu added in 8.4g Part A (and the review mark) took the title's room on the peek's one line ('A..'). P2 gives the title its own line, which makes the peek one row taller: the PCC card then misses by 1.2 px (634.6 > 633.4). Fix: no row gap in the peek header (saves 4 px).
- G2/G3 rule: RED: `npx vitest run src/app/window/my-records-rule.test.ts` -> file failed, module missing (2 s); green after my-records-rule.ts.
- G2/G3 store: RED: `npx vitest run src/app/window/my-records.test.ts` -> file failed, module missing (2 s); green after my-records.ts.
- G2 star button: RED: `npx vitest run src/features/inspector/star-button.test.tsx` -> file failed, module missing (2 s); green after star-button.tsx, contracts StarsPort, icons star/star-filled.
- G2 star key + toast: RED: `npx vitest run src/app/window/star-key.test.tsx` -> file failed, module missing (2 s); green after star-key.tsx.
- G3 palette Recent: RED: `npx vitest run src/features/search/palette.test.tsx` -> 2 failed (no Recent heading) (3 s); green after palette.tsx, contracts recentRecords.
- G3 search port recent: RED: `npx vitest run src/app/window/search-port.test.ts` -> 1 failed (recentRecords undefined) (2 s); green after search-port.ts, window.tsx.
- G2/G5 palette commands: RED: `npx vitest run src/app/window/palette-commands-mine.test.ts` -> 3 failed (no star / shortcuts command) (2 s); green after palette-commands.ts.
- G5 key tables: RED: `npx vitest run src/features/navigator/canvas-keys.test.ts src/ui/primitives/list-keys.test.ts` -> 2 failed + list-keys file failed (no canvasShortcuts, no list-keys) (3 s); green after canvas-keys.ts, list-keys.ts, virtual-table.tsx.
- G5 key map: RED: `npx vitest run src/app/window/key-map.test.ts` -> file failed, module missing (2 s); green after key-map.ts; handlers (palette, star, history, ?) now match through it.
- G5 sheet: RED: `npx vitest run src/app/window/shortcuts-host.test.tsx` -> file failed, modules missing (2 s); green after shortcuts-state.ts, shortcuts-host.tsx, shortcuts-sheet.tsx (lazy).
- G2 starred groups: RED: `npx vitest run src/app/window/starred-groups.test.ts` -> file failed, module missing (2 s); green after starred-groups.ts.
- G2 Starred view: RED: `npx vitest run src/app/window/starred-view.test.tsx` -> file failed, module missing (2 s); green after starred-view.tsx, starred-host.tsx (lazy).
- G2 phone tab: RED: `npx vitest run src/app/window/phone-home-window.test.tsx` -> 3 failed (tab list still ends in Search; no Starred tab) (6 s); green after phone-tabs.tsx, window.tsx, modes.ts, canvas.tsx, phone-tab-mode.ts. 13 e2e specs that tapped the Home nav's Search tab now tap the top bar's Search button (same palette).
- G3 Chapters strip: RED: `npx vitest run src/features/chapters/chapters-view.test.tsx src/app/window/continue-strip.test.tsx` -> 1 failed + strip file failed (no renderTop slot; module missing) (3 s); green after chapters-view.tsx, contracts renderTop, continue-strip.tsx, chapters-host.tsx.
- G3/G5 Settings: RED: `npx vitest run src/features/settings` -> 2 failed (no Keyboard shortcuts / Clear recent / note) (2 s); green after settings-page.tsx, settings-host.tsx.
- G4 tour: RED: `npx vitest run src/app/window/tour-flag.test.ts src/app/window/tour.test.tsx` -> both files failed, modules missing (2 s); green after tour-flag.ts, tour.tsx, lazy-tour.tsx.
- G4 gating: RED: `npx vitest run src/app/window/lazy-tour.test.tsx` -> file failed, module missing (2 s); green after lazy-tour.tsx.

## PAUSE (Part B, 2026-11-17): nothing committed, nothing deployed
Done in source (all with unit REDs above): P1-P6, G2 (star, key S, palette command, Starred view + rail + phone tab, address 'starred'), G3 (recent, palette Recent,
Chapters strip, Clear recent), G4 (tour, Study only, lazy), G5 (key-map table, shortcuts sheet, lazy). e2e written, NOT yet run: tests/e2e/starred-recent-shortcuts.spec.ts, tests/e2e/tour.spec.ts
(Study), app-essentials-b.spec.ts (P1-P4 green in Chromium, phone P2 green; phone-family:175 green).
LEFT: (1) lint errors from `npm run check` (check1): non-null `!` in tour.test.tsx and go-next-overflow.test.tsx; unused `pickFamily` in app-essentials-b.spec.ts line 26;
 warnings: window.tsx:238 add mineCommandDeps dep, palette.tsx:117 drop state.serial dep (use an eslint-disable like the rest), study-parts.tsx:126 (existing style). Then re-run check.
(2) run the new specs 3 engines (starred-recent-shortcuts, tour, app-essentials, app-essentials-b, phone specs, palette, study-edition, exam-first-run, phone-home); Study specs that answer the exam
 card by hand (exam-first-run, study-edition) may need skipTour (kit exam-kit.skipTour added). Sizes (node scripts/initial-js-size.mjs, budget +1,000 from Study 336,625 / Studio 340,716).
(3) screenshots screenshots/8.4g/B/ (OPEN each), docs (PROGRESS row 8.4 CLOSED, plan rows, PROJECT_STATE, PERSISTENCE uiState keys starred/recent/tourDone, ADR for key map), commit, deploy per RELEASE.md, push.
REVIEW REQUIRED so far: Starred/Recent NOT in the backup file (needs an import-format change): Settings says so. Tour is Study only; mark 3 has no anchor when no family is selected (shown low and centred).
 e2e before-red for P1/P3/P4 was not taken (source preceded the e2e; unit reds were). 13 e2e specs now tap the top bar Search instead of the removed Search tab.

## STOP (Part B, 2026-11-17): size over budget; nothing committed, nothing deployed
- check green (828 files, 8,796 tests, 0 lint errors). `node scripts/initial-js-size.mjs`, fresh builds: Study 340,744 (Part A close 336,625: +4,119), Studio 344,471 (340,716: +3,755). Budget +1,000. OVER by about 3,100 / 2,750.
- Rule: over -> STOP and report. Not done: trim, e2e runs of the new specs, full Chromium run, screenshots, docs, commit, deploy.
- Entry suspects for a trim (all new in the entry): key-map.ts (shortcutGroups + canvasShortcuts/canvasIntent words + list-keys words: only the BINDINGS table and bindingFor need to be in the entry; the group builder can move into the lazy shortcuts-sheet chunk);
  my-records-host.tsx + star-key.tsx + my-records.ts + my-records-rule.ts (the store and rules could load with the first star/recent need, keeping a tiny touch/isStarred shell);
  lazy-tour.tsx + tour-flag.ts; star-button + StarsPort; palette Recent branch; Starred mode + rail row; icons star/star-filled names; canvas-keys.ts words table (move CANVAS_INTENT_WORDS/PROBES into a separate file imported only by the sheet).
- Trim 1 (key-map words to lazy key-words.ts): Study 340,744 -> 339,413 (-1,331), Studio 344,471 -> 343,256 (-1,215). RED: npx vitest run src/app/window/key-map.test.ts -> file failed, key-words missing (3 s).
- Trim 2 RED: npx vitest run src/app/window/my-records-lazy.test.ts -> file failed, module missing (3 s).
- Trim 2 (my-records shell + lazy rules/keys; use-toggle-star in entry): Study 339,413 -> 339,084 (-329), Studio 343,256 -> 342,847 (-409).
- Trim 3 (tour gate + flag lazy) RED: npx vitest run src/app/window/lazy-tour.test.tsx -> 3 failed (flag prop gone; services prop) (4 s).
- Trim 3 (tour gate+flag lazy) + shortcuts host into the late-keys chunk (window-keys.tsx): Study 339,084 -> 338,604 (-480), Studio 342,847 -> 342,578 (-269). Still over the ceiling (338,125 / 342,216) by 479 / 362.
- Trim 4 (attach design: star port + palette star command + toggle toasts move into the late chunk; no queue) RED: npx vitest run src/app/window/my-records-lazy.test.ts -> 2 failed (extras/attach missing) (4 s).
- Trim 4 result (attach design): Study 338,604 -> 338,389 (-215), Studio 342,578 -> 342,351 (-227). Trim 5 (the tour check moves into the late chunk; window.tsx only passes exam + hasData): Study -> 338,285 (-104), Studio -> 342,359 (+8). Over the ceiling by 160 / 143.
- Trim 6 (star and shortcuts bindings move to key-map-late.ts, read only by the late chunk) RED: npx vitest run src/app/window/key-map.test.ts -> file failed, key-map-late missing (3 s).
- Trim 6 result: Study 338,286 -> 338,245 (-41), Studio 342,362 -> 342,342 (-20). Over the ceiling by 120 / 126.
- Trim 7 (shell cut to load/records/late/attach/subscribe; the MyRecords face is built only in the lazy chunks, my-records-face.ts; Starred waits for the load) RED: npx vitest run src/app/window/my-records-lazy.test.ts -> file failed, my-records-face missing (3 s). Before it: componentWillUnmount removed from the error boundary (Study -27, Studio -3): 338,218 / 342,339.
- Trim 8 (size): the tour finds its three anchors by what the page already has ([data-map-room], the Search button label, the Open family button text) instead of data-tour attributes carried through 6 files. RED: npx vitest run src/app/window/tour.test.tsx -> 1 failed (anchor not found by aria-label) (4 s). Before it: Trim 7 (shell cut, face built in the lazy views): Study 338,206 (-12), Studio 342,270 (-69).
- Trim 8 result: Study 338,206 -> 338,166 (-40), Studio 342,270 -> 342,202 (-68). Studio is now under the ceiling (342,216); Study over by 41.
- Trim 9 (closeShortcuts moved into the lazy host, bindingFor cast instead of throw): Study 338,166 -> 338,121, Studio 342,202 -> 342,143. RESULT: Study 338,121 (Part A close 336,625: +1,496; ceiling 338,125), Studio 342,143 (340,716: +1,427; ceiling 342,216). Under the hard ceiling, over the +1,000 aim. Total trims from the STOP: Study -2,623, Studio -2,328.
- Trim 10: prefetchLateKeys (tests that reset the registry, same pattern as the address driver) +; one arm effect instead of two. Now Study 338,098 (+1,473), Studio 342,165 (+1,449). npm run check had 3 failures in edition-window.test.tsx (window-keys resolved in the wrong registry): fixed with prefetchLateKeys.

## PAUSE (Part B, 2026-11-18, after the 3-engine round)
- Sizes now: Study 338,093 (+1,468), Studio 342,161 (+1,445); ceiling 338,125 / 342,216. Check was green before the last small edits (my-records-host arm on hasData, lint fix); re-run `npm run check` before commit.
- Round (specs list in the scratchpad specs.txt; log round3.log in the repo root, delete before commit): 321 passed, 101 skipped, 10 failed:
  - chromium: phone.spec.ts:276 (first-run ... search), reaction-explorer.spec.ts:293 (Explore tab), study-edition.spec.ts:118 (no editing anywhere)
  - firefox + webkit: notices-band.spec.ts:216 (phone toast one line, Pixel 7 and iPhone 14)
  - webkit: phone-family.spec.ts:184, phone.spec.ts:291, reaction-explorer.spec.ts:302
  Not yet diagnosed; likely the tour (Study specs that answer the exam card by hand need skipTour) and the toast/tab position. Check each against PROGRESS flaky list first.
- Not done: fix of these 10, full Chromium run, open each screenshot, docs, commit, deploy, push.
- Round fixes: phone.spec + reaction-explorer used the old Search tab (now top-bar Search button / Starred tab); notices-band phone toast: the extra answerExamCard waited past the toast (leaveChapters answers it); phone-family WebKit iPhone 14: the Record menu (66 px wide) overlapped Back and Forward in the peek (axe target-size): chip row wraps inside its box, menu is a 44 px square. study-edition:118 passed alone (an Escape on the loading export dialog race), watch it in the full run.
- After the round: webkit phone-family fixed (the review chip now wraps under, the star and the menu stay next to the kind chip; WebKit gave a tap on the name to the star above it); notices-band phone toast measured before the exam question (the toast lasts 5 s). notices-band desktop in WebKit failed in two long runs and at the HEAD baseline once (1 of 5), passes alone (8 of 8): load flake, not on the PROGRESS list: say so in REVIEW REQUIRED.
- Full Chromium run 1: 486 passed, 41 skipped, 8 failed: 5 stale specs (Search tab -> Starred: map-landscape-icons x2, map-landscape x2, phone-chapters), map-landscape-panel-head x2 + phone-family:175 (my peek CSS: display contents on the aside and a wrapped row; fixed: portrait only, the review pill is cut with an ellipsis, no wrap).
- Peek header (final): portrait only; the star and the menu follow the kind chip, the Studio review pill is cut with an ellipsis (no wrap), the name 6 px lower and the peek gaps 2 px (WebKit gives a tap near a button to that button: phone-family WebKit proved it). Stale Search-tab specs fixed. Firefox + WebKit round: 209 passed, 0 failed (round4). Second full Chromium run follows.
- Tour unanchored mark: the phone screenshot showed it under the Imported toast and the storage line. RED: npx vitest run src/app/window/tour.test.tsx -> placeMark(undefined) top 628 vs 350 (3 s).
