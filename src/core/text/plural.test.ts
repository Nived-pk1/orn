import { describe, expect, it } from 'vitest';
import { plural, verbFor } from './plural';

describe('plural', () => {
  it('counts with the right noun for 0, 1 and 2', () => {
    expect(plural(0, 'reaction', 'reactions')).toBe('0 reactions');
    expect(plural(1, 'reaction', 'reactions')).toBe('1 reaction');
    expect(plural(2, 'reaction', 'reactions')).toBe('2 reactions');
  });
  it('picks the verb form for the count', () => {
    expect(verbFor(1, 'uses', 'use')).toBe('uses');
    expect(verbFor(0, 'uses', 'use')).toBe('use');
    expect(verbFor(2, 'is', 'are')).toBe('are');
  });
});
