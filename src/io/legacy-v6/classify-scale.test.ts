/**
 * Step 3.11b: one-off conversion, so no benchmark (docs/PROGRESS.md says so) - but the scale sanity test of steps 3.10/3.11a extended
 * to the classification step: 5,000 reactions with shared concepts, named reactions, chapters, transformations, traps, related pairs
 * and exam relevance, matched against a context of thousands of records. "Not a scan" is asserted without a clock: every reaction and
 * every context record is a counting Proxy, the reads per reaction must not grow with the size of the document, and the context is read
 * exactly once, whatever the number of reactions (its lookups are Maps).
 */
import { describe, expect, it } from 'vitest';
import { fold } from '@/core/text';
import { createDocumentIds, mapLegacyClassification, mapLegacyCompounds, mapLegacyReactions, type LegacyMatchContext, type LegacyV5Data, type MatchRecord } from './index';
import { FIXED_NOW } from '@/test-support/legacy-map-kit';

interface Counter {
  reads: number;
}

function counting<T extends object>(target: T, counter: Counter): T {
  return new Proxy(target, {
    get(t, key, receiver) {
      counter.reads += 1;
      const value = Reflect.get(t, key, receiver) as unknown;
      return typeof value === 'object' && value !== null ? counting(value, counter) : value;
    },
    has: (t, key) => ((counter.reads += 1), Reflect.has(t, key)),
    ownKeys: (t) => ((counter.reads += 1), Reflect.ownKeys(t)),
    getOwnPropertyDescriptor: (t, key) => ((counter.reads += 1), Reflect.getOwnPropertyDescriptor(t, key)),
  });
}

/** `noise` counts the reads of context records nothing in the document matches: only building the index may touch them, once. */
const contextOf = (size: number, noise: Counter): LegacyMatchContext => {
  const records: MatchRecord[] = [
    { id: 'exm_main', kind: 'exam', names: [fold('JEE Main')] },
    { id: 'exm_adv', kind: 'exam', names: [fold('JEE Advanced')] },
    ...Array.from({ length: 5 }, (_, k): MatchRecord => ({ id: `cpt_fam${k}`, kind: 'concept', conceptKind: 'reaction_family', names: [fold(`family ${k}`)] })),
    ...Array.from({ length: 6 }, (_, k): MatchRecord => ({ id: `top_ch${k}`, kind: 'topic', parentId: 'top_root', names: [fold(`Chapter ${k}`)] })),
    ...Array.from({ length: size }, (_, k): MatchRecord =>
      counting(k % 3 === 0 ? { id: `nrx_c${k}`, kind: 'named_reaction', names: [fold(`context named ${k}`)] } : ({ id: `cpt_c${k}`, kind: 'concept', conceptKind: 'general', names: [fold(`context concept ${k}`)] } as MatchRecord), noise),
    ),
  ];
  return { records };
};

function documentOf(size: number, counter: Counter): LegacyV5Data {
  const compounds = Array.from({ length: size }, (_, i) => ({
    tags: [], image: '', smiles: '', formula: '', properties: '', node: true, functionalGroups: [], compoundClass: '', acidBase: '', aromaticity: '', stereo: '',
    nodeType: i < 2 ? 'major' : 'auto', genericFormula: '', fgId: i === 0 ? 'alkene' : i === 1 ? 'alcohol' : '', jee: { level: '', notes: '' }, id: `c${i}`, name: `Compound ${i}`,
  }));
  const part = (role: string, ref: string) => ({ ref, label: '', role, major: role === 'product', note: '', image: '' });
  const groups = [['alkene'], ['alcohol'], ['alkene', 'alcohol']];
  const reactions = Array.from({ length: size }, (_, i) =>
    counting(
      {
        id: `r${i}`,
        name: `Reaction ${i}`,
        participants: [part('substrate', `c${i}`), part('product', `c${(i * 7) % size}`)],
        conditions: { text: '', temperature: '', medium: '', phase: '', strength: '', heat: false, light: false, pressure: '', atmosphere: '', anhydrous: false },
        transformation: { from: `from ${i}`, to: `to ${i}`, fgFrom: groups[i % 3], fgTo: groups[(i + 1) % 3], bondChanges: `bond ${i % 4}` },
        mechanism: { type: `mech ${i % 10}`, summary: `summary ${i}` },
        reactionType: `type ${i % 20}`,
        reactionFamily: `family ${i % 15}`,
        reagentFamily: `rf ${i % 8}`,
        namedReaction: `NR ${i % 30}`,
        chapter: i % 50 === 0 ? 'Uncategorised' : `Chapter ${i % 12}`,
        tags: ['t'],
        jee: { relevance: i % 3 === 0 ? 'both' : 'main', difficulty: 1 + (i % 5), traps: [`trap a ${i}`, `trap b ${i}`], prerequisites: [`pre ${i % 25}`], concepts: [`con ${i % 25}`, `type ${i % 20}`] },
        relatedReactions: [`r${(i + 1) % size}`, `r${(i * 13 + 5) % size}`, `nothing ${i % 3}`],
        collapseIntermediates: true,
      },
      counter,
    ),
  );
  return { schemaVersion: 5 as const, compounds, reactions } as unknown as LegacyV5Data;
}

