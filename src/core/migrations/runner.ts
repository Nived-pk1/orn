import { CURRENT_SCHEMA_VERSION } from '../schema';
import type {
  MigratableDocument,
  MigrationError,
  MigrationErrorCode,
  MigrationResult,
  MigrationRunner,
  MigrationStepReport,
  SchemaMigration,
} from './contracts';
import { MIGRATIONS } from './steps';

function fail(code: MigrationErrorCode, message: string, atVersion: number): MigrationError {
  return { ok: false, code, message, atVersion };
}

/**
 * Builds a runner over a step list. The list is checked here (programmer errors throw): every step
 * is `from → from + 1`, starting versions are unique, and no step goes beyond `target`.
 * A gap below `target` is not a construction error: it surfaces per document as MISSING_STEP.
 */
export function createMigrationRunner(
  migrations: readonly SchemaMigration[] = MIGRATIONS,
  target: number = CURRENT_SCHEMA_VERSION,
): MigrationRunner {
  const byFrom = new Map<number, SchemaMigration>();
  for (const m of migrations) {
    if (m.to !== m.from + 1) throw new Error(`Migration ${m.from}→${m.to} must advance exactly one version`);
    if (m.to > target) throw new Error(`Migration ${m.from}→${m.to} goes beyond target version ${target}`);
    if (byFrom.has(m.from)) throw new Error(`Two migrations start at version ${m.from}`);
    byFrom.set(m.from, m);
  }

  function run(input: MigratableDocument): MigrationResult {
    const start: unknown = input.schemaVersion;
    if (typeof start !== 'number' || !Number.isInteger(start) || start < 1) {
      return fail('INVALID_VERSION', `schemaVersion ${String(start)} is not a positive integer`, Number(start));
    }
    if (start > target) {
      return fail(
        'NEWER_VERSION',
        `Document schema version ${start} is newer than this app supports (${target}); open it read-only or update the app`,
        start,
      );
    }
    let doc = input;
    const steps: MigrationStepReport[] = [];
    // Each iteration raises the version by exactly one (checked below), so at most `target` iterations.
    while (doc.schemaVersion < target) {
      const at = doc.schemaVersion;
      const step = byFrom.get(at);
      if (!step) return fail('MISSING_STEP', `No migration registered from schema version ${at}`, at);
      let out: ReturnType<SchemaMigration['migrate']>;
      try {
        out = step.migrate(doc);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return fail('STEP_FAILED', `Migration ${step.from}→${step.to} failed: ${reason}`, at);
      }
      if (out.doc.schemaVersion !== step.to) {
        return fail(
          'STEP_CONTRACT',
          `Migration ${step.from}→${step.to} returned schemaVersion ${String(out.doc.schemaVersion)}`,
          at,
        );
      }
      if (out.report.from !== step.from || out.report.to !== step.to) {
        return fail(
          'STEP_CONTRACT',
          `Migration ${step.from}→${step.to} returned a report for ${out.report.from}→${out.report.to}`,
          at,
        );
      }
      steps.push(out.report);
      doc = out.doc;
    }
    return { ok: true, doc, steps };
  }

  return { target, run };
}

/** The app's runner: registered steps up to CURRENT_SCHEMA_VERSION. */
export const migrationRunner: MigrationRunner = createMigrationRunner();
