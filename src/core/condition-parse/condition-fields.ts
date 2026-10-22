/**
 * Legacy condition-field parsers (docs/MIGRATION.md §4.5): the free-text values v6 keeps in `conditions.temperature`, `pressure`,
 * `medium`, `phase`, `strength` and `atmosphere` become the schema's stage-parameter shapes when - and only when - the reading is
 * unambiguous. Anything else stays as text in `other[]` and is reported; nothing is guessed, converted or dropped.
 *
 * Numbers with units (temperature, pressure) are found by the scanner in quantity.ts: single values and ranges, K and °C, hyphen
 * and en-dash. Words (`medium`, `phase`, `strength`, `atmosphere`, qualitative temperature and pressure) are looked up in small
 * explicit tables, case-insensitively, for the WHOLE value. The stage parameters have no strength field (strength belongs to a
 * participant, and which one is not decidable here), so a recognised strength is stored in `other[]` as `strength: dilute`.
 *
 * Every parser returns `segments` that tile the value exactly (see parse-spans.ts): each character is in a parsed span or in the
 * remainder, and the remainder is what `other` carries. Total: never throws, whatever the string.
 */
import type { ConditionParameters, Temperature } from '../schema';
import { remainderText, tile, toOtherEntries, type Parsed, type ParseReview, type Segment } from './parse-spans';
import { scanPressures, scanTemperatures, toTemperature, type PressureUnit } from './quantity';

export type ConditionField = 'temperature' | 'pressure' | 'medium' | 'phase' | 'strength' | 'atmosphere';
type Pressure = NonNullable<ConditionParameters['pressure']>;
type Medium = NonNullable<ConditionParameters['medium']>;
type Atmosphere = NonNullable<ConditionParameters['atmosphere']>;
type SolventCharacter = ConditionParameters['solventCharacter'][number];
type QualitativeTemperature = Extract<Temperature, { kind: 'qualitative' }>['value'];
type QualitativePressure = Extract<Pressure, { kind: 'qualitative' }>['value'];

export interface FieldParse {
  readonly field: ConditionField;
  /** The legacy value exactly as given. */
  readonly value: string;
  readonly temperature?: Temperature;
  readonly pressure?: Pressure;
  readonly medium?: Medium;
  readonly solventCharacter?: SolventCharacter;
  readonly atmosphere?: Atmosphere;
  /** Recognised strength (kept in `other` too, see the file comment). */
  readonly strength?: string;
  /** Schema-valid `other[]` entries for what was not turned into a field. */
  readonly other: readonly string[];
  /** Tiles `value` exactly. */
  readonly segments: readonly Segment[];
  readonly review: readonly ParseReview[];
}

const words = (entries: Readonly<Record<string, readonly string[]>>): ReadonlyMap<string, string> =>
  new Map(Object.entries(entries).flatMap(([meaning, spellings]) => spellings.map((spelling) => [spelling, meaning] as const)));

const TEMPERATURE_WORDS = words({
  room_temperature: ['room temperature', 'room temp', 'rt', 'r.t'],
  reflux: ['reflux', 'under reflux'],
  heat: ['heat', 'heated', 'heating', 'hot', 'high temperature', 'high temp', 'δ'],
  strong_heat: ['strong heat', 'strong heating', 'strongly heated', 'red heat'],
  warm: ['warm', 'warmed'],
  cold: ['cold', 'ice cold', 'ice-cold', 'cool', 'cooled'],
  low_temperature: ['low temperature', 'low temp'],
});
const PRESSURE_WORDS = words({
  reduced: ['reduced pressure', 'low pressure'],
  atmospheric: ['atmospheric pressure', 'atmospheric', 'ambient pressure'],
  high: ['high pressure'],
});
const MEDIUM_WORDS = words({
  acidic: ['acidic', 'acid', 'acidic medium', 'acid medium', 'acidic solution'],
  basic: ['basic', 'base', 'alkaline', 'basic medium', 'alkaline medium', 'basic solution', 'alkaline solution'],
  neutral: ['neutral', 'neutral medium', 'neutral solution'],
  buffered: ['buffered', 'buffer', 'buffered medium', 'buffered solution'],
});
const PHASE_WORDS = words({
  aqueous: ['aqueous', 'aq', 'aqueous solution', 'aqueous medium'],
  alcoholic: ['alcoholic', 'alc', 'alcoholic solution', 'alcoholic medium'],
});
const STRENGTH_WORDS = words({
  dilute: ['dilute', 'dil', 'dilute solution'],
  concentrated: ['concentrated', 'conc', 'concentrated solution'],
  fuming: ['fuming'],
  glacial: ['glacial'],
  saturated: ['saturated', 'sat', 'saturated solution'],
});
const ATMOSPHERE_PATTERN = /^(?:under\s+(?:an?\s+)?)?(nitrogen|n2|argon|ar|oxygen|o2|hydrogen|h2|air|inert)(?:\s+(?:atmosphere|gas))?$/;
const ATMOSPHERE_NAMES: Readonly<Record<string, Atmosphere>> = { nitrogen: 'nitrogen', n2: 'nitrogen', argon: 'argon', ar: 'argon', oxygen: 'oxygen', o2: 'oxygen', hydrogen: 'hydrogen', h2: 'hydrogen', air: 'air', inert: 'inert' }; // hardcode-ok: spellings of the schema's ATMOSPHERES vocabulary (the words also name species in the demo dataset); a table of the legacy format, nothing branches on a record

/** Lower case, whitespace runs collapsed, one trailing dot removed: the key the word tables are looked up with. */
const wordKey = (trimmed: string): string => trimmed.toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');

