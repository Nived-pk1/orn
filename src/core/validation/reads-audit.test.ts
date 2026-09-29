/**
 * Audit of `ValidationRule.referencedReads` (ADR-031): a declaration is a promise about what `check` reads,
 * and a wrong one leaves a stale finding, so it is verified mechanically here, over the maximal fixture, the
 * demo dataset and every generator shape.
 *  - Trace: every record a declared rule fetches through the subject's own references is a Proxy that logs
 *    the top-level fields read; the log must fit inside the declaration (existence counts as a read of the kind).
 *  - Vanish: a rule declared to read nothing must give the same findings when every record its subject refers
 *    to is hidden from it.
 *  - Reads that do NOT go through the subject's references (other records, name lookups, hierarchy walks) cannot be
 *    narrowed by `referencedReads`; they must be covered by the rule's `peers`, or by the referent expansion
 *    (`RXN-018`). A rule that also declares `peerReads` (ADR-032) is held to it: every field it reads of a record it
 *    does not refer to, directly or through the name index or a hierarchy walk, must be listed.
 * The REF rules share one analysis pass, so a trace would blame each for the others' reads: they are held to
 * the vanish check, and REF-001/REF-005 also to the targeted tests in scoping.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
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

// Resource limit, not an assertion: this file builds large datasets and loses its 5 s default under workstation contention (docs/PROGRESS.md, step 3.6 review).
vi.setConfig({ testTimeout: 30_000 });

const EXISTS = '<exists>';
const HIERARCHY_WALKS = new Set(['ancestorsOf', 'descendantsOf', 'classAncestors']);
/** The field a hierarchy walk over a record of that kind is derived from (core/indexes/hierarchy.ts). */
const PARENT_FIELD: Readonly<Record<string, string>> = { class: 'parentIds', concept: 'parentIds', named_reaction: 'parentIds', topic: 'parentId' };
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
  /** Fields read of the records the subject refers to, by kind. */
  readonly reads: Map<string, Set<string>>;
  /** Fields read of records it does not refer to (direct fetches, name lookups, hierarchy walks), by kind. */
  readonly others: Map<string, Set<string>>;
  readonly elsewhere: Set<string>;
  /** Index lookups that read other records' reference fields; `peerReads` cannot vouch for them. */
  readonly unsupported: Set<string>;
}

/** The fields the folded-name index is built from, per kind (core/indexes/names.ts). */
const NAME_FIELDS: Readonly<Record<string, readonly string[]>> = { species: ['names'], class: ['names'] };

/** Runs `rule` on `record` with every referenced record traced; other lookups are logged apart. */
function traced(rule: ValidationRule, record: AnyRecord, state: CanonicalState, indexes: CoreIndexes): Trace {
  const trace: Trace = { reads: new Map(), others: new Map(), elsewhere: new Set(), unsupported: new Set() };
  const referenced = referencedIds(record);
  const noteIn = (sink: Map<string, Set<string>>, kind: string, field: string): void => void sink.set(kind, (sink.get(kind) ?? new Set<string>()).add(field));
  const note = (kind: string, field: string): void => noteIn(trace.reads, kind, field);
  const wrap = (target: AnyRecord, sink: Map<string, Set<string>> = trace.reads): AnyRecord =>
    new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === 'string' && key !== 'kind' && key !== 'id') noteIn(sink, t.kind, key);
        return Reflect.get(t, key, receiver) as unknown;
      },
      has(t, key) {
        if (typeof key === 'string') noteIn(sink, t.kind, key);
        return Reflect.has(t, key);
      },
      ownKeys(t) {
        noteIn(sink, t.kind, '<all fields>');
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
            noteIn(trace.others, out === undefined ? (recordKindOfId(id) ?? '?') : (out as AnyRecord).kind, EXISTS);
            return out === undefined ? out : wrap(out as AnyRecord, trace.others);
          }
          note(out === undefined ? (recordKindOfId(id) ?? '?') : (out as AnyRecord).kind, EXISTS);
          return out === undefined ? out : wrap(out as AnyRecord);
        }
        if (typeof prop === 'string' && HIERARCHY_WALKS.has(prop)) {
          // A walk *up* from a record the subject refers to reads that record's parent field (a walk from any
          // other record, or down from the subject, is reached through `peers`).
          const walkedKind = prop === 'classAncestors' ? 'class' : (args[0] as string);
          const walkedId = (prop === 'classAncestors' ? args[0] : args[1]) as string;
          if (prop !== 'descendantsOf' && referenced.has(walkedId) && PARENT_FIELD[walkedKind] !== undefined) {
            note(walkedKind, PARENT_FIELD[walkedKind] as string);
            // ...and the walk goes on through the ancestors' own parent links, which only `peers` can reach.
            noteIn(trace.others, walkedKind, PARENT_FIELD[walkedKind] as string);
          } else {
            trace.elsewhere.add(prop);
            if (PARENT_FIELD[walkedKind] !== undefined) noteIn(trace.others, walkedKind, PARENT_FIELD[walkedKind] as string);
          }
        }
        if (prop === 'byFoldedName') for (const field of NAME_FIELDS[args[0] as string] ?? ['name', 'aliases', 'names']) noteIn(trace.others, args[0] as string, field);
        if (prop === 'referrersOf' || prop === 'linkersOf' || prop === 'definersOf') trace.unsupported.add(prop);
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
    const unseen = ['RXN-013', 'REL-006', 'CUR-003', 'CUR-005', 'HIER-002', 'CLS-001', 'RVW-002', 'SPC-006'].filter(
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

  it('every read a peerReads-declaring rule makes of a record it does not refer to is listed in peerReads (trace)', () => {
    const withPeerReads = RULES.filter((rule) => rule.peerReads !== undefined && !isReference(rule));
    expect(withPeerReads.map((rule) => rule.id).sort()).toEqual(expect.arrayContaining(['CLS-001', 'CLS-002', 'HIER-001', 'SPC-001', 'SPC-005', 'SPC-006']));
    const seen = new Map<string, Set<string>>();
    for (const [name, state] of STATES) {
      const indexes = coreIndexEngine.build(state);
      for (const rule of withPeerReads) {
        const peerReads = rule.peerReads as NonNullable<ValidationRule['peerReads']>;
        for (const kind of rule.kinds) {
          for (const record of Object.values(state.records[kind] as Readonly<Record<string, AnyRecord>>)) {
            const { reads, others, unsupported } = traced(rule, record, state, indexes);
            expect([...unsupported], `${rule.id} on ${name}/${record.id} looks up records through their reference fields`).toEqual([]);
            for (const [readKind, fields] of others) {
              const listed = [...(peerReads[readKind as RecordKind] ?? []), ...(peerReads['*'] ?? [])];
              expect(peerReads[readKind as RecordKind] !== undefined || peerReads['*'] !== undefined, `${rule.id} on ${name}/${record.id} reads a ${readKind} that peerReads does not name`).toBe(true);
              for (const field of fields) {
                if (field !== EXISTS) expect(listed, `${rule.id} on ${name}/${record.id} reads ${readKind}.${field}`).toContain(field);
              }
            }
            for (const [readKind, fields] of [...others, ...reads]) {
              seen.set(rule.id, new Set([...(seen.get(rule.id) ?? []), ...[...fields].filter((f) => f !== EXISTS && (peerReads[readKind as RecordKind] ?? []).includes(f))]));
            }
          }
        }
      }
    }
    const unseen = withPeerReads.map((rule) => rule.id).filter((id) => (seen.get(id)?.size ?? 0) === 0);
    expect(unseen, 'peerReads rules never seen reading a field they declare').toEqual([]);
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
