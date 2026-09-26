/**
 * Schema migrations — docs/MIGRATION.md §1–§3. Pure, deterministic, one version step each.
 * A migration never drops information silently: anything it cannot map goes to
 * provenance.legacy.unmapped on the affected record AND into the migration report.
 */
export interface MigratableDocument {
  readonly format: 'orn.dataset';
  readonly schemaVersion: number;
  readonly records: Readonly<Record<string, readonly unknown[]>>;
  readonly [key: string]: unknown;
}

export interface MigrationStepReport {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  readonly changedRecordIds: readonly string[];
  readonly notes: readonly string[];
}

export interface SchemaMigration {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  migrate(doc: MigratableDocument): { readonly doc: MigratableDocument; readonly report: MigrationStepReport };
}

export type MigrationErrorCode =
  | 'INVALID_VERSION'
  | 'NEWER_VERSION'
  | 'MISSING_STEP'
  | 'STEP_FAILED'
  | 'STEP_CONTRACT';

export interface MigrationError {
  readonly ok: false;
  readonly code: MigrationErrorCode;
  readonly message: string;
  /** Version the document had when the failure happened. */
  readonly atVersion: number;
}

export interface MigrationSuccess {
  readonly ok: true;
  readonly doc: MigratableDocument;
  /** One report per applied step, in order; empty when the document was already current. */
  readonly steps: readonly MigrationStepReport[];
}

export type MigrationResult = MigrationSuccess | MigrationError;

export interface MigrationRunner {
  /** Version this runner migrates to (CURRENT_SCHEMA_VERSION for the app runner). */
  readonly target: number;
  /**
   * Applies registered steps from doc.schemaVersion up to `target`. Never mutates its input.
   * A newer version, a gap in the chain or a failing step is an error value, never a partial result.
   */
  run(doc: MigratableDocument): MigrationResult;
}
