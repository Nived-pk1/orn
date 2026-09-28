# Persistence, Import/Export and Recovery

Package sections: **#14 Persistence**, **#15 Import/Export**, **#22 Error Recovery** (with ARCHITECTURE.md §22). Contracts: `src/persistence/contracts.ts`, `src/io/contracts.ts`.

## 1. Principles

1. IndexedDB (via Dexie 4) is the on-device store of record. Nothing canonical lives in localStorage, cookies or the URL.
2. Every IndexedDB transaction is atomic and ends on a committed revision (INV-20): an idle queue writes one transaction per ChangeSet; ChangeSets queued together may share one transaction that ends on the newest of them. Partial writes are impossible.
3. Memory is authoritative while the app runs; persistence follows through a serial queue. A failed write never loses the in-memory state and is always visible.
4. Imports, migrations and restores are previewed, snapshotted, and applied atomically (INV-21).
5. Exports are deterministic (INV-19) and self-describing (format + schemaVersion).

## 2. Storage layout

Database `orn`, Dexie version `DB_VERSION` (starts at 1). Store definitions live in `DB_STORES`; changing them requires a version bump, an upgrade function, and an upgrade test using fake-indexeddb.

| Store | Key | Contents |
|---|---|---|
| records | `id` (index `kind`) | Every canonical record, one row per record, exactly as the schema defines it |
| meta | `key` | `schemaVersion`, `datasetMeta`, `revision`, `lastCleanShutdownAt` (a time, or `null` while a session runs), `lastIntegrityCheckAt` |
| assetBlobs | `assetId` (index `sha256`) | Image bytes as Blob |
| snapshots | `id` (indexes `createdAt`, `reason`) | The summary fields (`id`, `createdAt`, `reason`, `revision`, `schemaVersion`, `byteSize`, `note?`) plus the fflate-compressed DatasetDocument JSON as a Blob (so listing rows does not load the bytes) |
| editorSessions | `id` | Authoring drafts (may be invalid) for crash recovery |
| derivedCache | `key` (indexes `cacheKind`, `lastUsedAt`) | Depictions, layouts, search index, structure facts; `{ key, cacheKind, value, byteSize, lastUsedAt }`; LRU-evicted, disposable |
| uiState | `key` | Selection, viewports, expansion, panels, active exam version; tolerant parsing |
| importBatches | `id` | Import reports (what was created, decisions made) |
| quarantine | `id` | Records that failed validation at boot or import, with issues |

A generic records table (rather than one store per kind) keeps schema evolution in Zod migrations instead of IndexedDB upgrades, and makes transactions over mixed kinds trivial.

The in-memory `CanonicalState` is `{ meta, records: { [kind]: { [id]: record } } }`, frozen by Immer. The file format is `DatasetDocument` (`src/core/schema/dataset.ts`): `{ format: 'orn.dataset', schemaVersion, exportedAt, exportScope, generator, meta, records: { [kind]: record[] } }`.

## 3. Write path

```
dispatch(envelope) ─► commit (memory, revision n) ─► ChangeSet n
      └─► persistence queue (serial)
             └─► tx(records, meta): put created+updated, delete deleted, meta.revision = n
                    ├─ ok       → SaveStatus.saved (lastSavedRevision = n)
                    └─ failure  → retry 250 ms, 1 s, 4 s → SaveStatus.failed (banner, "Export now")
```

- An idle queue writes one transaction per ChangeSet. ChangeSets that wait together are coalesced: the queue remembers WHICH records they touched and the newest state, so the latest value wins (delete then create = put; create then delete = delete). One transaction then moves the database from one committed revision straight to the newest. It is still one atomic transaction (INV-20): never a partial ChangeSet, and the database never holds a state memory did not have. ChangeSets committed in the same tick share a transaction.
- A failed write is retried after 250 ms, 1 s and 4 s, then the state is `failed`. The pending ChangeSets are **kept**: the next ChangeSet, or `flush()`, starts a fresh cycle over everything pending, so no revision is ever skipped. A ChangeSet whose revision does not follow the previous one is refused loudly (status `failed`, an exception): the database would miss that change for good.
- `writeChanges(changes, next, blobs?)`: the bytes of asset records created in that ChangeSet ride in the same transaction (§5). The promise resolves when the write cycle holding the ChangeSet ends, durable or `failed`; `getStatus()` says which.
- Every other IndexedDB write (the clean-shutdown and integrity-check markers, snapshots) goes through the same queue and runs in its order, after the ChangeSets pending when it was requested (`runOrdered`); it never changes `SaveStatus`, and it is refused on a read-only tab. **The single exception is `derivedCache`**: it is disposable and never canonical, so cache puts and gets bypass the queue (a failed cache write is a value, never a SaveStatus problem). The caller of `setLastCleanShutdownAt` still checks `getStatus()` first.
- `SaveStatus` is always visible in the status bar: saved / saving / retrying / failed / read-only. `getStatus()` is synchronous: writes are pending when `pendingRevisions > 0` or the state is saving, retrying or failed; on `beforeunload` with pending writes the app warns.
- Undo and redo are ordinary commits and persist the same way.

