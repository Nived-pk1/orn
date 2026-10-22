/**
 * Step 3.9: the "no character lost" property of the label and condition parsers, and "never throws", for ANY string (fast-check),
 * plus every label and condition text that occurs in both legacy fixtures after the step 3.8 port.
 *
 * "Accounted for" means: the returned segments tile the input exactly (contiguous, no overlap, concatenation === input), each
 * parsed segment re-parses to the same value on its own, and the remainder text - the segments without a field - is the only thing
 * `remainder` / `other[]` carry (whitespace normalised, control characters written as \u{hex}); rebuilt here independently.
 */
import * as fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ConditionParametersSchema, LabelTextSchema } from '@/core/schema';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { parseConditionField, type ConditionField } from '@/core/condition-parse/condition-fields';
import { parseLegacyConditions } from '@/core/condition-parse/condition-parser';
import { parseLabel } from './label-parser';
import { remainderText, toOtherEntries, type Segment } from '@/core/condition-parse/parse-spans';

const FIELDS: readonly ConditionField[] = ['temperature', 'pressure', 'medium', 'phase', 'strength', 'atmosphere'];
const PIECES = ['aq.', '(aq)', 'alc.', 'conc.', 'dil.', 'dry', 'anhydrous', '(excess)', '(cat.)', 'non-', 'KOH', 'H2SO4', ' ', '  ', '\t', '\n', '(', ')', ',', ';', '-', '–', '−', '‐', '°C', '° C', 'K', 'C', 'F', '443', '0', '5', '-78', '25', '.', 'atm', 'bar', 'kPa', 'mm Hg', 'hv', 'hν', 'UV', 'light', 'rt', 'reflux', 'heat', 'Δ', 'acidic', 'aqueous', 'nitrogen', 'under', 'ν', '\u0000', '‮', '\ud800', 'é', '😀', 'x'];

const glued = fc.array(fc.constantFrom(...PIECES), { maxLength: 14 }).map((parts) => parts.join(''));
const wild = fc.string({ unit: fc.oneof(fc.char16bits(), fc.fullUnicode(), fc.constantFrom(...PIECES.filter((p) => p.length === 1))), maxLength: 60 });
const anyText = fc.oneof({ weight: 3, arbitrary: glued }, { weight: 1, arbitrary: wild }, { weight: 1, arbitrary: fc.string({ maxLength: 40 }) });
const RUNS = { numRuns: Number(process.env['ORN_PROPERTY_RUNS'] ?? 300), seed: 20260929 };

const tiles = (input: string, segments: readonly Segment[]): boolean => {
  let at = 0;
  for (const s of segments) {
    if (s.start !== at || s.end < s.start || input.slice(s.start, s.end) !== s.text) return false;
    at = s.end;
  }
  return at === input.length && segments.map((s) => s.text).join('') === input;
};

const noSpace = (text: string): string => text.replace(/\s/g, '');
// eslint-disable-next-line no-control-regex -- intentional: the characters LabelTextSchema rejects
const FORBIDDEN = /[\u0000-\u001F\u007F‪-‮⁦-⁩]/;
const escapedIndependently = (text: string): string => [...text].map((ch) => (FORBIDDEN.test(ch) ? `\\u{${(ch.codePointAt(0) as number).toString(16)}}` : ch)).join('');

