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

export interface MigrationRunner {
  /** Applies registered steps from doc.schemaVersion up to CURRENT_SCHEMA_VERSION. Rejects newer versions. */
  run(doc: MigratableDocument): { readonly doc: MigratableDocument; readonly steps: readonly MigrationStepReport[] };
}