## 4. Boot sequence

`adapter.open()` runs it once and returns an `OpenResult` (`src/persistence/boot.ts`); its parts are pure or take the adapter's ports (`boot-load.ts`, `boot-migrate.ts`, `boot-checks.ts`). Boot takes an injected `WriterLock` (`alwaysGrantedLock` until step 3.4) and an injected `MigrationRunner`. Every branch that cannot make the data writable leaves the queue read-only and writes **nothing**.

1. Open the database; run Dexie upgrades if `DB_VERSION` increased. IndexedDB missing, refused or out of quota → `mode: 'unavailable'` (session-only mode; `reason` and `detail` say why).
2. Acquire the writer lock `orn-writer`. Not granted → open **read-only**, load the state, write nothing (no quarantine rows, no markers), follow changes (§10, step 3.4). If the stored data then needs a migration, only the writer may run it: the tab opens read-only without data.
3. Read records and meta in one transaction, then look at `meta.schemaVersion`:
   - newer than the runner's target → read-only, `readOnlyReason: 'newer_schema'`, `state: null`, `detail` explains ("Data was saved by a newer version"), the lock is released, nothing changed;
   - anything else that is not the current version goes to the runner, in memory, before anything is written. A version the runner refuses outright (0, negative, non-integer, not a number, missing next to stored records) → read-only `migration_failed`, nothing written, no snapshot. An older version: `pre_migration` snapshot of the stored rows exactly as they are (raw, not validated: they are in the old shape) → the migrated document → strict parse → L1–L3 (`validateAll`, no ERROR) → `replaceAll` at `revision + 1`. Any failure after the snapshot puts the stored rows back from that snapshot, opens read-only with `readOnlyReason: 'migration_failed'` and keeps the error detail. The undo history starts empty (the store is built afterwards);
   - a current version with a missing or invalid `datasetMeta`, or a missing or invalid `revision`, is `integrity_failure`: read-only, `state: null`, nothing written.
