/**
 * Audit of `ValidationRule.referencedReads` (ADR-031): a declaration is a promise about what `check` reads,
 * and a wrong one leaves a stale finding, so it is verified mechanically here, over the maximal fixture, the
 * demo dataset and every generator shape.
 *  - Trace: every record a declared rule fetches through the subject's own references is a Proxy that logs
 *    the top-level fields read; the log must fit inside the declaration (existence counts as a read of the kind).
 *  - Vanish: a rule declared to read nothing must give the same findings when every record its subject refers
 *    to is hidden from it.
 *  - Reads that do NOT go through the subject's references (other records, hierarchy walks) cannot be narrowed
 *    by the declaration; they must be covered by the rule's `peers`, or by the referent expansion (`RXN-018`).
 * The REF rules share one analysis pass, so a trace would blame each for the others' reads: they are held to
 * the vanish check, and REF-001/REF-005 also to the targeted tests in scoping.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { documentToState } from '../dataset';
import { coreIndexEngine } from '../indexes/engine';
import type { CoreIndexes } from '../indexes/contracts';
import { referenceEngine } from '../references';
import { recordKindOfId, RECORD_KINDS, type AnyRecord, type CanonicalState, type RecordKind } from '../schema';
import { buildDemoDocument } from '../../test-support/demo';
import { GENERATOR_SHAPES, generateDataset } from '../../test-support/generator';
import { commit, loadFixtureState } from '../../test-support/state-fixture';
import type { RuleContext, ValidationRule } from './contracts';
import { RULES } from './rules/registry';

const EXISTS = '<exists>';
const HIERARCHY_WALKS = new Set(['ancestorsOf', 'descendantsOf', 'classAncestors']);
/** Rules whose reads are of their own referrers, which the referent expansion (not `peers`) brings into scope. */
const REFERRER_SIDE = new Set(['RXN-018', 'AST-001']);

const stateOf = (params: Parameters<typeof generateDataset>[0]): CanonicalState => {
  const parsed = documentToState(generateDataset(params));
  if (!parsed.ok) throw new Error('duplicate IDs');
  return parsed.state;
};
const demo = documentToState(buildDemoDocument());
const maximal = loadFixtureState('maximal-valid');
/** Exam versions only read the records they cite once they are official (CUR-005). */
const allOfficial = commit(maximal, 1, (tables) => {
  for (const version of Object.values(tables.exam_version)) (version as { status: string }).status = 'official';
}).after;
const STATES: readonly (readonly [string, CanonicalState])[] = [
  ['maximal-valid', maximal],
  ['maximal-valid, exam versions official', allOfficial],
  ['demo', demo.ok ? demo.state : loadFixtureState('maximal-valid')],
  ...GENERATOR_SHAPES.map((shape) => [`generated ${shape}`, stateOf({ species: 60, classes: 4, reagents: 6, reactions: 30, relationshipsPerReaction: 1, topics: 3, shape, seed: 3 })] as const),
];

const referencedIds = (record: AnyRecord): Set<string> => {
  const ids = new Set<string>();
  for (const found of referenceEngine.extract(record)) {
    ids.add(found.targetId);
    if (found.containerRecordId !== undefined) ids.add(found.containerRecordId);
  }
  ids.delete(record.id);
  return ids;
};

interface Trace {
  readonly reads: Map<string, Set<string>>;
  readonly elsewhere: Set<string>;
}

/** Runs `rule` on `record` with every referenced record traced; other lookups are logged apart. */
function traced(rule: ValidationRule, record: AnyRecord, state: CanonicalState, indexes: CoreIndexes): Trace {
  const trace: Trace = { reads: new Map(), elsewhere: new Set() };
  const referenced = referencedIds(record);
  const note = (kind: string, field: string): void => void trace.reads.set(kind, (trace.reads.get(kind) ?? new Set<string>()).add(field));
  const wrap = (target: AnyRecord): AnyRecord =>
    new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === 'string' && key !== 'kind' && key !== 'id') note(t.kind, key);
        return Reflect.get(t, key, receiver) as unknown;
      },
      has(t, key) {
        if (typeof key === 'string') note(t.kind, key);
        return Reflect.has(t, key);
      },
      ownKeys(t) {
        note(t.kind, '<all fields>');
        return Reflect.ownKeys(t);
      },
    });
  const spy = new Proxy(indexes, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        const out: unknown = (value as (...a: unknown[]) => unknown).apply(target, args);
        if (prop === 'get') {
          const id = args[0] as string;
          if (id === record.id) return out;
          if (!referenced.has(id)) {
            trace.elsewhere.add(`get ${out === undefined ? '?' : (out as AnyRecord).kind}`);
            return out;
          }
          note(out === undefined ? (recordKindOfId(id) ?? '?') : (out as AnyRecord).kind, EXISTS);
          return out === undefined ? out : wrap(out as AnyRecord);
        }
        if (typeof prop === 'string' && HIERARCHY_WALKS.has(prop)) trace.elsewhere.add(prop);
        return out;
      };
    },
  }) as CoreIndexes;
  const ctx: RuleContext = { state, indexes: spy };
  for (const draft of rule.check(record as never, ctx)) void draft;
  return trace;
}

