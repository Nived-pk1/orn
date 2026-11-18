import { describe, expect, it, vi } from 'vitest';
import { createMyRecords } from './my-records';
import { STAR_LIMIT } from './my-records-rule';

const a = { kind: 'reaction', id: 'rxn_a' } as const;
const b = { kind: 'species', id: 'sp_b' } as const;
const services = (uiState: Record<string, unknown> = {}, mode: 'writer' | 'reader' = 'writer') => {
  const setUiState = vi.fn(() => Promise.resolve());
  return { setUiState, services: { bootReport: { uiState }, persistence: { setUiState }, status: { get: () => ({ mode }) } } as never };
};

describe('createMyRecords (step 8.4g Part B, G2 and G3)', () => {
  it('reads what was stored, tolerantly', () => {
    const { services: s } = services({ starred: [a, 'bad', b], recent: 'bad' });
    const mine = createMyRecords(s);
    expect(mine.starred()).toEqual([a, b]);
    expect(mine.recent()).toEqual([]);
    expect(mine.isStarred(a)).toBe(true);
  });

  it('a star is written, survives (the next store reads it), and is removed by the same call', () => {
    const { services: s, setUiState } = services();
    const mine = createMyRecords(s);
    const seen = vi.fn();
    mine.subscribe(seen);
    expect(mine.toggle(a)).toBe('added');
    expect(setUiState).toHaveBeenLastCalledWith('starred', [a]);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(createMyRecords(services({ starred: [a] }).services).isStarred(a)).toBe(true);
    expect(mine.toggle(a)).toBe('removed');
    expect(setUiState).toHaveBeenLastCalledWith('starred', []);
  });

  it('the 501st star is refused, nothing is written, nobody is told', () => {
    const { services: s, setUiState } = services({ starred: Array.from({ length: STAR_LIMIT }, (_, n) => ({ kind: 'reaction', id: `r${n}` })) });
    const mine = createMyRecords(s);
    const seen = vi.fn();
    mine.subscribe(seen);
    expect(mine.toggle(a)).toBe('full');
    expect(setUiState).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
  });

  it('recent: touched newest first, cleared on request; an unchanged first place writes nothing', () => {
    const { services: s, setUiState } = services();
    const mine = createMyRecords(s);
    mine.touch(a);
    mine.touch(b);
    expect(mine.recent()).toEqual([b, a]);
    setUiState.mockClear();
    mine.touch(b);
    expect(setUiState).not.toHaveBeenCalled();
    mine.clearRecent();
    expect(mine.recent()).toEqual([]);
    expect(setUiState).toHaveBeenLastCalledWith('recent', []);
  });

  it('a tab that cannot write keeps the marks in memory only', () => {
    const { services: s, setUiState } = services({}, 'reader');
    const mine = createMyRecords(s);
    mine.toggle(a);
    expect(mine.isStarred(a)).toBe(true);
    expect(setUiState).not.toHaveBeenCalled();
  });

  it('the snapshot is the same list until something changes', () => {
    const mine = createMyRecords(services().services);
    const before = mine.starred();
    expect(mine.starred()).toBe(before);
    mine.toggle(a);
    expect(mine.starred()).not.toBe(before);
  });
});
