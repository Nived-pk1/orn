/** The species properties' recipes and words (step 6.6a, decision C4 as decided in the Part 1 review): the schema's own fields; the unit is written in the value. */
import { describe, expect, it } from 'vitest';
import { PROPERTY_KEYS } from '@/core/schema';
import { addProperty, movePropertyBy, PROPERTY_HINTS, PROPERTY_KEY_WORDS, propertiesOf, propertyLine, removeProperty, setPropertyKey, setPropertyText } from './properties-model';

const run = (draft: Record<string, unknown>, ...recipes: ((d: Record<string, unknown>) => void)[]) => {
  const copy = structuredClone(draft);
  for (const recipe of recipes) recipe(copy);
  return copy;
};

describe('properties model', () => {
  it('has words and a hint for every key the schema lists', () => {
    expect(Object.keys(PROPERTY_KEY_WORDS).sort()).toEqual([...PROPERTY_KEYS].sort());
    for (const key of PROPERTY_KEYS) expect(PROPERTY_HINTS[key].length).toBeGreaterThan(0);
    expect(PROPERTY_HINTS.boiling_point).toBe('e.g. 78 °C (at 1 atm)');
    expect(PROPERTY_HINTS.melting_point).toBe('e.g. 78 °C (at 1 atm)');
    expect(PROPERTY_HINTS.density).toBe('e.g. 0.789 g/cm³ (at 20 °C)');
    expect(PROPERTY_HINTS.dipole_moment).toBe('e.g. 1.69 D');
  });
  it('a new property has NO key (absent until chosen), an empty value and no citations', () => {
    expect(run({ properties: [] }, addProperty()).properties).toEqual([{ value: '', citations: [] }]);
  });
  it('the key is set from the schema list; the value is stored as typed (the unit is part of the text); label and note are absent when empty', () => {
    const d = run({ properties: [{ value: '', citations: [] }] }, setPropertyKey(0, 'boiling_point'), setPropertyText(0, 'value', '78.4 °C (at 1 atm)'), setPropertyText(0, 'note', 'lit.'));
    expect(d.properties).toEqual([{ key: 'boiling_point', value: '78.4 °C (at 1 atm)', note: 'lit.', citations: [] }]);
    expect(run(d, setPropertyText(0, 'note', '')).properties).toEqual([{ key: 'boiling_point', value: '78.4 °C (at 1 atm)', citations: [] }]);
    expect((run(d, setPropertyText(0, 'value', '')).properties as { value: string }[])[0]?.value).toBe('');
  });
  it('changing away from "other" keeps the label (nothing is dropped silently)', () => {
    const d = run({ properties: [{ key: 'other', label: 'Refractive index', value: '1.36', citations: [] }] }, setPropertyKey(0, 'colour'));
    expect(d.properties).toEqual([{ key: 'colour', label: 'Refractive index', value: '1.36', citations: [] }]);
  });
  it('moves and removes', () => {
    const base = { properties: [{ key: 'colour', value: 'a', citations: [] }, { key: 'odour', value: 'b', citations: [] }] };
    expect((run(base, movePropertyBy(1, -1)).properties as { value: string }[]).map((p) => p.value)).toEqual(['b', 'a']);
    expect((run(base, removeProperty(0)).properties as { value: string }[]).map((p) => p.value)).toEqual(['b']);
  });
  it('the summary line is "<property> · <value>"; "other" uses its label; an unchosen key says so', () => {
    expect(propertyLine({ key: 'boiling_point', label: '', value: '78 °C', note: '', citations: 0 })).toBe('boiling point · 78 °C');
    expect(propertyLine({ key: 'other', label: 'Refractive index', value: '1.36', note: '', citations: 0 })).toBe('Refractive index · 1.36');
    expect(propertyLine({ key: '', label: '', value: '', note: '', citations: 0 })).toBe('Property not chosen');
    expect(propertiesOf({ properties: [{ key: 'colour', value: 'red', citations: [{ referenceId: 'r' }] }] })).toEqual([{ key: 'colour', label: '', value: 'red', note: '', citations: 1 }]);
  });
});
