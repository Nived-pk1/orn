/**
 * The validator (VALIDATION_RULES.md §1, §4): L1 → L2 → L3 per record, incrementally for a change or
 * over the whole state. Per record, a level runs only if the ones below it found no ERROR: rules assume
 * a well-formed record (L1) with resolvable references (L2). Findings are values; nothing here writes
 * to state (INV-24). The incremental result equals the full result (tested against `validateAll`).
 */
import { referenceEngine } from '../references';
import { RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind, type RecordRef } from '../schema';
import type { Finding, FindingStore, RuleContext, RuleScopedFindings, TouchedValidation, ValidationLevel, ValidationRule, Validator } from './contracts';
import { parseRecord } from './l1';
import { runRules } from './runner';
import { RULES } from './rules/registry';
import { changeOf, readsField, referrerRules, rulesByKind } from './scoping';

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
  const rulesOf = rulesByKind(rules);

  const findingsOf = (record: AnyRecord, ctx: RuleContext): readonly Finding[] => {
    const parsed = parseRecord(record.kind, record);
    if (!parsed.ok) return parsed.findings;
    const referential = runRules(l2.get(record.kind) ?? [], record, ctx);
    if (referential.some((finding) => finding.severity === 'error')) return referential;
    return [...referential, ...runRules(l3.get(record.kind) ?? [], record, ctx)];
  };

  interface Plan {
    /** Re-validated whole: touched records, referents, and referrers or peers with an affected L2 rule. */
    readonly whole: Map<string, RecordRef>;
    /** Referrers and peers of which only the rules that read what changed, or that named them, are re-run (all L3). */
    readonly partial: Map<string, { readonly ref: RecordRef; readonly rules: Map<string, ValidationRule> }>;
  }

  const plan = (state: CanonicalState, indexes: RuleContext['indexes'], touched: readonly RecordRef[], previous: CanonicalState | undefined): Plan => {
    const ctx: RuleContext = { state, indexes };
    const whole = new Map<string, RecordRef>();
    const partial: Plan['partial'] = new Map();
    const add = (ref: RecordRef): void => {
      if (!whole.has(keyOf(ref))) whole.set(keyOf(ref), ref);
    };
    const addIfPresent = (ref: RecordRef): void => {
      if (recordAt(state, ref) !== undefined) add(ref);
    };
    /** Only `rules` need re-running on `ref`, unless one of them is L2: an L2 outcome can gate the L3 rules. */
    const addRules = (ref: RecordRef, rules: readonly ValidationRule[]): void => {
      if (rules.length === 0 || recordAt(state, ref) === undefined) return;
      if (rules.some((rule) => rule.level === 2)) {
        add(ref);
        return;
      }
      const entry = partial.get(keyOf(ref)) ?? { ref, rules: new Map<string, ValidationRule>() };
      for (const rule of rules) entry.rules.set(rule.id, rule);
      partial.set(keyOf(ref), entry);
    };
    for (const ref of touched) {
      add(ref);
      const current = recordAt(state, ref);
      const before = previous === undefined ? undefined : recordAt(previous, ref);
      const change = changeOf(current, before, previous !== undefined);
      if (current !== undefined || before !== undefined) {
        // Referrers depend on the ID alone, so one lookup serves both versions. Each needs only the rules of
        // its kind that read something that changed (ADR-031/032).
        const affected = referrerRules(rulesOf, ref.kind, change);
        for (const { owner } of indexes.referrersOf(ref.id)) addRules(owner, affected(owner.kind));
      }
      for (const version of [current, before]) {
        if (version === undefined) continue;
        for (const found of referenceEngine.extract(version)) {
          if (found.targetKind !== undefined) addIfPresent({ kind: found.targetKind, id: found.targetId });
        }
        for (const rule of withPeers) {
          if (!rule.kinds.includes(version.kind) && !(rule.watches?.includes(version.kind) ?? false)) continue;
          // Declared `peerReads`: peers only depend on the fields listed there (ADR-032).
          if (!readsField(rule.peerReads, version.kind, change)) continue;
          // A peer is named by one rule: "records whose findings for this rule can change" (contracts.ts).
          for (const peer of rule.peers?.(version, ctx) ?? []) if (rule.kinds.includes(peer.kind)) addRules(peer, [rule]);
        }
      }
    }
    for (const key of whole.keys()) partial.delete(key);
    return { whole, partial };
  };

  const scopeOf: Validator['scopeOf'] = (state, indexes, touched, previous) => {
    const { whole, partial } = plan(state, indexes, touched, previous);
    return [...whole.values(), ...[...partial.values()].map((entry) => entry.ref)].sort(byRef);
  };

  const validateTouchedByRule: Validator['validateTouchedByRule'] = (state, indexes, touched, previous, known) => {
    const ctx: RuleContext = { state, indexes };
    const { whole, partial } = plan(state, indexes, touched, previous);
    const scope = [...whole.values()].sort(byRef);
    const findings: Finding[] = [];
    for (const ref of scope) {
      const record = recordAt(state, ref);
      if (record !== undefined) findings.push(...findingsOf(record, ctx));
    }
    const groups = new Map<string, { subjects: RecordRef[]; ruleIds: string[]; findings: Finding[] }>();
    for (const { ref, rules } of [...partial.values()].sort((a, b) => byRef(a.ref, b.ref))) {
      const record = recordAt(state, ref);
      // A referrer with an L1/L2 ERROR has no L3 findings (its L3 rules did not run), and its L1/L2 results do
      // not depend on what changed, or it would be whole: nothing to re-run.
      if (record === undefined || known.bySubject(ref).some((f) => f.severity === 'error' && f.level <= 2)) continue;
      const ruleIds = [...rules.keys()].sort(compare);
      const key = ruleIds.join(',');
      const group = groups.get(key) ?? { subjects: [], ruleIds, findings: [] };
      group.subjects.push(ref);
      group.findings.push(...runRules([...rules.values()], record, ctx));
      groups.set(key, group);
    }
    const byRule: RuleScopedFindings[] = [...groups.values()];
    const sortedFindings = findings.sort(byFinding);
    return {
      scope,
      findings: sortedFindings,
      byRule,
      all: [...sortedFindings, ...byRule.flatMap((group) => group.findings)].sort(byFinding),
    } satisfies TouchedValidation;
  };

  return {
    parseRecord,
    scopeOf,
    validateTouchedByRule,

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

/** Commits a `validateTouchedByRule` result: whole subjects per level, referrers per rule (ADR-032). */
export function commitTouched(store: FindingStore, result: TouchedValidation): void {
  commitFindings(store, result.scope, result.findings);
  for (const group of result.byRule) store.replaceForRules(group.subjects, group.ruleIds, group.findings);
}

export const validator: Validator = createValidator();
