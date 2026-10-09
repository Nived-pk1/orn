import { describe, expect, it } from 'vitest';
import expectedMaximal from '../../../data/fixtures/schema/v2/expected/maximal-from-v1.orn.json';
import expectedMinimal from '../../../data/fixtures/schema/v2/expected/minimal-from-v1.orn.json';
import maximalV2 from '../../../data/fixtures/schema/v2/maximal-valid.orn.json';
import minimalV2 from '../../../data/fixtures/schema/v2/minimal-valid.orn.json';
import maximalV1 from '../../../data/fixtures/schema/v1/maximal-valid.orn.json';
import minimalV1 from '../../../data/fixtures/schema/v1/minimal-valid.orn.json';
import { CURRENT_SCHEMA_VERSION } from '../schema';
import type { MigratableDocument, SchemaMigration } from './contracts';
import { createMigrationRunner, migrationRunner } from './runner';
import { MIGRATIONS } from './steps';

function doc(version: number): MigratableDocument {
  return { format: 'orn.dataset', schemaVersion: version, records: { species: [] } };
}

function report(from: number, to: number) {
  return { from, to, description: `test ${from}→${to}`, changedRecordIds: [], notes: [] };
}

/** Test step: bumps the version and appends to a `trail` marker. */
function step(from: number): SchemaMigration {
  return {
    from,
    to: from + 1,
    description: `test ${from}→${from + 1}`,
    migrate(d) {
      const trail = (d.trail as string[] | undefined) ?? [];
      return { doc: { ...d, schemaVersion: from + 1, trail: [...trail, `${from}→${from + 1}`] }, report: report(from, from + 1) };
    },
  };
}

describe('application runner (1 to 2 registered)', () => {
  it('registers exactly the step 1 to 2 while the schema is at version 2', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(MIGRATIONS.map((m) => [m.from, m.to])).toEqual([[1, 2]]);
    expect(migrationRunner.target).toBe(CURRENT_SCHEMA_VERSION);
  });

  it.each([
    ['minimal', minimalV1, expectedMinimal],
    ['maximal', maximalV1, expectedMaximal],
  ])('migrates the frozen %s v1 fixture to the committed v2 output, changing nothing but the version', (_name, fixture, expected) => {
    const input = fixture as unknown as MigratableDocument;
    const before = JSON.stringify(input);
    const result = migrationRunner.run(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc).toEqual(expected);
    expect({ ...result.doc, schemaVersion: 1 }).toEqual(input);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ from: 1, to: 2, changedRecordIds: [], notes: [] });
    expect(JSON.stringify(input)).toBe(before);
  });

  it.each([
    ['minimal', minimalV2],
    ['maximal', maximalV2],
  ])('returns the %s v2 fixture unchanged (same object, no reports)', (_name, fixture) => {
    const input = fixture as unknown as MigratableDocument;
    const result = migrationRunner.run(input);
    expect(result).toEqual({ ok: true, doc: input, steps: [] });
    expect(result.ok && result.doc).toBe(input);
  });

  it('rejects a newer version with NEWER_VERSION', () => {
    expect(migrationRunner.run(doc(CURRENT_SCHEMA_VERSION + 1))).toMatchObject({
      ok: false,
      code: 'NEWER_VERSION',
      atVersion: CURRENT_SCHEMA_VERSION + 1,
    });
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects version %s as INVALID_VERSION', (v) => {
    expect(migrationRunner.run(doc(v))).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
  });

  it('treats an infinite version as newer, not as a loop', () => {
    expect(migrationRunner.run(doc(Number.POSITIVE_INFINITY))).toMatchObject({ ok: false });
  });

  it('rejects a non-numeric version without throwing', () => {
    const bad = { ...doc(1), schemaVersion: '1' } as unknown as MigratableDocument;
    expect(migrationRunner.run(bad)).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
  });
});

describe('createMigrationRunner: chain', () => {
  it('applies steps in order from the document version to the target', () => {
    const result = createMigrationRunner([step(2), step(1), step(3)], 4).run(doc(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.schemaVersion).toBe(4);
    expect(result.doc.trail).toEqual(['1→2', '2→3', '3→4']);
    expect(result.steps.map((s) => [s.from, s.to])).toEqual([[1, 2], [2, 3], [3, 4]]);
  });

  it('starts mid-chain for a newer-than-oldest document', () => {
    const result = createMigrationRunner([step(1), step(2), step(3)], 4).run(doc(3));
    expect(result.ok && result.steps.map((s) => s.from)).toEqual([3]);
  });

  it('is deterministic and leaves a frozen input untouched', () => {
    const runner = createMigrationRunner([step(1), step(2)], 3);
    const input = Object.freeze(doc(1));
    expect(runner.run(input)).toEqual(runner.run(input));
    expect(input.schemaVersion).toBe(1);
  });

  it('reports MISSING_STEP for a gap, with the version where it stopped', () => {
    expect(createMigrationRunner([step(1), step(3)], 4).run(doc(1))).toMatchObject({
      ok: false,
      code: 'MISSING_STEP',
      atVersion: 2,
    });
  });

  it('reports MISSING_STEP when an older document has no steps at all', () => {
    expect(createMigrationRunner([], 2).run(doc(1))).toMatchObject({ ok: false, code: 'MISSING_STEP', atVersion: 1 });
  });

  it('returns no partial result when a later step throws', () => {
    const boom: SchemaMigration = {
      ...step(2),
      migrate: () => {
        throw new Error('bad record');
      },
    };
    expect(createMigrationRunner([step(1), boom], 3).run(doc(1))).toEqual({
      ok: false,
      code: 'STEP_FAILED',
      message: 'Migration 2→3 failed: bad record',
      atVersion: 2,
    });
  });

  it('turns a non-Error throw into STEP_FAILED', () => {
    const boom: SchemaMigration = {
      ...step(1),
      migrate: () => {
        throw 'nope';
      },
    };
    expect(createMigrationRunner([boom], 2).run(doc(1))).toMatchObject({ ok: false, code: 'STEP_FAILED' });
  });

  it('rejects a step that does not set the new schemaVersion', () => {
    const lazy: SchemaMigration = { ...step(1), migrate: (d) => ({ doc: d, report: report(1, 2) }) };
    expect(createMigrationRunner([lazy], 2).run(doc(1))).toMatchObject({ ok: false, code: 'STEP_CONTRACT' });
  });

  it('rejects a step whose report names other versions', () => {
    const wrong: SchemaMigration = {
      ...step(1),
      migrate: (d) => ({ doc: { ...d, schemaVersion: 2 }, report: report(1, 3) }),
    };
    expect(createMigrationRunner([wrong], 2).run(doc(1))).toMatchObject({ ok: false, code: 'STEP_CONTRACT' });
  });

  it('rejects a newer document and keeps a current one as is', () => {
    const runner = createMigrationRunner([step(1)], 2);
    expect(runner.run(doc(3))).toMatchObject({ ok: false, code: 'NEWER_VERSION' });
    const current = doc(2);
    expect(runner.run(current)).toEqual({ ok: true, doc: current, steps: [] });
  });
});

describe('createMigrationRunner: construction (programmer errors)', () => {
  it('throws on a step that skips versions', () => {
    expect(() => createMigrationRunner([{ ...step(1), to: 3 }], 3)).toThrow(/exactly one/);
  });
  it('throws on duplicate from', () => {
    expect(() => createMigrationRunner([step(1), step(1)], 2)).toThrow(/Two migrations/);
  });
  it('throws on a step beyond the target', () => {
    expect(() => createMigrationRunner([step(1), step(2)], 2)).toThrow(/beyond target/);
  });
});
