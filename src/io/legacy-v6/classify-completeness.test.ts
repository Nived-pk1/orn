/**
 * Step 3.11b, INV-23 over the WHOLE legacy JSON (MIGRATION.md §4.8): every scalar leaf of the v5 document (compounds, reactions and the
 * top level) is consumed by a mapping, kept in the `provenance.legacy.unmapped` of its own record (or in the report's
 * `documentUnmapped` when it belongs to no record), and every leaf the v4 → v5 port reports as dropped is counted as consumed by default
 * (empty) or kept under `unmapped.dropped` (with content). Nothing is deferred, nothing is invented. The leaves are enumerated by a walker
 * in THIS file; the mappers' traces are checked against the records by reading each consumed value back, and the checker itself is
 * tested against a hole and a false claim. Both fixtures, the quirk workbook and a hostile document; both hub decisions; the empty
 * and the demo context.
 */
import { describe, expect, it } from 'vitest';
import type { AnyRecord, Concept, Reaction } from '@/core/schema';
import { fold } from '@/core/text';
import { demoContext, demoRecords, mapClassified, type ClassifiedAll } from '@/test-support/legacy-classify-kit';
import { legacyFixture, legacyTestFixture } from '@/test-support/legacy-kit';
import { allConsumed, leavesOf, scalarsOf, unaccounted, unmappedOf, type Scalar, type Setup as KitSetup } from '@/test-support/legacy-completeness-kit';
import type { HubDecision } from './compound-map';
import type { LegacyMatchContext } from './match-context';


interface Setup extends KitSetup {
  readonly raw: unknown;
  readonly context?: LegacyMatchContext;
}

const hostile = {
  schemaVersion: 5,
  title: 'A title',
  'odd key': 7,
  extraTop: { a: [1, null, 'x', ''], b: {} },
  compounds: [
    { id: 'c1', name: 'Alkenes', nodeType: 'major', fgId: 'alkene' },
    { id: 'c2', name: 'Ethene', functionalGroups: ['alkene', 'weird group'] },
    { id: 'c3', name: 'Ethanol' },
  ],
  reactions: [
    {
      id: 'r1',
      name: 'One',
      participants: [{ ref: 'c2', role: 'substrate' }, { ref: 'c3', role: 'product', major: true }],
      transformation: { from: 'x'.repeat(1_500), to: 'B', fgFrom: ['alkene', 'alkene', 'nope', ''], fgTo: ['weird group'], bondChanges: { a: 1 }, extra: [1, { z: null }] },
      mechanism: { type: 'bad\u0001', summary: 'ok', junk: 1 },
      reactionType: 'x'.repeat(400),
      reactionFamily: 'Fam',
      reagentFamily: { obj: 1 },
      namedReaction: 5,
      chapter: ['a'],
      jee: { relevance: 'both', difficulty: 9, traps: ['t1', 'bad\u0000trap', 'y'.repeat(60_000)], prerequisites: ['p', 'p', 'bad\u0001'], concepts: ['Fam', 'c'], other: null },
      relatedReactions: ['r2', 'r99', 7, 'r1', '', 'r2'],
      collapseIntermediates: 0,
      dropped: 'a user field that happens to be called dropped',
      mystery: { a: [] },
    },
    { id: 'r2', name: 'Two', participants: [{ ref: 'c2', role: 'substrate' }, { ref: 'c3', role: 'product', major: true }], relatedReactions: ['r1'], jee: 3, transformation: 'str', mechanism: ['x'], chapter: 'Uncategorised', reactionType: 'Addition' },
    { id: 'r1', name: 'Repeated id', participants: [], relatedReactions: ['r1'], jee: { relevance: 'advanced', difficulty: '4', traps: 'one\ntwo', prerequisites: 'a, b', concepts: 'a' } },
    { name: 'no id', participants: [], chapter: 'Ch', namedReaction: 'NR', mechanism: { type: 'E2', summary: '   ' } },
  ],
};

