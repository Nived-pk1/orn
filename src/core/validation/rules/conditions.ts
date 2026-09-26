/**
 * RXN-014 (impossible ranges and temperatures) and RXN-015 (unconfirmed parsed conditions). Condition
 * parameters occur in reaction stages and variants, reagent profiles and caveat triggers; the rules
 * look at every such place, found by kind rather than by any particular record.
 */
import type { AnyRecord, ConditionParameters, Temperature } from '../../schema';
import type { ValidationRule } from '../contracts';
import { at, rule } from './helpers';

interface ParameterSet {
  readonly path: string;
  readonly params: ConditionParameters;
}

function parameterSets(record: AnyRecord): readonly ParameterSet[] {
  switch (record.kind) {
    case 'reaction':
      return [
        ...record.stages.map((s, i) => ({ path: at('stages', i, 'parameters'), params: s.parameters })),
        ...record.conditionVariants.map((v, i) => ({ path: at('conditionVariants', i, 'parameters'), params: v.parameters })),
      ];
    case 'reagent':
      return record.profiles.map((p, i) => ({ path: at('profiles', i, 'parameters'), params: p.parameters }));
    case 'caveat':
      return record.triggerConditions === undefined ? [] : [{ path: 'triggerConditions', params: record.triggerConditions }];
    default:
      return [];
  }
}

const KINDS = ['reaction', 'reagent', 'caveat'] as const;
const ABSOLUTE_ZERO_C = -273.15;

const belowAbsoluteZero = (value: number, unit: 'C' | 'K'): boolean => (unit === 'C' ? value < ABSOLUTE_ZERO_C : value < 0);

function temperatureProblems(t: Temperature): string[] {
  if (t.kind === 'value') return belowAbsoluteZero(t.value, t.unit) ? ['the temperature is below absolute zero'] : [];
  if (t.kind === 'qualitative') return [];
  const problems: string[] = [];
  if (t.min > t.max) problems.push('the minimum is above the maximum');
  if (belowAbsoluteZero(t.min, t.unit)) problems.push('the minimum temperature is below absolute zero');
  return problems;
}

export const CONDITION_RULES: readonly ValidationRule[] = [
  rule({
    id: 'RXN-014',
    level: 3,
    kinds: KINDS,
    defaultSeverity: 'error',
    scope: 'record',
    description: 'Range with min > max, or temperature below absolute zero',
    *check(record) {
      for (const { path, params } of parameterSets(record)) {
        const { temperature, pressure } = params;
        const hot = temperature === undefined ? [] : temperatureProblems(temperature);
        if (temperature !== undefined && hot.length > 0) {
          yield { path: at(path, 'temperature'), message: `Temperature: ${hot.join(' and ')}.` };
        }
        if (pressure?.kind === 'range' && pressure.min > pressure.max) {
          yield { path: at(path, 'pressure'), message: 'Pressure: the minimum is above the maximum.' };
        }
      }
    },
  }),

  rule({
    id: 'RXN-015',
    level: 3,
    kinds: KINDS,
    defaultSeverity: 'review_required',
    scope: 'record',
    description: 'Conditions filled by a parser and not yet confirmed',
    *check(record) {
      for (const { path, params } of parameterSets(record)) {
        if (params.parsedFields.length === 0) continue;
        yield {
          path: at(path, 'parsedFields'),
          message: `These conditions were filled in from text and need a person to confirm them: ${params.parsedFields.join(', ')}.`,
          data: { fields: [...params.parsedFields] },
        };
      }
    },
  }),
];
