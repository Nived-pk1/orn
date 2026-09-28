/** Self-test of `withVersionOffset` (Q10): numbers map back exactly and every real-runner error code passes through. */
import { describe, expect, it } from 'vitest';
import { createMigrationRunner } from '@/core/migrations';
import type { MigratableDocument, SchemaMigration } from '@/core/migrations/contracts';
import { withVersionOffset } from './version-offset';

const doc = (schemaVersion: unknown, extra: Record<string, unknown> = {}): MigratableDocument =>
  ({ format: 'orn.dataset', schemaVersion, records: {}, ...extra }) as MigratableDocument;

const step = (from: number, seen: number[] = []): SchemaMigration => ({
  from,
  to: from + 1,
  description: `step ${from}`,
  migrate(input) {
    seen.push(input.schemaVersion);
    return {
      doc: { ...input, schemaVersion: from + 1, [`s${from}`]: true },
      report: { from, to: from + 1, description: `step ${from}`, changedRecordIds: [`id-${from}`], notes: [`note ${from}`] },
    };
  },
});

describe('withVersionOffset', () => {
  it('the caller sees unshifted numbers: target, document versions, the steps’ own view and the step reports', () => {
    const seen: number[] = [];
    const runner = withVersionOffset([step(0, seen)]);
    expect(runner.target).toBe(1);
    const input = doc(0, { keep: 'me' });
    const out = runner.run(input);
    expect(out).toEqual({
      ok: true,
      doc: { format: 'orn.dataset', schemaVersion: 1, records: {}, keep: 'me', s0: true },
      steps: [{ from: 0, to: 1, description: 'step 0', changedRecordIds: ['id-0'], notes: ['note 0'] }],
    });
    expect(seen).toEqual([0]);
    expect(input).toEqual(doc(0, { keep: 'me' }));
  });

  it('a chain of steps runs in order and reports each one', () => {
    const runner = withVersionOffset([step(0), step(1)], 1, 2);
    const out = runner.run(doc(0));
    expect(out.ok && out.steps.map((s) => [s.from, s.to])).toEqual([[0, 1], [1, 2]]);
    expect(out.ok && out.doc.schemaVersion).toBe(2);
  });

  it('a current document passes through with no steps', () => {
    expect(withVersionOffset([step(0)]).run(doc(1))).toEqual({ ok: true, doc: doc(1), steps: [] });
  });

  it('INVALID_VERSION: below the shifted range, a non-integer and a non-number, with the caller’s number in atVersion', () => {
    const runner = withVersionOffset([step(0)]);
    expect(runner.run(doc(-1))).toMatchObject({ ok: false, code: 'INVALID_VERSION', atVersion: -1 });
    expect(runner.run(doc(0.5))).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
    expect(runner.run(doc('1'))).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
    expect(runner.run(doc(undefined))).toMatchObject({ ok: false, code: 'INVALID_VERSION' });
  });

  it('NEWER_VERSION', () => {
    expect(withVersionOffset([step(0)]).run(doc(2))).toMatchObject({ ok: false, code: 'NEWER_VERSION', atVersion: 2 });
  });

  it('MISSING_STEP: a gap in the chain', () => {
    expect(withVersionOffset([step(0), step(2)], 1, 3).run(doc(1))).toMatchObject({ ok: false, code: 'MISSING_STEP', atVersion: 1 });
  });

  it('STEP_FAILED: a step that throws', () => {
    const boom: SchemaMigration = { from: 0, to: 1, description: 'boom', migrate: () => { throw new Error('exploded'); } };
    expect(withVersionOffset([boom]).run(doc(0))).toMatchObject({ ok: false, code: 'STEP_FAILED', atVersion: 0, message: expect.stringContaining('exploded') });
  });

  it('STEP_CONTRACT: a step that returns the wrong version', () => {
    const wrong: SchemaMigration = { ...step(0), migrate: (d) => ({ doc: { ...d, schemaVersion: 5 }, report: { from: 0, to: 1, description: 'x', changedRecordIds: [], notes: [] } }) };
    expect(withVersionOffset([wrong]).run(doc(0))).toMatchObject({ ok: false, code: 'STEP_CONTRACT', atVersion: 0 });
  });

  it('is the real runner underneath: offset 0 behaves exactly like createMigrationRunner', () => {
    const plain = withVersionOffset([step(1)], 0, 2);
    const real = createMigrationRunner([step(1)], 2);
    for (const input of [doc(1), doc(2), doc(3), doc(0), doc(-1)]) expect(plain.run(input)).toEqual(real.run(input));
  });
});
