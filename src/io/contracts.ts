/**
 * Import/export contracts — docs/PERSISTENCE.md §6–§8 and docs/MIGRATION.md §4.
 * Import is a dry run first (preview), never mutates state before explicit confirmation (INV-21),
 * and is applied as ONE replaceState/commit after a pre-import snapshot.
 */
import type { AnyRecord, AssetId, JsonValue, RecordKind, RecordRef } from '@/core/schema';
import type { CommandError } from '@/core/commands/contracts';
import type { Finding } from '@/core/validation/contracts';

export const IMPORT_LIMITS = {
  maxJsonBytes: 50 * 1024 * 1024,
  maxPackageBytes: 200 * 1024 * 1024,
  /** Q5 (docs/PROGRESS.md "Phase 3 contract decisions"): matches SECURITY.md §3's asset cap. */
  maxAssetBytes: 20 * 1024 * 1024,
  maxRecords: 200_000,
  /**
   * Entries in a `.ornpkg` (step 3.6 review, item b): 65,535, the most a classic zip can hold (its entry count is 16 bits;
   * the exporter writes classic zips and never zip64). An archive claiming more is refused as a whole while its directory is
   * read, before any entry is inflated.
   */
  maxPackageEntries: 65_535,
  maxJsonDepth: 64,
  maxStringLength: 1_000_000,
  maxQuarantineRawBytes: 64 * 1024,
} as const;

/**
 * `legacy_v6`/`legacy_v4` (step 3.6, MIGRATION.md §4.1): renamed from the earlier placeholder
 * `'legacy-orn-html'`, which named the wrong thing — the legacy app is an HTML file, but what is ever
 * IMPORTED is its exported JSON (v6) or the v4 prototype's JSON, never HTML. Unused before step 3.6
 * (grep confirmed), so renaming is additive in effect.
 */
export type ImportFormat = 'orn.dataset' | 'orn.package' | 'legacy_v6' | 'legacy_v4';

/**
 * A record whose OWN `kind` differs from the envelope group it was listed under (step 3.6 review, item e). It still imports
 * (its own kind wins, matching boot); the mismatch is reported, never silent.
 */
export interface KindMismatch {
  readonly id: string;
  readonly envelopeKind: string;
  readonly ownKind: RecordKind;
}

export interface ImportSource {
  readonly fileName: string;
  readonly bytes: Blob;
}

export interface QuarantinedItem {
  readonly claimedKind?: string;
  readonly claimedId?: string;
  readonly issues: readonly string[];
  /**
   * The record's raw value, capped at `IMPORT_LIMITS.maxQuarantineRawBytes` characters of its JSON text
   * (docs/PERSISTENCE.md §7: the source file still exists, unlike a boot quarantine row).
   */
  readonly raw: JsonValue;
  /** Present only when `raw` was truncated to the cap: the length of the full JSON text. */
  readonly rawTruncated?: { readonly originalChars: number };
}

/** `__proto__`/`constructor`/`prototype` renamed during safe parsing, at any depth (ADV-035). */
export interface UnsafeKeyRename {
  readonly path: string;
  readonly originalKey: string;
}

export type DetectFormatResult = { readonly ok: true; readonly format: ImportFormat } | { readonly ok: false; readonly reason: string };

