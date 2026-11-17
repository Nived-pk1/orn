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
