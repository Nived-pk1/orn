import { describe, expect, it } from 'vitest';
import { RECORD_KINDS, type AnyRecord } from '@/core/schema';
import { loadFixtureState } from '@/test-support/state-fixture';
import type { CommittedData } from './boot-ports';
import { interpretCommitted } from './follower-read';

const state = loadFixtureState('minimal-valid');
const rows = RECORD_KINDS.flatMap((kind) => Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>));
const committed = (overrides: Partial<CommittedData['meta']> = {}, withRows: readonly unknown[] = rows): CommittedData => ({
  rows: withRows,
  meta: { schemaVersion: 1, datasetMeta: state.meta as never, revision: 4, ...overrides },
});

describe('interpretCommitted: a follower loads only what it can load without writing', () => {
  it('a current database becomes a state at its revision', () => {
    const result = interpretCommitted(committed(), 1, '2026-09-28T10:00:00.000Z');
    expect(result).toMatchObject({ ok: true, revision: 4, rejected: [] });
    expect(result.ok && result.state).toEqual(state);
  });

  it('rows that fail L1 are reported (id and issues) and left out of the state, never quarantined', () => {
    const bad = { ...rows[0], unexpectedField: 1 };
    const result = interpretCommitted(committed({}, [...rows.slice(1), bad]), 1, '2026-09-28T10:00:00.000Z');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rejected).toEqual([{ id: String((bad as { id: string }).id), issues: [expect.stringContaining('Unknown field')] }]);
    expect(Object.values(result.state.records).flatMap((t) => Object.keys(t))).not.toContain((bad as { id: string }).id);
  });

  it('nothing stored is "empty"', () => {
    expect(interpretCommitted({ rows: [], meta: {} }, 1, 'x')).toMatchObject({ ok: false, reason: 'empty' });
  });

  it.each([
    ['a newer schema', committed({ schemaVersion: 2 }), 'newer_schema'],
    ['an older schema (only the writer migrates)', committed({ schemaVersion: 0 }), 'needs_migration'],
    ['no schema version next to records', committed({ schemaVersion: undefined as never }), 'needs_migration'],
    ['a fractional schema version', committed({ schemaVersion: 1.5 }), 'needs_migration'],
    ['a missing revision', committed({ revision: undefined as never }), 'integrity_failure'],
    ['a negative revision', committed({ revision: -1 }), 'integrity_failure'],
    ['a damaged dataset meta', committed({ datasetMeta: { title: 5 } as never }), 'integrity_failure'],
  ])('%s is refused with a reason', (_name, data, reason) => {
    expect(interpretCommitted(data, 1, 'x')).toMatchObject({ ok: false, reason, detail: expect.any(String) });
  });
});
