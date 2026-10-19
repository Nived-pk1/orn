/**
 * The dry run of a draft (step 6.2a, part 2): the draft's own L1-L3 findings, the replica untouched.
 */
import { describe, expect, it } from 'vitest';
import type { Species } from '@/core/schema';
import { validator } from '@/core/validation';
import { envelope, makeStore, mustCommit } from '@/test-support/command-kit';
import { loadedReplica } from '@/test-support/replica-kit';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createComputeHandlers } from './handlers';
import { dryRun } from './dry-run';

const MAX = loadFixtureState('maximal-valid');
const WATER = MAX.records.species['spc_max-water'] as Species;

const held = () => loadedReplica(MAX, 3).snapshot();
const run = (draft: unknown) => {
  const { state, indexes } = held();
  return dryRun(state, indexes, 'species', draft);
};
const ruleIds = (result: ReturnType<typeof run>): string[] => (result.ok ? result.findings.map((f) => f.ruleId) : []);

describe('dry run of a species draft', () => {
  it('a stored record unchanged has the findings the validator gives it', () => {
    const { state, indexes } = held();
    expect(dryRun(state, indexes, 'species', WATER)).toEqual({ ok: true, findings: validator.validateAll(state, indexes).filter((f) => f.subject.id === WATER.id) });
  });

  it('a dangling class reference gets REF-001, linked to its field', () => {
    const result = run({ ...WATER, id: 'spc_new-draft', classIds: ['cls_does-not-exist'] });
    expect(ruleIds(result)).toContain('REF-001');
    expect(result.ok && result.findings.find((f) => f.ruleId === 'REF-001')?.path).toBe('classIds[0]');
  });

  it('a draft that fails the schema answers L1 only', () => {
    const result = run({ kind: 'species', id: 'spc_new-draft' });
    expect(result.ok && result.findings.length > 0 && result.findings.every((f) => f.level === 1)).toBe(true);
  });

  it('SPC-001 compares the DRAFT names with the stored ones (a new twin, a renamed record, a record that no longer collides)', () => {
    expect(ruleIds(run({ ...WATER, id: 'spc_new-draft' }))).toContain('SPC-001');
    const renamed = run({ ...WATER, names: { ...WATER.names, canonical: 'Something else entirely', common: [], aliases: [] } });
    expect(ruleIds(renamed)).not.toContain('SPC-001');
  });

  it('never changes the replica: state, indexes and findings are deep-equal before and after', () => {
    const replica = loadedReplica(MAX, 3);
    const before = replica.snapshot();
    const stateBefore = structuredClone(before.state);
    const namesBefore = before.indexes.byFoldedName('species', 'water');
    const findingsBefore = before.findings.all();
    for (const draft of [{ ...WATER, id: 'spc_new-draft' }, { ...WATER, classIds: ['cls_nope'] }, { kind: 'species', id: 'spc_x' }]) dryRun(before.state, before.indexes, 'species', draft);
    const after = replica.snapshot();
    expect(after.state).toBe(before.state);
    expect(after.state).toEqual(stateBefore);
    expect(after.indexes.byFoldedName('species', 'water')).toEqual(namesBefore);
    expect(after.indexes.get('spc_new-draft')).toBeUndefined();
    expect(after.findings.all()).toEqual(findingsBefore);
    expect(after.revision).toBe(3);
  });

  it("answers what the store's gate finds once the draft is committed (the same L1-L3 rules)", () => {
    for (const draft of [{ ...WATER, id: 'spc_new-draft' }, { ...WATER, id: 'spc_other-draft', names: { canonical: 'Fresh name', common: [], aliases: [] } }]) {
      const store = makeStore(MAX);
      mustCommit(store.dispatch(envelope('Create', { type: 'record.create', record: draft as Species })));
      const gate = store.findings.bySubject({ kind: 'species', id: draft.id }).filter((f) => f.level <= 3);
      const { state, indexes } = held();
      const result = dryRun(state, indexes, 'species', draft);
      const key = (f: { ruleId: string; path?: string; severity: string }): string => `${f.ruleId}|${f.path ?? ''}|${f.severity}`;
      expect(result.ok && result.findings.map(key).sort()).toEqual(gate.map(key).sort());
    }
  });

  it('refuses an unknown kind as a value', () => {
    const { state, indexes } = held();
    expect(dryRun(state, indexes, 'nonsense' as never, {})).toMatchObject({ ok: false, code: 'NOT_A_RECORD' });
  });
});

describe('the checkDraft call', () => {
  const ctx = { signal: new AbortController().signal } as never;
  it('answers the draft findings at the replica revision and REPLICA_STALE at another', async () => {
    const handlers = createComputeHandlers();
    handlers.replica.load(MAX, 5);
    const draft = { ...WATER, id: 'spc_new-draft', classIds: ['cls_nope'] };
    const ok = await handlers.api.checkDraft({ revision: 5, kind: 'species', draft }, ctx);
    expect(ok.ok && ok.findings.some((f) => f.ruleId === 'REF-001')).toBe(true);
    expect(await handlers.api.checkDraft({ revision: 4, kind: 'species', draft }, ctx)).toEqual({ ok: false, code: 'REPLICA_STALE', have: 5 });
    expect(handlers.replica.revision()).toBe(5);
  });
});
