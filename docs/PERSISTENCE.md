# Persistence, Import/Export and Recovery

Package sections: **#14 Persistence**, **#15 Import/Export**, **#22 Error Recovery** (with ARCHITECTURE.md §22). Contracts: `src/persistence/contracts.ts`, `src/io/contracts.ts`.

## 1. Principles

1. IndexedDB (via Dexie 4) is the on-device store of record. Nothing canonical lives in localStorage, cookies or the URL.
2. One commit = one ChangeSet = one IndexedDB transaction (INV-20). Partial writes are impossible.
3. Memory is authoritative while the app runs; persistence follows through a serial queue. A failed write never loses the in-memory state and is always visible.
4. Imports, migrations and restores are previewed, snapshotted, and applied atomically (INV-21).
5. Exports are deterministic (INV-19) and self-describing (format + schemaVersion).

## 2. Storage layout

Database `orn`, Dexie version `DB_VERSION` (starts at 1). Store definitions live in `DB_STORES`; changing them requires a version bump, an upgrade function, and an upgrade test using fake-indexeddb.

| Store | Key | Contents |
|---|---|---|
| records | `id` (index `kind`) | Every canonical record, one row per record, exactly as the schema defines it |
| meta | `key` | `schemaVersion`, `datasetMeta`, `revision`, `lastCleanShutdownAt`, `lastIntegrityCheckAt` |
| assetBlobs | `assetId` (index `sha256`) | Image bytes as Blob |
| snapshots | `id` (indexes `createdAt`, `reason`) | fflate-compressed DatasetDocument JSON + summary |
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

- ChangeSets that wait together are coalesced: the queue remembers WHICH records they touched and the newest state, so the latest value wins (delete then create = put; create then delete = delete). One transaction then moves the database from one committed revision straight to the newest. It is still one atomic transaction (INV-20): never a partial ChangeSet, and the database never holds a state memory did not have. ChangeSets committed in the same tick share a transaction.
- A failed write is retried after 250 ms, 1 s and 4 s, then the state is `failed`. The pending ChangeSets are **kept**: the next ChangeSet, or `flush()`, starts a fresh cycle over everything pending, so no revision is ever skipped. A ChangeSet whose revision does not follow the previous one is refused loudly (status `failed`, an exception): the database would miss that change for good.
- `writeChanges(changes, next, blobs?)`: the bytes of asset records created in that ChangeSet ride in the same transaction (§5). The promise resolves when the write cycle holding the ChangeSet ends, durable or `failed`; `getStatus()` says which.
- `SaveStatus` is always visible in the status bar: saved / saving / retrying / failed / read-only. `getStatus()` is synchronous: writes are pending when `pendingRevisions > 0` or the state is saving, retrying or failed; on `beforeunload` with pending writes the app warns.
- Undo and redo are ordinary commits and persist the same way.

## 4. Boot sequence

1. Open the database; run Dexie upgrades if `DB_VERSION` increased.
2. Acquire the Web Lock `orn-writer`. If another tab holds it, open **read-only** and follow changes (§10).
3. Read `meta.schemaVersion`:
   - older → create a `pre_migration` snapshot, migrate in the compute worker (MIGRATION.md §2), `replaceAll`;
   - newer → open read-only with a clear message ("Data was saved by a newer version").
4. Bulk-read records; in the compute worker L1-parse each; invalid rows move to `quarantine` with their issues (Diagnostics shows them; nothing is silently deleted).
5. Build indexes; run `validateAll` in the worker; hydrate search; restore uiState (reset any invalid entry).
6. Crash check: if the previous session did not record a clean shutdown and editor sessions exist, offer to restore drafts.

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

Importers parse `DatasetEnvelopeSchema` first (format, version, `records` as arrays of unknown) so one bad record never rejects a whole file. Records failing L1 go to `quarantine` with the raw value (truncated to 64 KB) and the issues. Keys `__proto__`, `constructor` and `prototype` are renamed during parsing (`__unsafe_key__…`) and reported, preventing prototype pollution without silent loss.

## 8. Export

- **`.orn.json`** — one `DatasetDocument`. Records sorted by ID within each kind, object keys in schema order, 2-space indentation, LF, trailing newline. Export → import → export is byte-identical (property test P-02).
- **`.ornpkg`** — zip (fflate): `manifest.json` (`format: 'orn.package'`, schemaVersion, file list with SHA-256), `dataset.json`, `assets/<sha256>.<ext>`.
- **Scopes**: `full`, `chemistry` (layers 1–2 + assets they use), `curriculum` (layers 1 + 3, with the chemistry records they map, optional), `presentation`, `subset` (selected records + reference closure when `includeDependencies`, so the file imports cleanly).
- **Images**: SVG and PNG of the current view are produced from the same Scene as the screen (UI_ARCHITECTURE.md §6); PNG via canvas rasterisation of that SVG.

## 9. Snapshots

- Mandatory before import, migration and restore. Periodic during editing (every 30 minutes of activity or 200 revisions); the last 5 periodic snapshots are kept. Manual snapshots are kept until the user deletes them.
- Format: fflate-compressed DatasetDocument JSON with a summary row.
- Restore: validate the snapshot (migrating if older) → `pre_restore` snapshot → `replaceState` → history cleared.

## 10. Multiple tabs

The tab holding the Web Lock `orn-writer` is the only writer (INV-28). Other tabs open read-only, show "Open in another tab — read-only", and subscribe to the BroadcastChannel `orn-changes`. The writer posts `{revision, changedIds}` after each persisted transaction; followers re-read those rows and apply them. When the writer closes, a follower acquires the lock, reloads fully and becomes writable. Browsers without Web Locks get a single-tab warning banner.

## 11. Quota and durability

`navigator.storage.persist()` is requested after the first edit. Diagnostics shows usage and quota. `derivedCache` keeps itself under a 100 MB soft cap by evicting its least recently used rows when a row is put. On a quota error: evict `derivedCache` (the least recently used half of its rows per round, retrying the write at once after each round, no timer) → ask to delete old periodic snapshots → otherwise `SaveStatus.failed` with "Export now" (pending ChangeSets kept, memory untouched). A cache write that fails is a value (`DerivedPutResult`), never a SaveStatus problem, and every eviction is reported to the diagnostics sink.

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