const inputs: [string, () => unknown][] = [
  ['v6-demo-export.json', () => legacyFixture('v6-demo-export.json')],
  ['v4-sample.json', () => legacyFixture('v4-sample.json')],
  ['the quirk workbook', () => legacyTestFixture('quirks.json')],
  ['a hostile document', () => hostile],
];
const contexts: [string, () => LegacyMatchContext | undefined][] = [['the empty context', () => undefined], ['the demo context', () => demoContext()]];
const hubsAs = (raw: unknown, decision: HubDecision): Map<string, HubDecision> =>
  new Map(((raw as { compounds?: { id: string; nodeType?: string }[] }).compounds ?? []).flatMap((c) => (c.nodeType === 'major' ? [[c.id, decision] as [string, HubDecision]] : [])));
const setups = (): [string, Setup][] =>
  inputs.flatMap(([name, load]) =>
    contexts.flatMap(([contextName, makeContext]) =>
      (['class', 'species'] as const).map((decision): [string, Setup] => {
        const raw = load();
        const context = makeContext();
        return [`${name}, hubs as ${decision}, ${contextName}`, { raw, ...(context === undefined ? {} : { context }), decisions: hubsAs(raw, decision) }];
      }),
    ),
  );
const chain = (setup: Setup): Promise<ClassifiedAll> => mapClassified(setup.raw, { ...(setup.context === undefined ? {} : { context: setup.context }), ...(setup.decisions === undefined ? {} : { decisions: setup.decisions }) });

describe('every leaf of the whole legacy JSON is consumed, kept in its record, or consumed by default (INV-23)', () => {
  it.each(setups())('%s: nothing is unaccounted for, nothing is deferred, nothing is not imported', async (_name, setup) => {
    const run = await chain(setup);
    expect(unaccounted(run, setup, allConsumed(run))).toEqual([]);
    expect(run.classification.deferred).toEqual([]);
    expect(run.classification.unhandledDropped).toEqual([]);
    expect(run.report.build().notImported).toEqual([]);
  });

  it('the checker is real: a trace with a hole is caught (a compound leaf, a reaction leaf, a classification leaf, the top level)', async () => {
    const setup: Setup = { raw: legacyFixture('v6-demo-export.json') };
    const run = await chain(setup);
    const holed = allConsumed(run);
    for (const path of ['compounds[0].name', 'reactions[0].participants[0].role', 'reactions[0].jee.difficulty', 'reactions[3].chapter', 'schemaVersion']) expect(holed.delete(path), path).toBe(true);
    expect(unaccounted(run, setup, holed)).toEqual([
      'compounds[0].name = "Alkanes"',
      'reactions[0].participants[0].role = "substrate"',
      'reactions[0].jee.difficulty = 1',
      'reactions[3].chapter = "Aldehydes, Ketones & Carboxylic Acids"',
      'schemaVersion = 5',
    ]);
    expect(unaccounted(run, setup, allConsumed(run))).toEqual([]);
  });

  it('the checker is real: a dropped leaf that nobody counted or kept is caught', async () => {
    const setup: Setup = { raw: legacyTestFixture('quirks.json') };
    const run = await chain(setup);
    const record = run.classification.records.reaction[2] as Reaction;
    const legacy = record.provenance.legacy as { system: string; unmapped?: { dropped?: Record<string, unknown> } };
    const before = legacy.unmapped?.dropped?.['jee.difficulty'];
    expect(before).toBe('3');
    const stripped = { ...record, provenance: { ...record.provenance, legacy: { ...legacy, unmapped: { ...(legacy.unmapped as object), dropped: {} } } } } as Reaction;
    const reaction = run.classification.records.reaction.map((r, i) => (i === 2 ? stripped : r));
    const lost = { ...run, classification: { ...run.classification, records: { ...run.classification.records, reaction } } } as ClassifiedAll;
    expect(unaccounted(lost, setup, allConsumed(lost)).some((m) => m.startsWith('dropped reactions[2].jee.difficulty'))).toBe(true);
  });

  it('the top-level fields that belong to no record are in the report (documentUnmapped), the dropped schemaVersion too', async () => {
    const run = await chain({ raw: legacyTestFixture('quirks.json') });
    expect(run.classification.documentUnmapped).toEqual({ title: 'Quirk workbook', unknownTopLevel: { kept: [1, 2, { deep: true }] }, 'dropped.schemaVersion': 4 });
    expect(run.report.build().documentUnmapped).toEqual(run.classification.documentUnmapped);
    expect(run.report.build().preservedUnmappedFields).toMatchObject({ 'document.title': 1, 'document.unknownTopLevel': 1, 'document.dropped.schemaVersion': 1 });
    expect(run.report.build().notes.DOCUMENT_VALUE_KEPT).toBe(3);
    const hostileRun = await chain({ raw: hostile });
    expect(hostileRun.classification.documentUnmapped).toEqual({ title: 'A title', 'odd key': 7, extraTop: { a: [1, null, 'x', ''], b: {} } });
  });

  it('empty dropped leaves are counted by generalized path, once per occurrence (quirk workbook)', async () => {
    const run = await chain({ raw: legacyTestFixture('quirks.json') });
    const counted = run.report.build().consumedByDefault;
    expect(counted['reactions[*].coProducts[*]']).toBe(2);
    expect(counted['reactions[*].jee.concepts[*]']).toBe(1);
    expect(counted['reactions[*].name']).toBe(1);
  });

  it('nothing is invented: every kept scalar of a reaction is a leaf of that reaction (v5 data) or one of its dropped leaves', async () => {
    for (const [name, setup] of setups()) {
      const run = await chain(setup);
      run.classification.records.reaction.forEach((reaction, index) => {
        const unmapped = structuredClone(unmappedOf(reaction) ?? {}) as Record<string, unknown>;
        const conditions = unmapped.conditions as Record<string, unknown> | undefined;
        if (conditions !== undefined) delete conditions.overflowOther; // derived entries, not leaves
        const pool: Scalar[] = [
          ...leavesOf(run.data.reactions[index]).map((leaf) => leaf.value),
          ...run.normalized.dropped.filter((leaf) => leaf.path.startsWith(`reactions[${index}]`)).map((leaf) => leaf.value),
        ];
        for (const scalar of scalarsOf(unmapped)) {
          const at = pool.findIndex((candidate) => candidate === scalar);
          expect(at, `${name}: ${reaction.id}: ${JSON.stringify(scalar)}`).toBeGreaterThanOrEqual(0);
          pool.splice(at, 1);
        }
      });
      const documentPool = [...leavesOf(run.data).map((leaf) => leaf.value), ...run.normalized.dropped.map((leaf) => leaf.value)];
      for (const scalar of scalarsOf(run.classification.documentUnmapped)) expect(documentPool.includes(scalar), `${name}: ${JSON.stringify(scalar)}`).toBe(true);
    }
  });
});

