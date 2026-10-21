/** The words for a relationship in a history label and a title (step 6.6c part A, L3): both ends, in the schema's own words, names cut past 40 characters. */
import { describe, expect, it } from 'vitest';
import { relationshipWords, shortName, NAME_WORDS_MAX } from './labels';

describe('shortName', () => {
  it('keeps a name of 40 characters or fewer and cuts a longer one to 40 characters and "..."', () => {
    expect(NAME_WORDS_MAX).toBe(40);
    expect(shortName('x'.repeat(40))).toBe('x'.repeat(40));
    expect(shortName('y'.repeat(41))).toBe(`${'y'.repeat(40)}...`);
  });
});

describe('relationshipWords', () => {
  it('names both ends around the type\'s label, from first to second', () => {
    expect(relationshipWords('commonly_confused_with', 'Aldol', 'Cannizzaro')).toBe('Aldol commonly confused with Cannizzaro');
    expect(relationshipWords('prerequisite_of', 'Inductive effect', "Markovnikov's rule")).toBe("Inductive effect prerequisite of Markovnikov's rule");
  });
  it('cuts each long name, not the whole line', () => {
    const long = 'a'.repeat(50);
    expect(relationshipWords('related_to', long, 'B')).toBe(`${'a'.repeat(40)}... related to B`);
  });
  it('an unknown type is said with its raw words, never dropped', () => {
    expect(relationshipWords('odd_type', 'A', 'B')).toBe('A odd type B');
  });
});
