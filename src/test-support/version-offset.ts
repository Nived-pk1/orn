/**
 * A test-only way to exercise the REAL migration runner with a document older than the runner accepts (Q10, docs/
 * PROGRESS.md "Phase 3 contract decisions"). The real runner rejects `schemaVersion < 1`, and until the first real
 * schema bump there is no step below the current version, so a synthetic "version 0 → 1" step cannot be registered
 * as such. `withVersionOffset` registers the steps shifted up by `offset` (0 → 1 becomes 1 → 2, target 2) in the real
 * `createMigrationRunner`, and wraps it so the caller only ever sees the unshifted numbers: the document's version,
 * the steps' own view of it, the step reports and the errors' `atVersion` all map back exactly. The runner's logic
 * and error codes are the real ones; only the numbers in its human-readable `message` are the shifted ones.
 */
import { createMigrationRunner } from '@/core/migrations';
import { MIGRATIONS } from '@/core/migrations/steps';
import { CURRENT_SCHEMA_VERSION } from '@/core/schema';
import type { MigratableDocument, MigrationRunner, MigrationStepReport, SchemaMigration } from '@/core/migrations/contracts';

export function withVersionOffset(steps: readonly SchemaMigration[], offset = 1, target = 1): MigrationRunner {
  const shift = (doc: MigratableDocument, by: number): MigratableDocument =>
    typeof doc.schemaVersion === 'number' ? { ...doc, schemaVersion: doc.schemaVersion + by } : doc;
  const report = (r: MigrationStepReport, by: number): MigrationStepReport => ({ ...r, from: r.from + by, to: r.to + by });

  const shifted: SchemaMigration[] = steps.map((step) => ({
    from: step.from + offset,
    to: step.to + offset,
    description: step.description,
    migrate(doc) {
      const out = step.migrate(shift(doc, -offset));
      return { doc: shift(out.doc, offset), report: report(out.report, offset) };
    },
  }));
  const real = createMigrationRunner(shifted, target + offset);

  return {
    target,
    run(doc) {
      const result = real.run(shift(doc, offset));
      if (!result.ok) return { ...result, atVersion: result.atVersion - offset };
      return { ok: true, doc: shift(result.doc, -offset), steps: result.steps.map((r) => report(r, -offset)) };
    },
  };
}

/**
 * `withVersionOffset` for the flows that end at the CURRENT schema (boot, restore, follower): the made-up steps (version 0 shown as
 * "1 older than the first real version") followed by the real steps from version 1 up to `CURRENT_SCHEMA_VERSION`, so a migrated
 * document is a current one. Since the first real bump (1 to 2, step 5.5c) the synthetic chain is one step longer than it was.
 */
export function withVersionOffsetToCurrent(steps: readonly SchemaMigration[]): MigrationRunner {
  return withVersionOffset([...steps, ...MIGRATIONS.filter((step) => step.from >= 1)], 1, CURRENT_SCHEMA_VERSION);
}

