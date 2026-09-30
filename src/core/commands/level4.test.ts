/**
 * Q10 b: level-4 findings of a subject that no longer exists are cleared in the store's commit step, whatever removed the subject
 * (a delete, an undo, `replaceState`, `reload`, `applyRemote`); an ordinary L1-L3 commit never clears level-4 findings.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, CanonicalState, RecordRef } from '../schema';
import { makeFinding } from '../validation';
import type { Finding } from '../validation/contracts';
import { envelope, makeStore, mustCommit, recordIn, ref, withFields } from '../../test-support/command-kit';
import { commit, loadFixtureState } from '../../test-support/state-fixture';
import type { RemoteChange } from './contracts';

const base = loadFixtureState('maximal-valid');
const ORIGIN = { id: 'CHEM-001', level: 4 as const, severity: 'warning' as const };
const chem = (subject: RecordRef, path = 'structure'): Finding => makeFinding(ORIGIN, subject, { path, message: 'test finding' });
const l4 = (store: ReturnType<typeof makeStore>): Finding[] => [...store.findings.all({ level: 4 })];

/** A species that nothing refers to, so a delete needs no cascade. */
function extra(state: CanonicalState): AnyRecord {
  const species = recordIn(state, 'species', 'spc_max-propanone');
  return withFields(species, {
    id: 'spc_l4-extra',
    names: { canonical: 'Level four extra', common: [], aliases: [] },
    classIds: [],
  });
}

function withExtra(): { store: ReturnType<typeof makeStore>; subject: RecordRef } {
  const store = makeStore(base);
  mustCommit(store.dispatch(envelope('Add', { type: 'record.create', record: extra(base) })));
  const subject = ref('species', 'spc_l4-extra');
  store.findings.replaceForRules([subject], ['CHEM-001'], [chem(subject)]);
  return { store, subject };
}

describe('Q10 b: level-4 findings never outlive their subject', () => {
  it('a delete clears them in the same commit step; the subscriber already sees them gone', () => {
    const { store, subject } = withExtra();
    expect(l4(store)).toHaveLength(1);
    let seen = -1;
    store.subscribe(() => void (seen = l4(store).length));
    mustCommit(store.dispatch(envelope('Delete', { type: 'record.delete', ref: subject, mode: 'restrict' })));
    expect(l4(store)).toEqual([]);
    expect(seen).toBe(0);
  });

  it('an undo of the creation clears them (a redo brings back the record, not the finding)', () => {
    const { store } = withExtra();
    mustCommit(store.undo() ?? ({ ok: false } as never));
    expect(l4(store)).toEqual([]);
    mustCommit(store.redo() ?? ({ ok: false } as never));
    expect(l4(store)).toEqual([]);
  });

  it('replaceState clears them when the replacement lacks the subject, and keeps them when it has it', () => {
    const { store, subject } = withExtra();
    const kept = store.getState();
    mustCommit(store.replaceState(kept, 'restore'));
    expect(l4(store).map((f) => f.subject)).toEqual([subject]);
    mustCommit(store.replaceState(base, 'restore'));
    expect(l4(store)).toEqual([]);
  });

  it('reload and applyRemote on a follower clear them', () => {
    const withIt = commit(base, 1, (tables) => void (tables.species['spc_l4-extra'] = extra(base))).after;
    let readOnly = true;
    const follower = makeStore(withIt, { readOnly: () => readOnly, revision: 1 });
    const subject = ref('species', 'spc_l4-extra');
    follower.findings.replaceForRules([subject], ['CHEM-001'], [chem(subject)]);
    const change: RemoteChange = { fromRevision: 1, revision: 2, upserts: [], deletedIds: ['spc_l4-extra'] };
    mustCommit(follower.applyRemote(change));
    expect(l4(follower)).toEqual([]);

    const again = makeStore(withIt, { readOnly: () => readOnly, revision: 1 });
    again.findings.replaceForRules([subject], ['CHEM-001'], [chem(subject)]);
    mustCommit(again.reload(base, 5));
    expect(l4(again)).toEqual([]);
    readOnly = false;
  });

  it('a commit that removes one record leaves the level-4 findings of every other record alone', () => {
    const { store, subject } = withExtra();
    const other = ref('species', 'spc_max-propanone');
    store.findings.replaceForRules([other], ['CHEM-001'], [chem(other)]);
    mustCommit(store.dispatch(envelope('Delete', { type: 'record.delete', ref: subject, mode: 'restrict' })));
    expect(l4(store).map((f) => f.subject)).toEqual([other]);
  });

  it('a normal L1-L3 commit, even one that re-validates the very subject, never clears level-4 findings', () => {
    const { store, subject } = withExtra();
    const record = recordIn(store.getState(), 'species', subject.id);
    mustCommit(store.dispatch(envelope('Edit', { type: 'record.update', record: withFields(record, { notes: 'edited' }) })));
    mustCommit(store.dispatch(envelope('Edit again', { type: 'record.update', record: withFields(record, { notes: 'edited twice', studyNotes: 'x' }) })));
    expect(l4(store).map((f) => f.subject)).toEqual([subject]);
    // and an L1-L3 finding replacement of the same subject (all three levels, and by rule) leaves it too
    store.findings.replaceForSubjects([subject], [], 3);
    store.findings.replaceForRules([subject], ['SPC-001'], []);
    expect(l4(store)).toHaveLength(1);
  });
});
