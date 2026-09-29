/**
 * Import/export contracts — docs/PERSISTENCE.md §6–§8 and docs/MIGRATION.md §4.
 * Import is a dry run first (preview), never mutates state before explicit confirmation (INV-21),
 * and is applied as ONE replaceState/commit after a pre-import snapshot.
 */
import type { AnyRecord, AssetId, JsonValue, RecordKind, RecordRef } from '@/core/schema';
import type { Finding } from '@/core/validation/contracts';

export const IMPORT_LIMITS = {
  maxJsonBytes: 50 * 1024 * 1024,
  maxPackageBytes: 200 * 1024 * 1024,
  /** Q5 (docs/PROGRESS.md "Phase 3 contract decisions"): matches SECURITY.md §3's asset cap. */
  maxAssetBytes: 20 * 1024 * 1024,
  maxRecords: 200_000,
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
  readonly assets: readonly ParsedAsset[];
  readonly rejectedAssets: readonly RejectedAsset[];
  /** `orn.package` only. */
  readonly packageIssues: readonly PackageEntryIssue[];
  /** `legacy_v6`/`legacy_v4` only: the raw parsed JSON (capped, unsafe keys already renamed), for step 3.8+. */
  readonly legacyPayload?: JsonValue;
}

export type ImportParseOutcome =
  | { readonly ok: true; readonly result: ImportParseResult }
  | { readonly ok: false; readonly code: ImportRejectionCode; readonly message: string; readonly detail?: Readonly<Record<string, unknown>> };

export type ConflictResolution = 'identical_skip' | 'keep_current' | 'replace' | 'import_as_copy';

export interface IdConflict {
  readonly ref: RecordRef;
  readonly resolution: ConflictResolution;
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
}

export interface ImportPreview {
  readonly batchId: string;
  readonly format: ImportFormat;
  readonly detectedSchemaVersion: number;
  readonly migrationsApplied: readonly string[];
  readonly counts: Readonly<
    Partial<Record<RecordKind, { readonly incoming: number; readonly new: number; readonly identical: number; readonly conflicting: number }>>
  >;
  readonly quarantined: readonly QuarantinedItem[];
  readonly conflicts: readonly IdConflict[];
  /** Findings for the MERGED result, computed on a replica (never on live state). */
  readonly findings: readonly Finding[];
  readonly decisions: readonly ImportDecision[];
  readonly legacyReport?: LegacyImportReport;
}

export interface ImportPlan {
  readonly preview: ImportPreview;
  readonly mode: 'replace_all' | 'merge';
  readonly decisions: readonly ImportDecision[];
  readonly conflicts: readonly IdConflict[];
}

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
  readonly missingAssets: readonly { readonly assetId: AssetId; readonly sha256: string }[];
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
