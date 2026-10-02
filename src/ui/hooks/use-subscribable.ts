/**
 * Hooks over `useSyncExternalStore` (step 5.1d, UI_ARCHITECTURE §4). They are generic and structural: `src/ui` never imports
 * `src/app`, so the app's status, store and finding store reach React through these shapes only.
 */
import { useRef, useSyncExternalStore } from 'react';
import type { ChangeSet } from '@/core/dataset/contracts';
import type { CanonicalState } from '@/core/schema';

/** A value with a stable identity until it changes (`AppStatus` through `StatusStore`). */
export interface Subscribable<T> {
  get(): T;
  subscribe(listener: (value: T) => void): () => void;
}

export function useSubscribable<T>(source: Subscribable<T>): T {
  return useSyncExternalStore(
    (onChange) => source.subscribe(() => onChange()),
    () => source.get(),
  );
}

/** The part of the canonical store a selector needs. */
export interface StateSource {
  getState(): CanonicalState;
  subscribe(listener: (changes: ChangeSet) => void): () => void;
}

/**
 * A selector over the canonical state. The answer is computed again only when the state object changed (or the selector did), so
 * a selector that builds a new object does not loop. Pass a stable selector (module level or `useCallback`).
 */
export function useStoreSelector<R>(store: StateSource, selector: (state: CanonicalState) => R): R {
  const cache = useRef<{ state: CanonicalState; selector: (state: CanonicalState) => R; value: R } | null>(null);
  return useSyncExternalStore(
    (onChange) => store.subscribe(() => onChange()),
    () => {
      const state = store.getState();
      const cached = cache.current;
      if (cached !== null && cached.state === state && cached.selector === selector) return cached.value;
      const value = selector(state);
      cache.current = { state, selector, value };
      return value;
    },
  );
}

/** The part of the finding store the counts need (a second subscription: L4 results arrive without a ChangeSet). */
export interface CountsSource<K extends string> {
  counts(): Readonly<Record<K, number>>;
  subscribe(listener: () => void): () => void;
}

/** Counts by key; the same object is returned until a number changes. */
export function useCounts<K extends string>(source: CountsSource<K>): Readonly<Record<K, number>> {
  const last = useRef<Readonly<Record<K, number>> | null>(null);
  return useSyncExternalStore(
    (onChange) => source.subscribe(onChange),
    () => {
      const next = source.counts();
      const previous = last.current;
      if (previous !== null && (Object.keys(next) as K[]).every((key) => previous[key] === next[key])) return previous;
      last.current = next;
      return next;
    },
  );
}
