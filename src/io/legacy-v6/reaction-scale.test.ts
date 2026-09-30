/**
 * Step 3.11a: one-off conversion, so no benchmark (docs/PROGRESS.md says so) - but the scale sanity test of step 3.10 extended to
 * reactions: 5,000 reactions with shared labels, dangling references and workups must map with lookups that are Maps, not scans.
 * "Not a scan" is asserted without a clock: every reaction and participant is a counting Proxy, and the reads per reaction during
 * the reaction mapping must not grow with the size of the document (a scan of the other reactions or participants would make
 * them grow with N).
 */
import { describe, expect, it } from 'vitest';
import { createDocumentIds, mapLegacyCompounds, mapLegacyReactions, type LegacyV5Data } from './index';
import { FIXED_NOW } from '@/test-support/legacy-map-kit';

function documentOf(size: number): { data: LegacyV5Data; reads: () => number; reset: () => void } {
  let reads = 0;
  const counting = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(t, key, receiver) {
        reads += 1;
        const value = Reflect.get(t, key, receiver) as unknown;
        return typeof value === 'object' && value !== null ? counting(value) : value;
      },
      has: (t, key) => ((reads += 1), Reflect.has(t, key)),
      ownKeys: (t) => ((reads += 1), Reflect.ownKeys(t)),
      getOwnPropertyDescriptor: (t, key) => ((reads += 1), Reflect.getOwnPropertyDescriptor(t, key)),
    });
  const compounds = Array.from({ length: size }, (_, i) => ({ tags: [], image: '', smiles: '', formula: '', properties: '', node: true, functionalGroups: [], compoundClass: '', acidBase: '', aromaticity: '', stereo: '', nodeType: i % 250 === 0 ? 'major' : 'auto', genericFormula: '', fgId: '', jee: { level: '', notes: '' }, id: `c${i}`, name: `Compound ${i}` }));
  const part = (role: string, ref: string, label = '') => ({ ref, label, role, major: role === 'product', note: '', image: '' });
  const reactions = Array.from({ length: size }, (_, i) =>
    counting({
      id: `r${i}`,
      name: `Reaction ${i}`,
      participants: [
        part('substrate', `c${i}`),
        part('reagent', '', `aq. KOH ${i % 40}`), // 40 shared created reagents
        part('reagent', '', `${400 + (i % 3)} K`),
        part('workup', '', 'H3O+'),
        part('product', i % 7 === 0 ? `missing${i % 10}` : `c${(i * 7) % size}`),
        part('byproduct', `c${(i * 3) % size}`),
      ],
      conditions: { text: 'heat, dry', temperature: '', medium: '', phase: '', strength: '', heat: true, light: false, pressure: '', atmosphere: '', anhydrous: true },
      tags: ['t'],
    }),
  );
  const data = { schemaVersion: 5 as const, compounds, reactions } as unknown as LegacyV5Data;
  return { data, reads: () => reads, reset: () => void (reads = 0) };
}

async function run(size: number) {
  const { data, reads, reset } = documentOf(size);
  const ids = createDocumentIds(data);
  const compounds = await mapLegacyCompounds({ data, dropped: [], assignedIds: [], ids }, { now: () => FIXED_NOW });
  if (!compounds.ok) throw new Error(compounds.message);
  reset();
  const mapped = await mapLegacyReactions({ data, assignedIds: [], ids, compounds }, { now: () => FIXED_NOW });
  if (!mapped.ok) throw new Error(mapped.message);
  return { mapped, readsPerReaction: reads() / size };
}

/** The counting Proxy makes these runs take seconds; the assertions count reads and never time, so the limit is only a guard against a hang. */
const SLOW = 120_000;

describe('scale sanity (one-off conversion, no benchmark)', () => {
  it('5,000 reactions map completely: shared reagents, ten placeholders, workup stages, unique IDs', async () => {
    const { mapped } = await run(5_000);
    expect(mapped.records.reaction).toHaveLength(5_000);
    expect(mapped.records.reagent.map((r) => r.names.canonical).sort()).toEqual([...Array.from({ length: 40 }, (_, i) => `KOH ${i}`), 'H3O+'].sort());
    expect(mapped.records.species.filter((s) => s.names.canonical.startsWith('Missing legacy compound'))).toHaveLength(10);
    expect(mapped.records.reaction.every((r) => r.stages.length === 2 && r.participants.length === 3)).toBe(true);
    expect(mapped.report.notImported).toEqual([]);
    const all = [...mapped.records.reaction, ...mapped.records.reagent, ...mapped.records.species].map((r) => r.id);
    expect(new Set(all).size).toBe(all.length);
  }, SLOW);

  it('lookups are maps, not scans: reads per reaction do not grow with the size of the document', async () => {
    const small = await run(1_000);
    const large = await run(5_000);
    expect(small.readsPerReaction).toBeGreaterThan(20); // the counter works
    expect(large.readsPerReaction).toBeLessThan(400); // bounded by a constant (a scan of 5,000 others would be in the thousands)
    expect(Math.abs(large.readsPerReaction - small.readsPerReaction) / small.readsPerReaction).toBeLessThan(0.05);
  }, SLOW);
});
