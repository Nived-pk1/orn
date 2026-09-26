/**
 * L2 referential rules REF-001…REF-008 (VALIDATION_RULES.md §3). Each rule is a view of the shared
 * analysis in ./reference-analysis.ts; the kinds a rule applies to are derived from the registries.
 */
import {
  NESTED_ID_SPECS,
  RECORD_KINDS,
  REFERENCE_SPECS,
  RICH_TEXT_PATHS,
  type RecordKind,
  type ReferenceSpec,
} from '../../schema';
import type { FindingDraft, RuleContext, ValidationRule } from '../contracts';
import { analyseReferences, type ReferenceRuleId } from './reference-analysis';

const ownersOf = (test: (spec: ReferenceSpec) => boolean): readonly RecordKind[] => [
  ...new Set(REFERENCE_SPECS.filter(test).map((spec) => spec.owner)),
];

interface RuleSpec {
  readonly id: ReferenceRuleId;
  readonly kinds: readonly RecordKind[];
  readonly severity: ValidationRule['defaultSeverity'];
  readonly scope: ValidationRule['scope'];
  readonly description: string;
}

const isRecordTarget = (spec: ReferenceSpec): boolean => spec.target.type === 'id' || spec.target.type === 'ref';

const SPECS: readonly RuleSpec[] = [
  {
    id: 'REF-001',
    kinds: ownersOf(isRecordTarget),
    severity: 'error',
    scope: 'neighbourhood',
    description: 'Referenced record does not exist',
  },
  {
    id: 'REF-002',
    kinds: ownersOf(isRecordTarget),
    severity: 'error',
    scope: 'record',
    description: 'Referenced kind not allowed for this field, or the ID prefix does not match the kind',
  },
  {
    id: 'REF-003',
    kinds: ownersOf(isRecordTarget),
    severity: 'error',
    scope: 'record',
    description: 'Reference points to a higher layer',
  },
  {
    id: 'REF-004',
    kinds: ownersOf((spec) => spec.target.type === 'local'),
    severity: 'error',
    scope: 'record',
    description: 'Local reference is not defined in the same record',
  },
  {
    id: 'REF-005',
    kinds: ownersOf((spec) => spec.target.type === 'nested'),
    severity: 'error',
    scope: 'neighbourhood',
    description: 'Nested reference is not defined in the record it names',
  },
  {
    id: 'REF-006',
    kinds: [...new Set(NESTED_ID_SPECS.map((spec) => spec.owner))],
    severity: 'error',
    scope: 'global',
    description: 'Nested ID defined more than once in the dataset',
  },
  {
    id: 'REF-007',
    kinds: ownersOf(isRecordTarget),
    severity: 'error',
    scope: 'record',
    description: 'A record refers to itself',
  },
  {
    id: 'REF-008',
    kinds: RECORD_KINDS.filter((kind) => RICH_TEXT_PATHS[kind].length > 0),
    severity: 'warning',
    scope: 'neighbourhood',
    description: 'Rich-text [[link]] target does not exist',
  },
];

function referenceRule(spec: RuleSpec): ValidationRule {
  return {
    id: spec.id,
    level: 2,
    kinds: spec.kinds,
    defaultSeverity: spec.severity,
    scope: spec.scope,
    description: spec.description,
    *check(record, ctx: RuleContext): Iterable<FindingDraft> {
      for (const found of analyseReferences(record, ctx)) if (found.ruleId === spec.id) yield found.draft;
    },
  };
}

export const REFERENCE_RULES: readonly ValidationRule[] = SPECS.map(referenceRule);
