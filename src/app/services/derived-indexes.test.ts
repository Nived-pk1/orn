import { describe, expect, it } from 'vitest';
import type { CanonicalStore } from '@/core/commands';
import type { ChangeSet } from '@/core/dataset/contracts';
import { indexEngine } from '@/core/indexes';
import { envelope, makeStore, mustCommit, recordIn, withFields } from '@/test-support/command-kit';
import { derivedSnapshot, idsOf } from '@/test-support/index-snapshot';
import { loadFixtureState } from '@/test-support/state-fixture';
import { createDerivedIndexes } from './derived-indexes';

const base = loadFixtureState('maximal-valid');
const speciesId = Object.keys(base.records.species).sort()[0] as string;

const counting = (step = 1): { nowMs(): number } => {
  let ms = 0;
  return { nowMs: () => (ms += step) };
};

const note = (store: ReturnType<typeof makeStore>, text: string): void => {
  mustCommit(store.dispatch(envelope(text, { type: 'record.update', record: withFields(recordIn(store.getState(), 'species', speciesId), { notes: text }) })));
};

const equalsBuild = (store: ReturnType<typeof makeStore>, read: () => ReturnType<typeof indexEngine.build>): void => {
  const ids = idsOf(store.getState());
  expect(derivedSnapshot(read(), ids)).toEqual(derivedSnapshot(indexEngine.build(store.getState(), store.getRevision()), ids));
};

describe('DerivedIndexes', () => {
  it('is lazy: nothing is built until the first read, commits before it cost nothing', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    note(store, 'a');
    note(store, 'b');
    expect(derived.stats()).toMatchObject({ builds: 0, applies: 0, queued: 0, lastBuildReason: null });
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 1, applies: 0, lastBuildReason: 'first' });
  });

  it('queues ChangeSets and applies them in order on read: one apply per ChangeSet, no build', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    derived.current();
    note(store, 'a');
    note(store, 'b');
    note(store, 'c');
    expect(derived.stats()).toMatchObject({ queued: 3, builds: 1, applies: 0 });
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toMatchObject({ queued: 0, builds: 1, applies: 3 });
    // undo and redo are ordinary ChangeSets
    store.undo();
    store.redo();
    store.undo();
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 1, applies: 6 });
  });

  it('a handle from before an apply is stale and throws: callers never keep one', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    const old = derived.current();
    note(store, 'a');
    const fresh = derived.current();
    expect(fresh.revision).toBe(store.getRevision());
    expect(() => old.referrersOf(speciesId)).toThrow(/stale/i);
  });

  it('a rejected commit is not announced: no build, no apply, nothing queued', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    derived.current();
    const before = derived.stats();
    const result = store.dispatch(envelope('bad', { type: 'record.delete', ref: { kind: 'species', id: 'spc_not-there' }, mode: 'restrict' }));
    expect(result.ok).toBe(false);
    expect(derived.stats()).toEqual(before);
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toEqual(before);
  });

  it('a replace is ONE build, not applies', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    derived.current();
    note(store, 'queued first');
    const result = store.replaceState({ ...store.getState(), meta: { ...store.getState().meta, title: 'Replaced' } }, 'import');
    expect(result.ok).toBe(true);
    expect(derived.stats().queued).toBe(0);
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 2, applies: 0, lastBuildReason: 'replace' });
  });

  it('a remote span or reload is ONE build', () => {
    const follower = makeStore(base, { readOnly: () => true });
    const derived = createDerivedIndexes({ store: follower, clock: counting() });
    derived.current();
    const next = { ...base, meta: { ...base.meta, title: 'Remote' } };
    expect(follower.reload(next, follower.getRevision() + 4).ok).toBe(true);
    equalsBuild(follower, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 2, applies: 0, lastBuildReason: 'remote' });
  });

  it('a revision gap (a ChangeSet that was never announced) is one build', () => {
    const real = makeStore(base);
    let dropped = false;
    const lossy: Pick<CanonicalStore, 'getState' | 'getRevision' | 'subscribe'> = {
      getState: () => real.getState(),
      getRevision: () => real.getRevision(),
      subscribe: (listener) =>
        real.subscribe((changes: ChangeSet) => {
          if (!dropped) {
            dropped = true;
            return;
          }
          listener(changes);
        }),
    };
    const derived = createDerivedIndexes({ store: lossy, clock: counting() });
    derived.current();
    note(real, 'lost');
    note(real, 'seen');
    equalsBuild(real, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 2, applies: 0, lastBuildReason: 'gap' });
  });

  it('a queue past 100 ChangeSets (or 2,000 touched records) is one build instead of many applies', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting(), maxBacklog: 3, maxBacklogRecords: 1000 });
    derived.current();
    for (let i = 0; i < 4; i += 1) note(store, `n${i}`);
    expect(derived.stats().queued).toBe(0);
    equalsBuild(store, () => derived.current());
    expect(derived.stats()).toMatchObject({ builds: 2, applies: 0, lastBuildReason: 'backlog' });

    const heavy = createDerivedIndexes({ store, clock: counting(), maxBacklog: 100, maxBacklogRecords: 1 });
    heavy.current();
    note(store, 'one record');
    expect(heavy.stats().queued).toBe(1); // weight 1 is within the bound
    note(store, 'two records in the queue');
    equalsBuild(store, () => heavy.current());
    expect(heavy.stats()).toMatchObject({ builds: 2, applies: 0, lastBuildReason: 'backlog' });
  });

  it('the default bounds are the replica sync numbers', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting() });
    derived.current();
    for (let i = 0; i < 100; i += 1) note(store, `n${i}`);
    expect(derived.stats().queued).toBe(100);
    note(store, 'the 101st');
    expect(derived.stats().queued).toBe(0);
    equalsBuild(store, () => derived.current());
    expect(derived.stats().lastBuildReason).toBe('backlog');
  });

  it('a read from a listener that ran before the service sees a store ahead of its queue: it builds, never guesses', () => {
    const store = makeStore(base);
    let early: ReturnType<ReturnType<typeof createDerivedIndexes>['current']> | undefined;
    const holder: { service?: ReturnType<typeof createDerivedIndexes> } = {};
    store.subscribe(() => {
      early = holder.service?.current();
    });
    const service = createDerivedIndexes({ store, clock: counting() });
    holder.service = service;
    service.current();
    note(store, 'a');
    expect(early?.revision).toBe(store.getRevision());
    expect(service.stats().lastBuildReason).toBe('mismatch');
    equalsBuild(store, () => service.current());
  });

  it('durations come from the injected clock; dispose stops listening', () => {
    const store = makeStore(base);
    const derived = createDerivedIndexes({ store, clock: counting(5) });
    derived.current();
    expect(derived.stats().lastBuildMs).toBe(5);
    note(store, 'a');
    derived.current();
    expect(derived.stats().lastApplyMs).toBe(5);
    derived.dispose();
    note(store, 'after dispose');
    expect(derived.stats().queued).toBe(0);
  });
});
