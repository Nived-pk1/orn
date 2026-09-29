/**
 * Step 3.9: the label parser (docs/MIGRATION.md §4.6), one table row per token row of the spec, plus ambiguity, boundaries and
 * the labels that occur in the legacy fixtures.
 */
import { describe, expect, it } from 'vitest';
import { parseLabel, type ParsedLabel } from './label-parser';

/** The invariant behind "no character lost": the segments tile the label exactly and `originalText` is the label. */
function expectTiling(label: string, parsed: ParsedLabel): void {
  expect(parsed.originalText).toBe(label);
  expect(parsed.segments.map((s) => s.text).join('')).toBe(label);
  let at = 0;
  for (const segment of parsed.segments) {
    expect(segment.start).toBe(at);
    expect(label.slice(segment.start, segment.end)).toBe(segment.text);
    at = segment.end;
  }
  expect(at).toBe(label.length);
}

describe('token rows of MIGRATION.md §4.6', () => {
  it.each([
    // aq. / (aq) / (aq.) / aqueous -> phase 'aq'
    ['aq. KOH', { phase: 'aq', remainder: 'KOH' }],
    ['KOH (aq)', { phase: 'aq', remainder: 'KOH' }],
    ['NaOH (aq.)', { phase: 'aq', remainder: 'NaOH' }],
    ['NaOH(aq)', { phase: 'aq', remainder: 'NaOH' }],
    ['aqueous KOH', { phase: 'aq', remainder: 'KOH' }],
    ['AQ. KOH', { phase: 'aq', remainder: 'KOH' }],
    // alc. / alcoholic -> 'alc'
    ['alc. KOH', { phase: 'alc', remainder: 'KOH' }],
    ['alcoholic KOH', { phase: 'alc', remainder: 'KOH' }],
    ['Alc. KOH', { phase: 'alc', remainder: 'KOH' }],
    // strength
    ['conc. H2SO4', { strength: 'concentrated', remainder: 'H2SO4' }],
    ['concentrated HNO3', { strength: 'concentrated', remainder: 'HNO3' }],
    ['Conc. H2SO4', { strength: 'concentrated', remainder: 'H2SO4' }],
    ['dil. H2SO4', { strength: 'dilute', remainder: 'H2SO4' }],
    ['dilute HCl', { strength: 'dilute', remainder: 'HCl' }],
    ['Dilute HCl', { strength: 'dilute', remainder: 'HCl' }],
    ['fuming H2SO4', { strength: 'fuming', remainder: 'H2SO4' }],
    ['glacial CH3COOH', { strength: 'glacial', remainder: 'CH3COOH' }],
    ['sat. NaCl', { strength: 'saturated', remainder: 'NaCl' }],
    ['saturated NaHCO3', { strength: 'saturated', remainder: 'NaHCO3' }],
    // dry / anhydrous
    ['dry ether', { dry: true, remainder: 'ether' }],
    ['anhydrous AlCl3', { dry: true, remainder: 'AlCl3' }],
    ['Anhydrous ZnCl2', { dry: true, remainder: 'ZnCl2' }],
    // quantity qualifier
    ['NH3 (excess)', { quantityQualifier: 'excess', remainder: 'NH3' }],
    ['excess Cl2', { quantityQualifier: 'excess', remainder: 'Cl2' }],
    ['HBr (excess)', { quantityQualifier: 'excess', remainder: 'HBr' }],
    ['H2SO4 (cat.)', { quantityQualifier: 'catalytic', remainder: 'H2SO4' }],
    ['catalytic HCl', { quantityQualifier: 'catalytic', remainder: 'HCl' }],
    // several tokens in one label
    ['conc. aq. NaOH', { strength: 'concentrated', phase: 'aq', remainder: 'NaOH' }],
    ['dry HCl (excess)', { dry: true, quantityQualifier: 'excess', remainder: 'HCl' }],
    ['NaOH (aq.) (excess)', { phase: 'aq', quantityQualifier: 'excess', remainder: 'NaOH' }],
    // the same value twice is not a conflict
    ['aq. NaOH (aq.)', { phase: 'aq', remainder: 'NaOH' }],
    // nothing to take out
    ['H2 / Lindlar catalyst', { remainder: 'H2 / Lindlar catalyst' }],
    ['Zn/H2O', { remainder: 'Zn/H2O' }],
    ['X (placeholder)', { remainder: 'X (placeholder)' }],
    ['', { remainder: '' }],
  ] as const)('%j', (label, expected) => {
    const parsed = parseLabel(label);
    expect(parsed.kind).toBe('participant');
    expect(parsed).toMatchObject(expected);
    for (const field of ['phase', 'strength', 'dry', 'quantityQualifier'] as const) {
      if (!(field in expected)) expect(parsed[field]).toBeUndefined();
    }
    expect(parsed.parsedFields).toEqual([]);
    expectTiling(label, parsed);
  });

  it('every token has its own source span', () => {
    const label = 'conc. aq. NaOH (excess)';
    const parsed = parseLabel(label);
    expect(parsed.tokens.map((t) => [t.field, t.value, t.text])).toEqual([
      ['strength', 'concentrated', 'conc.'],
      ['phase', 'aq', 'aq.'],
      ['quantity', 'excess', '(excess)'],
    ]);
    for (const token of parsed.tokens) expect(label.slice(token.start, token.end)).toBe(token.text);
  });
});

