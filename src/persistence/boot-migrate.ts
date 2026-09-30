/**
 * Boot step 3, older schema on disk (docs/PERSISTENCE.md §4, MIGRATION.md §2): tolerant document from the stored
 * rows → migrate in memory (the injected runner) → `pre_migration` snapshot → strict parse → L1–L3 → `replaceAll`.
 * The migration itself is pure and writes nothing, so a version the runner refuses outright (invalid, newer) is
 * reported with nothing written and no snapshot. Any other failure happens with the `pre_migration` snapshot in
 * place and ends with the stored rows put back exactly as the snapshot holds them (a rollback that is a no-op
 * today, because `replaceAll` is one atomic transaction, and stays correct if that ever changes).
 */
import { documentToState } from '@/core/dataset';
import type { MigratableDocument, MigrationStepReport } from '@/core/migrations/contracts';
import { DatasetDocumentSchema, RECORD_KINDS, type CanonicalState } from '@/core/schema';
import type { Finding } from '@/core/validation/contracts';
import type { PrecomputedFindings } from '@/core/commands/contracts';
import { validateForBoot, type BootValidation } from './boot-validate';
import type { BootPorts } from './boot-ports';
import type { SnapshotSummary } from './contracts';
import { describeError } from './events';

const MAX_DETAIL_ISSUES = 5;

export type MigrateOutcome =
  | { readonly ok: true; readonly state: CanonicalState; readonly revision: number; readonly steps: readonly MigrationStepReport[]; readonly findings: readonly Finding[]; readonly precomputed: PrecomputedFindings; readonly validation: BootValidation['report'] }
  | { readonly ok: false; readonly reason: 'migration_failed' | 'newer_schema'; readonly detail: string };

/** The stored rows as the tolerant document a migration step expects (rows of unknown kinds keep their own key). */
export function tolerantDocument(rows: readonly unknown[], meta: unknown, schemaVersion: unknown, exportedAt: string, generator: { app: string; version: string }): MigratableDocument {
  const records: Record<string, unknown[]> = {};
  for (const kind of RECORD_KINDS) records[kind] = [];
  for (const row of rows) {
    const kind = typeof row === 'object' && row !== null ? (row as { kind?: unknown }).kind : undefined;
    const key = typeof kind === 'string' ? kind : 'unknown';
    (records[key] ??= []).push(row);
  }
  return { format: 'orn.dataset', schemaVersion: schemaVersion as number, exportedAt, exportScope: 'full', generator, meta, records };
}

export async function migrateOnDisk(ports: BootPorts, doc: MigratableDocument, storedVersion: unknown, storedRevision: number): Promise<MigrateOutcome> {
  const migrated = ports.runner.run(doc);
  if (!migrated.ok && (migrated.code === 'INVALID_VERSION' || migrated.code === 'NEWER_VERSION')) {
    return { ok: false, reason: migrated.code === 'NEWER_VERSION' ? 'newer_schema' : 'migration_failed', detail: migrated.message };
  }

  let snapshot: SnapshotSummary;
  try {
    snapshot = await ports.createRawSnapshot('pre_migration', doc, storedRevision, `before migrating from schema version ${String(storedVersion)}`);
  } catch (error) {
    return { ok: false, reason: 'migration_failed', detail: `the pre_migration snapshot could not be written, so nothing was migrated (${describeError(error)})` };
  }

  /** Every failure after the snapshot ends here: rows back as the snapshot holds them, error detail kept. */
  const fail = async (detail: string): Promise<MigrateOutcome> => {
    const rolledBack = await ports.restoreRawSnapshot(snapshot.id);
    const note = rolledBack.ok ? `the stored data was put back from snapshot ${snapshot.id}` : `restoring snapshot ${snapshot.id} also failed: ${rolledBack.message}`;
    return { ok: false, reason: 'migration_failed', detail: `${detail}; ${note}` };
  };

  if (!migrated.ok) return fail(migrated.message);
  const parsed = DatasetDocumentSchema.safeParse(migrated.doc);
  if (!parsed.success) {
    const first = parsed.error.issues.slice(0, MAX_DETAIL_ISSUES).map((i) => `${i.path.map(String).join('.')}: ${i.message}`);
    return fail(`the migrated document does not pass validation (${parsed.error.issues.length} issue(s), e.g. ${first.join(' | ')})`);
  }
  const converted = documentToState(parsed.data);
  if (!converted.ok) return fail(`the migrated document repeats record IDs (${converted.duplicates.slice(0, MAX_DETAIL_ISSUES).map((d) => d.id).join(', ')})`);

  const revision = storedRevision + 1;
  // Awaited before `replaceAll`, and the ERROR gate below still decides: nothing is written for data that does not pass.
  const validated = await validateForBoot(ports, converted.state, revision);
  const findings = validated.precomputed.findings;
  const errors = findings.filter((f) => f.severity === 'error');
  if (errors.length > 0) {
    return fail(`the migrated data has ${errors.length} L1–L3 error(s), e.g. ${errors.slice(0, MAX_DETAIL_ISSUES).map((f) => `${f.ruleId} ${f.subject.id}`).join(', ')}`);
  }
  try {
    await ports.replaceAll(converted.state, revision);
  } catch (error) {
    return fail(`writing the migrated data failed (${describeError(error)})`);
  }
  return { ok: true, state: converted.state, revision, steps: migrated.steps, findings, precomputed: validated.precomputed, validation: validated.report };
}
