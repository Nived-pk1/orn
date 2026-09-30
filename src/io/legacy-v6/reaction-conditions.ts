/**
 * A legacy reaction's `conditions` object → the parameters of stage 1 (docs/MIGRATION.md §4.5), with the step 3.9 parser doing the
 * reading. This module does the accounting around it: which legacy leaves became parameters (the consumed-path trace), which are
 * kept in `provenance.legacy.unmapped`, which review reasons follow, and which informational notes the report counts.
 *
 * Every leaf of `conditions` ends up in exactly one of three places: consumed (parsed into a parameter, or the empty default v6
 * put there), kept whole in `unmapped` (a wrong-typed value, an unknown key, a text the schema cannot hold, anything the parser
 * did not read), or - for entries beyond the schema's `other[]` cap - kept in `unmapped.conditions.overflowOther`.
 */
import type { ConditionParameters } from '@/core/schema';
import { parseLegacyConditions } from './condition-parser';
import { excerpt, type CompoundScope } from './compound-scope';
import { list } from './compound-review';
import type { ReportBuilder } from './report';
import { isObj } from './text';

/** The keys of a v5 `conditions` object that the parser reads. */
const KNOWN_KEYS = ['text', 'temperature', 'medium', 'phase', 'strength', 'pressure', 'atmosphere', 'heat', 'light', 'anhydrous'] as const;

export const emptyParameters = (): ConditionParameters => ({ solventCharacter: [], activation: [], other: [], parsedFields: [] });

export interface MappedConditions {
  readonly parameters: ConditionParameters;
  /** `conditions.text` when the schema can hold it: the stage's `originalText` (and `parameters.text`). */
  readonly originalText?: string;
}

/** The value v6 puts where there is nothing to say. */
const isDefault = (value: unknown): boolean => value === '' || value === null || value === false;

export function mapConditions(conditions: unknown, scope: CompoundScope, report: ReportBuilder): MappedConditions {
  if (conditions === undefined) return { parameters: emptyParameters() };
  if (!isObj(conditions) || Array.isArray(conditions)) {
    if (isDefault(conditions) || (Array.isArray(conditions) && conditions.length === 0)) scope.consume(['conditions'], conditions);
    else {
      scope.keep(['conditions'], conditions);
      scope.reason(`conditions is not an object (${excerpt(conditions)}); kept in legacy.unmapped`);
    }
    return { parameters: emptyParameters() };
  }

  const parsed = parseLegacyConditions(conditions);
  const stored = parsed.parameters.text !== undefined;
  for (const key of KNOWN_KEYS) {
    if (!Object.hasOwn(conditions, key)) continue;
    const value = conditions[key];
    // consumed: the default v6 put there, or a value the parser read; everything else (wrong type, blank text, 0, a text the schema
    // cannot hold) stays whole in unmapped - the parser's own review item says why
    const read = parsed.consumed.includes(key) && !(key === 'text' && !stored);
    if (isDefault(value) || read) scope.consume(['conditions', key], value);
    else scope.keep(['conditions', key], value);
  }
  const unknown = Object.keys(conditions).filter((key) => !(KNOWN_KEYS as readonly string[]).includes(key));
  for (const key of unknown) scope.keep(['conditions', key], conditions[key]);
  if (unknown.length > 0) scope.reason(`unknown legacy field(s) in conditions kept in legacy.unmapped: ${list(unknown.map((key) => excerpt(key, 30)))}`);

  for (const item of parsed.review) scope.reason(`conditions: ${item.message}`);
  for (const note of parsed.notes) report.note(note.code);
  if (parsed.overflowOther.length > 0) scope.keep(['conditions', 'overflowOther'], [...parsed.overflowOther]);
  if (parsed.parameters.parsedFields.length > 0) {
    scope.reason(`conditions were read from text by the importer (${parsed.parameters.parsedFields.join(', ')}; RXN-015): check them against the original wording`);
  }
  return { parameters: parsed.parameters, ...(stored ? { originalText: parsed.originalText } : {}) };
}
