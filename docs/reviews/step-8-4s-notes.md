# Step 8.4s notes

Safety of the owner's data (undo import, backups, boot guard, publish gate, summary outcome) and room (lazy map canvas).
START: HEAD f985187 clean, pushed, stash empty, ports 4173/4174/8787/9333 free. Speed check (own 5e7 loop, start): 52 ms
(the loop of earlier notes read 228-235 ms; this one is a bare `for` loop, so compare only with itself).

RESUME HERE: see the last "STATE" line at the bottom.

## L1 lazy map canvas

- BEFORE (fresh builds): Study 383,408 / Studio 387,391 bytes gzip.
- Guard test first: `npx vitest run src/features/navigator/navigator-view.test.tsx` -> 2 passed BEFORE the source edit (it is a
  guard for the focus return through the view; it cannot be red before the lazy change). Disclosed: the race it guards (a
  re-render while the chunk loads dropping `returnTo`) is not reproduced by jsdom; the sentinel `Arrived` keeps `returnTo` until
  the canvas has mounted.
- Done: `navigator-view.tsx` lazy canvas + `<Skeleton label="Loading the navigator" />` fallback; `warmNavigatorCanvas` exported
  (barrel no longer re-exports `NavigatorCanvas`); `src/app/window/use-warm-canvas.ts` (Studio, phone saved tab 'map').
- AFTER: Study 347,711 / Studio 351,490 bytes gzip (-35,697 / -35,901). Study < 350,000: OK, no STOP.
- Budget lines lowered: check-build.mjs 400 kB -> Study 360 / Studio 365; check-edition.mjs Studio 395 -> 365, Study 360 added.
  `npm run build:smoke` passes (no editor module in a Study chunk).

## S1 undo import (facts F1, F2)

- F1: `ImportBatchRow` (persistence/contracts.ts:122) is `{id, createdAt, report: JsonValue}`; the report is `ImportBatchReport`
  (io/contracts.ts:297), which ALREADY holds `revisionAfter` (the revision the import produced), `snapshotId`, `appliedAt`.
  `saveImportBatch` is `db.importBatches.put` (aux-stores.ts:96), an upsert. The "undone" mark is an OPTIONAL `undoneAt` in the
  report JSON. What allows it: persistence treats the report as opaque JSON (contracts.ts:122 "opaque JSON here"; PERSISTENCE.md
  row table line 27: importBatches = import reports), and ImportBatchReport already took optional additions without a version step
  at 5.1c (`sourceSha256?`, `clockNowIso?`, io/contracts.ts:320). No Dexie version change, no schema change.
- F2: Undo import is reached from the File menu (window.tsx `file.onUndo`), the palette ('undo-import', palette-commands.ts), the
  Dataset page button (dataset-actions.tsx) and the toast action (notices.tsx:33); all call `model.undoImport` ->
  `ports.undo` -> `flows.undo` -> restore-service.ts `undo`.
- RED: `npx vitest run tests/integration/app-services-undo-import.test.ts` -> 4 failed, 2 passed (18 s) before the source edit
  (da-02 assertion kept as the first test).
- RED: `npx vitest run src/features/data-exchange/import-model-undo.test.ts src/features/data-exchange/import-screen.test.tsx` -> 3 failed
  (undo_question phase missing) before the source edit.
- GREEN: integration 6 passed; data-exchange 124 passed; dataset-actions 6 passed (the "already undone" button test was written
  after the source: disclosed, no red line).
- Done: restore-service `undo` (ALREADY_UNDONE, newest pre_import must be this batch's, CHANGED_SINCE with discardedRevisions,
  `undoneAt` written after a good restore), `undoAnyway` + `undo_question` phase, Cancel focus, `undoneReason` on the menu / palette /
  dataset page. e2e (Chromium) still to write: see STATE.

## S2 backup with pictures can be read back (F3)

- F3: `scanJsonCaps` (src/io/json-caps.ts) is called from import-source.ts (CAP_LIMITS) before `JSON.parse`; one linear pass with
  depth and string length. It now tracks "a key string `embeddedAssets` at depth 1, then `:`, then `[`" and uses the larger limit
  (`embeddedStringLength` = ceil(maxAssetBytes*4/3)+4) only for strings inside that array. Look-alikes (nested, escaped, a VALUE
  "embeddedAssets") get no extra room.
- RED: `npx vitest run src/io/json-caps.test.ts src/io/export-embed-roundtrip.test.ts` -> 4 failed (9.7 s) before the source edit
  (the DA-01 test moved to src/io/export-embed-roundtrip.test.ts, assertion kept; plus scanner cases, near-cap, too-large).
