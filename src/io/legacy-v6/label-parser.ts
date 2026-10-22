/**
 * Label parser (docs/MIGRATION.md §4.6): the tokens of a legacy participant label (`aq. KOH`, `NH3 (excess)`, `dil. H2SO4`) are
 * taken out into the participant's structured fields, or - when the WHOLE label is a temperature or light - the label is a
 * stage parameter and not a participant at all. What is left is returned as `remainder` for matching against existing records
 * (matching is steps 3.10 and 3.11). `originalText` is always the untouched label.
 *
 * Case-insensitive throughout (the legacy data mixes `Dilute`, `dil.`, `UV`). A token is a whole word: `dry` is not taken out of
 * `drying agent`, `aq` not out of `aqueous` (that one is its own token), `non-aqueous` is left alone and reported. Where two
 * tokens disagree on one field (`aq. alc. KOH`) none of them is taken out, and the label is reported: never guessed. Nothing
 * throws for any string, and the returned `segments` tile the label exactly (see parse-spans.ts): no character is lost.
 */
import type { ConditionParameters, Participant, Temperature } from '@/core/schema';
import { remainderText, tile, toOtherEntries, type Parsed, type ParseReview, type Segment } from '@/core/condition-parse/parse-spans';
import { scanTemperatures, toTemperature } from '@/core/condition-parse/quantity';

type Strength = NonNullable<Participant['strength']>;
type Qualifier = NonNullable<NonNullable<Participant['quantity']>['qualifier']>;
export type LabelField = 'phase' | 'strength' | 'dry' | 'quantity';