const outputOf = (rule: ValidationRule, record: AnyRecord, ctx: RuleContext): string => JSON.stringify([...rule.check(record as never, ctx)]);

/** The indexes with every record the subject refers to hidden. */
function withReferencedHidden(record: AnyRecord, indexes: CoreIndexes): CoreIndexes {
  const referenced = referencedIds(record);
  return new Proxy(indexes, {
    get(target, prop) {
      const value = Reflect.get(target, prop, target) as unknown;
      if (prop !== 'get') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      return (id: string) => (referenced.has(id) ? undefined : target.get(id));
    },
  }) as CoreIndexes;
}

const declared = RULES.filter((rule) => rule.referencedReads !== undefined);
const isReference = (rule: ValidationRule): boolean => rule.id.startsWith('REF-');
const nothing = (rule: ValidationRule): boolean => Object.keys(rule.referencedReads ?? {}).length === 0;

describe('referencedReads audit (ADR-031)', () => {
  it('declares a good part of the catalogue, and every declaration names real kinds', () => {
    expect(declared.length).toBeGreaterThanOrEqual(50);
    for (const rule of declared) {
      for (const key of Object.keys(rule.referencedReads ?? {})) expect(key === '*' || (RECORD_KINDS as readonly string[]).includes(key), `${rule.id} ${key}`).toBe(true);
    }
  });

  it('every read of a referenced record stays inside the declaration (trace)', () => {
    const seen = new Map<string, Map<string, Set<string>>>();
    for (const [name, state] of STATES) {
      const indexes = coreIndexEngine.build(state);
      for (const rule of declared.filter((r) => !isReference(r))) {
        for (const kind of rule.kinds) {
          for (const record of Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
            const { reads, elsewhere } = traced(rule, record, state, indexes);
            const own = rule.referencedReads as NonNullable<ValidationRule['referencedReads']>;
            for (const [readKind, fields] of reads) {
              const allowed = [...(own[readKind as RecordKind] ?? []), ...(own['*'] ?? [])];
              const known = own[readKind as RecordKind] !== undefined || own['*'] !== undefined;
              expect(known, `${rule.id} on ${name}/${record.id} reads a ${readKind} it does not declare`).toBe(true);
              for (const field of fields) {
                if (field !== EXISTS) expect(allowed, `${rule.id} on ${name}/${record.id} reads ${readKind}.${field}`).toContain(field);
              }
              const perKind = seen.get(rule.id) ?? new Map<string, Set<string>>();
              perKind.set(readKind, new Set([...(perKind.get(readKind) ?? []), ...fields]));
              seen.set(rule.id, perKind);
            }
            if (elsewhere.size > 0) {
              expect(rule.peers !== undefined || REFERRER_SIDE.has(rule.id), `${rule.id} reads ${[...elsewhere].join(', ')} outside its references without peers`).toBe(true);
            }
          }
        }
      }
    }
    // Not vacuous: the rules that declare fields were seen reading them.
    const unseen = ['RXN-013', 'REL-006', 'CUR-003', 'CUR-005', 'HIER-002', 'CLS-001', 'RVW-002'].filter(
      (id) => [...(seen.get(id)?.values() ?? [])].flatMap((fields) => [...fields]).every((f) => f === EXISTS),
    );
    expect(unseen, 'declared rules never seen reading a field').toEqual([]);
  });

  it('a rule declared to read nothing is unaffected when the records its subject refers to are hidden (vanish)', () => {
    let compared = 0;
    for (const [name, state] of STATES) {
      const indexes = coreIndexEngine.build(state);
      for (const rule of declared.filter((r) => nothing(r) && r.id !== 'REF-008')) {
        // REF-008 reads whether [[links]] resolve: not a reference, so `watches` + `peers` carry it.
        for (const kind of rule.kinds) {
          for (const record of Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
            const real = outputOf(rule, record, { state, indexes });
            const hidden = outputOf(rule, record, { state, indexes: withReferencedHidden(record, indexes) });
            expect(hidden, `${rule.id} on ${name}/${record.id}`).toBe(real);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('REF-001 does read what it declares (its outcome changes when the referenced records are hidden)', () => {
    const [, state] = STATES[0] as (typeof STATES)[number];
    const indexes = coreIndexEngine.build(state);
    const rule = RULES.find((r) => r.id === 'REF-001') as ValidationRule;
    let changed = 0;
    for (const kind of rule.kinds) {
      for (const record of Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
        if (outputOf(rule, record, { state, indexes }) !== outputOf(rule, record, { state, indexes: withReferencedHidden(record, indexes) })) changed += 1;
      }
    }
    expect(changed).toBeGreaterThan(0);
  });
});
