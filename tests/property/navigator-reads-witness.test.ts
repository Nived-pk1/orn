/**
 * Step 5.4c review follow-up a: the other half of the `readsKinds` proof. One WITNESS per kind of
 * `navigatorProjection.readsKinds`: a concrete edit of one record of that kind that changes the navigator
 * projection (`sameProjection` false). The property test shows no kind outside the list matters; this table shows
 * every listed kind is needed. Kinds that have no witness are not in the list (see `reads.ts`).
 */
import { describe, expect, it } from 'vitest';
import { navigatorProjection, createScopeOf, sameProjection, type Projection, type ProjectionRequest } from '@/core/graph';
import { documentToState } from '@/core/dataset';
import { indexEngine } from '@/core/indexes';
import type { AnyRecord, CanonicalState, ExamId, ExamVersionId, RecordKind } from '@/core/schema';
import { buildDemoDocument } from '@/test-support/demo';
import { requestOf } from '@/test-support/graph-state';

const parsed = documentToState(buildDemoDocument());
if (!parsed.ok) throw new Error('demo does not parse');
const DEMO = parsed.state;

type Loose = Record<string, unknown>;
type Exam = 'main' | 'advanced';
const EXAMS: Record<Exam, [ExamId, ExamVersionId]> = {
  main: ['exm_jee-main' as ExamId, 'exv_jee-main-2026' as ExamVersionId],
  advanced: ['exm_jee-advanced' as ExamId, 'exv_jee-advanced-2026' as ExamVersionId],
};

const get = (state: CanonicalState, kind: RecordKind, id: string): Loose => {
  const record = (state.records[kind] as Record<string, unknown>)[id];
  if (record === undefined) throw new Error(`${id} is not in the demo`);
  return record as Loose;
};

/** A copy of `state` in which `kind`/`id` is replaced by `next(record)` (undefined `current` = a new record). */
function withRecord(state: CanonicalState, kind: RecordKind, id: string, next: (current: Loose) => Loose): CanonicalState {
  const tables = structuredClone(state.records) as unknown as Record<string, Record<string, AnyRecord>>;
  const table = tables[kind] as Record<string, AnyRecord>;
  table[id] = next(table[id] === undefined ? {} : (table[id] as unknown as Loose)) as unknown as AnyRecord;
  return { meta: state.meta, records: tables as unknown as CanonicalState['records'] };
}

const anchorOnTarget = (kind: RecordKind, id: string): CanonicalState =>
  withRecord(DEMO, 'navigator_anchor', 'anc_witness', () => ({ id: 'anc_witness', kind: 'navigator_anchor', target: { kind, id }, order: 99, provenance: get(DEMO, 'navigator_anchor', 'anc_alkenes').provenance }));

function project(state: CanonicalState, exam: Exam = 'main', over: Partial<ProjectionRequest> = {}): Projection {
  const indexes = indexEngine.build(state, 1);
  return navigatorProjection.build({ state, indexes, scopeOf: createScopeOf(indexes, ...EXAMS[exam]) }, requestOf('navigator', over));
}

const ALL_SCOPES = { scopes: ['official', 'prerequisite', 'enrichment', 'outside', 'unmapped'] as never, topicIds: [], reagentFamilies: [] };
const review = (current: Loose): Loose => ({ ...current, review: { ...(current.review as Loose), status: 'review_required', reasons: ['witness'] } });

interface Witness {
  readonly kind: RecordKind;
  /** The state before the edit and the state after it (one record of `kind` differs). */
  readonly before: CanonicalState;
  readonly after: CanonicalState;
  readonly exam?: Exam;
  readonly request?: Partial<ProjectionRequest>;
}

const conceptBase = anchorOnTarget('concept', 'cpt_markovnikov');
const namedBase = anchorOnTarget('named_reaction', 'nrx_aldol');
const topicFilter = { scopes: [], topicIds: ['top_alkenes'] as never, reagentFamilies: [] };

