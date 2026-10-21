/**
 * The conditions of a stage (or of a condition variant, or of a reagent profile) as recipes over the draft, and their view (step 6.4a decisions D1, D2 and D4).
 * A stage's or variant's `parameters` is the schema's ConditionParameters: temperature, pressure and time are a value, a range (not time) or a
 * word; the rest are single choices, lists of choices, a yes / no, the `other` qualifiers and the free `text`. Values are stored exactly as
 * entered (no unit conversion, no rounding); "Not stated" is the field absent (an empty list for the list fields). A new field starts empty:
 * choosing a kind stores only the kind (the missing number, unit or word is then a finding, never a guess).
 * A field named in `parsedFields` was read from text and is unconfirmed (RXN-015): every edit of a field, and Confirm, remove it from the list.
 * The summary line is the ARROW'S own builder (`conditionPartsOf`) over the fields that already satisfy the schema; no chemistry here.
 */
import { conditionPartsOf } from '@/core/graph';
import type { DraftRecipe } from '@/core/editing';
import { ConditionParametersSchema, DurationSchema, PARAMETER_FIELDS, PressureSchema, TemperatureSchema, type ConditionParameters } from '@/core/schema';

export type ParameterField = (typeof PARAMETER_FIELDS)[number];
export type MeasureField = 'temperature' | 'pressure' | 'time';
export type ChoiceField = 'medium' | 'light' | 'atmosphere';
export type ListField = 'solventCharacter' | 'activation';
export type MeasureKind = 'value' | 'range' | 'qualitative';

/** Where a set of parameters lives: the stage or the condition variant at this index. */
export interface ParamsLoc {
  readonly of: 'stage' | 'variant' | 'profile';
  readonly index: number;
}
export const stageLoc = (index: number): ParamsLoc => ({ of: 'stage', index });
export const variantLoc = (index: number): ParamsLoc => ({ of: 'variant', index });
/** A reagent profile's conditions (step 6.6a, decision C5): the same form, the draft's `profiles[index].parameters`. */
export const profileLoc = (index: number): ParamsLoc => ({ of: 'profile', index });
const ROWS: Readonly<Record<ParamsLoc['of'], string>> = { stage: 'stages', variant: 'conditionVariants', profile: 'profiles' };
/** The draft path of the parameters ("stages[0].parameters"). */
export const paramsPath = (loc: ParamsLoc): string => `${ROWS[loc.of]}[${loc.index}].parameters`;

type Fields = Record<string, unknown>;
const isBag = (value: unknown): value is Fields => typeof value === 'object' && value !== null && !Array.isArray(value);
const listOf = (bag: Fields, field: string): unknown[] => {
  if (!Array.isArray(bag[field])) bag[field] = [];
  return bag[field] as unknown[];
};

/** The parameters bag of the stage / variant, with the schema's required lists present; undefined when there is no such row. */
function paramsAt(draft: unknown, loc: ParamsLoc): Fields | undefined {
  if (!isBag(draft)) return undefined;
  const rows = draft[ROWS[loc.of]];
  const row = Array.isArray(rows) ? rows[loc.index] : undefined;
  if (!isBag(row)) return undefined;
  if (!isBag(row.parameters)) row.parameters = {};
  const bag = row.parameters as Fields;
  for (const list of ['solventCharacter', 'activation', 'other', 'parsedFields']) listOf(bag, list);
  return bag;
}

/** A recipe over the parameters of one row; `field` is the field it edits (it is confirmed: removed from `parsedFields`). */
const edit = (loc: ParamsLoc, field: ParameterField | undefined, change: (bag: Fields) => void): DraftRecipe => (draft) => {
  const bag = paramsAt(draft, loc);
  if (bag === undefined) return;
  change(bag);
  if (field !== undefined) bag.parsedFields = listOf(bag, 'parsedFields').filter((one) => one !== field);
};

