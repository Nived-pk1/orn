/**
 * Step 3.11b: §4.9 quirk r22 (the unanchored test reaction with chapter "Uncategorised" and no relevance), strict L1 for every record of
 * the whole mapped set of both fixtures, the quirk workbook and a hostile document, no L1-L3 ERROR for the mapped set (with the empty
 * context on its own, and merged with data/seed/demo.orn.json when the context is the demo), pinned warning / info counts, the
 * hostile-document behaviour of the classification fields, determinism and the clock. Expected values are typed here.
 */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { createScopeOf } from '@/core/graph';
import { contextOf } from '@/test-support/graph-state';
import { AnyRecordSchema, type Reaction } from '@/core/schema';
import { validator } from '@/core/validation';
import { demoContext, demoRecords, mapClassified, stateWithDemo, type ChainOptions, type ClassifiedAll } from '@/test-support/legacy-classify-kit';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { stateOfRecords } from '@/test-support/legacy-map-kit';
import { createReportBuilder } from './report';
import type { HubDecision } from './compound-map';
import { mapLegacyClassification } from './classify-map';

const demo = (options: ChainOptions = {}) => mapClassified(legacyFixture('v6-demo-export.json'), options);

describe('§4.9 r22: the unanchored test reaction, chapter "Uncategorised", no relevance', () => {
  it('is imported without a topic mapping and without an exam relevance, with or without the demo context', async () => {
    for (const options of [{}, { context: demoContext() }] as ChainOptions[]) {
      const all = await demo(options);
      const index = all.data.reactions.findIndex((r) => r.id === 'r22');
      expect(index).toBeGreaterThanOrEqual(0);
      const r22 = all.classification.records.reaction[index] as Reaction;
      expect(r22.id).toBe('rxn_v6-r22');
      expect(all.classification.records.topic_mapping.filter((m) => m.target.id === r22.id)).toEqual([]);
      expect(all.classification.records.exam_relevance.filter((e) => e.target.id === r22.id)).toEqual([]);
      expect(all.classification.records.topic.map((t) => t.name)).not.toContain('Uncategorised');
      expect(r22.provenance.legacy?.unmapped).not.toHaveProperty('chapter');
      expect(r22.provenance.legacy?.unmapped).not.toHaveProperty('jee');
      expect(r22.difficulty).toBeUndefined();
      expect(r22.review.reasons.some((x) => x.includes('chapter') || x.includes('relevance'))).toBe(false);
    }
  });

  it('the derived exam scope (with the demo dataset): r22 is unmapped, an ordinary reaction is official through the imported relevance', async () => {
    const all = await demo({ context: demoContext() });
    const { indexes } = contextOf(stateWithDemo(all.all));
    for (const [exam, version] of [['exm_jee-main', 'exv_jee-main-2026'], ['exm_jee-advanced', 'exv_jee-advanced-2026']]) {
      const scopeOf = createScopeOf(indexes, exam as never, version as never);
      expect(scopeOf({ kind: 'reaction', id: 'rxn_v6-r22' } as never), `${exam} r22`).toBe('unmapped');
      expect(scopeOf({ kind: 'reaction', id: 'rxn_v6-r1' } as never), `${exam} r1`).toBe('official');
    }
  });

  it('r22 is the only demo reaction without a chapter and the only one without a relevance flag', async () => {
    const all = await demo();
    const without = all.data.reactions.filter((r) => r.chapter === 'Uncategorised').map((r) => r.id);
    expect(without).toEqual(['r22']);
    expect(all.classification.records.topic_mapping).toHaveLength(21);
    expect(all.classification.records.reaction.filter((r) => r.difficulty === undefined).map((r) => r.id)).toEqual(['rxn_v6-r22']);
  });
});

const fixtures: [string, () => unknown][] = [
  ['v6-demo-export.json', () => legacyFixture('v6-demo-export.json')],
  ['v4-sample.json', () => legacyFixture('v4-sample.json')],
  ['the quirk workbook', () => legacyTestFixture('quirks.json')],
];
const decisionsFor = (raw: unknown, decision: HubDecision): Map<string, HubDecision> =>
  new Map(((raw as { compounds: { id: string; nodeType?: string }[] }).compounds ?? []).flatMap((c) => (c.nodeType === 'major' ? [[c.id, decision] as [string, HubDecision]] : [])));