export interface LabelToken {
  readonly field: LabelField;
  readonly value: 'aq' | 'alc' | Strength | true | Qualifier;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

interface TokenMeaning {
  readonly field: LabelField;
  readonly value: LabelToken['value'];
}

/** Every token row of MIGRATION.md §4.6 (lower case, matched case-insensitively). `(…)` around any of them is also accepted. */
const TOKENS: Readonly<Record<string, TokenMeaning>> = {
  'aq.': { field: 'phase', value: 'aq' },
  aq: { field: 'phase', value: 'aq' },
  aqueous: { field: 'phase', value: 'aq' },
  'alc.': { field: 'phase', value: 'alc' },
  alc: { field: 'phase', value: 'alc' },
  alcoholic: { field: 'phase', value: 'alc' },
  'conc.': { field: 'strength', value: 'concentrated' },
  conc: { field: 'strength', value: 'concentrated' },
  concentrated: { field: 'strength', value: 'concentrated' },
  'dil.': { field: 'strength', value: 'dilute' },
  dil: { field: 'strength', value: 'dilute' },
  dilute: { field: 'strength', value: 'dilute' },
  fuming: { field: 'strength', value: 'fuming' },
  glacial: { field: 'strength', value: 'glacial' },
  'sat.': { field: 'strength', value: 'saturated' },
  saturated: { field: 'strength', value: 'saturated' },
  dry: { field: 'dry', value: true },
  anhydrous: { field: 'dry', value: true },
  excess: { field: 'quantity', value: 'excess' },
  'cat.': { field: 'quantity', value: 'catalytic' },
  catalytic: { field: 'quantity', value: 'catalytic' },
};

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALTERNATIVES = Object.keys(TOKENS)
  .sort((a, b) => b.length - a.length)
  .map((key) => (key.endsWith('.') ? escapeRegExp(key) : `${escapeRegExp(key)}(?![A-Za-z0-9])`))
  .join('|');
const TOKEN_PATTERN = new RegExp(`(?<![A-Za-z0-9])(?:${ALTERNATIVES})|\\(\\s*(?:${ALTERNATIVES})\\s*\\)`, 'gi');
const NEGATION_BEFORE = /\bnon[-\s]*$/i;

export type LabelKind = 'participant' | 'stage_parameter';

export interface ParsedLabel {
  /** The label exactly as given: always kept. */
  readonly originalText: string;
  /** `stage_parameter`: the whole label is a temperature or light; no participant is created. */
  readonly kind: LabelKind;
  /** Text to match against existing reagents / species; empty for a stage parameter. */
  readonly remainder: string;
  readonly phase?: 'aq' | 'alc';
  readonly strength?: Strength;
  readonly dry?: true;
  readonly quantityQualifier?: Qualifier;
  /** For a stage parameter: the fields to merge into the stage's parameters (`other` only when it could not be decided). */
  readonly stageParameters?: Partial<Pick<ConditionParameters, 'temperature' | 'light' | 'other'>>;
  /** The parameter fields the parser filled (`ConditionParameters.parsedFields`). */
  readonly parsedFields: readonly ('temperature' | 'light')[];
  /** Every token taken out, with its source span. */
  readonly tokens: readonly LabelToken[];
  /** Tiles `originalText` exactly. */
  readonly segments: readonly Segment[];
  readonly review: readonly ParseReview[];
}

const WHOLE_LIGHT: ReadonlyMap<string, 'hv' | 'uv'> = new Map([
  ['hv', 'hv'],
  ['hν', 'hv'],
  ['light', 'hv'],
  ['uv', 'uv'],
]);
const LIGHT_LIKE = /^(?:uv|hv|hν)(?:[\s,].*)?$/;
const CONDITION_LIKE = /^(?:reflux|heat|heated|room temperature|room temp\.?|rt|δ|high temperature)$/;

function stageParameterLabel(
  originalText: string,
  parsed: Parsed,
  stageParameters: NonNullable<ParsedLabel['stageParameters']>,
  parsedFields: ParsedLabel['parsedFields'],
  review: readonly ParseReview[],
): ParsedLabel {
  return { originalText, kind: 'stage_parameter', remainder: '', stageParameters, parsedFields, tokens: [], segments: tile(originalText, [parsed]), review };
}

/** A whole label that is a temperature or light. `undefined` when it is neither, or looks like one only in part. */
function wholeStageParameter(label: string): ParsedLabel | undefined {
  const lead = label.length - label.trimStart().length;
  const trimmed = label.trim();
  if (trimmed === '') return undefined;
  const span = (field: string): Parsed => ({ start: lead, end: lead + trimmed.length, field });

  const light = WHOLE_LIGHT.get(trimmed.toLowerCase());
  if (light !== undefined) return stageParameterLabel(label, span('light'), { light }, ['light'], []);

  const scan = scanTemperatures(trimmed, { bareCelsius: false });
  const whole = (start: number, end: number): boolean => start === 0 && end === trimmed.length;
  const hit = scan.hits.find((candidate) => whole(candidate.start, candidate.end));
  if (hit !== undefined && scan.hits.length === 1 && scan.problems.length === 0) {
    const temperature: Temperature = toTemperature(hit.value);
    return stageParameterLabel(label, span('temperature'), { temperature }, ['temperature'], []);
  }
  const problem = scan.problems.find((candidate) => whole(candidate.start, candidate.end));
  if (problem !== undefined && scan.hits.length === 0 && scan.problems.length === 1) {
    // Clearly a temperature, but not decidable (unsupported unit, range written downwards, below absolute zero): never guessed.
    const other = toOtherEntries('temperature', trimmed);
    const review: ParseReview[] = [{ code: 'QUANTITY_NOT_DECIDED', message: `label "${trimmed}" is a temperature that cannot be stored as a value (${problem.reason}); kept in other[]`, field: 'temperature', start: lead, end: lead + trimmed.length }];
    if (other.escaped) review.push({ code: 'CONTROL_CHARACTERS_ESCAPED', message: 'control characters were written as \\u{hex} in other[]', field: 'temperature' });
    return stageParameterLabel(label, span('other'), { other: other.entries }, [], review);
  }
  return undefined;
}

/** Parses one participant label. Total: never throws, whatever the string. */
export function parseLabel(label: string): ParsedLabel {
  const whole = wholeStageParameter(label);
  if (whole !== undefined) return whole;

  const review: ParseReview[] = [];
  const found: LabelToken[] = [];
  const pattern = new RegExp(TOKEN_PATTERN.source, 'gi');
  for (let match = pattern.exec(label); match !== null; match = pattern.exec(label)) {
    const start = match.index;
    const core = match[0].replace(/^\(\s*|\s*\)$/g, '').toLowerCase();
    const meaning = TOKENS[core];
    if (meaning === undefined) continue; // unreachable: the pattern is built from the table
    if (NEGATION_BEFORE.test(label.slice(Math.max(0, start - 8), start))) {
      review.push({ code: 'NEGATED_TOKEN', message: `"${match[0]}" follows "non"; left in the label, not read as ${String(meaning.value)}`, field: meaning.field, start, end: start + match[0].length });
      continue;
    }
    found.push({ field: meaning.field, value: meaning.value, start, end: start + match[0].length, text: match[0] });
  }

  // One value per field. Disagreeing tokens are all left in the label (never guessed).
  const kept: LabelToken[] = [];
  for (const field of ['phase', 'strength', 'dry', 'quantity'] as const) {
    const ofField = found.filter((token) => token.field === field);
    if (new Set(ofField.map((token) => token.value)).size > 1) {
      const values = [...new Set(ofField.map((token) => String(token.value)))].join(' / ');
      review.push({ code: 'CONFLICTING_TOKENS', message: `label has conflicting ${field} tokens (${values}); none taken out`, field, start: ofField[0]?.start, end: ofField[ofField.length - 1]?.end });
    } else kept.push(...ofField);
  }
  kept.sort((a, b) => a.start - b.start);

  const segments = tile(label, kept.map((token) => ({ start: token.start, end: token.end, field: token.field })));
  const remainder = remainderText(segments);
  if (remainder === '' && label.trim() !== '') {
    review.push({ code: 'EMPTY_REMAINDER', message: `label "${label.trim()}" holds only tokens and no substance name` });
  }
  if (remainder !== '') {
    const leftover = scanTemperatures(remainder, { bareCelsius: false });
    if (leftover.hits.length > 0 || leftover.problems.length > 0) {
      review.push({ code: 'REMAINDER_LOOKS_LIKE_TEMPERATURE', message: `"${remainder}" contains a temperature inside a longer label; not split off (ambiguous)`, field: 'temperature' });
    }
  }
  const lowered = remainder.toLowerCase();
  if (WHOLE_LIGHT.has(lowered) || LIGHT_LIKE.test(lowered) || CONDITION_LIKE.test(lowered)) {
    review.push({ code: 'LABEL_LOOKS_LIKE_STAGE_PARAMETER', message: `"${remainder}" reads like a stage condition but is not a whole-label match of MIGRATION.md §4.6; kept as a participant label` });
  }

  const value = (field: LabelField): LabelToken['value'] | undefined => kept.find((token) => token.field === field)?.value;
  const phase = value('phase') as 'aq' | 'alc' | undefined;
  const strength = value('strength') as Strength | undefined;
  const quantityQualifier = value('quantity') as Qualifier | undefined;
  return {
    originalText: label,
    kind: 'participant',
    remainder,
    ...(phase === undefined ? {} : { phase }),
    ...(strength === undefined ? {} : { strength }),
    ...(value('dry') === true ? { dry: true as const } : {}),
    ...(quantityQualifier === undefined ? {} : { quantityQualifier }),
    parsedFields: [],
    tokens: kept,
    segments,
    review,
  };
}