describe('label parser: any string', () => {
  it('never throws; the segments tile the label; originalText is the label; remainder is only the remainder segments', () => {
    fc.assert(
      fc.property(anyText, (label) => {
        const parsed = parseLabel(label);
        expect(parsed.originalText).toBe(label);
        expect(tiles(label, parsed.segments)).toBe(true);
        const kept = parsed.segments.filter((s) => s.field !== undefined);
        expect(parsed.remainder).toBe(parsed.kind === 'stage_parameter' ? '' : remainderText(parsed.segments));
        if (parsed.kind === 'participant') {
          // every non-remainder character belongs to a reported token, and every token to a segment
          expect(kept.map((s) => [s.start, s.end])).toEqual(parsed.tokens.map((t) => [t.start, t.end]));
          for (const token of parsed.tokens) expect(label.slice(token.start, token.end)).toBe(token.text);
          expect(noSpace(label).length).toBe(noSpace(parsed.remainder).length + kept.reduce((n, s) => n + noSpace(s.text).length, 0));
        } else {
          expect(kept).toHaveLength(1);
          expect(noSpace(kept[0]?.text ?? '')).toBe(noSpace(label));
        }
      }),
      RUNS,
    );
  });

  it('every token re-parses to itself when it is the whole label of a participant', () => {
    fc.assert(
      fc.property(anyText, (label) => {
        for (const token of parseLabel(label).tokens) {
          const alone = parseLabel(token.text);
          expect(alone.tokens.map((t) => [t.field, t.value])).toEqual([[token.field, token.value]]);
          expect(alone.remainder).toBe('');
        }
      }),
      RUNS,
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(anyText, (label) => {
        expect(parseLabel(label)).toEqual(parseLabel(label));
      }),
      RUNS,
    );
  });
});

describe('condition field parsers: any string', () => {
  it.each(FIELDS)('%s: never throws; segments tile the value; other[] carries exactly the remainder', (field) => {
    fc.assert(
      fc.property(anyText, (value) => {
        const parsed = parseConditionField(field, value);
        expect(parsed.value).toBe(value);
        expect(tiles(value, parsed.segments)).toBe(true);
        const remainder = remainderText(parsed.segments);
        const prefix = `${field}: `;
        for (const entry of parsed.other) expect(LabelTextSchema.safeParse(entry).success).toBe(true);
        if (parsed.strength === undefined) {
          const carried = parsed.other.map((entry) => (entry.startsWith(prefix) ? entry.slice(prefix.length) : entry)).join('');
          expect(noSpace(carried)).toBe(noSpace(escapedIndependently(remainder)));
        } else {
          expect(parsed.other).toEqual([`strength: ${parsed.strength}`]);
          expect(remainder).toBe('');
        }
        // parsed characters are accounted for by a field: the parsed spans, alone, give the same value back
        for (const segment of parsed.segments.filter((s) => s.field !== undefined)) {
          const again = parseConditionField(field, segment.text);
          expect(JSON.stringify([again.temperature, again.pressure, again.medium, again.solventCharacter, again.atmosphere, again.strength])).toBe(
            JSON.stringify([parsed.temperature, parsed.pressure, parsed.medium, parsed.solventCharacter, parsed.atmosphere, parsed.strength]),
          );
        }
        // nothing is invented: a field is set only when some text was parsed into it
        const set = [parsed.temperature, parsed.pressure, parsed.medium, parsed.solventCharacter, parsed.atmosphere, parsed.strength].filter((v) => v !== undefined);
        expect(set.length).toBe(parsed.segments.some((s) => s.field !== undefined) ? 1 : 0);
      }),
      RUNS,
    );
  });

  it('a partly parsed value never hides a second number: values with digits left over are not decided', () => {
    fc.assert(
      fc.property(anyText, (value) => {
        for (const field of ['temperature', 'pressure'] as const) {
          const parsed = parseConditionField(field, value);
          if (parsed.temperature === undefined && parsed.pressure === undefined) continue;
          expect(/\d/.test(remainderText(parsed.segments))).toBe(false);
        }
      }),
      RUNS,
    );
  });
});

describe('parseLegacyConditions: any object of strings', () => {
  it('never throws; the parameters always satisfy the schema; every non-blank value is consumed', () => {
    fc.assert(
      fc.property(
        fc.record({ text: anyText, temperature: anyText, medium: anyText, phase: anyText, strength: anyText, pressure: anyText, atmosphere: anyText }),
        fc.record({ heat: fc.constantFrom(true, false, 'yes', 0, null), light: fc.constantFrom(true, false, 'yes'), anhydrous: fc.constantFrom(true, false, {}) }),
        (texts, flags) => {
          const parsed = parseLegacyConditions({ ...texts, ...flags });
          expect(ConditionParametersSchema.safeParse(parsed.parameters).success).toBe(true);
          expect(parsed.originalText).toBe(texts.text);
          for (const [key, value] of Object.entries(texts)) {
            if (key !== 'text' && value.trim() !== '') expect(parsed.consumed).toContain(key);
          }
          const carried = [...parsed.parameters.other, ...parsed.overflowOther];
          for (const entry of carried) expect(LabelTextSchema.safeParse(entry).success).toBe(true);
        },
      ),
      { ...RUNS, numRuns: Math.max(50, Math.floor(RUNS.numRuns / 3)) },
    );
  });
});

