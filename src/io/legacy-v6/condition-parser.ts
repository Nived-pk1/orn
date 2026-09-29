/**
 * Legacy `conditions` object -> the schema's stage parameters (docs/MIGRATION.md §4.5). Steps: each free-text field is parsed by
 * `parseConditionField` (condition-fields.ts); the three flags v6 inferred by regex (`heat`, `light`, `anhydrous`) become
 * `temperature: qualitative heat` (only when the fields gave no temperature), `light: hv` and `anhydrous: true`; `text` is kept
 * as `parameters.text` when it is storable. Every field a parser filled is listed in `parsedFields` (RXN-015 review).
 *
 * `text` is NOT re-read: v6 already filled its flags and fields from the text once (ported in conditions.ts), and §4.5 keeps the
 * text itself. A flag is only applied when it is exactly `true`; a truthy non-boolean (`"yes"`) is reported, not guessed.
 * Values that are neither string nor number nor boolean (objects, arrays) are reported and NOT consumed: the caller carries them
 * into `provenance.legacy.unmapped`. Nothing here throws; no `other[]` entry is truncated (overflow beyond the schema's 16 is
 * returned in `overflowOther`).
 */
import { PARAMETER_FIELDS, ShortTextSchema, type ConditionParameters } from '@/core/schema';
import { parseConditionField, type ConditionField, type FieldParse } from './condition-fields';
import type { ParseReview } from './parse-spans';

/** `ConditionParametersSchema.other` holds at most this many entries (a test checks the schema still says so). */
const MAX_OTHER = 16;
/** Order the fields are read and `other[]` is filled in. */
const FIELD_ORDER = ['temperature', 'medium', 'phase', 'strength', 'pressure', 'atmosphere'] as const satisfies readonly ConditionField[];
type ParameterField = (typeof PARAMETER_FIELDS)[number];

export interface FlagTrace {
  readonly flag: 'heat' | 'light' | 'anhydrous';
  readonly outcome: 'applied' | 'subsumed_by_temperature' | 'false';
}

export interface ParsedConditions {
  /** `conditions.text` when it is a string, else the empty string (a non-string is reported in `unconsumed`). */
  readonly originalText: string;
  /** Schema-shaped and valid against `ConditionParametersSchema` (checked by the tests). */
  readonly parameters: ConditionParameters;
  /** `other[]` entries beyond the schema's cap; the caller keeps them (provenance) - never dropped. */
  readonly overflowOther: readonly string[];
  /** Per legacy field that held a value: what the parser made of it (spans tile the value). */
  readonly fields: readonly FieldParse[];
  readonly flags: readonly FlagTrace[];
  /** Legacy fields whose value is represented in `parameters` (parsed, in `other`, or `text`). */
  readonly consumed: readonly string[];
  /** Legacy fields whose value could not be represented at all (wrong type); the caller carries them in `unmapped`. */
  readonly unconsumed: readonly string[];
  readonly review: readonly ParseReview[];
}

const own = (source: object, key: string): unknown => (Object.hasOwn(source, key) ? (source as Record<string, unknown>)[key] : undefined);

function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