const measureOf = (bag: Fields, field: MeasureField): Fields | undefined => (isBag(bag[field]) ? (bag[field] as Fields) : undefined);

/** "Not stated" (kind '') removes the field; a kind keeps the unit when switching between a value and a range, and stores nothing else. */
export const setMeasureKind = (loc: ParamsLoc, field: MeasureField, kind: MeasureKind | ''): DraftRecipe =>
  edit(loc, field, (bag) => {
    if (kind === '') {
      Reflect.deleteProperty(bag, field);
      return;
    }
    const unit = measureOf(bag, field)?.unit;
    bag[field] = kind === 'qualitative' || unit === undefined ? { kind } : { kind, unit };
  });

/** One number of the value or range; undefined (an empty box) removes it. */
export const setMeasureNumber = (loc: ParamsLoc, field: MeasureField, key: 'value' | 'min' | 'max', value: number | undefined): DraftRecipe =>
  edit(loc, field, (bag) => {
    const measure = measureOf(bag, field);
    if (measure === undefined) return;
    if (value === undefined) Reflect.deleteProperty(measure, key);
    else measure[key] = value;
  });

/** The unit (value and range) or the word (qualitative) of the measure; '' removes it. */
export const setMeasureChoice = (loc: ParamsLoc, field: MeasureField, key: 'unit' | 'value', value: string): DraftRecipe =>
  edit(loc, field, (bag) => {
    const measure = measureOf(bag, field);
    if (measure === undefined) return;
    if (value === '') Reflect.deleteProperty(measure, key);
    else measure[key] = value;
  });

export const setChoice = (loc: ParamsLoc, field: ChoiceField, value: string): DraftRecipe =>
  edit(loc, field, (bag) => {
    if (value === '') Reflect.deleteProperty(bag, field);
    else bag[field] = value;
  });

/** '' is "Not stated"; 'yes' and 'no' store true and false (false is a stated value). */
export const setAnhydrous = (loc: ParamsLoc, value: '' | 'yes' | 'no'): DraftRecipe =>
  edit(loc, 'anhydrous', (bag) => {
    if (value === '') Reflect.deleteProperty(bag, 'anhydrous');
    else bag.anhydrous = value === 'yes';
  });

/** Ticks or unticks one word of a list field; a word already there is not added twice. */
export const setListMember = (loc: ParamsLoc, field: ListField, word: string, on: boolean): DraftRecipe =>
  edit(loc, field, (bag) => {
    const list = listOf(bag, field);
    const has = list.includes(word);
    if (on && !has) list.push(word);
    if (!on && has) bag[field] = list.filter((one) => one !== word);
  });

export const setConditionText = (loc: ParamsLoc, value: string): DraftRecipe =>
  edit(loc, undefined, (bag) => {
    if (value === '') Reflect.deleteProperty(bag, 'text');
    else bag.text = value;
  });

export const addQualifier = (loc: ParamsLoc): DraftRecipe => edit(loc, undefined, (bag) => void listOf(bag, 'other').push(''));
export const setQualifier = (loc: ParamsLoc, index: number, value: string): DraftRecipe =>
  edit(loc, undefined, (bag) => {
    const list = listOf(bag, 'other');
    if (index >= 0 && index < list.length) list[index] = value;
  });
export const removeQualifier = (loc: ParamsLoc, index: number): DraftRecipe => edit(loc, undefined, (bag) => void listOf(bag, 'other').splice(index, 1));
export const moveQualifier = (loc: ParamsLoc, index: number, by: -1 | 1): DraftRecipe =>
  edit(loc, undefined, (bag) => {
    const list = listOf(bag, 'other');
    const to = index + by;
    if (index < 0 || index >= list.length || to < 0 || to >= list.length) return;
    const moved = list[index];
    list[index] = list[to];
    list[to] = moved;
  });

