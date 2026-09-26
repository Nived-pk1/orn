/** Normaliser — docs/SEARCH.md §2; ADV-022 (duplicate names), ADV-033 (inert markup), INV-24. */
import { describe, expect, it } from 'vitest';
import { fold, textNormalizer, tokens } from './normalizer';

describe('fold', () => {
  it.each([
    ['Reimer–Tiemann', 'reimer tiemann'],
    ['Reimer-Tiemann', 'reimer tiemann'],
    ['Friedel‑Crafts', 'friedel crafts'],
    ['Wolff — Kishner', 'wolff kishner'],
    ['C₂H₅OH', 'c2h5oh'],
    ['C2H5OH', 'c2h5oh'],
    ['Br⁻', 'br-'],
    ['Na⁺', 'na+'],
    ['α-D-glucose', 'alpha d glucose'],
    ['Δ', 'delta'],
    ['β-Ketoester', 'beta ketoester'],
    ['ν', 'nu'],
    ["Baeyer's reagent", 'baeyers reagent'],
    ['Baeyer’s reagent', 'baeyers reagent'],
    ['Café', 'cafe'],
    ['Straße', 'strasse'],
    ['  many   spaces\t\nhere ', 'many spaces here'],
    ['', ''],
  ])('%s → %s', (input, expected) => {
    expect(fold(input)).toBe(expected);
  });

  it('makes equivalent spellings compare equal', () => {
    expect(fold('Reimer–Tiemann')).toBe(fold('reimer tiemann'));
    expect(fold('C₂H₅OH')).toBe(fold('C2H5OH'));
    expect(fold('Baeyer’s')).toBe(fold("Baeyer's"));
  });

  it('keeps non-Latin scripts intact (only Latin combining marks are removed)', () => {
    expect(fold('कार्बन')).toBe('कार्बन');
  });

  it('treats markup and HTML as plain characters', () => {
    expect(fold('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });

  it('is idempotent on a spread of tricky inputs', () => {
    for (const input of ['Br⁻ + Na⁺', 'a--b', 'a-–b', '(-)-menthol', "x'-y", 'α-', '10⁻³', '- - -', 'a - b', 'Br⁻-']) {
      expect(fold(fold(input))).toBe(fold(input));
    }
  });
});

describe('tokens', () => {
  it('emits joined variants so all spellings share a token', () => {
    for (const spelling of ['wolff-kishner', 'wolff kishner', 'wolffkishner', 'Wolff–Kishner']) {
      expect(tokens(spelling)).toContain('wolffkishner');
    }
    expect(tokens('wolff-kishner')).toEqual(['wolff', 'kishner', 'wolffkishner']);
  });

  it('joins adjacent pairs and the whole phrase', () => {
    expect(tokens('Friedel-Crafts alkylation')).toEqual([
      'friedel',
      'crafts',
      'alkylation',
      'friedelcrafts',
      'craftsalkylation',
      'friedelcraftsalkylation',
    ]);
  });

  it('strips surrounding punctuation and drops punctuation-only words', () => {
    expect(tokens('(ethanol), [C₂H₅OH] ; + —')).toEqual(['ethanol', 'c2h5oh', 'ethanolc2h5oh']);
  });

  it('deduplicates and handles empty input', () => {
    expect(tokens('a a')).toEqual(['a', 'aa']);
    expect(tokens('')).toEqual([]);
    expect(tokens('   ')).toEqual([]);
  });

  it('output size is linear in the number of words', () => {
    const words = Array.from({ length: 5000 }, (_, i) => `w${i}`).join(' ');
    expect(tokens(words).length).toBeLessThanOrEqual(3 * 5000);
  });
});

describe('textNormalizer', () => {
  it('exposes the contract', () => {
    expect(textNormalizer.fold('α')).toBe('alpha');
    expect(textNormalizer.tokens('a-b')).toContain('ab');
  });
});