- GREEN: src/io 845 passed. P-02 near-cap case added to tests/property/import-export-roundtrip.test.ts (passes, 15 s); it was NOT run
  red first (disclosed; the DA-01 unit red covers the cause). Disclosed: its first version used toEqual on two 27 MB arrays and
  ran the worker out of memory (4 GB); it compares with Buffer.equals now.
- The exporter refuses a one-file export over `maxJsonBytes` as `{ ok: false, code: 'SERIALIZE_FAILED', message: 'This backup is too
  large for one file. Choose Package (.ornpkg).' }`. A new error code would change the `ExportErrorCode` contract, so the existing
  code carries the words (no contract change).

## S3 default backup keeps the pictures (F4)

- F4: defaults were format 'orn.json', scope 'full', images 'none' (export-model.ts CLOSED); the scope text for Everything
  "...and every attached image" was fixed text (export-words.ts SCOPES).
- RED: `npx vitest run src/features/data-exchange/export-words.test.ts src/features/data-exchange/export-model.test.ts` -> 5 failed
  before the source edit. GREEN: data-exchange 130 passed.
- Done: `exportDefaults` (package + "In the package" when image count > 0 and bytes > 0), `scopeWords` (Everything and Chemistry
  drop the image claim with No images), `notInFileLine` ("N pictures are NOT in this file."). Three existing screen assertions
  changed because the spec changes the words/defaults (scope sentence follows the images choice; a dataset with pictures opens on the
  package): disclosed, behaviour otherwise unchanged.

## S4 how old the last backup is (F5)

- F5: uiState is read at boot into `bootReport.uiState` (a record of every key, tolerant) and written with
  `services.persistence.setUiState(key, JsonValue)` (aux-stores.ts:115, own-data.ts is the pattern). PERSISTENCE.md line 26 and
  line 176: uiState = "tolerant parsing", invalid entries reset, never block boot, so two NEW KEYS need no version step
  (`lastBackup` = `{revision, at}` as the prompt names it; `lastBackupNoticeDismissed` = same shape, for Dismiss). The Studio status
  line is `FullStatusLine` (full-status.tsx, a lazy Studio chunk, items from status-short.ts); the storage banner is a banner in
  banners.ts with `dismiss_storage` -> `panels.dismissStorageNotice()`; the new notice joins the desktop band (notice-band.tsx).
- RED: `npx vitest run src/app/window/backup-rule.test.ts src/app/window/backup-record.test.ts` -> 2 files failed (modules missing)
  before the source. GREEN 13 passed (+1 rule case for a dismissal older than the last backup).
- Done: backup-rule.ts (pure: words, 200 changes / 3 days, Dismiss), backup-record.ts (two tolerant keys, memory-only in a tab
  that cannot write), `ExportPorts.exported` called after the file is saved (scope 'full' -> markBackedUp(revision exported)),
  status line item, band notice "N changes are not in a backup." with "Back up now" (opens the export, S3 defaults) and Dismiss.
- Choices: with no backup yet, only the 200-change rule applies (no time to count from). The notice is in the desktop notice band
  only (the phone has no Studio notice list). EDITING guards the notice, so a Study unit test cannot reach it: its words and rule
  are tested in backup-rule.test; the e2e (Studio) covers the status words (still to write: see STATE).
- Tests after the source (no red line): full-status-backup.test.tsx (3), export-model `exported` test.

## S5 / S6 / S7 / S8 (progress)

- S5: `chromeTransactionDurability: 'strict'` in `OrnDb` constructor (db.ts). RED: persistence-db.test 'strict durability' failed before the
  edit; GREEN after. Benches run (`npm run bench -- persist commit compute-import import`, 5m42s, all ran). fake-indexeddb ignores the
  durability option, so these benches cannot show its cost (persist.bench says "dominated by fake-indexeddb"). The real cost is NOT
  measured; budget verdicts (bench:compare) NOT run. Record as REVIEW REQUIRED; watch import-apply time in the Chromium e2e.
- F6: Dexie constructor = src/persistence/db.ts `OrnDb` (super call). F7: boot.ts line ~126 (`assembleState` -> `moveToQuarantine`);
  `refuse('integrity_failure', ...)` is the existing read-only branch.
- S6: RED persistence-boot 'more than 20 rejected...' (read_write instead of read_only) and fingerprint test (module missing) before
  the source. GREEN: persistence-boot + schema-fingerprint 38 passed. Break-and-restore done (a comment in refs.ts failed the guard
  with the exact words; restored with git checkout). New file src/core/schema/fingerprint.ts (+ scripts/schema-fingerprint.mjs, .d.mts,
  test in tests/integration/): a file in the schema folder, not a schema change: put it under "Amendments" in PROGRESS. Disclosed: the
  words say "Export them" but a read-only tab with state null has no export of the rejected rows (spec words kept).