function undecided(field: ConditionField, value: string, code: 'UNPARSED_FIELD_VALUE' | 'QUANTITY_NOT_DECIDED', why: string): FieldParse {
  const other = toOtherEntries(field, value);
  const review: ParseReview[] = [{ code, message: `conditions.${field} "${value.trim()}" ${why}; kept in other[]`, field }];
  if (other.escaped) review.push({ code: 'CONTROL_CHARACTERS_ESCAPED', message: 'control characters were written as \\u{hex} in other[]', field });
  return { field, value, other: other.entries, segments: tile(value, []), review };
}

/** A value that is entirely one word from a table: the trimmed text is the parsed span, edge whitespace is remainder. */
function wholeWord(field: ConditionField, value: string, meaning: Partial<FieldParse>, alsoOther: readonly string[] = []): FieldParse {
  const lead = value.length - value.trimStart().length;
  const parsed: Parsed = { start: lead, end: lead + value.trim().length, field };
  return { field, value, ...meaning, other: alsoOther, segments: tile(value, [parsed]), review: [] };
}

interface Numeric<Value> {
  readonly hits: readonly { readonly start: number; readonly end: number; readonly value: Value }[];
  readonly problemCount: number;
}

/** Shared by temperature and pressure: one unambiguous quantity plus words is accepted; several, or any doubt, is not. */
function quantityField<Value>(
  field: 'temperature' | 'pressure',
  value: string,
  numeric: Numeric<Value>,
  qualitative: (key: string) => Partial<FieldParse> | undefined,
  build: (hit: Value) => Partial<FieldParse>,
): FieldParse {
  const trimmed = value.trim();
  if (trimmed === '') return { field, value, other: [], segments: tile(value, []), review: [] };
  if (numeric.hits.length === 0 && numeric.problemCount === 0) {
    const meaning = qualitative(wordKey(trimmed));
    return meaning === undefined ? undecided(field, value, 'UNPARSED_FIELD_VALUE', 'has no number with a supported unit') : wholeWord(field, value, meaning);
  }
  if (numeric.problemCount > 0 || numeric.hits.length > 1) {
    return undecided(field, value, 'QUANTITY_NOT_DECIDED', numeric.hits.length > 1 ? 'holds more than one value' : 'holds a value that cannot be stored (unit or range not decidable)');
  }
  const hit = numeric.hits[0] as Numeric<Value>['hits'][number];
  const segments = tile(value, [{ start: hit.start, end: hit.end, field }]);
  const leftover = remainderText(segments);
  if (/\d/.test(leftover)) return undecided(field, value, 'QUANTITY_NOT_DECIDED', 'has further numbers around the value');
  const other = toOtherEntries(field, leftover);
  const review: ParseReview[] = [];
  if (leftover !== '') review.push({ code: 'PARTIAL_FIELD_PARSE', message: `conditions.${field} "${trimmed}": the value was read, the rest ("${leftover}") is kept in other[]`, field });
  if (other.escaped) review.push({ code: 'CONTROL_CHARACTERS_ESCAPED', message: 'control characters were written as \\u{hex} in other[]', field });
  return { field, value, ...build(hit.value), other: other.entries, segments, review };
}

function temperatureField(value: string): FieldParse {
  const scan = scanTemperatures(value, { bareCelsius: true });
  return quantityField(
    'temperature',
    value,
    { hits: scan.hits, problemCount: scan.problems.length },
    (key) => {
      const word = TEMPERATURE_WORDS.get(key);
      return word === undefined ? undefined : { temperature: { kind: 'qualitative', value: word as QualitativeTemperature } };
    },
    (hit) => ({ temperature: toTemperature(hit) }),
  );
}

function pressureField(value: string): FieldParse {
  const scan = scanPressures(value);
  return quantityField(
    'pressure',
    value,
    { hits: scan.hits, problemCount: scan.problems.length },
    (key) => {
      const word = PRESSURE_WORDS.get(key);
      return word === undefined ? undefined : { pressure: { kind: 'qualitative', value: word as QualitativePressure } };
    },
    (hit): Partial<FieldParse> => ({ pressure: hit.kind === 'value' ? { kind: 'value', value: hit.value, unit: hit.unit as PressureUnit } : { kind: 'range', min: hit.min, max: hit.max, unit: hit.unit as PressureUnit } }),
  );
}

function vocabularyField(field: 'medium' | 'phase' | 'strength' | 'atmosphere', value: string): FieldParse {
  const trimmed = value.trim();
  if (trimmed === '') return { field, value, other: [], segments: tile(value, []), review: [] };
  const key = wordKey(trimmed);
  if (field === 'medium') {
    const medium = MEDIUM_WORDS.get(key);
    if (medium !== undefined) return wholeWord(field, value, { medium: medium as Medium });
  } else if (field === 'phase') {
    const solventCharacter = PHASE_WORDS.get(key);
    if (solventCharacter !== undefined) return wholeWord(field, value, { solventCharacter: solventCharacter as SolventCharacter });
  } else if (field === 'strength') {
    const strength = STRENGTH_WORDS.get(key);
    if (strength !== undefined) return wholeWord(field, value, { strength }, toOtherEntries('strength', strength).entries);
  } else {
    const found = ATMOSPHERE_PATTERN.exec(key);
    if (found !== null) return wholeWord(field, value, { atmosphere: ATMOSPHERE_NAMES[found[1] as string] });
  }
  return undecided(field, value, 'UNPARSED_FIELD_VALUE', 'is not one of the recognised spellings');
}

/** Parses the text of one legacy condition field. Total: never throws. */
export function parseConditionField(field: ConditionField, value: string): FieldParse {
  if (field === 'temperature') return temperatureField(value);
  if (field === 'pressure') return pressureField(value);
  return vocabularyField(field, value);
}
