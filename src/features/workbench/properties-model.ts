/**
 * A species' properties as recipes over the draft, and their words (step 6.6a, decision C4 as decided in the Part 1 review; NO schema
 * change). A property is edited as the schema types it: `key` (no default: absent until chosen), `label` (required, and shown, only for
 * `other`: SPC-007), `value` (free text: the unit is written in it), `note` (rich text) and `citations`. The hint under the value
 * shows the usual unit for the key; it is never a finding and never changes the value. No chemistry here.
 */
import type { DraftRecipe } from '@/core/editing';
import type { PROPERTY_KEYS } from '@/core/schema';

type PropertyKey = (typeof PROPERTY_KEYS)[number];

export const PROPERTY_KEY_WORDS: Readonly<Record<PropertyKey, string>> = {
  physical_state: 'Physical state',
  boiling_point: 'Boiling point',
  melting_point: 'Melting point',
  solubility: 'Solubility',
  density: 'Density',
  acidity: 'Acidity',
  basicity: 'Basicity',
  odour: 'Odour',
  colour: 'Colour',
  dipole_moment: 'Dipole moment',
  other: 'Other',
};

export const PROPERTY_HINTS: Readonly<Record<PropertyKey, string>> = {
  physical_state: 'In words: solid, liquid or gas, at room temperature.',
  boiling_point: 'e.g. 78 °C (at 1 atm)',
  melting_point: 'e.g. 78 °C (at 1 atm)',
  solubility: 'In words: for example "miscible with water" or "slightly soluble in water".',
  density: 'e.g. 0.789 g/cm³ (at 20 °C)',
  acidity: 'In words, or a pKa: for example "pKa about 16" or "weakly acidic".',
  basicity: 'In words, or a pKb: for example "weakly basic".',
  odour: 'In words: for example "sweet, fruity".',
  colour: 'In words: for example "colourless".',
  dipole_moment: 'e.g. 1.69 D',
  other: 'Write the value with its unit, and name the property above.',
};

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const listOf = (draft: Fields): unknown[] => {
  if (!Array.isArray(draft.properties)) draft.properties = [];
  return draft.properties as unknown[];
};

export interface PropertyView {
  /** '' when not chosen. */
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly note: string;
  readonly citations: number;
}

export function propertiesOf(draft: unknown): PropertyView[] {
  const list = isBag(draft) && Array.isArray(draft.properties) ? (draft.properties as unknown[]) : [];
  return list.map((item) => {
    const row = isBag(item) ? item : {};
    return { key: text(row.key), label: text(row.label), value: text(row.value), note: text(row.note), citations: Array.isArray(row.citations) ? row.citations.length : 0 };
  });
}

/** A new property has no key, an empty value (the schema asks for text) and no citations. */
export const addProperty = (): DraftRecipe => (draft) => {
  listOf(draft).push({ value: '', citations: [] });
};
export const setPropertyKey = (index: number, key: string): DraftRecipe => (draft) => {
  const item = listOf(draft)[index];
  if (!isBag(item)) return;
  if (key === '') Reflect.deleteProperty(item, 'key');
  else item.key = key;
};
/** The value is kept even when empty (it is required text); the label and the note are absent when empty. */
export const setPropertyText = (index: number, field: 'label' | 'value' | 'note', value: string): DraftRecipe => (draft) => {
  const item = listOf(draft)[index];
  if (!isBag(item)) return;
  if (value === '' && field !== 'value') Reflect.deleteProperty(item, field);
  else item[field] = value;
};
export const removeProperty = (index: number): DraftRecipe => (draft) => {
  listOf(draft).splice(index, 1);
};
export const movePropertyBy = (index: number, by: -1 | 1): DraftRecipe => (draft) => {
  const list = listOf(draft);
  const to = index + by;
  const item = list[index];
  if (item === undefined || to < 0 || to >= list.length) return;
  list.splice(index, 1);
  list.splice(to, 0, item);
};

/** The property in the same words as its choice list: "Boiling point"; the label for `other` (or "Other" with no label yet); "" when not chosen. */
const propertyTitle = (property: PropertyView): string => (property.key === 'other' ? (property.label === '' ? PROPERTY_KEY_WORDS.other : property.label) : (PROPERTY_KEY_WORDS[property.key as PropertyKey] ?? property.key));
/** The name of the property in words: the label for `other`, the key otherwise ("boiling point"), or "" when not chosen. */
export const propertyName = (property: PropertyView): string => (property.key === 'other' ? (property.label === '' ? 'other' : property.label) : property.key.replace(/_/g, ' '));
/** "<property> · <value>"; an unchosen key says so. */
export const propertyLine = (property: PropertyView): string => (property.key === '' ? 'Property not chosen' : `${propertyTitle(property)} · ${property.value}`);
