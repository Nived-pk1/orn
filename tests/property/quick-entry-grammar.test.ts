/**
 * Quick entry grammar properties (step 6.7b, Q2): the parser never throws and always answers; splitting and joining terms round-trips.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatQuickEntry, parseQuickEntry, type QuickEntry } from '@/core/quick-entry/grammar';

const PIECES = ['+', ' + ', '->', '→', '=>', ', then ', ',then', '(', ')', ' (', '()', 'then', ' ', '\t', '\n', 'a', 'Na+', '[O]', 'CC(=O)O', '°C', '\u0000', '\ud800', '😀', 'é', '-', '>', '=', ','];

const word = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9\-[\]=#@.]{0,8}$/);
const conditionWord = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9,.°]{0,6}$/);
const condition = fc.array(conditionWord, { minLength: 1, maxLength: 3 }).map((words) => words.join(' '));
const term = fc.record({ text: word, condition: fc.option(condition, { nil: undefined }) });
const entryArb = fc.record({
  stages: fc.array(fc.record({ terms: fc.array(term, { minLength: 1, maxLength: 3 }) }), { minLength: 1, maxLength: 3 }),
  products: fc.array(word, { minLength: 1, maxLength: 3 }),
  arrow: fc.constantFrom('->' as const, '→' as const, '=>' as const),
});

const plain = (entry: QuickEntry) => ({
  stages: entry.stages.map((s) => s.terms.map((t) => [t.text, t.condition ?? null])),
  products: entry.products.map((t) => t.text),
  arrow: entry.arrow,
});

describe('quick entry grammar (property)', () => {
  it('never throws, and answers ok or errors with in-range positions and words', () => {
    const lines = fc.oneof(fc.string({ maxLength: 300 }), fc.string({ unit: 'binary', maxLength: 120 }), fc.array(fc.constantFrom(...PIECES), { maxLength: 40 }).map((p) => p.join('')));
    fc.assert(
      fc.property(lines, (line) => {
        const result = parseQuickEntry(line);
        if (result.ok) {
          expect(result.entry.stages.length).toBeGreaterThan(0);
          expect(result.entry.products.length).toBeGreaterThan(0);
        } else {
          expect(result.errors.length).toBeGreaterThan(0);
          for (const error of result.errors) {
            expect(error.message.length).toBeGreaterThan(0);
            expect(error.position).toBeGreaterThanOrEqual(0);
            expect(error.position).toBeLessThanOrEqual(line.length);
          }
        }
      }),
      { numRuns: 1500 },
    );
  });
  it('parse is deterministic', () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...PIECES), { maxLength: 30 }).map((p) => p.join('')), (line) => {
          expect(parseQuickEntry(line)).toEqual(parseQuickEntry(line));
        }),
      { numRuns: 500 },
    );
  });
  it('splitting and joining terms round-trips: parse(format(entry)) is the entry', () => {
    fc.assert(
      fc.property(entryArb, (generated) => {
        const entry: QuickEntry = {
          arrow: generated.arrow,
          stages: generated.stages.map((s) => ({ terms: s.terms.map((t) => ({ text: t.text, ...(t.condition === undefined ? {} : { condition: t.condition }), start: 0, end: 0 })) })),
          products: generated.products.map((text) => ({ text, start: 0, end: 0 })),
        };
        const line = formatQuickEntry(entry, entry.arrow);
        const again = parseQuickEntry(line);
        expect(again.ok).toBe(true);
        if (again.ok) {
          expect(plain(again.entry)).toEqual(plain(entry));
          expect(formatQuickEntry(again.entry, again.entry.arrow)).toBe(line);
        }
      }),
      { numRuns: 800 },
    );
  });
});
