/**
 * The palette grammar (step 4.5, SEARCH §4): plain text, the r: s: c: g: n: m: t: prefixes, > commands, case and whitespace
 * tolerance, and bounded work on any input (never throws, output within the limits, linear in the capped input).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_QUERY_CHARS, MAX_QUERY_WORDS } from '../contracts';
import { PALETTE_INPUT_CAP, PALETTE_PREFIXES, parsePalette } from './parse';

describe('prefixes', () => {
  it.each(Object.entries(PALETTE_PREFIXES))('%s: narrows to %s', (letter, kind) => {
    expect(parsePalette(`${letter}: ethanol`)).toEqual({ mode: 'search', text: 'ethanol', kinds: [kind], truncated: false });
    expect(parsePalette(`${letter.toUpperCase()}:ethanol`)).toEqual({ mode: 'search', text: 'ethanol', kinds: [kind], truncated: false });
  });

  it('plain text searches everything', () => {
    expect(parsePalette('ethanol')).toEqual({ mode: 'search', text: 'ethanol', truncated: false });
    expect(parsePalette('')).toEqual({ mode: 'search', text: '', truncated: false });
    expect(parsePalette('   ')).toEqual({ mode: 'search', text: '', truncated: false });
  });

  it('is tolerant of case and whitespace, including a full-width colon', () => {
    expect(parsePalette('   R  :   Wolff   Kishner  ')).toEqual({ mode: 'search', text: 'Wolff Kishner', kinds: ['reaction'], truncated: false });
    expect(parsePalette('\tS：Br2')).toEqual({ mode: 'search', text: 'Br2', kinds: ['species'], truncated: false });
    expect(parsePalette('s:')).toEqual({ mode: 'search', text: '', kinds: ['species'], truncated: false });
  });

  it('only the first prefix counts; an unknown letter or a longer word before the colon is plain text', () => {
    expect(parsePalette('r: s: x')).toMatchObject({ kinds: ['reaction'], text: 's: x' });
    expect(parsePalette('x: ethanol')).toEqual({ mode: 'search', text: 'x: ethanol', truncated: false });
    expect(parsePalette('rs: ethanol')).toEqual({ mode: 'search', text: 'rs: ethanol', truncated: false });
    expect(parsePalette('ethanol: r')).toEqual({ mode: 'search', text: 'ethanol: r', truncated: false });
  });
});

describe('commands', () => {
  it('> starts a command; text is folded to lower case with single spaces', () => {
    expect(parsePalette('> export')).toEqual({ mode: 'command', text: 'export', truncated: false });
    expect(parsePalette('>new reaction')).toEqual({ mode: 'command', text: 'new reaction', truncated: false });
    expect(parsePalette('  >   Toggle   Exam  Scope ')).toEqual({ mode: 'command', text: 'toggle exam scope', truncated: false });
    expect(parsePalette('>')).toEqual({ mode: 'command', text: '', truncated: false });
  });

  it('a > that is not first is text', () => {
    expect(parsePalette('a > b')).toEqual({ mode: 'search', text: 'a > b', truncated: false });
  });
});

describe('limits are reported, never silent', () => {
  it('cuts to the word and character limits and says so', () => {
    const words = Array.from({ length: MAX_QUERY_WORDS + 4 }, (_, i) => `w${i}`).join(' ');
    const cut = parsePalette(words);
    expect(cut.text.split(' ')).toHaveLength(MAX_QUERY_WORDS);
    expect(cut.truncated).toBe(true);
    const long = parsePalette('a'.repeat(MAX_QUERY_CHARS + 500));
    expect(long.text.length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect(long.truncated).toBe(true);
    expect(parsePalette('a'.repeat(MAX_QUERY_CHARS)).truncated).toBe(false);
  });

  it('never splits a surrogate pair when it cuts', () => {
    const text = '😀'.repeat(MAX_QUERY_CHARS);
    const out = parsePalette(text).text;
    expect(out.length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
    expect([...out].every((ch) => ch === '😀')).toBe(true);
  });

  it('reads no more than the cap of a huge input', () => {
    const huge = `r: ${'word '.repeat(2_000_000)}`;
    const began = performance.now();
    const out = parsePalette(huge);
    expect(performance.now() - began).toBeLessThan(200);
    expect(out).toMatchObject({ mode: 'search', kinds: ['reaction'], truncated: true });
    expect(PALETTE_INPUT_CAP).toBeLessThan(2_000);
  });
});

describe('properties', () => {
  it('never throws, always within the limits, whatever the input (also non-strings)', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: 'binary', maxLength: 3_000 }), fc.fullUnicodeString({ maxLength: 500 }), fc.anything().map((x) => x as string)), (input) => {
        const out = parsePalette(input);
        expect(out.text.length).toBeLessThanOrEqual(MAX_QUERY_CHARS);
        expect(out.text.split(' ').filter((w) => w !== '').length).toBeLessThanOrEqual(MAX_QUERY_WORDS);
        expect(out.text).toBe(out.text.trim());
        structuredClone(out);
      }),
      { numRuns: 500 },
    );
  });

  it('whitespace and the case of the prefix letter do not change the answer', () => {
    fc.assert(
      fc.property(fc.constantFrom(...Object.keys(PALETTE_PREFIXES)), fc.constantFrom('', ' ', '\t', '  \n'), fc.constantFrom('', ' ', '   '), fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 -]{0,30}[A-Za-z0-9]$/), (letter, before, after, text) => {
        const plain = parsePalette(`${letter}:${text}`);
        expect(parsePalette(`${before}${letter.toUpperCase()}${after}:${after}${text}${before}`)).toEqual(plain);
      }),
      { numRuns: 200 },
    );
  });

  it('work grows linearly with the input up to the cap, and stops growing after it', () => {
    const time = (n: number): number => {
      const input = 'a '.repeat(n);
      const began = performance.now();
      for (let i = 0; i < 200; i += 1) parsePalette(input);
      return performance.now() - began;
    };
    time(100); // warm up
    const [small, large, huge] = [time(100), time(PALETTE_INPUT_CAP), time(PALETTE_INPUT_CAP * 40)];
    expect(huge).toBeLessThan(Math.max(large * 4, 50)); // 40x the input costs about what the cap costs
    expect(large).toBeLessThan(Math.max(small * 60, 50));
  });
});
