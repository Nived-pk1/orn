// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PHONE_QUERIES, readLayoutMode, useLayoutMode } from './use-layout-mode';

/** A matchMedia that answers the two phone queries from a window of (width, height, coarse) and tells listeners when it changes. */
function fakeWindow(initial: { width: number; height: number; coarse: boolean }) {
  const state = { ...initial };
  const listeners = new Set<() => void>();
  const matches = (query: string): boolean => {
    if (query === PHONE_QUERIES[0]) return state.width <= 699;
    if (query === PHONE_QUERIES[1]) return state.coarse && state.height <= 499;
    return false;
  };
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return matches(query);
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return {
    resize(next: Partial<typeof state>) {
      Object.assign(state, next);
      for (const listener of [...listeners]) listener();
    },
  };
}

describe('useLayoutMode (ADR-039)', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('is the desktop where there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(readLayoutMode()).toBe('desktop');
    expect(renderHook(() => useLayoutMode()).result.current).toBe('desktop');
  });

  it('names the two queries the CSS and the hook share', () => {
    expect(PHONE_QUERIES).toEqual(['(max-width: 699px)', '(pointer: coarse) and (max-height: 499px)']);
  });

  it('is a phone under 700 px wide and the desktop from 700 px (a tablet is the desktop)', () => {
    const env = fakeWindow({ width: 699, height: 900, coarse: true });
    expect(readLayoutMode()).toBe('phone');
    env.resize({ width: 700 });
    expect(readLayoutMode()).toBe('desktop');
    env.resize({ width: 820, height: 1180 });
    expect(readLayoutMode()).toBe('desktop');
  });

  it('is a phone held sideways: a coarse pointer and a height of 499 px or less, whatever the width', () => {
    fakeWindow({ width: 900, height: 499, coarse: true });
    expect(readLayoutMode()).toBe('phone');
    fakeWindow({ width: 900, height: 500, coarse: true });
    expect(readLayoutMode()).toBe('desktop');
    fakeWindow({ width: 900, height: 400, coarse: false });
    expect(readLayoutMode()).toBe('desktop');
  });

  it('follows the window when it is resized or turned', () => {
    const env = fakeWindow({ width: 1280, height: 800, coarse: false });
    const { result } = renderHook(() => useLayoutMode());
    expect(result.current).toBe('desktop');
    act(() => env.resize({ width: 390 }));
    expect(result.current).toBe('phone');
    act(() => env.resize({ width: 1024, height: 768 }));
    expect(result.current).toBe('desktop');
    act(() => env.resize({ width: 844, height: 390, coarse: true }));
    expect(result.current).toBe('phone');
  });
});
