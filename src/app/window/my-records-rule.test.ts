import { describe, expect, it } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { RECENT_LIMIT, STAR_LIMIT, parseRefs, toggleStar, touchRecent } from './my-records-rule';

const ref = (n: number, kind = 'reaction') => ({ kind, id: `r${n}` }) as RecordRef;

describe('starred and recent records (step 8.4g Part B, G2 and G3)', () => {
  it('parses what was stored tolerantly: bad entries and duplicates go, the rest keeps its order, the cap holds', () => {
    const stored = [ref(1), { kind: 'species', id: 'e' }, ref(1), null, 3, { kind: 'x' }, { kind: 'Bad Kind', id: 'q' }, { kind: 'class', id: '' }, { kind: 'class', id: 'a'.repeat(300) }];
    expect(parseRefs(stored, 10)).toEqual([ref(1), { kind: 'species', id: 'e' }]);
    expect(parseRefs('nope', 10)).toEqual([]);
    expect(parseRefs(Array.from({ length: 900 }, (_, n) => ref(n)), STAR_LIMIT)).toHaveLength(STAR_LIMIT);
  });

  it('a star is added, then removed; the 501st is refused and the list is not changed', () => {
    const one = toggleStar([], ref(1));
    expect(one).toEqual({ result: 'added', list: [ref(1)] });
    expect(toggleStar(one.list, ref(1))).toEqual({ result: 'removed', list: [] });
    const full = Array.from({ length: STAR_LIMIT }, (_, n) => ref(n));
    const refused = toggleStar(full, ref(STAR_LIMIT));
    expect(refused.result).toBe('full');
    expect(refused.list).toBe(full);
    expect(toggleStar(full, ref(3)).result).toBe('removed'); // a full list can still lose one
  });

  it('recent: newest first, no duplicates, at most 20', () => {
    let list = touchRecent([], ref(1));
    list = touchRecent(list, ref(2));
    list = touchRecent(list, ref(1));
    expect(list).toEqual([ref(1), ref(2)]);
    for (let n = 10; n < 40; n++) list = touchRecent(list, ref(n));
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]).toEqual(ref(39));
  });

  it('the same id of two kinds is two records', () => {
    expect(toggleStar([ref(1, 'species')], ref(1, 'reaction')).list).toHaveLength(2);
  });
});
