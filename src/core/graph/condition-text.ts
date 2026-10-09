/**
 * Condition text for the arrow (step 5.5a part 3, item l; the 5.4b review, decision 5 in docs/PROGRESS.md). Pure: the effective
 * parameters of a stage become ordered parts, never markup. Wording, by field:
 *   temperature  value "413 K", "25 °C" (the value, a space, the unit; the schema's C is written with the degree sign); a range
 *                "0–5 °C" (en dash U+2013), or "−10 to 5 °C" when a bound is negative; a qualitative value is the schema word with
 *                spaces ("room temperature", "reflux")
 *   pressure     the same, "60–70 atm", "1 bar"; qualitative: "reduced pressure", "atmospheric pressure", "high pressure"
 *   light        "hν", "UV", "visible light", "sunlight", "diffuse light", "dark" (2026-10-09, the 5.4a follow-up b wording)
 *   medium       the schema word and " medium" ("acidic medium")
 *   time         value "2 h"; qualitative "brief" / "prolonged"
 *   activation   each schema word ("electrolysis", "ultrasound", "microwave", "radiation")
 *   atmosphere   `air` is written ("air"); `inert` is "inert atmosphere"; a gas is a FORMULA part ("N2", "Ar", "O2", "H2")
 *   anhydrous    "anhydrous" when true
 *   other        each qualifier as written
 *   text         only when the stage gave no structured part: its first line, at most `MAX_TEXT_CHARS` characters, a visible ellipsis
 * Negative numbers use U+2212. Not on the arrow: solventCharacter, parsedFields, the stage's originalText and label and kind, the
 * variant's label and note. A unit or enum word the decision does not name is the schema's word, with spaces (listed in PROGRESS).
 */
import type { ConditionParameters } from '../schema/conditions';

export interface ConditionPart {
  readonly text: string;
  readonly kind: 'condition' | 'formula';
}

/** The longest free `text` written on an arrow, in characters. */
export const MAX_TEXT_CHARS = 48;
export const MINUS = '−';
const EN_DASH = '–';
const ELLIPSIS = '…';

const words = (value: string): string => value.replace(/_/g, ' ');

/** The schema's unit word and how it is written: only Celsius differs (the degree sign). */
const UNIT_TEXT: Readonly<Record<string, string>> = { C: '°C' };
const unitText = (unit: string): string => UNIT_TEXT[unit] ?? unit;

/** Words the schema spells differently from the arrow (light, qualitative pressure, atmosphere); other words are the schema's, with spaces. */
const LIGHT_TEXT: Readonly<Record<string, string>> = { hv: 'hν', uv: 'UV', visible: 'visible light', diffuse: 'diffuse light' };
const PRESSURE_TEXT: Readonly<Record<string, string>> = { reduced: 'reduced pressure', atmospheric: 'atmospheric pressure', high: 'high pressure' };
const ATMOSPHERE_TEXT: Readonly<Record<string, string>> = { inert: 'inert atmosphere' };
const spelled = (table: Readonly<Record<string, string>>, value: string): string => table[value] ?? words(value);

/** A finite number as text: U+2212 for a minus sign, no exponent for ordinary values (the schema allows any finite number). */
export function numberText(value: number): string {
  const text = Number.isFinite(value) ? String(Math.abs(value)) : '?';
  return value < 0 ? `${MINUS}${text}` : text;
}

type Measured = { readonly kind: 'value'; readonly value: number; readonly unit: string } | { readonly kind: 'range'; readonly min: number; readonly max: number; readonly unit: string } | { readonly kind: 'qualitative'; readonly value: string };

function measuredText(measured: Measured, qualitative: Readonly<Record<string, string>> = {}): string {
  switch (measured.kind) {
    case 'value':
      return `${numberText(measured.value)} ${unitText(measured.unit)}`;
    case 'range':
      // A range with a negative bound reads badly with a dash next to a minus sign.
      return measured.min < 0 || measured.max < 0 ? `${numberText(measured.min)} to ${numberText(measured.max)} ${unitText(measured.unit)}` : `${numberText(measured.min)}${EN_DASH}${numberText(measured.max)} ${unitText(measured.unit)}`;
    case 'qualitative':
      return spelled(qualitative, measured.value);
  }
}

/** Atmospheres that are a gas: written as a formula part. */
const GAS_FORMULA: Readonly<Record<string, string>> = { nitrogen: 'N2', argon: 'Ar', oxygen: 'O2', hydrogen: 'H2' };

/** The first line of a free text, cut to `MAX_TEXT_CHARS` characters with a visible ellipsis. */
export function textLine(text: string): string {
  const first = (text.split(/\r?\n/)[0] ?? '').trim();
  const chars = [...first];
  return chars.length <= MAX_TEXT_CHARS ? first : `${chars.slice(0, MAX_TEXT_CHARS - 1).join('').trimEnd()}${ELLIPSIS}`;
}

/** The parts of one set of EFFECTIVE parameters, in the order of the decision: temperature, pressure, light, medium, time, activation, atmosphere, anhydrous, other. */
export function conditionPartsOf(parameters: ConditionParameters): ConditionPart[] {
  const parts: ConditionPart[] = [];
  const add = (text: string, kind: ConditionPart['kind'] = 'condition'): void => {
    if (text !== '') parts.push({ text, kind });
  };
  if (parameters.temperature !== undefined) add(measuredText(parameters.temperature));
  if (parameters.pressure !== undefined) add(measuredText(parameters.pressure, PRESSURE_TEXT));
  if (parameters.light !== undefined) add(spelled(LIGHT_TEXT, parameters.light));
  if (parameters.medium !== undefined) add(`${words(parameters.medium)} medium`);
  if (parameters.time !== undefined) add(measuredText(parameters.time));
  for (const activation of parameters.activation) add(words(activation));
  if (parameters.atmosphere !== undefined) {
    const gas = GAS_FORMULA[parameters.atmosphere];
    if (gas === undefined) add(spelled(ATMOSPHERE_TEXT, parameters.atmosphere));
    else add(gas, 'formula');
  }
  if (parameters.anhydrous === true) add('anhydrous');
  for (const other of parameters.other) add(other.trim());
  // The free text restates the structured fields, so it is written only when they gave nothing.
  if (parts.length === 0 && parameters.text !== undefined) add(textLine(parameters.text));
  return parts;
}

/** Fields of `override` that are present (an empty list is "not stated": the schema cannot tell it from absent) replace those of `base`. */
export function overrideParameters(base: ConditionParameters, override: ConditionParameters): ConditionParameters {
  return {
    ...base,
    ...(override.temperature === undefined ? {} : { temperature: override.temperature }),
    ...(override.pressure === undefined ? {} : { pressure: override.pressure }),
    ...(override.time === undefined ? {} : { time: override.time }),
    ...(override.medium === undefined ? {} : { medium: override.medium }),
    ...(override.anhydrous === undefined ? {} : { anhydrous: override.anhydrous }),
    ...(override.light === undefined ? {} : { light: override.light }),
    ...(override.atmosphere === undefined ? {} : { atmosphere: override.atmosphere }),
    ...(override.activation.length === 0 ? {} : { activation: override.activation }),
    ...(override.other.length === 0 ? {} : { other: override.other }),
    ...(override.text === undefined ? {} : { text: override.text }),
  };
}