/** Confirms a field read from text: it leaves `parsedFields`, the value stays (one undoable edit). */
export const confirmField = (loc: ParamsLoc, field: ParameterField): DraftRecipe => edit(loc, field, () => undefined);

/** Takes the field out (a variant's override, "Remove"): absent, or an empty list; it is confirmed away too. */
export const clearField = (loc: ParamsLoc, field: ParameterField | 'other' | 'text'): DraftRecipe =>
  edit(loc, field === 'other' || field === 'text' ? undefined : field, (bag) => {
    if (field === 'solventCharacter' || field === 'activation' || field === 'other') bag[field] = [];
    else Reflect.deleteProperty(bag, field);
  });

/** The parameters of a stage / variant as the draft has them now (a bag; empty when the row or its parameters are missing). Read only. */
export function parametersOf(draft: unknown, loc: ParamsLoc): Readonly<Fields> {
  const rows = isBag(draft) ? draft[ROWS[loc.of]] : undefined;
  const row = Array.isArray(rows) ? rows[loc.index] : undefined;
  return isBag(row) && isBag(row.parameters) ? row.parameters : {};
}

export const parsedFieldsOf = (params: Readonly<Fields>): readonly ParameterField[] =>
  Array.isArray(params.parsedFields) ? params.parsedFields.filter((one): one is ParameterField => (PARAMETER_FIELDS as readonly unknown[]).includes(one)) : [];

/** Whether the field has a value now (a list field: at least one member; anhydrous: yes or no). */
export function hasField(params: Readonly<Fields>, field: ParameterField | 'other' | 'text'): boolean {
  const value = params[field];
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

/**
 * The parameters as far as they already satisfy the schema: a field that is half typed (a value with no unit, a range with no maximum) is left out,
 * so the arrow's builder is never given what it cannot word. A field that fails is a finding in the form, not an error here.
 */
export function validParametersOf(params: Readonly<Fields>): ConditionParameters {
  const pick = <T,>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, field: string): { [k: string]: T } => {
    const parsed = params[field] === undefined ? undefined : schema.safeParse(params[field]);
    return parsed?.success === true ? { [field]: parsed.data } : {};
  };
  const members = <T extends string>(field: string, words: readonly T[]): T[] =>
    Array.isArray(params[field]) ? (params[field] as unknown[]).filter((one): one is T => (words as readonly unknown[]).includes(one)) : [];
  const shape = ConditionParametersSchema.shape;
  const single = (field: 'medium' | 'light' | 'atmosphere'): Partial<ConditionParameters> => {
    const parsed = params[field] === undefined ? undefined : shape[field].safeParse(params[field]);
    return parsed?.success === true && parsed.data !== undefined ? { [field]: parsed.data } : {};
  };
  const anhydrous = typeof params.anhydrous === 'boolean' ? { anhydrous: params.anhydrous } : {};
  const text = typeof params.text === 'string' && params.text !== '' ? { text: params.text } : {};
  return {
    ...pick(TemperatureSchema, 'temperature'),
    ...pick(PressureSchema, 'pressure'),
    ...pick(DurationSchema, 'time'),
    ...single('medium'),
    ...single('light'),
    ...single('atmosphere'),
    ...anhydrous,
    ...text,
    solventCharacter: members('solventCharacter', shape.solventCharacter.element.options),
    activation: members('activation', shape.activation.element.options),
    other: Array.isArray(params.other) ? params.other.filter((one): one is string => typeof one === 'string' && one.trim() !== '') : [],
    parsedFields: [],
  };
}

/** What a stage with nothing the arrow can write says. */
export const NO_CONDITIONS = 'No conditions on the arrow';

/** The one summary line of a stage: the arrow's own condition parts, joined by " · ". */
export function summaryOf(params: Readonly<Fields>): string {
  const parts = conditionPartsOf(validParametersOf(params)).map((part) => part.text);
  return parts.length === 0 ? NO_CONDITIONS : parts.join(' · ');
}
