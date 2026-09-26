/**
 * Import/export contracts — docs/PERSISTENCE.md §6–§8 and docs/MIGRATION.md §4.
 * Import is a dry run first (preview), never mutates state before explicit confirmation (INV-21),
 * and is applied as ONE replaceState/commit after a pre-import snapshot.
 */
import type { RecordKind, RecordRef } from '@/core/schema';
import type { Finding } from '@/core/validation/contracts';

export const IMPORT_LIMITS = {
  maxJsonBytes: 50 * 1024 * 1024,
  maxPackageBytes: 200 * 1024 * 1024,
  maxRecords: 200_000,
  maxJsonDepth: 64,
  maxStringLength: 1_000_000,
  maxQuarantineRawBytes: 64 * 1024,
} as const;

export type ImportFormat = 'orn.dataset' | 'orn.package' | 'legacy-orn-html';

export interface ImportSource {
  readonly fileName: string;
  readonly bytes: Blob;
}

export interface QuarantinedItem {
  readonly claimedKind?: string;
  readonly claimedId?: string;
  readonly issues: readonly string[];
}

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
