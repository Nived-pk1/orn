/**
 * The inspector's focus and its history (step 5.6a; UI_ARCHITECTURE §9, §10): the record the inspector shows and the records shown
 * before and after it. UI state (INV-10): it holds record references only, is kept across view switches and is not saved. Bounded:
 * at most `MAX_HISTORY` entries (the oldest is dropped). Opening the record that is already shown changes nothing; opening another
 * one drops what was ahead (a new branch), as a browser does.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { RecordRef } from '@/core/schema';

export const MAX_HISTORY = 100;

/** A record entry: a record and, optionally, a place inside it (a mechanism's variant ID; step 5.6b). */
export type RecordEntry = RecordRef & { readonly at?: string };
/**
 * A history entry is one SELECTION of the map (step 8.2b-fix, S1): a record (a family or anything opened), the bucket (the map's derived
 * "Not in a family yet" node, not a record), an arrow (from node, to node) or nothing. The inspector shows exactly the current entry.
 */
export type InspectorEntry = RecordEntry | VirtualEntry;
/** (`id` and `at` are declared absent so code that reads `history[i].id` still compiles; only a record has them.) */
export type VirtualEntry =
  | { readonly kind: 'bucket'; readonly id?: undefined; readonly at?: undefined }
  | { readonly kind: 'arrow'; readonly from: string; readonly to: string; readonly id?: undefined; readonly at?: undefined }
  | { readonly kind: 'none'; readonly id?: undefined; readonly at?: undefined };
const isVirtual = (entry: InspectorEntry | undefined): entry is VirtualEntry => entry !== undefined && (entry.kind === 'bucket' || entry.kind === 'arrow' || entry.kind === 'none');

export interface InspectorState {
  /** Oldest first. */
  readonly history: readonly InspectorEntry[];
  /** Index of the shown record in `history`; -1 when nothing was opened. */
  readonly index: number;
  /** Shows `ref` (pushed on the history), at `at` inside it when given. */
  open(ref: RecordRef, at?: string): void;
  /** Selects a bucket, an arrow or nothing (pushed on the history like a record; the same entry again changes nothing). */
  select(entry: VirtualEntry): void;
  back(): boolean;
  forward(): boolean;
  /** Forgets every entry (the record is gone, or a replace of the dataset). */
  clear(): void;
}
export type InspectorStore = StoreApi<InspectorState>;

/** The record shown, or null (nothing, the bucket or an arrow): page code reads `.id` of it. */
export const currentOf = (state: Pick<InspectorState, 'history' | 'index'>): RecordEntry | null => {
  const entry = state.history[state.index];
  return entry === undefined || isVirtual(entry) ? null : entry;
};
/** The whole current selection (a record or a virtual entry), or null when nothing was ever selected. */
export const selectionOf = (state: Pick<InspectorState, 'history' | 'index'>): InspectorEntry | null => state.history[state.index] ?? null;
export const canBack = (state: Pick<InspectorState, 'index'>): boolean => state.index > 0;
export const canForward = (state: Pick<InspectorState, 'history' | 'index'>): boolean => state.index >= 0 && state.index < state.history.length - 1;

const same = (a: InspectorEntry | null, b: InspectorEntry, at: string | undefined): boolean => {
  if (a === null || a.kind !== b.kind) return false;
  if (a.kind === 'arrow' && b.kind === 'arrow') return a.from === b.from && a.to === b.to;
  if (isVirtual(a) || isVirtual(b)) return true;
  return a.id === b.id && a.at === at;
};

export function createInspectorStore(): InspectorStore {
  return createStore<InspectorState>((set, get) => ({
    history: [],
    index: -1,
    select(entry) {
      const state = get();
      if (same(selectionOf(state), entry, undefined)) return;
      const kept = [...state.history.slice(0, state.index + 1), entry];
      const history = kept.length > MAX_HISTORY ? kept.slice(kept.length - MAX_HISTORY) : kept;
      set({ history, index: history.length - 1 });
    },
    open(ref, at) {
      const state = get();
      if (same(selectionOf(state), ref, at)) return;
      const entry = (at === undefined ? { kind: ref.kind, id: ref.id } : { kind: ref.kind, id: ref.id, at }) as InspectorEntry;
      const kept = [...state.history.slice(0, state.index + 1), entry];
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