async function run(size: number, contextSize: number) {
  const reactionReads: Counter = { reads: 0 };
  const contextReads: Counter = { reads: 0 }; // reads of context records nothing matches
  const data = documentOf(size, reactionReads);
  const ids = createDocumentIds(data);
  const compounds = await mapLegacyCompounds({ data, dropped: [], assignedIds: [], ids }, { now: () => FIXED_NOW });
  if (!compounds.ok) throw new Error(compounds.message);
  const reactions = await mapLegacyReactions({ data, assignedIds: [], ids, compounds }, { now: () => FIXED_NOW });
  if (!reactions.ok) throw new Error(reactions.message);
  const context = contextOf(contextSize, contextReads);
  contextReads.reads = 0; // making the context is not part of the step
  reactionReads.reads = 0;
  const mapped = mapLegacyClassification({ data, ids, compounds, reactions }, { now: () => FIXED_NOW, context });
  if (!mapped.ok) throw new Error(mapped.message);
  return { mapped, readsPerReaction: reactionReads.reads / size, contextReads: contextReads.reads };
}

/** The counting Proxy makes these runs take seconds; the assertions count reads and never time, so the limit is only a guard against a hang. */
const SLOW = 120_000;

describe('scale sanity (one-off conversion, no benchmark)', () => {
  it('5,000 reactions are classified completely: shared records once, unique IDs, nothing left over', async () => {
    const { mapped } = await run(5_000, 3_000);
    const r = mapped.records;
    expect(r.reaction).toHaveLength(5_000);
    expect(r.named_reaction).toHaveLength(30);
    expect(r.topic.map((t) => t.name).sort()).toEqual(['Chapter 10', 'Chapter 11', 'Chapter 6', 'Chapter 7', 'Chapter 8', 'Chapter 9']); // Chapter 0-5 are in the context
    expect(r.topic_mapping).toHaveLength(5_000 - 100); // "Uncategorised" every 50th
    expect(r.mechanism).toHaveLength(5_000);
    expect(r.caveat).toHaveLength(10_000);
    expect(r.transformation).toHaveLength(3); // the FROM / TO pairs (i % 3, (i + 1) % 3): three different class-set pairs
    expect(r.concept).toHaveLength(20 + 10 + 10 + 25 + 25); // type, family 5-14, mech, pre, con (family 0-4 are in the context)
    expect(r.exam_relevance).toHaveLength(1_667 * 2 + 3_333); // both for i % 3 == 0, main otherwise
    expect(r.relationship.length).toBeGreaterThan(5_000);
    expect(mapped.reagentFamilies).toHaveLength(8);
    expect(mapped.deferred).toEqual([]);
    expect(mapped.report.notImported).toEqual([]);
    const all = [...r.reaction, ...r.concept, ...r.named_reaction, ...r.topic, ...r.topic_mapping, ...r.transformation, ...r.mechanism, ...r.caveat, ...r.relationship, ...r.exam_relevance].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
  }, SLOW);

  it('lookups are maps, not scans: reads per reaction do not grow with the size of the document', async () => {
    const small = await run(1_000, 3_000);
    const large = await run(5_000, 3_000);
    expect(small.readsPerReaction).toBeGreaterThan(20); // the counter works
    expect(large.readsPerReaction).toBeLessThan(400); // bounded by a constant (a scan of 5,000 others would be in the thousands)
    expect(Math.abs(large.readsPerReaction - small.readsPerReaction) / small.readsPerReaction).toBeLessThan(0.05);
  }, SLOW);

  it('the context is indexed once, whatever the number of reactions: reads of records nothing matches depend on the context size only', async () => {
    const few = await run(500, 3_000);
    const many = await run(4_000, 3_000);
    const bigger = await run(500, 6_000);
    expect(few.contextReads).toBeGreaterThan(3_000); // the counter works: every noise record is read while the index is built
    expect(many.contextReads).toBe(few.contextReads);
    expect(bigger.contextReads).toBeGreaterThan(few.contextReads * 1.5); // proportional to the size of the context, built once
    expect(bigger.contextReads).toBeLessThan(few.contextReads * 2.5);
  }, SLOW);
});
