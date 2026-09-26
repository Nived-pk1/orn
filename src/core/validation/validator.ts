/**
 * The validator (VALIDATION_RULES.md §1, §4): L1 → L2 → L3 per record, incrementally for a change or
 * over the whole state. Per record, a level runs only if the ones below it found no ERROR: rules assume
 * a well-formed record (L1) with resolvable references (L2). Findings are values; nothing here writes
 * to state (INV-24). The incremental result equals the full result (tested against `validateAll`).
 */
import { referenceEngine } from '../references';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '../schema';
import type { Finding, FindingStore, RuleContext, ValidationLevel, ValidationRule, Validator } from './contracts';
import { parseRecord } from './l1';
import { runRules } from './runner';
import { RULES } from './rules/registry';

const KIND_ORDER = new Map<string, number>(RECORD_KINDS.map((kind, i) => [kind, i]));
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (ref: RecordRef): string => `${ref.kind}:${ref.id}`;

const byRef = (a: RecordRef, b: RecordRef): number =>
  (KIND_ORDER.get(a.kind) ?? 0) - (KIND_ORDER.get(b.kind) ?? 0) || compare(a.id, b.id);
const byFinding = (a: Finding, b: Finding): number =>
  byRef(a.subject, b.subject) || a.level - b.level || compare(a.ruleId, b.ruleId) || compare(a.path ?? '', b.path ?? '');

const recordAt = (state: CanonicalState, ref: RecordRef): AnyRecord | undefined => {
  const table = state.records[ref.kind] as Readonly<Record<string, AnyRecord>>;
  return Object.hasOwn(table, ref.id) ? table[ref.id] : undefined;
};

/** Rules of one level, indexed by the record kind they apply to. */
function byKind(rules: readonly ValidationRule[], level: 2 | 3): ReadonlyMap<RecordKind, readonly ValidationRule[]> {
  const map = new Map<RecordKind, ValidationRule[]>();
  for (const rule of rules.filter((r) => r.level === level)) {
    for (const kind of rule.kinds) map.set(kind, [...(map.get(kind) ?? []), rule]);
  }
  return map;
}

export function createValidator(rules: readonly ValidationRule[] = RULES): Validator {
  const l2 = byKind(rules, 2);
  const l3 = byKind(rules, 3);
  const withPeers = rules.filter((rule) => rule.peers !== undefined);

  const findingsOf = (record: AnyRecord, ctx: RuleContext): readonly Finding[] => {
    const parsed = parseRecord(record.kind, record);
    if (!parsed.ok) return parsed.findings;
    const referential = runRules(l2.get(record.kind) ?? [], record, ctx);
    if (referential.some((finding) => finding.severity === 'error')) return referential;
    return [...referential, ...runRules(l3.get(record.kind) ?? [], record, ctx)];
  };

  const scopeOf: Validator['scopeOf'] = (state, indexes, touched, previous) => {
    const ctx: RuleContext = { state, indexes };
    const scope = new Map<string, RecordRef>();
    const add = (ref: RecordRef): void => {
      if (!scope.has(keyOf(ref))) scope.set(keyOf(ref), ref);
    };
    const addIfPresent = (ref: RecordRef): void => {
      if (recordAt(state, ref) !== undefined) add(ref);
    };
    for (const ref of touched) {
      add(ref);
      for (const version of [recordAt(state, ref), previous === undefined ? undefined : recordAt(previous, ref)]) {
        if (version === undefined) continue;
        for (const referrer of indexes.referrersOf(version.id)) addIfPresent(referrer.owner);
        for (const found of referenceEngine.extract(version)) {
          if (found.targetKind !== undefined) addIfPresent({ kind: found.targetKind, id: found.targetId });
        }
        for (const rule of withPeers) {
          if (!rule.kinds.includes(version.kind) && !(rule.watches?.includes(version.kind) ?? false)) continue;
          for (const peer of rule.peers?.(version, ctx) ?? []) addIfPresent(peer);
        }
      }
    }
    return [...scope.values()].sort(byRef);
  };

  return {
    parseRecord,
    scopeOf,

    validateTouched(state, indexes, touched, previous) {
      const ctx: RuleContext = { state, indexes };
      const found: Finding[] = [];
      for (const ref of scopeOf(state, indexes, touched, previous)) {
        const record = recordAt(state, ref);
        if (record !== undefined) found.push(...findingsOf(record, ctx));
      }
      return found.sort(byFinding);
    },

    validateAll(state, indexes, signal) {
      const ctx: RuleContext = { state, indexes };
      const found: Finding[] = [];
      for (const kind of RECORD_KINDS) {
        const table = state.records[kind] as Readonly<Record<string, AnyRecord>>;
        for (const id of Object.keys(table).sort(compare)) {
          if (signal?.aborted === true) {
            const error = new Error('validateAll was aborted');
            error.name = 'AbortError';
            throw error;
          }
          found.push(...findingsOf(table[id] as AnyRecord, ctx));
        }
      }
      return found.sort(byFinding);
    },
  };
}

/**
 * Writes the outcome of `validateTouched` into the store: for each level 1–3, the subjects of `scope`
 * get exactly the findings of that level (none clears them).
 */
export function commitFindings(store: FindingStore, scope: readonly RecordRef[], findings: readonly Finding[]): void {
  for (const level of [1, 2, 3] as const satisfies readonly ValidationLevel[]) {
    store.replaceForSubjects(scope, findings.filter((finding) => finding.level === level), level);
  }
}

export const validator: Validator = createValidator();