4. L1-parse each row. A row that fails L1 (or has no known kind) is left out of the state and gets a `quarantine` row with its issues and its raw value (§7). **The row itself is not deleted** from `records`: quarantine is a copy, so nothing is lost even when the raw copy is truncated. The quarantine ID is derived from the row's ID, so the same row at the next boot is not quarantined again.
5. Build indexes; run `validateAll` (the findings are returned in the `bootReport`, so the store need not run it again); report asset records whose bytes are missing from `assetBlobs` (AST-002); restore uiState tolerantly (an entry that is not plain JSON, or fails the caller's validator for its key, is reset and reported, never a reason not to boot).
6. Crash check: `meta.lastCleanShutdownAt` is `null` while a session runs (boot writes `null` once it has read the previous value) and a time after a clean shutdown; a `null` (or unreadable) value at boot means the previous session did not shut down cleanly, and only then are the editor-session IDs offered in the `bootReport`. Boot ends by writing `lastIntegrityCheckAt` and continuing the write queue from the loaded revision (so its gap guard is armed). A `revision_gap` (§3) is recovered with `replaceAll`: the user-visible "save everything now" (the button is Phase 5).

`OpenResult` for a loaded database: `mode` (`read_write`, or `read_only` with `readOnlyReason` `other_tab_is_writer` / `newer_schema` / `integrity_failure` / `migration_failed` and a `detail`), `state` (null when nothing is stored or it could not be interpreted), `revision`, `storedSchemaVersion` (as found on disk, before any migration), `quarantinedCount` and the `bootReport` (migration step reports, findings, `assetIdsWithoutBlob`, `crashSuspected`, `editorSessionIds`, `uiState`, `uiStateReset`, `newlyQuarantined`, `quarantineTruncated`; a `singleTab` warning is added in step 3.4).

Cold boot budget: < 2.5 s at 2k species / 5k reactions (PERFORMANCE_ARCHITECTURE.md §2).

## 5. Assets

Ingest: size cap (20 MB) → magic-byte sniffing must agree with the declared media type → SHA-256 via `crypto.subtle` → de-duplicate by hash → store Blob in `assetBlobs` and the `asset` record in `records` in one transaction: the blob is passed to `writeChanges(changes, next, blobs)` with the ChangeSet that creates the record (there is no separate blob write, so a crash can leave neither an orphan blob nor a record without bytes). Blobs of deleted asset records are kept, because undo needs them; sweeping orphan blobs is a Phase 9 Diagnostics action, reported and confirmed by the user, never automatic. Display uses object URLs created and revoked by a component-lifetime hook; SVG assets are displayed only through `<img>` (SECURITY.md §2). Boot integrity reports asset records whose blob is missing (AST-002).

## 6. Import (#15)

```
file ─► size caps ─► compute worker: safe JSON parse (depth ≤ 64, strings ≤ 1 MB, unsafe keys renamed)
     ─► detect format: orn.dataset | orn.package (zip) | legacy v6/v4 export
     ─► legacy? convert (MIGRATION.md §4) ─► schema migrations to current version
     ─► per-record L1; failures → quarantine list (not the whole file)
     ─► ID conflict analysis against current state
     ─► L2/L3 on the MERGED replica (never on live state)
     ─► ImportPreview: counts, conflicts, quarantined, findings, decisions, legacy report
user confirms (or cancels: nothing changed)
     ─► pre_import snapshot ─► ONE replaceState (or merge commit) ─► history cleared ─► batch report stored
```

Conflict resolutions per ID: `identical_skip` (same content, deep-equal after canonical ordering), `keep_current`, `replace`, `import_as_copy` (new IDs via the reference engine's `remap`, references inside the imported set rewired). Default is the non-destructive choice. Modes: `replace_all` (restore a backup) and `merge`. If the merged result would contain L1–L3 ERRORs, confirmation is disabled until the user excludes the offending records or picks another resolution.

Undo history is cleared after an import because patches cannot span a wholesale replacement; the pre-import snapshot is the undo, offered prominently ("Undo import" restores it).

## 7. Tolerant envelope and quarantine

Importers parse `DatasetEnvelopeSchema` first (format, version, `records` as arrays of unknown) so one bad record never rejects a whole file. Records failing L1 go to `quarantine` with the raw value and the issues. The raw value is kept whole up to 64 Ki characters of its JSON text (the cap is in characters, like the other text limits); a longer one is kept as its first 64 Ki characters and `rawTruncated.originalChars` says how long it was. At boot the offending row stays in `records`, so truncation loses nothing. `import` rows carry the `importBatchId`; rows are added in the write queue's order and a row whose ID exists is kept as it is. Keys `__proto__`, `constructor` and `prototype` are renamed during parsing (`__unsafe_key__…`) and reported, preventing prototype pollution without silent loss.

## 8. Export

- **`.orn.json`** — one `DatasetDocument`. Records sorted by ID within each kind, object keys in schema order, 2-space indentation, LF, trailing newline. Export → import → export is byte-identical (property test P-02).
- **`.ornpkg`** — zip (fflate): `manifest.json` (`format: 'orn.package'`, schemaVersion, file list with SHA-256), `dataset.json`, `assets/<sha256>.<ext>`.
- **Scopes**: `full`, `chemistry` (layers 1–2 + assets they use), `curriculum` (layers 1 + 3, with the chemistry records they map, optional), `presentation`, `subset` (selected records + reference closure when `includeDependencies`, so the file imports cleanly).
- **Images**: SVG and PNG of the current view are produced from the same Scene as the screen (UI_ARCHITECTURE.md §6); PNG via canvas rasterisation of that SVG.

## 9. Snapshots

- Mandatory before import, migration and restore (reasons `pre_import`, `pre_migration`, `pre_restore`; never pruned). Manual snapshots are kept until the user deletes them. Periodic snapshots are taken during editing, after 30 minutes of activity or 200 revisions, whichever comes first (activity starts with the first ChangeSet after the previous snapshot; injected clock; `createPeriodicPolicy`, `startPeriodicSnapshots`). Creating a periodic snapshot prunes all but the newest 5 periodic ones in the same transaction, and reports the pruned IDs.
- Format: a `full` DatasetDocument as deterministic JSON text (the strict schema, so a state that does not serialise is refused, never stored), compressed with fflate (zlib: no timestamp, so identical states give identical bytes). Building and decoding are pure functions (`buildSnapshot`, `decodeSnapshot`) hosted by the compute worker from Phase 4. Decoding is bounded (inflated size cap 200 MB) and every kind of damage is a value: `readSnapshot` returns `{ ok: true, summary, doc }` with the TOLERANT `MigratableDocument` (an older snapshot must be migrated before it parses strictly) or `{ ok: false, code: 'NOT_FOUND' | 'CORRUPT', message }`.
- Creating and deleting run in the write queue's order (§3). Snapshot bytes are never part of a ChangeSet transaction.
- Restore (`restoreSnapshot`): read → migrate (the injected `MigrationRunner`, if the snapshot is older) → strict L1 parse → `pre_restore` snapshot of the live state (taken again, at most 3 times, if the live data changed while it was written) → `replaceState(…, 'restore')` (validated like a commit, history cleared) . The result is a value: `ok: true` with the `pre_restore` summary (restoring it is "undo restore") and the migration step reports, or `ok: false` with `READ_ONLY`, `NOT_FOUND`, `CORRUPT`, `MIGRATION_FAILED` (the runner's error attached), `INVALID` (bounded L1 issues), `REJECTED` (the store's L1–L3 refusal; the `pre_restore` snapshot made for it is removed again) or `SNAPSHOT_FAILED`. A failed restore changes nothing: not the live state, not its history, not the stored snapshots. The restored state reaches IndexedDB like any ChangeSet (the store's `replace` ChangeSet through the write queue); the caller may `flush()` to wait for it.

## 10. Multiple tabs

The tab holding the Web Lock `orn-writer` is the only writer (INV-28). Other tabs open read-only, show "Open in another tab — read-only", and subscribe to the BroadcastChannel `orn-changes`. The writer posts `{ fromRevision, revision, changedIds }` after each persisted transaction (`fromRevision` is the revision the database was at before it, so a coalesced transaction names the whole span); a follower re-reads those rows and applies them when `fromRevision` equals its current revision, and otherwise reloads fully. When the writer closes, a follower acquires the lock, reloads fully and becomes writable. Browsers without Web Locks get a single-tab warning banner.

## 11. Quota and durability

`navigator.storage.persist()` is requested after the first edit. Diagnostics shows usage and quota. `derivedCache` keeps itself under a 100 MB soft cap by evicting its least recently used rows when a row is put. On a quota error: evict `derivedCache` (the least recently used half of its rows per round, retrying the write at once after each round, no timer) → **stage 2:** `SaveStatus.failed` carries `deletablePeriodicSnapshotIds`, the periodic snapshots the user may delete to make room, oldest first (mandatory and manual snapshots are never offered; the field is absent when there are none; there is no UI before Phase 5, only the status). Deleting one refreshes the list but does not retry the write: a new ChangeSet or `flush()` does → otherwise `SaveStatus.failed` with "Export now" (pending ChangeSets kept, memory untouched). A cache write that fails is a value (`DerivedPutResult`), never a SaveStatus problem, and every eviction is reported to the diagnostics sink.

## 12. Failure modes (#22)

| Failure | Response |
|---|---|
| IndexedDB unavailable (private mode, blocked) | Session-only mode with a persistent banner; export available; nothing pretends to be saved |
| Write transaction fails | Retry with backoff → failed status + banner; memory kept; export offered |
| Quota exceeded | §11 sequence |
| Corrupt record at boot | Quarantined with issues; rest loads; Diagnostics lists it with export/repair options |
| Migration throws | Automatic restore of the pre-migration snapshot; open read-only; error report exportable |
| Newer schema on disk | Read-only mode with explanation |
| Worker crash | Restart worker, reload its replica from the current state, retry the request once, then surface an error |
| RDKit fails to load | L4 checks and depictions unavailable (clear notice); everything else works; names/formulas shown instead of structures |
| ELK fails or exceeds 2 s | Fallback layered layout; notice in Diagnostics |
| Render error | Error boundary per panel with "Reload panel"; canonical state unaffected |
| Import error at any stage | Nothing changed (INV-21); preview shows the error |
| Tab or browser crash | Editor sessions are saved every 2 s while dirty; offered for restore on next boot |

## 13. UI state

Stored in `uiState` with tolerant schemas (invalid entries are reset, never block boot): selection, per-view viewport, expansion state, open panels and widths, inspector disclosure level, active exam and exam version, last view, recent searches. It is never exported with the dataset unless the user explicitly exports a "workspace" (FUTURE).
