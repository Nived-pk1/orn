/**
 * The inspector's focus and its history (step 5.6a; UI_ARCHITECTURE §9, §10): the record the inspector shows and the records shown
 * before and after it. UI state (INV-10): it holds record references only, is kept across view switches and is not saved. Bounded:
 * at most `MAX_HISTORY` entries (the oldest is dropped). Opening the record that is already shown changes nothing; opening another
 * one drops what was ahead (a new branch), as a browser does.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { RecordRef } from '@/core/schema';

export const MAX_HISTORY = 100;

export interface InspectorState {
  /** Oldest first. */
  readonly history: readonly RecordRef[];
  /** Index of the shown record in `history`; -1 when nothing was opened. */
  readonly index: number;
  /** Shows `ref` (pushed on the history). */
  open(ref: RecordRef): void;
  back(): boolean;
  forward(): boolean;
  /** Forgets every entry (the record is gone, or a replace of the dataset). */
  clear(): void;
}
export type InspectorStore = StoreApi<InspectorState>;

export const currentOf = (state: Pick<InspectorState, 'history' | 'index'>): RecordRef | null => state.history[state.index] ?? null;
export const canBack = (state: Pick<InspectorState, 'index'>): boolean => state.index > 0;
export const canForward = (state: Pick<InspectorState, 'history' | 'index'>): boolean => state.index >= 0 && state.index < state.history.length - 1;

const same = (a: RecordRef | null, b: RecordRef): boolean => a !== null && a.kind === b.kind && a.id === b.id;

export function createInspectorStore(): InspectorStore {
  return createStore<InspectorState>((set, get) => ({
    history: [],
    index: -1,
    open(ref) {
      const state = get();
      if (same(currentOf(state), ref)) return;
      const kept = [...state.history.slice(0, state.index + 1), { kind: ref.kind, id: ref.id }];
      const history = kept.length > MAX_HISTORY ? kept.slice(kept.length - MAX_HISTORY) : kept;
      set({ history, index: history.length - 1 });
    },
    back() {
      if (!canBack(get())) return false;
      set({ index: get().index - 1 });
      return true;
    },
    forward() {
      if (!canForward(get())) return false;
      set({ index: get().index + 1 });
      return true;
    },
    clear() {
      if (get().history.length > 0) set({ history: [], index: -1 });
    },
  }));
}