/** Parses one legacy v5 `conditions` object. Any value at all is accepted; nothing throws. */
export function parseLegacyConditions(conditions: unknown): ParsedConditions {
  const source: object = typeof conditions === 'object' && conditions !== null && !Array.isArray(conditions) ? conditions : {};
  const review: ParseReview[] = [];
  const consumed: string[] = [];
  const unconsumed: string[] = [];
  const unsupported = (key: string, value: unknown): void => {
    unconsumed.push(key);
    review.push({ code: 'UNSUPPORTED_VALUE_TYPE', message: `conditions.${key} is ${Array.isArray(value) ? 'an array' : typeof value} and cannot be read as a condition; carried unchanged`, field: key });
  };

  let originalText = '';
  const rawText = own(source, 'text');
  if (typeof rawText === 'string') {
    originalText = rawText;
    if (rawText !== '') consumed.push('text');
  } else if (rawText !== undefined && rawText !== null && rawText !== '') unsupported('text', rawText);

  const fields: FieldParse[] = [];
  for (const key of FIELD_ORDER) {
    const raw = own(source, key);
    const text = textOf(raw);
    if (text !== undefined) {
      const parsed = parseConditionField(key, text);
      if (text.trim() !== '') {
        fields.push(parsed);
        consumed.push(key);
        review.push(...parsed.review);
      }
    } else if (raw !== undefined && raw !== null && raw !== false && raw !== '') unsupported(key, raw);
  }

  const first = <K extends 'temperature' | 'pressure' | 'medium' | 'atmosphere'>(key: K) => fields.find((f) => f[key] !== undefined)?.[key];
  const solventCharacter = fields.flatMap((f) => (f.solventCharacter === undefined ? [] : [f.solventCharacter]));
  let temperature = first('temperature');
  let light: ConditionParameters['light'];
  let anhydrous: boolean | undefined;

  const flags: FlagTrace[] = [];
  const parsedFields = new Set<ParameterField>();
  for (const key of ['heat', 'light', 'anhydrous'] as const) {
    const raw = own(source, key);
    if (raw === true) {
      consumed.push(key);
      if (key === 'heat') {
        if (temperature === undefined) {
          temperature = { kind: 'qualitative', value: 'heat' };
          flags.push({ flag: key, outcome: 'applied' });
          parsedFields.add('temperature');
        } else {
          flags.push({ flag: key, outcome: 'subsumed_by_temperature' });
          review.push({ code: 'FLAG_SUBSUMED', message: 'conditions.heat is true and a temperature was also read; the temperature is kept, the flag adds nothing', field: key });
        }
      } else if (key === 'light') {
        light = 'hv';
        parsedFields.add('light');
        flags.push({ flag: key, outcome: 'applied' });
      } else {
        anhydrous = true;
        parsedFields.add('anhydrous');
        flags.push({ flag: key, outcome: 'applied' });
      }
    } else if (raw === false || raw === undefined || raw === null || raw === '' || raw === 0) {
      if (raw === false) consumed.push(key);
      if (raw !== undefined) flags.push({ flag: key, outcome: 'false' });
    } else {
      unconsumed.push(key);
      review.push({ code: 'NON_BOOLEAN_FLAG', message: `conditions.${key} is ${JSON.stringify(raw)}, not a boolean; not applied`, field: key });
    }
  }

  const pressure = first('pressure');
  const medium = first('medium');
  const atmosphere = first('atmosphere');
  if (first('temperature') !== undefined) parsedFields.add('temperature');
  if (pressure !== undefined) parsedFields.add('pressure');
  if (medium !== undefined) parsedFields.add('medium');
  if (solventCharacter.length > 0) parsedFields.add('solventCharacter');
  if (atmosphere !== undefined) parsedFields.add('atmosphere');

  const allOther = fields.flatMap((f) => f.other);
  const other = allOther.slice(0, MAX_OTHER);
  const overflowOther = allOther.slice(MAX_OTHER);
  if (overflowOther.length > 0) review.push({ code: 'OTHER_OVERFLOW', message: `${allOther.length} other[] entries; the schema holds ${MAX_OTHER}, the remaining ${overflowOther.length} are returned separately` });

  let text: string | undefined;
  if (originalText.trim() !== '') {
    if (ShortTextSchema.safeParse(originalText).success) text = originalText;
    else review.push({ code: 'TEXT_NOT_REPRESENTABLE', message: 'conditions.text is longer than the schema allows or holds control characters; the caller keeps the original text', field: 'text' });
  }

  const parameters: ConditionParameters = {
    ...(temperature === undefined ? {} : { temperature }),
    ...(pressure === undefined ? {} : { pressure }),
    ...(medium === undefined ? {} : { medium }),
    solventCharacter: [...new Set(solventCharacter)],
    ...(anhydrous === undefined ? {} : { anhydrous }),
    ...(light === undefined ? {} : { light }),
    ...(atmosphere === undefined ? {} : { atmosphere }),
    activation: [],
    other,
    ...(text === undefined ? {} : { text }),
    parsedFields: PARAMETER_FIELDS.filter((field) => parsedFields.has(field)),
  };
  return { originalText, parameters, overflowOther, fields, flags, consumed: [...new Set(consumed)], unconsumed: [...new Set(unconsumed)], review };
}