- F8: records carry `review: { status: 'unreviewed'|'review_required'|'verified' }` (core/schema/primitives.ts:213); some kinds have none
  (navigator_anchor, entity_display, reaction_scheme...). The demo is entirely unverified.
- S7 code written, NOT yet run: src/io/publish.ts (`countUnreviewed`, `allowUnreviewed` option, exact count), scripts/publish-dataset.mjs
  (`--allow-unreviewed N`, prints "not verified: N (...)" every time), check-edition DENY_PATTERNS (+ NAME_OK for
  src/features/navigator/bulk-context.ts, which is in the Study build on purpose), wrangler.studio.jsonc preview_urls false, RELEASE.md
  edited (audit line, review gate, preview URLs, size lines). STILL TO DO for S7: tests in tests/integration/publish-dataset.test.ts
  (existing accept-tests must pass `--allow-unreviewed <exact N>`; the demo count is computed from the records), check-edition.test (the
  395 kB line is now 365/360; add a deny-pattern case), playwright.config.ts Study server command runs
  `publish-dataset.mjs data/fixtures/schema/v2/minimal-valid.orn.json` and now needs `--allow-unreviewed <exact N>` (find N from its refusal;
  run it with ORN_PUBLISH_DIR set to a temp folder, NOT the default data/published).
  CAUTION: I started `node scripts/publish-dataset.mjs data/fixtures/...minimal-valid.orn.json` WITHOUT ORN_PUBLISH_DIR in the background
  (task bk4fc7x56). Check `git status data/` is clean; if data/published/ changed, restore with `git checkout -- data/published`.
- S8 code written: src/core/graph/headline-outcome.ts (+test, 8 cases pass), headline-words.ts, study-connected.ts `arrowLine`,
  study-summary.ts `ends`. STILL TO DO: run the moved RU-01 test (move fable's ru-01 test next to study-connected as a test, red first is
  impossible now: the code is already changed; say so) and the existing inspector tests.

## STATE (where to resume)

Uncommitted work in the tree (nothing committed in 8.4s yet; `npm run check` has NOT been run). Done: L1, S1, S2, S3, S4, S5, S6.
Written, untested: S7, S8 wiring. e2e specs written, never run: tests/e2e/data-safety.spec.ts (S1, S4).
Left, in order: finish S7 tests + playwright.config N; S8 tests; fix any existing tests broken by the new behaviour (check-edition.test
395 kB line, check-build.test 400 kB, publish-dataset tests, anything importing NavigatorCanvas from the barrel); `npm run check`
(default workers); e2e per CLOSE step 2; screenshots in screenshots/8.4s/ (open each); docs: PROGRESS (+Amendments: fingerprint file,
SERIALIZE_FAILED words, bulk-context NAME_OK), plan rows 8.4s DONE and 8.4m, PROJECT_STATE (next 8.4f Part 2), PERSISTENCE.md (S1, S4, S5,
S6), SECURITY.md (publish gate), GRAPH_SEMANTICS or inspector doc (S8); commit `phase-8.4s: ...`; deploy per RELEASE.md; report.
Speed check this session: start 52 ms; later reads 82 ms (use a FILE script; `node -e` reads ~820 ms and is not comparable).
Sizes: BEFORE Study 383,408 / Studio 387,391; AFTER L1 347,711 / 351,490 (later edits not re-measured).
- Checked: the stray publish run REFUSED (22 unverified in minimal-valid.orn.json), wrote nothing; `git status data/` is clean. So
  playwright.config.ts needs `--allow-unreviewed 22` on that Study server command.

## STATE (second session, 2026-11-15): CLOSE steps 1 to 4 done; commit and deploy left

Done: S7 tests (publish, check-edition deny patterns), S8 test moved (study-connected-headline.test.ts), size-limit fixes, e2e (named
runs; Z-list failures compared with a worktree of f985187, same way), screenshots (all opened), docs (PROGRESS, plan rows, PROJECT_STATE,
PERSISTENCE, SECURITY, GRAPH_SEMANTICS, RELEASE). Sizes (fresh `build:smoke`): Study 348,868 / Studio 352,716 bytes gzip.
Left: final `npm run check`, commit `phase-8.4s: ...`, deploy per RELEASE.md (Study, live specs, Studio, Access check, push), record
both Worker versions in PROGRESS and PROJECT_STATE (releasePreview / studioPreview, step84s.deployed).

## STATE (closing, 2026-11-15): committed 38dde4f, HELD for the reviewer

`ORN_TEST_WORKERS=2 npm run check` green (784 files, 8,592 tests, 905.8 s; the user approved 2 workers after three default-workers runs failed on load timeouts only). Not deployed, not pushed. Resume: reviewer approves the two S3 spec fixes (hostile.spec.ts, mechanism-pictures.spec.ts) and the 2-worker check; then deploy per docs/RELEASE.md and record the versions.