const WITNESSES: readonly Witness[] = [
  { kind: 'reaction', before: DEMO, after: withRecord(DEMO, 'reaction', 'rxn_ethene-hydration', (r) => ({ ...r, outcomes: (r.outcomes as Loose[]).map((o) => ({ ...o, selectivity: 'minor' })) })) },
  { kind: 'species', before: DEMO, after: withRecord(DEMO, 'species', 'spc_ethene', (s) => ({ ...s, classIds: [] })) },
  { kind: 'class', before: DEMO, after: withRecord(DEMO, 'class', 'cls_alcohols-primary', (c) => ({ ...c, parentIds: [] })) },
  { kind: 'reagent', before: DEMO, after: withRecord(DEMO, 'reagent', 'rgt_pcc', (r) => ({ ...r, families: [] })), request: { filters: { scopes: [], topicIds: [], reagentFamilies: ['oxidant'] as never } } },
  { kind: 'concept', before: conceptBase, after: withRecord(conceptBase, 'concept', 'cpt_markovnikov', review) },
  { kind: 'named_reaction', before: namedBase, after: withRecord(namedBase, 'named_reaction', 'nrx_aldol', review) },
  { kind: 'navigator_anchor', before: DEMO, after: withRecord(DEMO, 'navigator_anchor', 'anc_alkenes', (a) => ({ ...a, target: { kind: 'class', id: 'cls_alkanes' } })) },
  { kind: 'entity_display', before: DEMO, after: withRecord(DEMO, 'entity_display', 'edp_water', (d) => ({ ...d, target: { kind: 'species', id: 'spc_ethene' } })) },
  {
    kind: 'caveat',
    before: DEMO,
    after: withRecord(DEMO, 'caveat', 'cav_pcc-stops-at-aldehyde', (c) => ({ ...c, targets: [...(c.targets as Loose[]), { ref: { kind: 'class', id: 'cls_alcohols' }, as: 'context' }] })),
  },
  {
    kind: 'topic',
    before: DEMO,
    after: withRecord(DEMO, 'topic', 'top_alkenes', (t) => ({ ...t, parentId: 'top_goc' })),
    request: { filters: { scopes: [], topicIds: ['top_hydrocarbons'] as never, reagentFamilies: [] } },
  },
  { kind: 'topic_mapping', before: DEMO, after: withRecord(DEMO, 'topic_mapping', 'tmp_ethene-hydration-alkenes', (m) => ({ ...m, topicId: 'top_phenols' })), request: { filters: topicFilter } },
  {
    kind: 'exam_version',
    before: DEMO,
    after: withRecord(DEMO, 'exam_version', 'exv_jee-main-2026', (v) => ({
      ...v,
      units: (v.units as Loose[]).map((u) => ({ ...u, topicCoverage: (u.topicCoverage as Loose[]).map((c) => ({ ...c, coverage: 'included' })) })),
    })),
    request: { filters: { ...ALL_SCOPES, scopes: ['outside'] as never } },
  },
  {
    kind: 'exam_relevance',
    before: DEMO,
    after: withRecord(DEMO, 'exam_relevance', 'erl_beckmann-advanced', (r) => ({ ...r, scope: 'official' })),
    exam: 'advanced',
    request: { filters: { ...ALL_SCOPES, scopes: ['enrichment'] as never } },
  },
];

describe('navigator readsKinds: one witness per listed kind', () => {
  const listed = [...(navigatorProjection.readsKinds ?? [])];

  it('has exactly one witness for every kind in the list, and none for another kind', () => {
    expect(WITNESSES.map((w) => w.kind).sort()).toEqual([...listed].sort());
  });

  for (const w of WITNESSES) {
    it(`${w.kind}: an edit of one record changes the projection`, () => {
      expect(changedId(w)).toMatch(/^[a-z]{3}_/);
      const before = project(w.before, w.exam, w.request);
      const after = project(w.after, w.exam, w.request);
      expect(sameProjection(before, after)).toBe(false);
    });
  }
});

/** The ID of the record that differs between the two states of a witness (exactly one of `kind`). */
function changedId(w: Witness): string {
  const table = w.after.records[w.kind] as Record<string, unknown>;
  const was = w.before.records[w.kind] as Record<string, unknown>;
  const ids = Object.keys(table).filter((id) => was[id] !== undefined && JSON.stringify(was[id]) !== JSON.stringify(table[id]));
  if (ids.length !== 1) throw new Error(`witness for ${w.kind} must edit exactly one record, edited ${ids.length}`);
  return ids[0] as string;
}