/** Reads every consumed classification leaf back out of the records. */
function readBack(run: ClassifiedAll, context: LegacyMatchContext | undefined): string[] {
  const wrong: string[] = [];
  const records = new Map<string, AnyRecord>([...(context === undefined ? [] : demoRecords()), ...run.all].map((record) => [record.id as string, record] as const));
  const names = (id: string): string[] => {
    const record = records.get(id) as (Concept & { aliases?: string[] }) | undefined;
    return record === undefined ? [] : [record.name, ...(record.aliases ?? [])].map(fold);
  };
  const consumed = allConsumed(run);
  const reactions = run.classification.records.reaction;
  const c = run.classification.records;
  for (const leaf of leavesOf({ reactions: run.data.reactions })) {
    if (!consumed.has(leaf.path)) continue;
    const [, position, field, sub, k] = leaf.segments as [string, number, string, string | undefined, number | undefined];
    const reaction = reactions[position] as Reaction;
    const fail = (why: string): void => void wrong.push(`${leaf.path} = ${JSON.stringify(leaf.value)}: ${why}`);
    const text = typeof leaf.value === 'string' ? leaf.value : undefined;
    const hasName = (ids: readonly string[]): boolean => text !== undefined && ids.some((id) => names(id).includes(fold(text)));
    if (field === 'transformation' && (sub === 'from' || sub === 'to') && text !== undefined && text !== '' && !(reaction.generalizedEquation ?? '').includes(text)) fail('not in generalizedEquation');
    if (field === 'transformation' && (sub === 'fgFrom' || sub === 'fgTo') && k !== undefined && text !== undefined && text !== '') {
      const classId = run.compounds.functionalGroupClass.get(text);
      const linked = reaction.transformationIds.some((id) => (c.transformation.find((t) => t.id === id)?.[sub === 'fgFrom' ? 'fromClassIds' : 'toClassIds'] ?? []).includes(classId as never));
      if (!linked) fail('the class of the group is not in the reaction\'s transformation');
    }
    if (field === 'transformation' && sub === 'bondChanges' && text !== undefined && text !== '' && !reaction.transformationIds.some((id) => c.transformation.find((t) => t.id === id)?.bondChangeSummary === text)) fail('not a bondChangeSummary');
    if (field === 'mechanism' && sub === 'type' && text !== undefined && text !== '' && !hasName(reaction.mechanismClasses.map((m) => m.conceptId))) fail('no such concept in mechanismClasses');
    if (field === 'mechanism' && sub === 'summary' && text !== undefined && text.trim() !== '' && !reaction.mechanismIds.some((id) => c.mechanism.find((m) => m.id === id)?.summary === text)) fail('not the summary of the reaction\'s mechanism');
    if (field === 'reactionType' && text !== undefined && text !== '' && !hasName(reaction.reactionTypes.map((t) => t.conceptId))) fail('no such concept in reactionTypes');
    if (field === 'reactionFamily' && text !== undefined && text !== '' && !hasName(reaction.conceptIds)) fail('no such concept in conceptIds');
    if (field === 'namedReaction' && text !== undefined && text !== '' && !hasName(reaction.namedReactionIds)) fail('no such named reaction');
    if (field === 'chapter' && text !== undefined && text !== 'Uncategorised' && text !== '' && !hasName(c.topic_mapping.filter((m) => m.target.id === reaction.id).map((m) => m.topicId))) fail('no topic mapping to a topic of that name');
    if (field === 'chapter' && text === 'Uncategorised' && c.topic_mapping.some((m) => m.target.id === reaction.id)) fail('"Uncategorised" got a mapping');
    if (field === 'jee' && sub === 'difficulty' && typeof leaf.value === 'number' && leaf.value !== 0 && reaction.difficulty !== leaf.value) fail('not the difficulty');
    if (field === 'jee' && sub === 'traps' && text !== undefined && text !== '' && !c.caveat.some((v) => v.statement === text && v.targets.some((t) => t.ref.id === reaction.id))) fail('no caveat with that statement on the reaction');
    if (field === 'jee' && sub === 'prerequisites' && text !== undefined && text !== '' && !hasName(reaction.prerequisiteConceptIds)) fail('no such concept in prerequisiteConceptIds');
    if (field === 'jee' && sub === 'concepts' && text !== undefined && text !== '' && !hasName(reaction.conceptIds)) fail('no such concept in conceptIds');
    if (field === 'jee' && sub === 'relevance' && text !== undefined && text !== '' && !c.exam_relevance.some((e) => e.target.id === reaction.id)) fail('no exam_relevance on the reaction');
    if (field === 'relatedReactions' && text !== undefined && text !== '' && !c.relationship.some((r) => [r.from.id, r.to.id].includes(reaction.id))) fail('no relationship on the reaction');
  }
  if (consumed.has('schemaVersion') && run.data.schemaVersion !== 5) wrong.push('schemaVersion consumed but not 5');
  return wrong;
}

