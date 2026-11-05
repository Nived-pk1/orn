import { describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { canBack, canForward, createInspectorStore, currentOf, MAX_HISTORY, selectionOf } from './inspector-store';

const ref = (id: string): RecordRef => ({ kind: 'species', id }) as RecordRef;

describe('the inspector store', () => {
  it('starts empty and opening pushes on the history', () => {
    const store = createInspectorStore();
    expect(currentOf(store.getState())).toBeNull();
    store.getState().open(ref('spc_a'));
    store.getState().open(ref('spc_b'));
    expect(currentOf(store.getState())?.id).toBe('spc_b');
    expect(canBack(store.getState())).toBe(true);
    expect(canForward(store.getState())).toBe(false);
  });

  it('opening the record already shown changes nothing', () => {
    const store = createInspectorStore();
    store.getState().open(ref('spc_a'));
    const before = store.getState();
    store.getState().open(ref('spc_a'));
    expect(store.getState()).toBe(before);
  });

  it('back and forward move, and a new open drops what was ahead', () => {
    const store = createInspectorStore();
    for (const id of ['spc_a', 'spc_b', 'spc_c']) store.getState().open(ref(id));
    expect(store.getState().back()).toBe(true);
    expect(store.getState().back()).toBe(true);
    expect(store.getState().back()).toBe(false);
    expect(currentOf(store.getState())?.id).toBe('spc_a');
    expect(store.getState().forward()).toBe(true);
    store.getState().open(ref('spc_d'));
    expect(store.getState().history.map((r) => r.id)).toEqual(['spc_a', 'spc_b', 'spc_d']);
    expect(store.getState().forward()).toBe(false);
  });

  it('is bounded: the oldest entry is dropped', () => {
    const store = createInspectorStore();
    for (let i = 0; i < MAX_HISTORY + 20; i += 1) store.getState().open(ref(`spc_${i}`));
    expect(store.getState().history).toHaveLength(MAX_HISTORY);
    expect(store.getState().history[0]?.id).toBe('spc_20');
    expect(currentOf(store.getState())?.id).toBe(`spc_${MAX_HISTORY + 19}`);
  });

  it('clear forgets everything', () => {
    const store = createInspectorStore();
    store.getState().open(ref('spc_a'));
    store.getState().clear();
    expect(currentOf(store.getState())).toBeNull();
    expect(store.getState().index).toBe(-1);
  });

  it('a place inside the record (a variant) is part of the entry: the same record at another place is a new entry, the same place changes nothing', () => {
    const store = createInspectorStore();
    store.getState().open(ref('mec_a'));
    store.getState().open(ref('mec_a'), 'mvr_1');
    store.getState().open(ref('mec_a'), 'mvr_1');
    expect(store.getState().history).toEqual([{ kind: 'species', id: 'mec_a' }, { kind: 'species', id: 'mec_a', at: 'mvr_1' }]);
    expect(currentOf(store.getState())?.at).toBe('mvr_1');
    store.getState().back();
    expect(currentOf(store.getState())?.at).toBeUndefined();
  });
});

describe('the inspector store holds the map selection (step 8.2b-fix, S1)', () => {
  it('a bucket, an arrow and "nothing" are entries of the same history: Back and Forward walk them', () => {
    const store = createInspectorStore();
    store.getState().open(ref('spc_a'));
    store.getState().select({ kind: 'bucket' });
    store.getState().select({ kind: 'arrow', from: 'a', to: 'b' });
    store.getState().select({ kind: 'none' });
    expect(selectionOf(store.getState())).toEqual({ kind: 'none' });
    store.getState().back();
    expect(selectionOf(store.getState())).toEqual({ kind: 'arrow', from: 'a', to: 'b' });
    store.getState().back();
    expect(selectionOf(store.getState())).toEqual({ kind: 'bucket' });
    store.getState().back();
    expect(selectionOf(store.getState())).toEqual(ref('spc_a'));
    store.getState().forward();
    expect(selectionOf(store.getState())).toEqual({ kind: 'bucket' });
  });
  it('currentOf answers only a record (page code reads .id), null on a bucket, an arrow or nothing', () => {
    const store = createInspectorStore();
    store.getState().open(ref('spc_a'));
    store.getState().select({ kind: 'bucket' });
    expect(currentOf(store.getState())).toBeNull();
  });
  it('selecting what is already selected changes nothing; the same arrow the other way round is another arrow', () => {
    const store = createInspectorStore();
    store.getState().select({ kind: 'arrow', from: 'a', to: 'b' });
    const before = store.getState();
    store.getState().select({ kind: 'arrow', from: 'a', to: 'b' });
    expect(store.getState()).toBe(before);
    store.getState().select({ kind: 'arrow', from: 'b', to: 'a' });
    expect(store.getState().history).toHaveLength(2);
  });
});
