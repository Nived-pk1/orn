import { describe, expect, it } from 'vitest';
import type { CanonicalState, RecordRef } from '@/core/schema';
import { starredGroups } from './starred-groups';

const ref = (kind: string, id: string) => ({ kind, id }) as RecordRef;
const state = {
  records: {
    species: { s1: { id: 's1', names: { display: 'Ethanol' }, aliases: [] }, s2: { id: 's2', names: { display: 'Acetone' }, aliases: [] } },
    reaction: { r1: { id: 'r1', names: { display: 'Aldol addition' }, aliases: [] } },
    class: {},
  },
} as unknown as CanonicalState;

describe('starredGroups (step 8.4g Part B, G2)', () => {
  it('groups by kind in a fixed order, each group in the order the stars were made, names from the records', () => {
    const { groups, missing } = starredGroups(state, [ref('species', 's2'), ref('reaction', 'r1'), ref('species', 's1')]);
    expect(groups.map((g) => g.heading)).toEqual(['Reactions', 'Compounds']);
    expect(groups[1]?.rows.map((r) => r.title)).toEqual(['Acetone', 'Ethanol']);
    expect(missing).toBe(0);
  });

  it('a star whose record is gone is left out and counted', () => {
    const { groups, missing } = starredGroups(state, [ref('species', 's1'), ref('species', 'deleted'), ref('class', 'nope'), ref('weird_kind', 'x')]);
    expect(groups.flatMap((g) => g.rows).map((r) => r.ref.id)).toEqual(['s1']);
    expect(missing).toBe(3);
  });

  it('says the footer in words', async () => {
    const { missingWords } = await import('./starred-groups');
    expect(missingWords(0)).toBeUndefined();
    expect(missingWords(1)).toBe('1 starred record no longer exists');
    expect(missingWords(2)).toBe('2 starred records no longer exist');
  });
});