describe('the trace is read back against the records', () => {
  it.each(setups())('%s: each consumed classification value is really in the output', async (_name, setup) => {
    const run = await chain(setup);
    expect(readBack(run, setup.context)).toEqual([]);
  });

  it('the read-back is real: a false claim is caught', async () => {
    const run = await chain({ raw: legacyFixture('v6-demo-export.json') });
    const lie = (change: (r: Record<string, unknown>) => void): string[] => {
      const data = structuredClone(run.data) as unknown as { reactions: Record<string, unknown>[] };
      change(data.reactions[0] as Record<string, unknown>);
      return readBack({ ...run, data: data as never }, undefined);
    };
    expect(lie((r) => void ((r.jee as Record<string, unknown>).difficulty = 4))).toEqual(['reactions[0].jee.difficulty = 4: not the difficulty']);
    expect(lie((r) => void (r.reactionType = 'not a type'))).toEqual(['reactions[0].reactionType = "not a type": no such concept in reactionTypes']);
    expect(lie((r) => void (r.chapter = 'Nowhere'))).toEqual(['reactions[0].chapter = "Nowhere": no topic mapping to a topic of that name']);
    expect(lie((r) => void ((r.jee as Record<string, unknown>).traps = ['a trap nobody made']))).toEqual(['reactions[0].jee.traps[0] = "a trap nobody made": no caveat with that statement on the reaction']);
    expect(lie(() => undefined)).toEqual([]);
  });
});
