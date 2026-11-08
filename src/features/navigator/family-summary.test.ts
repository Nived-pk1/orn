import { describe, expect, it } from 'vitest';
import { familySummaryOf } from './family-summary';

describe('the family page summary, one line (step 8.4d, E5)', () => {
  it('"<n> reactions · makes <a> families · made from <b>"', () => {
    expect(familySummaryOf({ reactions: 12, makes: 2, madeFrom: 3 })).toBe('12 reactions · makes 2 families · made from 3');
  });
  it('singulars: 1 reaction, makes 1 family', () => {
    expect(familySummaryOf({ reactions: 1, makes: 1, madeFrom: 1 })).toBe('1 reaction · makes 1 family · made from 1');
  });
  it('a part with zero is left out; the reactions part is always there', () => {
    expect(familySummaryOf({ reactions: 4, makes: 0, madeFrom: 2 })).toBe('4 reactions · made from 2');
    expect(familySummaryOf({ reactions: 4, makes: 3, madeFrom: 0 })).toBe('4 reactions · makes 3 families');
    expect(familySummaryOf({ reactions: 0, makes: 0, madeFrom: 0 })).toBe('0 reactions');
  });
});
