import { describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { canBack, canForward, createInspectorStore, currentOf, MAX_HISTORY } from './inspector-store';

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
});
