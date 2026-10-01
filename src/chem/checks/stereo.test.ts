/** CHEM-006's comparison without a toolkit: the descriptor reader and `compareStereo` over given CIP counts. */
import { describe, expect, it } from 'vitest';
import type { CipCounts } from '../contracts';
import { compareStereo, readDescriptors } from './stereo';

const cip = (over: Partial<CipCounts> = {}): CipCounts => ({ R: 0, S: 0, r: 0, s: 0, E: 0, Z: 0, ...over });
const compare = (descriptors: string[], counts: CipCounts | undefined, unspecified: number | 'unknown' = 0) =>
  compareStereo({ descriptors, cip: counts, unspecifiedStereocentres: unspecified === 'unknown' ? undefined : unspecified });

describe('readDescriptors', () => {
  it('reads locants and letters, in any list form, and ignores the locants', () => {
    for (const text of ['2R', 'R', '(2R)', '(2R,3S)', '2R, 3S', '2R;3S', '3aR', "2'S", '(2R)-', '2-R']) {
      expect(readDescriptors([text]).ok, text).toBe(true);
    }
    expect(readDescriptors(['(2R,3S)', 'E'])).toEqual({ ok: true, letters: { R: 1, S: 1, E: 1, Z: 0 }, lowerCase: false });
  });

  it('refuses words and anything else as "not compared", never guesses', () => {
    for (const text of ['cis', 'trans', 'meso', 'achiral', 'rel-(2R)', 'RS', '(+)-2R', '', '  ', 'R and S', 'e', 'z', '2', 'x'.repeat(300)]) {
      expect(readDescriptors([text]).ok, text).toBe(false);
    }
    expect(readDescriptors(['2R', 'cis']).ok).toBe(false);
  });

  it('flags lower-case r and s', () => {
    expect(readDescriptors(['1r'])).toMatchObject({ ok: true, lowerCase: true });
  });
});

describe('compareStereo', () => {
  it('equal multisets agree; locants and order do not matter', () => {
    expect(compare(['2S', '3R'], cip({ R: 1, S: 1 }))).toEqual({ drafts: [], notCompared: [] });
    expect(compare(['E', '2R'], cip({ R: 1, E: 1 }))).toEqual({ drafts: [], notCompared: [] });
  });

  it('nothing to compare when the species has no descriptors (no note either)', () => {
    expect(compare([], cip({ R: 1 }))).toEqual({ drafts: [], notCompared: [] });
  });

  it('R/S: a different letter, or more centres than the structure has, or a letter it lacks, is a finding', () => {
    expect(compare(['R'], cip({ S: 1 })).drafts).toHaveLength(1);
    expect(compare(['R', 'R'], cip({ R: 1 })).drafts).toHaveLength(1);
    expect(compare(['R', 'R'], cip({ R: 1, S: 2 })).drafts).toHaveLength(1);
    expect(compare(['R'], cip()).drafts).toHaveLength(1);
    expect(compare(['R'], cip({ S: 1 })).drafts[0]).toMatchObject({ ruleId: 'CHEM-006', path: 'stereo.descriptors' });
  });

  it('R/S: naming fewer centres that fit inside the structure is not compared', () => {
    const out = compare(['R'], cip({ R: 1, S: 1 }));
    expect(out.drafts).toEqual([]);
    expect(out.notCompared).toHaveLength(1);
  });

  it('E/Z: equal counts with different letters are a finding; unequal counts are not compared', () => {
    expect(compare(['Z'], cip({ E: 1 })).drafts).toHaveLength(1);
    expect(compare(['Z'], cip()).drafts).toEqual([]);
    expect(compare(['Z'], cip()).notCompared).toHaveLength(1);
    expect(compare(['E', 'E'], cip({ E: 1 })).notCompared).toHaveLength(1);
  });

  it('is not compared at all for words, lower-case, unspecified centres, or no labels', () => {
    for (const out of [
      compare(['cis'], cip({ R: 1 })),
      compare(['1r'], cip({ R: 1 })),
      compare(['R'], cip({ s: 1 })),
      compare(['R'], cip({ R: 1 }), 1),
      compare(['R'], undefined),
      compare(['R'], cip({ R: 1 }), 'unknown'),
    ]) {
      expect(out.drafts).toEqual([]);
      expect(out.notCompared).toHaveLength(1);
      expect(out.notCompared[0]?.ruleId).toBe('CHEM-006');
    }
  });

  it('a mixed result gives the finding and the note together', () => {
    const out = compare(['S', 'Z'], cip({ R: 1, S: 1, E: 1 }));
    expect(out.drafts).toHaveLength(1);
    expect(out.notCompared).toHaveLength(1);
    const both = compare(['R', 'Z'], cip({ S: 1, E: 1 }));
    expect(both.drafts).toHaveLength(2);
  });
});
