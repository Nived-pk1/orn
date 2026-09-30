/**
 * Step 3.10: one-off conversion, so no benchmark (docs/PROGRESS.md says so) - but a scale sanity test: 5,000 compounds with hubs,
 * shared functional groups, many `compoundClass` texts and repeated names must map with lookups that are Maps, not scans.
 * "Not a scan" is asserted without a clock: every compound object is a counting Proxy, and the number of reads per compound must not
 * grow with the size of the document (a per-compound scan of the other compounds would make it grow with N).
 */
import { describe, expect, it } from 'vitest';
import { createDocumentIds, mapLegacyCompounds, type LegacyV5Data } from './index';
import { FIXED_NOW } from '@/test-support/legacy-map-kit';

interface Counted {
  readonly data: LegacyV5Data;
  reads: () => number;
}

function documentOf(size: number): Counted {
  let reads = 0;
  const counting = <T extends object>(target: T): T =>
    new Proxy(target, {
      get: (t, key, receiver) => ((reads += 1), Reflect.get(t, key, receiver)),
      has: (t, key) => ((reads += 1), Reflect.has(t, key)),
      ownKeys: (t) => ((reads += 1), Reflect.ownKeys(t)),
      getOwnPropertyDescriptor: (t, key) => ((reads += 1), Reflect.getOwnPropertyDescriptor(t, key)),
    });
  const base = { tags: [], image: '', smiles: '', formula: '', properties: '', node: true, functionalGroups: [], compoundClass: '', acidBase: '', aromaticity: '', stereo: '', nodeType: 'auto', genericFormula: '', fgId: '', jee: { level: '', notes: '' } };
  const compounds = Array.from({ length: size }, (_, i) =>
    counting(
      i % 250 === 0
        ? { ...base, id: `c${i}`, name: `Hub ${i}`, nodeType: 'major', fgId: `fg-${i / 250}`, smiles: 'CCO', genericFormula: 'R–X' }
        : { ...base, id: `c${i}`, name: `Compound ${i % (size / 5)}`, fgId: `fg-${i % 20}`, functionalGroups: [`fg-${(i + 1) % 20}`], compoundClass: `class ${i % 50}`, smiles: 'CC', formula: 'C2H6', tags: ['t'] },
    ),
  );
  // every reaction refers to two compounds (one may be missing from the file): reference lookups are per participant, not per compound
  const reactions = Array.from({ length: size }, (_, i) => ({ id: `r${i}`, participants: [{ ref: `c${i}`, role: 'substrate' }, { ref: i % 7 === 0 ? `missing${i % 10}` : `c${(i * 7) % size}`, role: 'product' }] }));
  return { data: { schemaVersion: 5, compounds, reactions }, reads: () => reads };
}

async function run(size: number) {
  const { data, reads } = documentOf(size);
  const ids = createDocumentIds(data);
  const mapped = await mapLegacyCompounds({ data, dropped: [], assignedIds: [], ids }, { now: () => FIXED_NOW });
  // the ID space knows the compounds only reactions refer to (registered first), whichever way the file lists them
  for (let i = 0; i < 10; i += 1) ids.ids.speciesId(`missing${i}`);
  if (!mapped.ok) throw new Error(mapped.message);
  return { mapped, readsPerCompound: reads() / size };
}

describe('scale sanity (one-off conversion, no benchmark)', () => {
  it('5,000 compounds map completely: hubs, species, shared and created classes, duplicate names', async () => {
    const { mapped } = await run(5_000);
    expect(mapped.records.navigator_anchor).toHaveLength(20);
    expect(mapped.records.species).toHaveLength(4_980);
    // 20 hub classes (fg-0…fg-19, one hub each) + 50 classes created from compoundClass texts
    expect(mapped.records.class).toHaveLength(20 + 50);
    expect(mapped.report.notImported).toEqual([]);
    expect(mapped.records.species.every((s) => s.classIds.length === 3)).toBe(true);
    expect(new Set(allIds(mapped)).size).toBe(allIds(mapped).length);
  });

  it('lookups are maps, not scans: reads per compound do not grow with the size of the document', async () => {
    const small = await run(1_000);
    const large = await run(5_000);
    expect(small.readsPerCompound).toBeGreaterThan(5); // the counter works
    expect(large.readsPerCompound).toBeLessThan(120); // bounded by a constant (a scan of 5,000 others would be in the thousands)
    expect(Math.abs(large.readsPerCompound - small.readsPerCompound) / small.readsPerCompound).toBeLessThan(0.05);
  });
});

function allIds(mapped: Awaited<ReturnType<typeof run>>['mapped']): string[] {
  return [...mapped.records.species, ...mapped.records.class, ...mapped.records.navigator_anchor, ...mapped.records.entity_display, ...mapped.records.asset].map((r) => r.id);
}
