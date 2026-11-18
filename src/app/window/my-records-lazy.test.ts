import { describe, expect, it, vi } from 'vitest';
import { createLazyMine } from './my-records-lazy';
import { faceOf, NO_MY_RECORDS } from './my-records-face';

const a = { kind: 'reaction', id: 'rxn_a' } as const;
const b = { kind: 'species', id: 'sp_b' } as const;
const services = (uiState: Record<string, unknown> = {}) => ({ bootReport: { uiState }, persistence: { setUiState: vi.fn(() => Promise.resolve()) }, status: { get: () => ({ mode: 'writer' }) } }) as never;

describe('createLazyMine (step 8.4g Part B, trim: the rules load on idle or first use)', () => {
  it('before it is loaded it has nothing: not ready, no stars, nothing recent, no star shown', () => {
    const mine = createLazyMine(services({ starred: [a] }));
    expect(mine.records()).toBeUndefined();
    expect(mine.late()).toBeUndefined();
    const face = faceOf(mine);
    expect(face.starred()).toEqual([]);
    expect(face.isStarred(a)).toBe(false);
    expect(face.recent()).toEqual([]);
    expect(face.toggle(a)).toBe('full'); // refused until loaded: the star button is not shown then
  });

  it('load() reads what was stored, tells the listeners once, and is the same promise the second time', async () => {
    const mine = createLazyMine(services({ starred: [a], recent: [b] }));
    const seen = vi.fn();
    mine.subscribe(seen);
    const first = mine.load();
    expect(mine.load()).toBe(first);
    await first;
    expect(mine.records()).toBeDefined();
    const face = faceOf(mine);
    expect(face.starred()).toEqual([a]);
    expect(face.recent()).toEqual([b]);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(face.toggle(a)).toBe('removed');
  });

  it('what the late chunk attaches (the star port, the palette star command) is what the window reads, and nothing before', () => {
    const mine = createLazyMine(services());
    const seen = vi.fn();
    mine.subscribe(seen);
    const late = { port: { isStarred: () => false, toggle: () => undefined, subscribe: () => () => undefined }, star: () => undefined };
    mine.attach(late);
    expect(mine.late()).toBe(late);
    expect(seen).toHaveBeenCalledTimes(1);
    mine.attach(undefined);
    expect(mine.late()).toBeUndefined();
  });

  it('a record touched before it is loaded is not kept (the late chunk touches the one shown when it is ready)', async () => {
    const mine = createLazyMine(services());
    faceOf(mine).touch(a);
    await mine.load();
    expect(faceOf(mine).recent()).toEqual([]);
    faceOf(mine).touch(b);
    expect(faceOf(mine).recent()).toEqual([b]);
  });

  it('a window without the services shows nothing', () => {
    expect(NO_MY_RECORDS.starred()).toEqual([]);
    expect(NO_MY_RECORDS.toggle(a)).toBe('full');
    expect(faceOf(createLazyMine()).starred()).toEqual([]);
  });
});