describe('a whole label that is a temperature or light is a stage parameter, not a participant', () => {
  it.each([
    ['443 K', { kind: 'value', value: 443, unit: 'K' }],
    ['140°C', { kind: 'value', value: 140, unit: 'C' }],
    ['140 °C', { kind: 'value', value: 140, unit: 'C' }],
    ['25 ° C', { kind: 'value', value: 25, unit: 'C' }],
    ['-78 °C', { kind: 'value', value: -78, unit: 'C' }],
    ['37.5°C', { kind: 'value', value: 37.5, unit: 'C' }],
    ['0-5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0–5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['0 °C - 5 °C', { kind: 'range', min: 0, max: 5, unit: 'C' }],
    ['273-278 K', { kind: 'range', min: 273, max: 278, unit: 'K' }],
    ['  443 K  ', { kind: 'value', value: 443, unit: 'K' }],
  ] as const)('temperature %j', (label, temperature) => {
    const parsed = parseLabel(label);
    expect(parsed.kind).toBe('stage_parameter');
    expect(parsed.remainder).toBe('');
    expect(parsed.stageParameters).toEqual({ temperature });
    expect(parsed.parsedFields).toEqual(['temperature']);
    expect(parsed.review).toEqual([]);
    expectTiling(label, parsed);
  });

  it.each([
    ['hv', 'hv'],
    ['hν', 'hv'],
    ['light', 'hv'],
    ['UV', 'uv'],
    ['Hv', 'hv'],
    ['LIGHT', 'hv'],
    ['uv', 'uv'],
    [' hv ', 'hv'],
  ] as const)('light %j', (label, light) => {
    const parsed = parseLabel(label);
    expect(parsed.kind).toBe('stage_parameter');
    expect(parsed.stageParameters).toEqual({ light });
    expect(parsed.parsedFields).toEqual(['light']);
    expectTiling(label, parsed);
  });
});

describe('ambiguity is reported, never guessed', () => {
  it.each([
    ['100 °F', 'unsupported_unit'],
    ['5-0 °C', 'descending_range'],
    ['-300 °C', 'out_of_range'],
    ['0 °C - 278 K', 'mixed_units'],
    ['25°', 'missing_unit_letter'],
  ])('%j is clearly a temperature but not storable: kept whole in other[]', (label, reason) => {
    const parsed = parseLabel(label);
    expect(parsed.kind).toBe('stage_parameter');
    expect(parsed.parsedFields).toEqual([]);
    expect(parsed.stageParameters?.temperature).toBeUndefined();
    expect(parsed.stageParameters?.other).toEqual([`temperature: ${label.trim()}`]);
    expect(parsed.review.map((r) => r.code)).toEqual(['QUANTITY_NOT_DECIDED']);
    expect(parsed.review[0]?.message).toContain(reason);
    expectTiling(label, parsed);
  });

  it('disagreeing tokens on one field: none taken out', () => {
    for (const label of ['aq. alc. KOH', 'conc. dil. HCl', 'excess NaOH (cat.)']) {
      const parsed = parseLabel(label);
      expect(parsed.remainder).toBe(label);
      expect(parsed.tokens).toEqual([]);
      expect(parsed.review.map((r) => r.code)).toEqual(['CONFLICTING_TOKENS']);
      expectTiling(label, parsed);
    }
  });

  it('a conflict on one field leaves the other fields alone', () => {
    const parsed = parseLabel('aq. alc. dry KOH');
    expect(parsed.dry).toBe(true);
    expect(parsed.phase).toBeUndefined();
    expect(parsed.remainder).toBe('aq. alc. KOH');
  });

  it('non-aqueous / non aqueous is not "aqueous"', () => {
    for (const label of ['non-aqueous solvent', 'Non aqueous solvent', 'nonaqueous solvent']) {
      const parsed = parseLabel(label);
      expect(parsed.phase).toBeUndefined();
      expect(parsed.remainder).toBe(label);
      expectTiling(label, parsed);
    }
    expect(parseLabel('non-aqueous solvent').review.map((r) => r.code)).toEqual(['NEGATED_TOKEN']);
  });

  it('tokens are whole words: nothing is cut out of a longer word', () => {
    for (const label of ['drying agent', 'aquarium salt', 'concentric', 'dilution buffer', 'excessive', 'saturn', 'catalyst', 'alcohol', 'glacialx', 'dryer']) {
      const parsed = parseLabel(label);
      expect(parsed.tokens).toEqual([]);
      expect(parsed.remainder).toBe(label);
    }
  });

  it('a temperature inside a longer label is not split off', () => {
    const parsed = parseLabel('H2SO4, 443 K');
    expect(parsed.kind).toBe('participant');
    expect(parsed.remainder).toBe('H2SO4, 443 K');
    expect(parsed.review.map((r) => r.code)).toEqual(['REMAINDER_LOOKS_LIKE_TEMPERATURE']);
  });

  it('a label of tokens only is reported (no substance name)', () => {
    const parsed = parseLabel('aqueous');
    expect(parsed).toMatchObject({ phase: 'aq', remainder: '' });
    expect(parsed.review.map((r) => r.code)).toEqual(['EMPTY_REMAINDER']);
    expect(parsed.originalText).toBe('aqueous');
  });

  it.each(['UV light', 'hv, UV light', 'reflux', 'heat', 'room temperature', 'rt', 'Δ'])('%j reads like a condition but is not a §4.6 whole-label match', (label) => {
    const parsed = parseLabel(label);
    expect(parsed.kind).toBe('participant');
    expect(parsed.remainder).toBe(label);
    expect(parsed.review.map((r) => r.code)).toContain('LABEL_LOOKS_LIKE_STAGE_PARAMETER');
  });
});

describe('the labels of both legacy fixtures', () => {
  // After the step 3.8 port: every participant label of v4-sample and v6-demo-export (see the fixture test in no-char-lost.test.ts).
  it.each([
    ['PCC', 'PCC'],
    ['CH2Cl2', 'CH2Cl2'],
    ['KMnO4', 'KMnO4'],
    ['H+', 'H+'],
    ['O2', 'O2'],
    ['conc. H2SO4', 'H2SO4'],
    ['O3', 'O3'],
    ['Zn/H2O', 'Zn/H2O'],
    ['B2H6', 'B2H6'],
    ['H2O2', 'H2O2'],
    ['NaOH', 'NaOH'],
    ['Unknown thing', 'Unknown thing'],
    ['HBr', 'HBr'],
    ['aq. KOH', 'KOH'],
    ['NaBH4', 'NaBH4'],
    ['EtOH', 'EtOH'],
    ['alc. KOH', 'KOH'],
    ['H2 / Lindlar catalyst', 'H2 / Lindlar catalyst'],
    ['Cl2', 'Cl2'],
    ['PBr3', 'PBr3'],
    ['H2O', 'H2O'],
    ['dil. H2SO4', 'H2SO4'],
    ['NH3 (excess)', 'NH3'],
    ['NaOH (aq.)', 'NaOH'],
    ['HBr (excess)', 'HBr'],
    ['CH3MgBr', 'CH3MgBr'],
    ['dry ether', 'ether'],
    ['H3O+', 'H3O+'],
    ['propene', 'propene'],
    ['AlCl3', 'AlCl3'],
    ['NH2OH', 'NH2OH'],
    ['HCN', 'HCN'],
    ['Br2', 'Br2'],
    ['FeBr3', 'FeBr3'],
    ['X (placeholder)', 'X (placeholder)'],
  ])('%j -> remainder %j', (label, remainder) => {
    const parsed = parseLabel(label);
    expect(parsed.remainder).toBe(remainder);
    expect(parsed.kind).toBe('participant');
  });

  it('"aq. KOH" and "alc. KOH" resolve to one remainder with different phases', () => {
    const [a, b] = [parseLabel('aq. KOH'), parseLabel('alc. KOH')];
    expect(a.remainder).toBe(b.remainder);
    expect([a.phase, b.phase]).toEqual(['aq', 'alc']);
  });

  it('the v4 case: "443 K" (which v6 stored as a reagent label) is moved to the stage temperature', () => {
    const parsed = parseLabel('443 K');
    expect(parsed.kind).toBe('stage_parameter');
    expect(parsed.stageParameters?.temperature).toEqual({ kind: 'value', value: 443, unit: 'K' });
  });
});