const findingsOf = (all: ClassifiedAll, withDemo: boolean) => {
  const state = withDemo ? stateWithDemo(all.all) : stateOfRecords(all.all);
  return validator.validateAll(state, coreIndexEngine.build(state, 1));
};
const countsOf = (findings: ReturnType<typeof findingsOf>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const f of findings) out[`${f.severity}:${f.ruleId}`] = (out[`${f.severity}:${f.ruleId}`] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

describe('every mapped record passes strict L1 and the mapped set has no L1-L3 ERROR', () => {
  it.each(fixtures.flatMap(([name, load]) => (['class', 'species'] as const).flatMap((decision) => [true, false].map((withContext): [string, () => unknown, HubDecision, boolean] => [name, load, decision, withContext]))))(
    '%s, hubs as %s, demo context %s',
    async (_name, load, decision, withContext) => {
      const raw = load();
      const all = await mapClassified(raw, { decisions: decisionsFor(raw, decision), ...(withContext ? { context: demoContext() } : {}) });
      for (const record of all.all) {
        const parsed = AnyRecordSchema.safeParse(record);
        expect(parsed.success, `${record.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2))}`).toBe(true);
      }
      const errors = findingsOf(all, withContext).filter((f) => f.severity === 'error');
      expect(errors.map((f) => [f.ruleId, f.subject.id, f.message])).toEqual([]);
    },
  );

  it('a hostile document: strict L1 and no L1-L3 ERROR too', async () => {
    const hostile = {
      schemaVersion: 5,
      title: 't',
      compounds: [{ id: 'c1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' }, { id: 'c2', name: 'Ethene' }, { id: 'c3', name: 'Ethanol' }],
      reactions: [
        { id: 'r1', name: 'One', participants: [{ ref: 'c2', role: 'substrate' }, { ref: 'c3', role: 'product', major: true }], transformation: { from: 'a', to: 'b', fgFrom: ['alkene'], fgTo: ['alkene'], bondChanges: 'x' }, mechanism: { type: 'SN2', summary: 's' }, reactionType: 'RT', reactionFamily: 'RF', namedReaction: 'NR', chapter: 'Ch', jee: { relevance: 'both', difficulty: 2, traps: ['t'], prerequisites: ['p'], concepts: ['c'] }, relatedReactions: ['r2', 'r1', 'r9'] },
        { id: 'r2', name: 'Two', participants: [{ ref: 'c2', role: 'substrate' }, { ref: 'c3', role: 'product', major: true }], relatedReactions: ['r1'], chapter: 'Ch', jee: { relevance: 'main' } },
      ],
    };
    for (const context of [undefined, demoContext()]) {
      const all = await mapClassified(hostile, context === undefined ? {} : { context });
      for (const record of all.all) expect(AnyRecordSchema.safeParse(record).success, record.id).toBe(true);
      expect(findingsOf(all, context !== undefined).filter((f) => f.severity === 'error')).toEqual([]);
    }
  });
});

describe('pinned findings of the whole mapped set (warnings and INFO counts, both contexts)', () => {
  it('v6-demo-export.json, empty context: 1 warning, no error; the rest is INFO / review', async () => {
    const counts = countsOf(findingsOf(await demo(), false));
    expect(counts).toEqual({
      'info:MEC-001': 21,
      'info:RXN-016': 22,
      'info:SPC-004': 4,
      'review_required:RVW-001': 107,
      'review_required:RXN-015': 8,
      'warning:RXN-021': 1,
    });
  });

  it('v6-demo-export.json, demo context (merged with the demo dataset)', async () => {
    const all = await demo({ context: demoContext() });
    const counts = countsOf(findingsOf(all, true));
    expect(Object.keys(counts).filter((k) => k.startsWith('error:'))).toEqual([]);
    expect(counts['warning:RXN-021']).toBe(1); // r12, from the import
    expect(counts['info:MEC-001']).toBe(21);
    expect(counts['review_required:RXN-015']).toBe(8);
  });

  it('v4-sample.json, empty context', async () => {
    const counts = countsOf(findingsOf(await mapClassified(legacyFixture('v4-sample.json')), false));
    expect(counts).toEqual({
      'info:MEC-001': 2,
      'info:RVW-002': 1,
      'info:RXN-016': 6,
      'info:SPC-004': 5,
      'review_required:RVW-001': 20,
      'review_required:RXN-015': 3,
      'warning:SPC-001': 2,
    });
  });
});

describe('every kind-specific reference names a concept of the matching kind', () => {
  it.each(fixtures.flatMap(([name, load]) => [true, false].map((withContext): [string, () => unknown, boolean] => [name, load, withContext])))('%s, demo context %s', async (_name, load, withContext) => {
    const all = await mapClassified(load(), withContext ? { context: demoContext() } : {});
    const kindOf = new Map(all.all.filter((r) => r.kind === 'concept').map((r) => [r.id as string, (r as { conceptKind: string }).conceptKind] as const));
    if (withContext) for (const r of demoRecords()) if (r.kind === 'concept') kindOf.set(r.id as string, (r as { conceptKind: string }).conceptKind);
    let checked = 0;
    for (const r of all.classification.records.reaction) {
      for (const t of r.reactionTypes) { expect(kindOf.get(t.conceptId)).toBe('reaction_type'); checked += 1; }
      for (const m of r.mechanismClasses) { expect(kindOf.get(m.conceptId)).toBe('mechanism_class'); checked += 1; }
    }
    const family = new Set(all.data.reactions.flatMap((r) => (typeof r.reactionFamily === 'string' && r.reactionFamily !== '' ? [r.reactionFamily.toLowerCase()] : [])));
    for (const r of all.classification.records.reaction) for (const id of r.conceptIds) if (family.has((all.classification.records.concept.find((c) => c.id === id)?.name ?? '').toLowerCase()) && all.classification.records.concept.some((c) => c.id === id && c.conceptKind === 'reaction_family')) checked += 1;
    if (_name.startsWith('v6-demo')) expect(checked).toBeGreaterThan(20); // the v4 sample has no such fields
  });
});

describe('the classification result', () => {
  it('nothing is deferred, no dropped leaf is unhandled, and the reaction records keep their IDs and order', async () => {
    for (const [, load] of fixtures) {
      const all = await mapClassified(load());
      expect(all.classification.deferred).toEqual([]);
      expect(all.classification.unhandledDropped).toEqual([]);
      expect(all.classification.records.reaction.map((r) => r.id)).toEqual(all.reactions.records.reaction.map((r) => r.id));
      expect(all.report.build().notImported).toEqual([]);
    }
  });

  it('a deferred path the step does not handle is returned, never dropped silently (the honest leftover list)', async () => {
    const all = await demo();
    const extra = ['reactions[0].notAField.leaf', 'reactions[999].jee.difficulty'];
    const result = mapLegacyClassification({ data: all.data, ids: all.ids, compounds: all.compounds, reactions: { ...all.reactions, deferred: [...all.reactions.deferred, ...extra] } }, { now: () => '2026-09-30T00:00:00.000Z' });
    expect(result.ok && result.deferred).toEqual(extra);
  });

  it('the 3.11a records are not mutated: they still have empty classification fields after the step', async () => {
    const all = await demo();
    for (const before of all.reactions.records.reaction) {
      expect([before.namedReactionIds, before.transformationIds, before.reactionTypes, before.mechanismClasses, before.mechanismIds, before.conceptIds, before.prerequisiteConceptIds]).toEqual([[], [], [], [], [], [], []]);
      expect(before.difficulty).toBeUndefined();
    }
  });

  it('only fields of the classification block change on a reaction: everything else equals the 3.11a record', async () => {
    const all = await demo();
    all.classification.records.reaction.forEach((after, i) => {
      const before = all.reactions.records.reaction[i] as Reaction;
      const strip = (r: Reaction) => {
        const { namedReactionIds, transformationIds, reactionTypes, mechanismClasses, mechanismIds, conceptIds, prerequisiteConceptIds, difficulty, generalizedEquation, provenance, review, ...rest } = r;
        void [namedReactionIds, transformationIds, reactionTypes, mechanismClasses, mechanismIds, conceptIds, prerequisiteConceptIds, difficulty, generalizedEquation, provenance, review];
        return rest;
      };
      expect(strip(after)).toEqual(strip(before));
      expect(after.review.lifecycle).toBe(before.review.lifecycle);
      expect(after.review.reasons.slice(0, before.review.reasons.length)).toEqual(before.review.reasons);
      expect(after.provenance.origin).toBe('legacy_import');
      expect(after.provenance.createdAt).toBe(before.provenance.createdAt);
    });
  });

  it('the shared report counts every created record and lists every review reason of the new records', async () => {
    const all = await demo({ context: demoContext() });
    const report = all.report.build();
    const c = all.classification.records;
    expect(report.createdCounts).toMatchObject({ concept: c.concept.length, named_reaction: c.named_reaction.length, topic: c.topic.length, caveat: 18, relationship: 6, mechanism: 21, exam_relevance: 42, reaction: 22 });
    expect(report.createdCounts.transformation).toBeUndefined();
    const items = report.reviewItems;
    for (const record of [...c.concept, ...c.named_reaction, ...c.topic, ...c.exam_relevance]) {
      for (const reason of record.review.reasons) expect(items.some((i) => i.subject.id === record.id && i.reason === reason), `${record.id}: ${reason}`).toBe(true);
    }
    for (const reaction of c.reaction) {
      const before = all.reactions.records.reaction.find((r) => r.id === reaction.id) as Reaction;
      for (const reason of reaction.review.reasons.slice(before.review.reasons.length)) expect(items.some((i) => i.subject.id === reaction.id && i.reason === reason)).toBe(true);
    }
  });
});

describe('hostile classification fields', () => {
  const hostile = {
    schemaVersion: 5,
    compounds: [{ id: 'c1', name: 'A' }, { id: 'c2', name: 'B' }],
    reactions: [
      {
        id: 'r1', name: 'One', participants: [{ ref: 'c1', role: 'substrate' }, { ref: 'c2', role: 'product', major: true }],
        dropped: 'a user field called dropped', collapseIntermediates: 0,
        jee: { traps: ['ok', 'bad\u0000trap'], relevance: 5 }, mechanism: { type: 'bad\u0001', summary: '  ', foo: 1 }, transformation: { from: 'x'.repeat(1_500), bondChanges: [1] },
      },
    ],
  };

  it('kept values, reasons and the suffix for a user field that shares the name of the port\'s `dropped` group', async () => {
    const all = await mapClassified(hostile);
    const reaction = all.classification.records.reaction[0] as Reaction;
    const unmapped = reaction.provenance.legacy?.unmapped as Record<string, unknown>;
    expect(unmapped.dropped).toBe('a user field called dropped');
    expect(unmapped['dropped#3.11b']).toEqual({ collapseIntermediates: 0 });
    expect(unmapped.jee).toEqual({ traps: ['bad\u0000trap'], relevance: 5 });
    expect(unmapped.mechanism).toEqual({ type: 'bad\u0001', summary: '  ', foo: 1 });
    expect(unmapped.transformation).toEqual({ from: 'x'.repeat(1_500), bondChanges: [1] });
    expect(all.classification.records.caveat.map((c) => c.statement)).toEqual(['ok']);
    expect(reaction.review.reasons.filter((r) => r.includes('1 legacy value(s) were changed or dropped'))).toHaveLength(1);
  });
});

describe('determinism, clock and the shared report', () => {
  it('the same input and context give the same records and report, twice', async () => {
    const a = await mapClassified(legacyFixture('v6-demo-export.json'), { context: demoContext() });
    const b = await mapClassified(legacyFixture('v6-demo-export.json'), { context: demoContext() });
    expect(JSON.stringify(a.classification.records)).toBe(JSON.stringify(b.classification.records));
    expect(JSON.stringify(a.report.build())).toBe(JSON.stringify(b.report.build()));
    expect(JSON.stringify(a.classification.reagentFamilies)).toBe(JSON.stringify(b.classification.reagentFamilies));
  });

  it('the injected clock stamps every created record; a clock that is not a UTC ISO timestamp is refused as a value, nothing is mapped', async () => {
    const all = await mapClassified(legacyFixture('v4-sample.json'), { classify: { now: () => '2031-01-02T03:04:05.000Z' } });
    const c = all.classification.records;
    for (const record of [...c.mechanism, ...c.concept, ...c.named_reaction, ...c.topic, ...c.caveat, ...c.transformation]) expect(record.provenance.createdAt).toBe('2031-01-02T03:04:05.000Z');
    expect(all.classification.records.reaction[0]?.provenance.createdAt).toBe('2026-09-30T00:00:00.000Z'); // the 3.11a record keeps its own stamp
    const shared = createReportBuilder(5);
    const refused = mapLegacyClassification({ data: all.data, ids: all.ids, compounds: all.compounds, reactions: all.reactions }, { now: () => 'yesterday', report: shared });
    expect(refused).toMatchObject({ ok: false, code: 'INVALID_CLOCK' });
    expect(shared.build().createdCounts).toEqual({});
  });

  it('a successful run is absorbed into the caller\'s builder; the run\'s own report is the classification part', async () => {
    const all = await mapClassified(legacyFixture('v4-sample.json'));
    const own = all.classification.report;
    const shared = all.report.build();
    expect(own.createdCounts.mechanism).toBe(2);
    expect(own.createdCounts.species).toBeUndefined();
    expect(shared.createdCounts.mechanism).toBe(2);
    expect(shared.createdCounts.species).toBeGreaterThan(0);
  });
});
