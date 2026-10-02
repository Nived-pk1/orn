// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useCounts, useStoreSelector, useSubscribable, type Subscribable } from './use-subscribable';
import { createCanonicalStore } from '@/core/commands';
import { tierState } from '@/test-support/perf-kit';

afterEach(cleanup);

function box<T>(initial: T): Subscribable<T> & { set(value: T): void } {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    set(next) {
      value = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

describe('useSubscribable', () => {
  it('reads the value and re-renders when it changes', () => {
    const source = box('one');
    function Show() {
      return <p>{useSubscribable(source)}</p>;
    }
    render(<Show />);
    expect(screen.getByText('one')).toBeTruthy();
    act(() => source.set('two'));
    expect(screen.getByText('two')).toBeTruthy();
  });
});

describe('useStoreSelector', () => {
  it('a selector that builds a new object does not loop, and the answer follows the state', () => {
    const store = createCanonicalStore({ initial: tierState('tiny', 'dense'), revision: 0, validateInitial: false });
    let renders = 0;
    const selector = (state: ReturnType<typeof store.getState>): { n: number } => ({ n: Object.keys(state.records.species).length });
    function Show() {
      renders += 1;
      return <p>species {useStoreSelector(store, selector).n}</p>;
    }
    render(<Show />);
    const first = renders;
    expect(screen.getByText(/species \d+/)).toBeTruthy();
    expect(first).toBeLessThan(4);
    act(() => void store.replaceState(structuredClone(store.getState()), 'import'));
    expect(renders).toBeLessThan(first + 4);
  });
});

describe('useCounts', () => {
  it('returns the same object until a number changes', () => {
    let counts = { a: 1, b: 2 };
    const listeners = new Set<() => void>();
    const source = { counts: () => ({ ...counts }), subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)) };
    const seen: unknown[] = [];
    function Show() {
      const value = useCounts(source);
      seen.push(value);
      return <p>
        {value.a}-{value.b}
      </p>;
    }
    render(<Show />);
    act(() => listeners.forEach((l) => l()));
    expect(new Set(seen).size).toBe(1);
    counts = { a: 5, b: 2 };
    act(() => listeners.forEach((l) => l()));
    expect(screen.getByText('5-2')).toBeTruthy();
  });
});
