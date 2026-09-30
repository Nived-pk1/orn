/**
 * Step 4.2a (Phase 4 contract decisions, Q3): `replaceState` and `reload` accept findings computed elsewhere, but only
 * for exactly the state they adopt. Every refusal is a value (`FINDINGS_MISMATCH`), says which check failed, and leaves
 * the store as it was: state, revision, indexes, findings, history, subscribers. The ERROR gate stays on `replaceState`;
 * `reload` keeps ADR-033 (no gate). Without the parameter nothing changes (store.test.ts, remote.test.ts stay green).
 */
import { describe, expect, it, vi } from 'vitest';
import type { CanonicalState } from '../schema';
import { validator, type Finding } from '../validation';
import { envelope, makeStore, mustCommit, recordIn, withFields } from '../../test-support/command-kit';
import { fingerprintOf, precomputedOf } from '../../test-support/precomputed-kit';
import { commit, loadFixtureState, remove } from '../../test-support/state-fixture';
import type { CommitResult, PrecomputedFindings } from './contracts';
import type { StoreHandle, StoreOptions } from './store';

const SPECIES = 'spc_max-propanone';
const minimal = loadFixtureState('minimal-valid');
const maximal = loadFixtureState('maximal-valid');
/** A state with a dangling reference: L2 ERROR findings. */
const broken = commit(maximal, 0, (tables) => remove(tables, 'species', SPECIES)).after;
const START = 4;

function writable(options: Partial<StoreOptions> = {}) {
  const store = makeStore(minimal, { revision: START, ...options });
  const heard = { calls: 0 };
  store.subscribe(() => void (heard.calls += 1));
  return { store, heard };
}
function follower(options: Partial<StoreOptions> = {}) {
  const store = makeStore(minimal, { revision: START, readOnly: () => true, ...options });
  const heard = { calls: 0 };
  store.subscribe(() => void (heard.calls += 1));
  return { store, heard };
}
const refusal = (result: CommitResult): { code: string; message: string } => {
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
};
const someFinding = (findings: readonly Finding[]): Finding => {
  const first = findings[0];
  if (first === undefined) throw new Error('the state has no findings to build a test from');
  return first;
};

/** One refusal case: the call is refused as FINDINGS_MISMATCH with `reason`, and the store is exactly as before. */
type Call = (store: StoreHandle, pre: PrecomputedFindings) => CommitResult;
const viaReplace: Call = (store, pre) => store.replaceState(maximal, 'import', pre);
const viaReload: Call = (store, pre) => store.reload(maximal, 9, pre);
const ADOPTS = { replaceState: START + 1, reload: 9 };

