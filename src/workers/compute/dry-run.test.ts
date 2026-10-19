/**
 * The dry run of a draft (step 6.2a, part 2): the draft's own L1-L3 findings, the replica untouched.
 */
import { describe, expect, it } from 'vitest';
import type { Reaction, Species } from '@/core/schema';
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

describe('dry run of a REACTION draft (step 6.3a part 2)', () => {
  const GRIGNARD = MAX.records.reaction['rxn_max-grignard-propanone'] as Reaction;
  const asReaction = (draft: unknown) => {
    const { state, indexes } = held();
    return dryRun(state, indexes, 'reaction', draft);
  };
  const withParticipant = (ref: { kind: 'species' | 'class' | 'reagent'; id: string }, role: Reaction['participants'][number]['role'] = 'reactant'): Reaction => ({
    ...GRIGNARD,
    participants: [...GRIGNARD.participants, { id: 'prt_added-draft' as never, ref: ref as never, role }],
    stages: GRIGNARD.stages.map((stage, i) => (i === 0 ? { ...stage, participantIds: [...stage.participantIds, 'prt_added-draft' as never] } : stage)),
  });

  it('a stored reaction unchanged has the findings the validator gives it', () => {
    const { state, indexes } = held();
    expect(asReaction(GRIGNARD)).toEqual({ ok: true, findings: validator.validateAll(state, indexes).filter((f) => f.subject.id === GRIGNARD.id) });
  });

  it('a dangling participant gets REF-001 at its field', () => {
    const result = asReaction(withParticipant({ kind: 'species', id: 'spc_does-not-exist' }));
    expect(ruleIds(result)).toContain('REF-001');
    expect(result.ok && result.findings.find((f) => f.ruleId === 'REF-001')?.path).toBe(`participants[${GRIGNARD.participants.length}].ref`);
  });

  it('RXN-021 names the role and the stage of the repeat', () => {
    const first = GRIGNARD.participants[0] as Reaction['participants'][number];
    const result = asReaction(withParticipant({ kind: first.ref.kind, id: first.ref.id } as never, first.role));
    const finding = result.ok ? result.findings.find((f) => f.ruleId === 'RXN-021') : undefined;
    expect(finding?.message).toMatch(/is listed twice as reactant in stage 1; use the coefficient instead\.$/);
  });

  it('a draft of a NEW reaction needs no stored record (its ID is only in the overlay) and never changes the replica', () => {
    const replica = loadedReplica(MAX, 3);
    const before = replica.snapshot();
    const stateBefore = structuredClone(before.state);
    const findingsBefore = before.findings.all();
    const fresh = { ...GRIGNARD, id: 'rxn_new-draft', name: 'New one', participants: [], stages: [], outcomes: [], conditionVariants: [], intermediates: [] };
    for (const draft of [fresh, withParticipant({ kind: 'species', id: 'spc_nope' }), { kind: 'reaction', id: 'rxn_x' }]) dryRun(before.state, before.indexes, 'reaction', draft);
    const after = replica.snapshot();
    expect(after.state).toBe(before.state);
    expect(after.state).toEqual(stateBefore);
    expect(after.indexes.get('rxn_new-draft')).toBeUndefined();
    expect(after.findings.all()).toEqual(findingsBefore);
    expect(after.revision).toBe(3);
  });

  it("answers what the store's gate finds once the draft is committed (the same L1-L3 rules)", () => {
    const first = GRIGNARD.participants[0] as Reaction['participants'][number];
    const drafts: Reaction[] = [
      { ...GRIGNARD, id: 'rxn_new-draft' as never, name: 'A fresh name', participants: [], stages: [], outcomes: [], conditionVariants: [], intermediates: [], review: { ...GRIGNARD.review, lifecycle: 'draft' } },
      withParticipant({ kind: first.ref.kind, id: first.ref.id } as never, first.role), // an EDIT of the stored reaction
    ];
    for (const draft of drafts) {
      const store = makeStore(MAX);
      const committed = store.dispatch(envelope('Save', { type: draft.id === GRIGNARD.id ? 'record.update' : 'record.create', record: draft }));
      expect(committed.ok).toBe(true);
      const gate = store.findings.bySubject({ kind: 'reaction', id: draft.id }).filter((f) => f.level <= 3);
      const key = (f: { ruleId: string; path?: string; severity: string }): string => `${f.ruleId}|${f.path ?? ''}|${f.severity}`;
      const result = asReaction(draft);
      expect(result.ok && result.findings.map(key).sort()).toEqual(gate.map(key).sort());
    }
  });
});
