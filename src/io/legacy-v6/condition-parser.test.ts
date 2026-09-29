/**
 * Step 3.9: the condition parser (docs/MIGRATION.md §4.5): the legacy free-text condition fields into the schema's stage-parameter
 * shapes when unambiguous, else `other[]`; the three regex flags; `parsedFields`; and every `conditions` object of both fixtures.
 */
import { describe, expect, it } from 'vitest';
import { ConditionParametersSchema } from '@/core/schema';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { parseConditionField, type ConditionField } from './condition-fields';
import { parseLegacyConditions } from './condition-parser';

const tiles = (value: string, segments: readonly { start: number; end: number; text: string }[]): boolean => {
  let at = 0;
  for (const s of segments) {
    if (s.start !== at || value.slice(s.start, s.end) !== s.text) return false;
    at = s.end;
  }
  return at === value.length;
};

describe('temperature field: single values, ranges, K and °C, hyphen and en-dash', () => {
  it.each([
    ['140°C', { kind: 'value', value: 140, unit: 'C' }],
    ['140 °C', { kind: 'value', value: 140, unit: 'C' }],
    ['0 ° C', { kind: 'value', value: 0, unit: 'C' }],
    ['25 C', { kind: 'value', value: 25, unit: 'C' }],
    ['443 K', { kind: 'value', value: 443, unit: 'K' }],
    ['443K', { kind: 'value', value: 443, unit: 'K' }],
    ['443 °K', { kind: 'value', value: 443, unit: 'K' }],
    ['-78 °C', { kind: 'value', value: -78, unit: 'C' }],
    ['−78 °C', { kind: 'value', value: -78, unit: 'C' }],
    ['+25 °C', { kind: 'value', value: 25, unit: 'C' }],
    ['37.5 °C', { kind: 'value', value: 37.5, unit: 'C' }],
    ['0-5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0 - 5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0–5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0‐5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['273-278 K', { kind: 'range', min: 273, max: 278, unit: 'K' }],
    ['413–443 K', { kind: 'range', min: 413, max: 443, unit: 'K' }],
    ['-10 - -5 °C', { kind: 'range', min: -10, max: -5, unit: 'C' }],
    ['-10--5 °C', { kind: 'range', min: -10, max: -5, unit: 'C' }],
    ['0 °C – 5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0 K', { kind: 'value', value: 0, unit: 'K' }],
    ['room temperature', { kind: 'qualitative', value: 'room_temperature' }],
    ['Room Temp', { kind: 'qualitative', value: 'room_temperature' }],
    ['rt', { kind: 'qualitative', value: 'room_temperature' }],
    ['r.t.', { kind: 'qualitative', value: 'room_temperature' }],
    ['reflux', { kind: 'qualitative', value: 'reflux' }],
    ['heat', { kind: 'qualitative', value: 'heat' }],
    ['Δ', { kind: 'qualitative', value: 'heat' }],
    ['high temperature', { kind: 'qualitative', value: 'heat' }],
    ['warm', { kind: 'qualitative', value: 'warm' }],
    ['cold', { kind: 'qualitative', value: 'cold' }],
    ['low temperature', { kind: 'qualitative', value: 'low_temperature' }],
    ['strong heating', { kind: 'qualitative', value: 'strong_heat' }],
    ['  443 K  ', { kind: 'value', value: 443, unit: 'K' }],
  ] as const)('%j', (value, temperature) => {
    const parsed = parseConditionField('temperature', value);
    expect(parsed.temperature).toEqual(temperature);
    expect(parsed.other).toEqual([]);
    expect(parsed.review).toEqual([]);
    expect(tiles(value, parsed.segments)).toBe(true);
  });

  it.each([
    '25', // no unit
    't',
    'about right',
    '-78 °C then 0 °C', // two values
    '-78 °C, 0 °C',
    '100 °F',
    '5-0 °C', // written downwards: never reordered
    '-300 °C',
    '-5 K',
    '0 °C - 278 K',
    '25°',
    '140 °C, 3 h', // a further number around the value
    '10-20-30 °C',
    '1e999 °C',
    '1'.repeat(400) + ' °C',
  ])('%j is not decided: the whole value goes to other[] with a review item', (value) => {
    const parsed = parseConditionField('temperature', value);
    expect(parsed.temperature).toBeUndefined();
    expect(parsed.other.length).toBeGreaterThan(0);
    expect(parsed.other.every((entry) => entry.startsWith('temperature: '))).toBe(true);
    expect(parsed.other.map((entry) => entry.slice('temperature: '.length)).join('')).toBe(value.replace(/\s+/g, ' ').trim());
    expect(parsed.review.length).toBeGreaterThan(0);
    expect(tiles(value, parsed.segments)).toBe(true);
    expect(parsed.segments.every((s) => s.field === undefined)).toBe(true);
  });

  it('a value read next to words: the value is taken, the words are kept and reported', () => {
    const parsed = parseConditionField('temperature', 'heated at 140 °C');
    expect(parsed.temperature).toEqual({ kind: 'value', value: 140, unit: 'C' });
    expect(parsed.other).toEqual(['temperature: heated at']);
    expect(parsed.review.map((r) => r.code)).toEqual(['PARTIAL_FIELD_PARSE']);
    expect(parsed.segments.map((s) => [s.text, s.field])).toEqual([['heated at ', undefined], ['140 °C', 'temperature']]);
  });

  it('a blank value gives nothing and no review item', () => {
    for (const value of ['', '   ', '\n']) {
      const parsed = parseConditionField('temperature', value);
      expect(parsed).toMatchObject({ other: [], review: [] });
      expect(parsed.temperature).toBeUndefined();
    }
  });
});

describe('pressure field', () => {
  it.each([
    ['1 atm', { kind: 'value', value: 1, unit: 'atm' }],
    ['1 atmosphere', { kind: 'value', value: 1, unit: 'atm' }],
    ['5 bar', { kind: 'value', value: 5, unit: 'bar' }],
    ['2-3 bar', { kind: 'range', min: 2, max: 3, unit: 'bar' }],
    ['2–3 atm', { kind: 'range', min: 2, max: 3, unit: 'atm' }],
    ['760 mmHg', { kind: 'value', value: 760, unit: 'mmHg' }],
    ['760 mm Hg', { kind: 'value', value: 760, unit: 'mmHg' }],
    ['101.3 kPa', { kind: 'value', value: 101.3, unit: 'kPa' }],
    ['high pressure', { kind: 'qualitative', value: 'high' }],
    ['Reduced pressure', { kind: 'qualitative', value: 'reduced' }],
    ['atmospheric', { kind: 'qualitative', value: 'atmospheric' }],
  ] as const)('%j', (value, pressure) => {
    const parsed = parseConditionField('pressure', value);
    expect(parsed.pressure).toEqual(pressure);
    expect(parsed.review).toEqual([]);
    expect(tiles(value, parsed.segments)).toBe(true);
  });

  it.each(['5 psi', '760 torr', '1 Pa', '3', '5-2 atm', '1 atm - 2 bar', 'a lot'])('%j is not decided', (value) => {
    const parsed = parseConditionField('pressure', value);
    expect(parsed.pressure).toBeUndefined();
    expect(parsed.other.join('')).toContain('pressure: ');
    expect(parsed.review.length).toBeGreaterThan(0);
  });
});

describe('medium, phase, strength and atmosphere fields (whole-value word tables, case-insensitive)', () => {
  it.each([
    ['medium', 'acidic', { medium: 'acidic' }],
    ['medium', 'Acidic', { medium: 'acidic' }],
    ['medium', 'acid medium', { medium: 'acidic' }],
    ['medium', 'basic', { medium: 'basic' }],
    ['medium', 'alkaline', { medium: 'basic' }],
    ['medium', 'neutral', { medium: 'neutral' }],
    ['medium', 'buffered', { medium: 'buffered' }],
    ['phase', 'aqueous', { solventCharacter: 'aqueous' }],
    ['phase', 'Aq.', { solventCharacter: 'aqueous' }],
    ['phase', 'alcoholic', { solventCharacter: 'alcoholic' }],
    ['phase', 'alc.', { solventCharacter: 'alcoholic' }],
    ['atmosphere', 'nitrogen', { atmosphere: 'nitrogen' }],
    ['atmosphere', 'N2', { atmosphere: 'nitrogen' }],
    ['atmosphere', 'under argon', { atmosphere: 'argon' }],
    ['atmosphere', 'inert atmosphere', { atmosphere: 'inert' }],
    ['atmosphere', 'under an oxygen atmosphere', { atmosphere: 'oxygen' }],
    ['atmosphere', 'H2', { atmosphere: 'hydrogen' }],
    ['atmosphere', 'air', { atmosphere: 'air' }],
  ] as [ConditionField, string, Record<string, string>][])('%s %j', (field, value, expected) => {
    const parsed = parseConditionField(field, value);
    expect(parsed).toMatchObject(expected);
    expect(parsed.other).toEqual([]);
    expect(parsed.review).toEqual([]);
    expect(tiles(value, parsed.segments)).toBe(true);
    expect(parsed.segments.filter((s) => s.field !== undefined)).toHaveLength(1);
  });

  it.each([
    ['dilute', 'dilute'],
    ['Dil.', 'dilute'],
    ['conc.', 'concentrated'],
    ['Concentrated', 'concentrated'],
    ['fuming', 'fuming'],
    ['glacial', 'glacial'],
    ['sat.', 'saturated'],
  ])('strength %j has no stage field, so it is kept as other[] "strength: %s"', (value, canonical) => {
    const parsed = parseConditionField('strength', value);
    expect(parsed.strength).toBe(canonical);
    expect(parsed.other).toEqual([`strength: ${canonical}`]);
    expect(parsed.review).toEqual([]);
  });

  it.each([
    ['medium', 'm'],
    ['medium', 'somewhat acidic'],
    ['phase', 'p'],
    ['phase', 'gas'],
    ['strength', 'custom'],
    ['atmosphere', 'vacuum'],
    ['atmosphere', 'nitrogen and argon'],
  ] as [ConditionField, string][])('%s %j is not a recognised spelling: kept in other[]', (field, value) => {
    const parsed = parseConditionField(field, value);
    expect(parsed.other).toEqual([`${field}: ${value}`]);
    expect(parsed.review.map((r) => r.code)).toEqual(['UNPARSED_FIELD_VALUE']);
  });
});

describe('flags, text and parsedFields (MIGRATION.md §4.5)', () => {
  it('heat without a temperature becomes qualitative heat; light becomes hv; anhydrous becomes true; all are parsedFields', () => {
    const parsed = parseLegacyConditions({ text: 'x', heat: true, light: true, anhydrous: true });
    expect(parsed.parameters).toEqual({
      temperature: { kind: 'qualitative', value: 'heat' },
      solventCharacter: [],
      anhydrous: true,
      light: 'hv',
      activation: [],
      other: [],
      text: 'x',
      parsedFields: ['temperature', 'anhydrous', 'light'],
    });
    expect(parsed.flags.map((f) => [f.flag, f.outcome])).toEqual([['heat', 'applied'], ['light', 'applied'], ['anhydrous', 'applied']]);
  });

  it('heat with a temperature keeps the temperature and reports the flag as subsumed', () => {
    const parsed = parseLegacyConditions({ temperature: '140°C', heat: true });
    expect(parsed.parameters.temperature).toEqual({ kind: 'value', value: 140, unit: 'C' });
    expect(parsed.flags).toEqual([{ flag: 'heat', outcome: 'subsumed_by_temperature' }]);
    expect(parsed.review.map((r) => r.code)).toEqual(['FLAG_SUBSUMED']);
    expect(parsed.consumed).toContain('heat');
  });

  it('heat with an undecidable temperature text still gets qualitative heat; the text stays in other[]', () => {
    const parsed = parseLegacyConditions({ temperature: 't', heat: true });
    expect(parsed.parameters.temperature).toEqual({ kind: 'qualitative', value: 'heat' });
    expect(parsed.parameters.other).toEqual(['temperature: t']);
    expect(parsed.parameters.parsedFields).toEqual(['temperature']);
  });

  it('a flag is only applied when it is exactly true: "yes" is reported, not guessed', () => {
    const parsed = parseLegacyConditions({ heat: 'yes', light: 1, anhydrous: {} });
    expect(parsed.parameters.temperature).toBeUndefined();
    expect(parsed.parameters.light).toBeUndefined();
    expect(parsed.parameters.anhydrous).toBeUndefined();
    expect(parsed.review.map((r) => [r.code, r.field])).toEqual([['NON_BOOLEAN_FLAG', 'heat'], ['NON_BOOLEAN_FLAG', 'light'], ['NON_BOOLEAN_FLAG', 'anhydrous']]);
    expect(parsed.unconsumed).toEqual(['heat', 'light', 'anhydrous']);
  });

  it('false flags and empty fields are silent', () => {
    const parsed = parseLegacyConditions({ text: '', temperature: '', medium: '', phase: '', strength: '', heat: false, light: false, pressure: '', atmosphere: '', anhydrous: false });
    expect(parsed.parameters).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
    expect(parsed.review).toEqual([]);
    expect(parsed.unconsumed).toEqual([]);
  });

  it('every field a parser filled is in parsedFields, in schema order', () => {
    const parsed = parseLegacyConditions({ text: 'all', temperature: '0-5 °C', medium: 'acidic', phase: 'aqueous', strength: 'dilute', pressure: '1 atm', atmosphere: 'nitrogen', light: true, anhydrous: true });
    expect(parsed.parameters.parsedFields).toEqual(['temperature', 'pressure', 'medium', 'solventCharacter', 'anhydrous', 'light', 'atmosphere']);
    expect(parsed.parameters).toMatchObject({
      temperature: { kind: 'range', min: 0, max: 5, unit: 'C' },
      pressure: { kind: 'value', value: 1, unit: 'atm' },
      medium: 'acidic',
      solventCharacter: ['aqueous'],
      atmosphere: 'nitrogen',
      other: ['strength: dilute'],
    });
    expect(ConditionParametersSchema.safeParse(parsed.parameters).success).toBe(true);
  });

  it('text is kept as parameters.text and originalText; a text the schema cannot hold is reported, never truncated', () => {
    expect(parseLegacyConditions({ text: 'Conc. H2SO4, 443 K' })).toMatchObject({ originalText: 'Conc. H2SO4, 443 K', parameters: { text: 'Conc. H2SO4, 443 K' } });
    const long = 'x'.repeat(2001);
    const tooLong = parseLegacyConditions({ text: long });
    expect(tooLong.originalText).toBe(long);
    expect(tooLong.parameters.text).toBeUndefined();
    expect(tooLong.review.map((r) => r.code)).toEqual(['TEXT_NOT_REPRESENTABLE']);
    const control = parseLegacyConditions({ text: 'a\u0000b' });
    expect(control.originalText).toBe('a\u0000b');
    expect(control.parameters.text).toBeUndefined();
    expect(control.review.map((r) => r.code)).toEqual(['TEXT_NOT_REPRESENTABLE']);
  });

  it('values of the wrong type are reported and NOT consumed; numbers are read as their text', () => {
    const parsed = parseLegacyConditions({ text: 5, temperature: 25, medium: { a: 1 }, pressure: [1], atmosphere: true });
    expect(parsed.parameters.other).toEqual(['temperature: 25']);
    expect(parsed.consumed).toEqual(['temperature']);
    expect(parsed.unconsumed).toEqual(['text', 'medium', 'pressure', 'atmosphere']);
    expect(parsed.review.filter((r) => r.code === 'UNSUPPORTED_VALUE_TYPE').map((r) => r.field)).toEqual(['text', 'medium', 'pressure', 'atmosphere']);
  });

  it('other[] never exceeds the schema cap; the overflow is returned, nothing is dropped', () => {
    const long = 'word '.repeat(2000).trim();
    const parsed = parseLegacyConditions({ medium: long, phase: long });
    expect(parsed.parameters.other).toHaveLength(16);
    expect(ConditionParametersSchema.safeParse(parsed.parameters).success).toBe(true);
    expect(parsed.overflowOther.length).toBeGreaterThan(0);
    expect(parsed.review.map((r) => r.code)).toContain('OTHER_OVERFLOW');
    const words = [...parsed.parameters.other, ...parsed.overflowOther].map((e) => e.replace(/^(medium|phase): /, '')).join('');
    expect(words.replace(/\s/g, '')).toBe((long + long).replace(/\s/g, ''));
  });

  it('control characters in a value are written as \\u{hex} and reported', () => {
    const parsed = parseLegacyConditions({ medium: 'bad\u0001‮value' });
    expect(parsed.parameters.other).toEqual(['medium: bad\\u{1}\\u{202e}value']);
    expect(parsed.review.map((r) => r.code)).toContain('CONTROL_CHARACTERS_ESCAPED');
    expect(ConditionParametersSchema.safeParse(parsed.parameters).success).toBe(true);
  });

  it('any input at all is accepted', () => {
    for (const input of [undefined, null, 0, 'x', [], [1], true, () => 1, Symbol('s')]) {
      expect(() => parseLegacyConditions(input)).not.toThrow();
    }
    expect(parseLegacyConditions(null).parameters).toEqual({ solventCharacter: [], activation: [], other: [], parsedFields: [] });
  });

  it('inherited properties are never read (only own ones)', () => {
    const proto = { temperature: '140 °C', heat: true };
    const parsed = parseLegacyConditions(Object.create(proto) as unknown);
    expect(parsed.parameters.temperature).toBeUndefined();
  });

  it('is deterministic and does not modify its input', () => {
    const input = { text: 't', temperature: '0-5 °C', heat: true };
    const before = JSON.stringify(input);
    expect(parseLegacyConditions(input)).toEqual(parseLegacyConditions(input));
    expect(JSON.stringify(input)).toBe(before);
  });
});

describe('the conditions of both legacy fixtures (after the step 3.8 port) and the quirk workbook', () => {
  const conditionsOf = (data: unknown): unknown[] => ((data as { reactions: { conditions?: unknown }[] }).reactions).map((r) => r.conditions);
  const sources: [string, unknown[]][] = [
    ['v4-sample.normalized-by-v6.json', conditionsOf(legacyFixture('v4-sample.normalized-by-v6.json'))],
    ['v6-demo-export.normalized-by-v6.json', conditionsOf(legacyFixture('v6-demo-export.normalized-by-v6.json'))],
    ['quirks.normalized-by-v6.json', conditionsOf(legacyTestFixture('quirks.normalized-by-v6.json'))],
    ['condition-texts.autofilled-by-v6.json', (legacyTestFixture('condition-texts.autofilled-by-v6.json') as { result: unknown }[]).map((row) => row.result)],
  ];

  it.each(sources)('%s: every conditions object parses, is schema-valid and keeps its text', (_name, all) => {
    expect(all.length).toBeGreaterThan(0);
    for (const conditions of all) {
      const parsed = parseLegacyConditions(conditions);
      expect(ConditionParametersSchema.safeParse(parsed.parameters).success).toBe(true);
      for (const field of parsed.fields) expect(tiles(field.value, field.segments)).toBe(true);
      const text = (conditions as { text?: unknown }).text;
      if (typeof text === 'string') expect(parsed.originalText).toBe(text);
    }
  });

  it('the v6 demo: r-with "140°C" reads as a value, "aqueous" as solventCharacter, medium acidic, heat/light/anhydrous flags', () => {
    const demo = conditionsOf(legacyFixture('v6-demo-export.normalized-by-v6.json')) as { text: string; temperature: string }[];
    const parsed = demo.map((c) => parseLegacyConditions(c));
    const hot = parsed.find((p) => p.originalText === '140°C');
    expect(hot?.parameters.temperature).toEqual({ kind: 'value', value: 140, unit: 'C' });
    expect(parsed.some((p) => p.parameters.solventCharacter.includes('aqueous'))).toBe(true);
    expect(parsed.some((p) => p.parameters.solventCharacter.includes('alcoholic'))).toBe(true);
    expect(parsed.some((p) => p.parameters.medium === 'acidic')).toBe(true);
    expect(parsed.some((p) => p.parameters.light === 'hv')).toBe(true);
    expect(parsed.some((p) => p.parameters.anhydrous === true)).toBe(true);
    expect(parsed.some((p) => p.parameters.temperature?.kind === 'qualitative')).toBe(true);
  });

  it('the quirk with junk in every field keeps every value visible', () => {
    const parsed = parseLegacyConditions({ text: 'text with heat', heat: 'yes', strength: 'custom', medium: 'm', phase: 'p', temperature: 't', light: true, anhydrous: true });
    expect(parsed.parameters.other).toEqual(['temperature: t', 'medium: m', 'phase: p', 'strength: custom']);
    expect(parsed.parameters.light).toBe('hv');
    expect(parsed.parameters.anhydrous).toBe(true);
    expect(parsed.unconsumed).toEqual(['heat']);
    expect(parsed.review.map((r) => r.code)).toEqual(['UNPARSED_FIELD_VALUE', 'UNPARSED_FIELD_VALUE', 'UNPARSED_FIELD_VALUE', 'UNPARSED_FIELD_VALUE', 'NON_BOOLEAN_FLAG']);
  });
});