describe.each([
  ['replaceState', viaReplace, writable, (store: StoreHandle) => store.getRevision() + 1],
  ['reload', viaReload, follower, () => ADOPTS.reload],
] as const)('%s with precomputed findings: every refusal is FINDINGS_MISMATCH and changes nothing', (_name, call, make, adoptedBy) => {
  /** The store first gets one commit (writable case) so its history is not empty; `good` is built for what it will adopt. */
  function expectRefused(damage: (good: PrecomputedFindings, adopted: number) => PrecomputedFindings, reason: RegExp): void {
    const { store, heard } = make();
    if (!store.isReadOnly()) mustCommit(store.dispatch(envelope('Set a note', { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', 'spc_water'), { notes: 'x' }) })));
    const adopted = adoptedBy(store);
    const before = fingerprintOf(store, heard);
    const error = refusal(call(store, damage(precomputedOf(maximal, adopted), adopted)));
    expect(error.code).toBe('FINDINGS_MISMATCH');
    expect(error.message).toMatch(reason);
    expect(fingerprintOf(store, heard)).toEqual(before);
    expect(store.getState()).toBe(before.state);
    expect(store.findings.all()).toBe(before.findings);
  }
  const extra = (good: PrecomputedFindings, more: Finding): PrecomputedFindings => ({ ...good, findings: [...good.findings, more] });

  it('the rule set is not the one of this build', () => expectRefused((good) => ({ ...good, ruleSet: 'rs_0000000000000000' }), /rule set rs_0+ is not this build/));
  it('the revision is not the one the store will adopt', () => expectRefused((good, adopted) => ({ ...good, revision: adopted + 1 }), /for revision \d+, but the store would adopt revision \d+/));
  it('the revision is the current one of the store (stale)', () => expectRefused((good, adopted) => ({ ...good, revision: adopted - 1 }), /would adopt revision/));
  it('a record count differs from the count of the new state', () =>
    expectRefused((good) => ({ ...good, recordCounts: { ...good.recordCounts, species: good.recordCounts.species + 1 } }), /record count for species is \d+, the new state has \d+/));
  it('a record count is missing', () =>
    expectRefused((good) => {
      const { reaction: _dropped, ...rest } = good.recordCounts;
      return { ...good, recordCounts: rest as PrecomputedFindings['recordCounts'] };
    }, /record count for reaction is undefined/));
  it('a record count names an unknown kind', () => expectRefused((good) => ({ ...good, recordCounts: { ...good.recordCounts, gizmo: 1 } as never }), /unknown kind "gizmo"/));
  it('a finding is about a record that is not in the new state', () =>
    expectRefused((good) => extra(good, { ...someFinding(good.findings), subject: { kind: 'species', id: 'spc_nowhere' } }), /spc_nowhere, which is not in the new state/));
  it('a finding is about a subject of the OLD state only', () => {
    expect(maximal.records.species['spc_water']).toBeUndefined();
    expectRefused((good) => extra(good, { ...someFinding(good.findings), subject: { kind: 'species', id: 'spc_water' }, id: 'fnd_0000000000000001' }), /spc_water, which is not in the new state/);
  });
  it('a finding is level 4 (never passed)', () =>
    expectRefused((good) => extra(good, { ...someFinding(good.findings), level: 4, ruleId: 'CHEM-001', id: 'fnd_0000000000000002' }), /level 4; only levels 1-3/));
  it('a finding is of a rule that is not in the rule set', () =>
    expectRefused((good) => extra(good, { ...someFinding(good.findings), ruleId: 'XXX-999', id: 'fnd_0000000000000003' }), /rule XXX-999, which is not in the rule set/));
  it('a finding says a rule is at another level than the rule set does', () =>
    expectRefused((good) => {
      const first = someFinding(good.findings);
      return extra(good, { ...first, level: first.level === 3 ? 2 : 3, id: 'fnd_0000000000000004' });
    }, /the rule set says \d/));
  it('a finding ID appears twice', () => expectRefused((good) => extra(good, someFinding(good.findings)), /finding ID fnd_[0-9a-f]+ appears more than once/));
  it('a finding has an unknown severity', () => expectRefused((good) => ({ ...good, findings: [{ ...someFinding(good.findings), severity: 'fatal' as never }] }), /unknown severity/));
  it('a finding is malformed', () => expectRefused((good) => ({ ...good, findings: [{ id: 'fnd_1' } as never] }), /malformed/));
  it('the value is not the expected shape', () => {
    expectRefused((good) => ({ ...good, findings: 'none' as never }), /not \{ findings, ruleSet, revision, recordCounts \}/);
    expectRefused((good) => ({ ...good, recordCounts: null as never }), /not \{ findings, ruleSet, revision, recordCounts \}/);
  });
});

describe('verifyPrecomputed (tests only, default false)', () => {
  it('when true, findings that differ from validateAll are refused: a missing finding, an extra one, an altered one', () => {
    const good = precomputedOf(maximal, START + 1);
    const first = someFinding(good.findings);
    const cases: readonly [PrecomputedFindings, RegExp][] = [
      [{ ...good, findings: good.findings.slice(1) }, /\d+ findings were passed, validateAll finds \d+/],
      [{ ...good, findings: [...good.findings, { ...first, id: 'fnd_00000000000000ff' }] }, /\d+ findings were passed, validateAll finds \d+/],
      [{ ...good, findings: [{ ...first, message: 'altered' }, ...good.findings.slice(1)] }, /differs from validateAll/],
      [{ ...good, findings: [{ ...first, severity: first.severity === 'warning' ? 'info' : 'warning' }, ...good.findings.slice(1)] }, /differs from validateAll/],
    ];
    expect(good.findings.length).toBeGreaterThan(0);
    for (const [pre, reason] of cases) {
      const { store, heard } = writable({ verifyPrecomputed: true });
      const before = fingerprintOf(store, heard);
      const error = refusal(store.replaceState(maximal, 'import', pre));
      expect(error.code).toBe('FINDINGS_MISMATCH');
      expect(error.message).toMatch(reason);
      expect(fingerprintOf(store, heard)).toEqual(before);
    }
  });

  it('accepts findings equal to validateAll in any order, and reload verifies the same way', () => {
    const good = precomputedOf(maximal, ADOPTS.reload);
    const shuffled = { ...good, findings: [...good.findings].reverse() };
    const { store } = follower({ verifyPrecomputed: true });
    expect(store.reload(maximal, ADOPTS.reload, shuffled).ok).toBe(true);
    const other = follower({ verifyPrecomputed: true });
    const error = refusal(other.store.reload(maximal, ADOPTS.reload, { ...good, findings: good.findings.slice(1) }));
    expect(error.code).toBe('FINDINGS_MISMATCH');
  });

  it('when false (production), a missing finding is NOT detected: only the cheap checks run', () => {
    const good = precomputedOf(maximal, START + 1);
    const { store } = writable();
    expect(store.replaceState(maximal, 'import', { ...good, findings: good.findings.slice(1) }).ok).toBe(true);
    expect(store.findings.all()).toHaveLength(good.findings.length - 1);
  });
});

describe('replaceState with precomputed findings', () => {
  it('adopts the state exactly like the in-process path: state, revision, findings, ChangeSet, history, notification', () => {
    const seed = (): ReturnType<typeof writable> => {
      const rig = writable({ verifyPrecomputed: true });
      mustCommit(rig.store.dispatch(envelope('Set a note', { type: 'record.update', record: withFields(recordIn(rig.store.getState(), 'species', 'spc_water'), { notes: 'x' }) })));
      return rig;
    };
    const plain = seed();
    const fast = seed();
    const a = plain.store.replaceState(maximal, 'import');
    const b = fast.store.replaceState(maximal, 'import', precomputedOf(maximal, plain.store.getRevision()));
    expect(a.ok && b.ok).toBe(true);
    expect(b).toEqual(a);
    for (const rig of [plain, fast]) expect(rig.store.canUndo()).toBe(false);
    expect(fast.store.getState()).toBe(maximal);
    expect(fast.store.getRevision()).toBe(plain.store.getRevision());
    expect(fast.store.findings.all()).toEqual(plain.store.findings.all());
    expect(fast.store.getIndexes().revision).toBe(fast.store.getRevision());
    expect(fast.heard.calls).toBe(plain.heard.calls);
  });

  it('does not run validateAll itself (no silent recompute), and does when verifyPrecomputed is on', () => {
    const counted = { calls: 0 };
    const spy = { ...validator, validateAll: vi.fn((...args: Parameters<typeof validator.validateAll>) => (counted.calls++, validator.validateAll(...args))) };
    const { store } = writable({ validator: spy, validateInitial: false });
    expect(store.replaceState(maximal, 'import', precomputedOf(maximal, START + 1)).ok).toBe(true);
    expect(counted.calls).toBe(0);
    const { store: checked } = writable({ validator: spy, validateInitial: false, verifyPrecomputed: true });
    expect(checked.replaceState(maximal, 'import', precomputedOf(maximal, START + 1)).ok).toBe(true);
    expect(counted.calls).toBe(1);
  });

  it('keeps the ERROR gate: precomputed findings with an ERROR are refused like the in-process path, and nothing changes', () => {
    const plain = writable();
    const fast = writable();
    const before = fingerprintOf(fast.store, fast.heard);
    const expected = refusal(plain.store.replaceState(broken, 'import'));
    const got = refusal(fast.store.replaceState(broken, 'import', precomputedOf(broken, START + 1)));
    expect(got.code).toBe('VALIDATION_FAILED');
    expect(got).toEqual(expected);
    expect(fingerprintOf(fast.store, fast.heard)).toEqual(before);
  });

  it('the gate looks at the precomputed findings: an ERROR passed for a valid state refuses, and a valid state\'s clean findings pass', () => {
    const good = precomputedOf(maximal, START + 1);
    const first = someFinding(good.findings);
    const withError: PrecomputedFindings = { ...good, findings: [...good.findings.filter((f) => f.id !== first.id), { ...first, severity: 'error' }] };
    const { store, heard } = writable();
    const before = fingerprintOf(store, heard);
    expect(refusal(store.replaceState(maximal, 'import', withError)).code).toBe('VALIDATION_FAILED');
    expect(fingerprintOf(store, heard)).toEqual(before);
    expect(store.replaceState(maximal, 'import', good).ok).toBe(true);
  });

  it('is refused READ_ONLY on a read-only store before anything else, precomputed or not', () => {
    const { store } = follower();
    expect(refusal(store.replaceState(maximal, 'import', precomputedOf(maximal, START + 1))).code).toBe('READ_ONLY');
    expect(refusal(store.replaceState(maximal, 'import', { ...precomputedOf(maximal, START + 1), ruleSet: 'nope' })).code).toBe('READ_ONLY');
  });

  it('a state that is not a state is refused by the shape check first', () => {
    const { store } = writable();
    const bad = { ...maximal, records: { ...maximal.records, species: undefined } } as unknown as CanonicalState;
    expect(refusal(store.replaceState(bad, 'import', precomputedOf(maximal, START + 1))).code).toBe('VALIDATION_FAILED');
  });

  it('after a refusal the same store accepts correct findings (nothing was half-applied)', () => {
    const { store } = writable();
    expect(refusal(store.replaceState(maximal, 'import', { ...precomputedOf(maximal, START + 1), ruleSet: 'x' })).code).toBe('FINDINGS_MISMATCH');
    expect(store.replaceState(maximal, 'import', precomputedOf(maximal, START + 1)).ok).toBe(true);
    expect(store.getRevision()).toBe(START + 1);
    const plain = writable();
    plain.store.replaceState(maximal, 'import');
    expect(store.findings.all()).toEqual(plain.store.findings.all());
  });
});

describe('reload with precomputed findings', () => {
  it('adopts the state at the revision argument, findings as passed, no ERROR gate (ADR-033)', () => {
    const { store, heard } = follower({ verifyPrecomputed: true });
    const result = store.reload(broken, 12, precomputedOf(broken, 12));
    expect(result.ok).toBe(true);
    expect(store.getRevision()).toBe(12);
    expect(store.getState()).toBe(broken);
    expect(store.findings.all().some((f) => f.severity === 'error')).toBe(true);
    const plain = follower();
    plain.store.reload(broken, 12);
    expect(store.findings.all()).toEqual(plain.store.findings.all());
    expect(heard.calls).toBe(1);
  });

  it('equals the in-process reload', () => {
    const plain = follower();
    const fast = follower();
    const a = plain.store.reload(maximal, 9);
    const b = fast.store.reload(maximal, 9, precomputedOf(maximal, 9));
    expect(b).toEqual(a);
    expect(fast.store.findings.all()).toEqual(plain.store.findings.all());
  });

  it('a writable store still answers NOT_FOLLOWER, not FINDINGS_MISMATCH, and nothing changes', () => {
    const { store, heard } = writable();
    const before = fingerprintOf(store, heard);
    expect(refusal(store.reload(maximal, 9, precomputedOf(maximal, 9))).code).toBe('NOT_FOLLOWER');
    expect(refusal(store.reload(maximal, 9, { ...precomputedOf(maximal, 9), ruleSet: 'x' })).code).toBe('NOT_FOLLOWER');
    expect(fingerprintOf(store, heard)).toEqual(before);
  });

  it('a revision that is not a non-negative integer is refused as before', () => {
    const { store } = follower();
    expect(refusal(store.reload(maximal, -1, precomputedOf(maximal, -1))).code).toBe('STALE_REVISION');
  });

  it('the precomputed revision must be the revision argument, not the store\'s', () => {
    const { store } = follower();
    expect(refusal(store.reload(maximal, 9, precomputedOf(maximal, START + 1))).message).toMatch(/would adopt revision 9/);
  });
});