/** An asset whose bytes were recovered and verified (SHA-256 and magic bytes both match the declared media type). */
export interface ParsedAsset {
  readonly assetId: AssetId;
  readonly sha256: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

/** An asset file present but not usable: hash or magic-byte mismatch, or no matching asset record (AST-002 later; never silent). */
export interface RejectedAsset {
  readonly sha256: string;
  readonly assetId?: AssetId;
  readonly reason: string;
}

/** A `.ornpkg` entry that could not be used as it stood: an unsafe/duplicate name, a file the manifest never named, or a manifest entry with no file. */
export interface PackageEntryIssue {
  readonly path: string;
  readonly reason: string;
}

export type ImportRejectionCode =
  | 'FILE_TOO_LARGE'
  | 'TOO_DEEP'
  | 'STRING_TOO_LONG'
  | 'TOO_MANY_RECORDS'
  | 'INVALID_JSON'
  | 'INVALID_ENVELOPE'
  | 'UNKNOWN_FORMAT'
  | 'NEWER_SCHEMA'
  | 'MIGRATION_FAILED'
  | 'PACKAGE_INVALID'
  | 'CANCELLED';

/**
 * What step 3.6 parses an `ImportSource` into: a plain-data, structured-clone-safe value (no Map/Set/class)
 * that step 3.7 consumes for conflict analysis and preview. Nothing is written anywhere by this step.
 */
export interface ImportParseResult {
  readonly format: ImportFormat;
  /** Absent for `legacy_v6`/`legacy_v4` (no `schemaVersion` field in those). */
  readonly detectedSchemaVersion?: number;
  /** Step descriptions, in the order applied; empty when already current or legacy (not migrated here). */
  readonly migrationsApplied: readonly string[];
  /** `orn.dataset`/`orn.package` only; unvalidated (3.7's job) so a malformed one is never a reason to refuse the whole file. */
  readonly meta?: JsonValue;
  /** Records that passed L1, grouped by their OWN validated kind (not necessarily the envelope's grouping). */
  readonly records: Readonly<Partial<Record<RecordKind, readonly AnyRecord[]>>>;
  readonly counts: Readonly<Partial<Record<RecordKind, number>>>;
  readonly quarantined: readonly QuarantinedItem[];
  readonly unsafeKeysRenamed: readonly UnsafeKeyRename[];
  /** Records that imported under their own kind although the envelope listed them under another one. */
  readonly kindMismatches: readonly KindMismatch[];
  readonly assets: readonly ParsedAsset[];
  readonly rejectedAssets: readonly RejectedAsset[];
  /** `orn.package` only. */
  readonly packageIssues: readonly PackageEntryIssue[];
  /**
   * `legacy_v6`/`legacy_v4` only: the COMPLETE parsed JSON for steps 3.8–3.11, which map every leaf of it. Only cap-checked
   * (bytes, depth, string length) and key-sanitised (unsafe keys renamed and reported), never truncated or shortened.
   */
  readonly legacyPayload?: JsonValue;
}

export type ImportParseOutcome =
  | { readonly ok: true; readonly result: ImportParseResult }
  | { readonly ok: false; readonly code: ImportRejectionCode; readonly message: string; readonly detail?: Readonly<Record<string, unknown>> };

export type ConflictResolution = 'identical_skip' | 'keep_current' | 'replace' | 'import_as_copy';

export interface IdConflict {
  readonly ref: RecordRef;
  readonly resolution: ConflictResolution;
  /**
   * The incoming record is canonically deep-equal to the live one (step 3.7, decided per record by deterministic
   * serialisation, never by name or ID). `identical_skip` is valid only when this is true; it is then the default.
   */
  readonly identical: boolean;
}

/** A choice the user confirms in the preview (defaults are always the non-destructive option). */
export interface ImportDecision {
  readonly id: string;
  readonly subject: RecordRef;
  readonly question: string;
  readonly options: readonly string[];
  readonly chosen: string;
}

export interface LegacyImportReport {
  readonly sourceSystem: string;
  readonly sourceSchemaVersion: number;
  readonly createdCounts: Readonly<Partial<Record<RecordKind, number>>>;
  /** Every record the importer marked review_required, with the reason. */
  readonly reviewItems: readonly { readonly subject: RecordRef; readonly reason: string }[];
  /** Legacy fields preserved in provenance.legacy.unmapped, by field name → occurrences. */
  readonly preservedUnmappedFields: Readonly<Record<string, number>>;
  /** Anything that could not be imported at all (should be empty; each entry explains why). */
  readonly notImported: readonly { readonly legacyId: string; readonly reason: string }[];
  /**
   * MIGRATION.md §4.8: empty legacy values that v6 replaced by defaults (`""`, `[]`, `{}`, `null`) count as consumed by default.
   * Legacy path with every index written `[*]` (for example `compounds[*].name`) → occurrences.
   */
  readonly consumedByDefault: Readonly<Record<string, number>>;
  /** Informational items nobody has to decide (not in `reviewItems`), by code → occurrences (for example `FLAG_SUBSUMED`). */
  readonly notes: Readonly<Record<string, number>>;
  /**
   * Step 3.11b: legacy values that belong to the DOCUMENT, not to any record (a top-level field next to `compounds` and `reactions`,
   * a dropped leaf whose path names no record): top-level key or `dropped.<path>` → the value, verbatim. Kept here so nothing is lost;
   * empty for both real v6 exports.
   */
  readonly documentUnmapped: Readonly<Record<string, JsonValue>>;
  // ---- step 3.11c: what only the whole import knows (the mappers leave these empty; `import-legacy.ts` fills them)
  /** ID-part collisions settled by the ID space (MIGRATION.md §4.2); empty for an ordinary document. */
  readonly collisions: readonly LegacyIdCollisionReport[];
  /** Unsafe keys renamed while parsing the legacy file (the same list as `ImportPreview.unsafeKeysRenamed`). */
  readonly unsafeKeysRenamed: readonly UnsafeKeyRename[];
  /** The preview decisions in force (defaults or the user's choices): hub class / species, `reagentFamily` values. */
  readonly decisions: readonly ImportDecision[];
  /** Distinct `reagentFamily` values with the number of reactions that carry them (kept in `legacy.unmapped`). */
  readonly reagentFamilies: readonly { readonly value: string; readonly count: number }[];
}

/** One ID-part collision of the legacy ID space (plain data; see `IdCollision` in `src/io/legacy-v6/id-parts.ts`). */
export interface LegacyIdCollisionReport {
  readonly namespace: string;
  readonly originals: readonly string[];
  readonly sharedPart: string;
  readonly resolved: readonly { readonly original: string; readonly part: string; readonly space?: string }[];
}

/** How many findings of each severity the merged result has (all of them, even when the list below is capped). */
export interface FindingSummary {
  readonly error: number;
  readonly warning: number;
  readonly info: number;
  readonly reviewRequired: number;
  /** `findings` lists errors first, then the rest, and stops at `IMPORT_PREVIEW_MAX_FINDINGS`; true when it stopped early. */
  readonly truncated: boolean;
}

/** Cap on the findings LISTED in a preview (the summary always counts all of them). */
export const IMPORT_PREVIEW_MAX_FINDINGS = 2_000;

/** What the plan does with the asset bytes recovered from the file (step 3.7; the bytes ride in the same transaction as their record, Q1). */
export interface ImportAssetSummary {
  /** Verified byte payloads that will be written with an asset record this plan creates or replaces. */
  readonly toStore: number;
  /** Verified byte payloads left out because the plan does not write their record (skipped, kept as the live one, excluded). */
  readonly notStored: number;
  // Nothing is ever overwritten: `assetBlobs` is content-addressed (docs/PERSISTENCE.md §5), so a replaced asset's old bytes stay
  // under their hash and "Undo import" brings the old record AND its bytes back.
  /** Asset records the plan writes (or re-points at different bytes) for which the file carries no verified bytes: AST-002 will report them. */
  readonly withoutBytes: number;
}

export interface ImportPreview {
  readonly batchId: string;
  readonly format: ImportFormat;
  readonly detectedSchemaVersion: number;
  readonly migrationsApplied: readonly string[];
  readonly counts: Readonly<
    Partial<Record<RecordKind, { readonly incoming: number; readonly new: number; readonly identical: number; readonly conflicting: number }>>
  >;
  /** Records that failed L1 in the file, plus records that repeat an ID already seen earlier in the same file (never silently dropped). */
  readonly quarantined: readonly QuarantinedItem[];
  readonly conflicts: readonly IdConflict[];
  /** Findings for the MERGED result, computed on a replica (never on live state). Capped; see `findingSummary`. */
  readonly findings: readonly Finding[];
  readonly findingSummary: FindingSummary;
  readonly decisions: readonly ImportDecision[];
  readonly legacyReport?: LegacyImportReport;
  /** Q6: `[[id]]` links rewritten to new IDs across the records copied with `import_as_copy` and the records that reference them. */
  readonly richTextLinksRewritten: number;
  /** Q6: unsafe keys renamed while parsing (ADV-035). */
  readonly unsafeKeysRenamed: readonly UnsafeKeyRename[];
  readonly kindMismatches: readonly KindMismatch[];
  readonly rejectedAssets: readonly RejectedAsset[];
  readonly packageIssues: readonly PackageEntryIssue[];
  readonly assets: ImportAssetSummary;
  /** Records in the merged result. */
  readonly mergedRecordCount: number;
  /** False while the merged result has an L1–L3 ERROR or cannot be built; `blockers` says why. Apply is refused then. */
  readonly canConfirm: boolean;
  readonly blockers: readonly string[];
}

/** What the user confirms. `apply` does exactly this, on the merged replica the preview showed (Q6). */
export interface ImportPlan {
  readonly preview: ImportPreview;
  readonly mode: 'replace_all' | 'merge';
  readonly decisions: readonly ImportDecision[];
  /** One entry per incoming ID that already exists in the live dataset (merge mode; empty for `replace_all`), sorted by kind then ID. */
  readonly conflicts: readonly IdConflict[];
  /** Incoming records left out of the import entirely (the user's way past a blocking finding), sorted. */
  readonly excluded: readonly RecordRef[];
  /** `import_as_copy`: every old ID (record and nested IDs) → its new ID, sorted by old ID. Empty when nothing is copied. */
  readonly copyIdMap: readonly { readonly from: string; readonly to: string }[];
}

/** A change to the plan. Anything omitted keeps its default (non-destructive): `merge`, identical → `identical_skip`, different → `keep_current`, nothing excluded. */
export interface ImportPlanRequest {
  readonly mode?: 'replace_all' | 'merge';
  /** Merge mode only: refused as a value in `replace_all` (there is nothing to resolve). */
  readonly resolutions?: readonly { readonly id: string; readonly resolution: ConflictResolution }[];
  readonly excluded?: readonly RecordRef[];
  /**
   * Step 3.11c, legacy imports only (refused as a value for any other format): the choices made for the preview decisions
   * (`ImportPreview.decisions`), by decision ID. Omitted decisions keep their default; like everything here the request is the FULL
   * desired state, not a delta.
   */
  readonly decisions?: readonly { readonly id: string; readonly chosen: string }[];
}

export type ImportPreviewErrorCode = 'LEGACY_INVALID' | 'UNKNOWN_BATCH' | 'INVALID_REQUEST' | 'INVALID_META' | 'CANCELLED';

export type ImportPreviewOutcome =
  | { readonly ok: true; readonly plan: ImportPlan }
  | { readonly ok: false; readonly code: ImportPreviewErrorCode; readonly message: string };

export type ImportApplyErrorCode =
  | 'UNKNOWN_BATCH'
  | 'STALE_REVISION'
  | 'PLAN_MISMATCH'
  | 'BLOCKED'
  | 'READ_ONLY'
  | 'SNAPSHOT_FAILED'
  | 'REJECTED';

/** The stored record of an import (`importBatches`); plain JSON so persistence can keep it as opaque `JsonValue`. */
export interface ImportBatchReport {
  readonly batchId: string;
  readonly appliedAt: string;
  readonly fileName: string;
  readonly format: ImportFormat;
  readonly mode: 'replace_all' | 'merge';
  readonly snapshotId: string;
  readonly revisionBefore: number;
  readonly revisionAfter: number;
  readonly mergedRecordCount: number;
  readonly counts: ImportPreview['counts'];
  readonly conflicts: readonly IdConflict[];
  readonly excluded: readonly RecordRef[];
  readonly copyIdMap: ImportPlan['copyIdMap'];
  readonly decisions: readonly ImportDecision[];
  readonly richTextLinksRewritten: number;
  readonly unsafeKeysRenamed: number;
  readonly quarantinedCount: number;
  readonly rejectedAssets: readonly RejectedAsset[];
  readonly assets: ImportAssetSummary;
  readonly findingSummary: FindingSummary;
  /** Legacy imports (step 3.11c): the full report, stored with the batch. */
  readonly legacyReport?: LegacyImportReport;
}

export type ImportApplyResult =
  | {
      readonly ok: true;
      readonly revision: number;
      /** The mandatory `pre_import` snapshot: restoring it is "Undo import". */
      readonly snapshotId: string;
      readonly report: ImportBatchReport;
      /** False when the batch report or the quarantine rows could not be stored (the import itself is applied); `reportError` says why. */
      readonly reportSaved: boolean;
      readonly reportError?: string;
    }
  | { readonly ok: false; readonly code: ImportApplyErrorCode; readonly message: string; readonly error?: CommandError };

export interface ExportOptions {
  readonly scope: 'full' | 'chemistry' | 'curriculum' | 'presentation' | 'subset';
  readonly subset?: readonly RecordRef[];
  /** For subsets: include the reference closure so the export imports cleanly. */
  readonly includeDependencies: boolean;
  readonly assets: 'none' | 'embed' | 'package';
}

/**
 * Asset bytes for export (Q7, docs/PROGRESS.md "Phase 3 contract decisions"): a function port passed
 * BESIDE `ExportOptions`, never inside them, so options stay structured-clone-safe. `undefined` means
 * the bytes are unavailable (never thrown): the caller reports it in `ExportResult.missingAssets`
 * rather than failing the whole export (CLAUDE.md §1.5).
 */
export type AssetBytesProvider = (assetId: AssetId, sha256: string) => Promise<Uint8Array | undefined>;

/** Longest `MissingAsset.message` (characters): a provider's error text is kept, but bounded (CLAUDE.md §1.6). */
export const MISSING_ASSET_MESSAGE_CAP = 500;
/** An included asset whose bytes the export could not supply: `no_bytes` (provider answered `undefined`) or `read_failed` (it threw; `message` capped). */
export interface MissingAsset {
  readonly assetId: AssetId;
  readonly sha256: string;
  readonly reason?: 'no_bytes' | 'read_failed';
  readonly message?: string;
}

/** A reference that does not resolve inside the exported set (only possible for `scope: 'subset'` without closure). */
export interface MissingReference {
  readonly from: RecordRef;
  readonly path: string;
  readonly targetKind?: RecordKind;
  readonly targetId: string;
}

/** What building an export produced: nothing is silent (CLAUDE.md §1.5) — every gap is a counted, reported value. */
export interface ExportResult {
  readonly bytes: Uint8Array;
  readonly counts: Readonly<Partial<Record<RecordKind, number>>>;
  /** Asset records included whose bytes `AssetBytesProvider` could not supply. */
  readonly missingAssets: readonly MissingAsset[];
  /** Only ever non-empty for `scope: 'subset'` with `includeDependencies: false`. */
  readonly missingReferences: readonly MissingReference[];
}

export type ExportErrorCode = 'CANCELLED' | 'SERIALIZE_FAILED';

export type ExportBuildResult =
  | { readonly ok: true; readonly result: ExportResult }
  | { readonly ok: false; readonly code: ExportErrorCode; readonly message: string };

/**
 * Cancellation and progress (Q12, docs/PROGRESS.md "Phase 3 contract decisions"): io and persistence must not import
 * `src/workers`, so this is structurally the same shape as `RpcCallContext` minus the required-ness — a Phase 4
 * compute-worker caller holding a real `RpcCallContext` can pass it here directly without adapting it (see the
 * type-level test in `tests/types/task-options.test.ts`, which is the direction that actually has to hold: a
 * `TaskOptions` value is NOT assignable the other way, since `RpcCallContext.signal`/`progress` are required).
 */
export interface TaskOptions {
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total?: number, note?: string) => void;
}
