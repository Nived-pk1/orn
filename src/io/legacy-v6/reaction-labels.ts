/**
 * A whole-label temperature or light (docs/MIGRATION.md §4.6) is a stage parameter, not a participant. This merges the parameter
 * the label parser read into the parameters of the stage it belongs to. Nothing is overwritten: a different value already there
 * (from `conditions`) sends the label to the stage's `other[]`; entries that do not fit the schema's cap are returned.
 */
import { PARAMETER_FIELDS, type ConditionParameters } from '@/core/schema';
import { excerpt, type CompoundScope } from './compound-scope';
import type { ParsedLabel } from './label-parser';
import { toOtherEntries } from '@/core/condition-parse/parse-spans';

/** `ConditionParametersSchema.other` holds at most this many entries. */
const MAX_OTHER = 16;

/** Merges a whole-label stage parameter into a stage's parameters. Entries that do not fit `other[]` are returned (the caller keeps them). */
export function mergeStageParameters(target: ConditionParameters, label: ParsedLabel, text: string, scope: CompoundScope): string[] {
  const patch = label.stageParameters ?? {};
  const overflow: string[] = [];
  const add = (entry: string): void => void (target.other.length < MAX_OTHER ? target.other.push(entry) : overflow.push(entry));
  const clash = (name: 'temperature' | 'light'): void => {
    for (const entry of toOtherEntries(name, text).entries) add(entry);
    scope.reason(`participant label ${excerpt(text)} is a ${name} but this stage already has a different one; the label was kept in the stage's other[]`);
  };
  if (patch.temperature !== undefined) {
    if (target.temperature === undefined) target.temperature = patch.temperature;
    else if (JSON.stringify(target.temperature) !== JSON.stringify(patch.temperature)) clash('temperature');
  }
  if (patch.light !== undefined) {
    if (target.light === undefined) target.light = patch.light;
    else if (target.light !== patch.light) clash('light');
  }
  for (const entry of patch.other ?? []) add(entry);
  const fields = new Set([...target.parsedFields, ...label.parsedFields]);
  target.parsedFields.splice(0, target.parsedFields.length, ...PARAMETER_FIELDS.filter((field) => fields.has(field)));
  return overflow;
}