describe('bounded work', () => {
  it('long adversarial strings finish (no catastrophic backtracking) and still tile', () => {
    const inputs = [
      '1 '.repeat(100_000),
      '1-'.repeat(100_000),
      '(aq'.repeat(60_000),
      ' '.repeat(200_000) + '5 °C',
      '5'.repeat(200_000),
      '-'.repeat(200_000),
      'non-'.repeat(50_000),
      '°'.repeat(100_000),
    ];
    for (const input of inputs) {
      const label = parseLabel(input);
      expect(tiles(input, label.segments)).toBe(true);
      for (const field of FIELDS) expect(tiles(input, parseConditionField(field, input).segments)).toBe(true);
    }
  }, 30_000);
});

describe('toOtherEntries', () => {
  it('splits a long text at character boundaries without losing or repeating anything', () => {
    const text = 'ab '.repeat(300).trim() + '😀'.repeat(150);
    const { entries } = toOtherEntries('medium', text);
    expect(entries.length).toBeGreaterThan(1);
    for (const entry of entries) {
      expect(LabelTextSchema.safeParse(entry).success).toBe(true);
      expect(entry.startsWith('medium: ')).toBe(true);
      expect(entry).not.toMatch(/[\ud800-\udbff]$/); // no cut surrogate pair
    }
    expect(entries.map((e) => e.slice('medium: '.length)).join('')).toBe(text);
  });

  it('gives no entry for blank text', () => {
    expect(toOtherEntries('x', ' \n\t ').entries).toEqual([]);
  });
});

describe('the labels and condition texts of both legacy fixtures', () => {
  const participantsOf = (data: unknown): { label?: unknown }[] =>
    ((data as { reactions: { participants?: { label?: unknown }[] }[] }).reactions).flatMap((r) => r.participants ?? []);
  const fixtures: unknown[] = [
    legacyFixture('v4-sample.normalized-by-v6.json'),
    legacyFixture('v6-demo-export.normalized-by-v6.json'),
    legacyTestFixture('quirks.normalized-by-v6.json'),
  ];
  const labels = [
    ...new Set([
      ...fixtures.flatMap((data) => participantsOf(data).map((p) => p.label)).filter((label): label is string => typeof label === 'string'),
      ...(legacyTestFixture('reagent-strings.split-by-v6.json') as { result?: { reagents?: string[]; workup?: string[]; conditions?: string[] } }[]).flatMap((row) => [
        ...(row.result?.reagents ?? []),
        ...(row.result?.workup ?? []),
        ...(row.result?.conditions ?? []),
      ]),
    ]),
  ];
  const conditionTexts = [
    ...new Set(
      fixtures.flatMap((data) => (data as { reactions: { conditions?: Record<string, unknown> }[] }).reactions.flatMap((r) => Object.values(r.conditions ?? {}))).filter((v): v is string => typeof v === 'string'),
    ),
  ];

  it('the fixtures hold labels and condition texts to test', () => {
    expect(labels.length).toBeGreaterThan(40);
    expect(conditionTexts.length).toBeGreaterThan(10);
  });

  it('every label parses without throwing and no character is lost', () => {
    for (const label of labels) {
      const parsed = parseLabel(label);
      expect(parsed.originalText).toBe(label);
      expect(tiles(label, parsed.segments)).toBe(true);
    }
  });

  it('every condition text parses as every field without throwing, and no character is lost', () => {
    for (const value of conditionTexts) for (const field of FIELDS) expect(tiles(value, parseConditionField(field, value).segments)).toBe(true);
  });

  it('the v4 temperature-as-reagent labels are found: "443 K" becomes a stage parameter', () => {
    const temperatureLabels = labels.filter((label) => parseLabel(label).kind === 'stage_parameter');
    expect(temperatureLabels).toContain('443 K');
  });
});
