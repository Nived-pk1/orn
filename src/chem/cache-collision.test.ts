/**
 * The cache never answers for another input (step 4.3a): with a hash that COLLIDES for every input, two different structures
 * still get their own answers, because a hit also compares the whole input the entry was made from.
 */
import { describe, expect, it, vi } from 'vitest';
import type { StructureRep } from '@/core/schema';
import { createFakeRdkit, ETHANOL_SPEC } from '@/test-support/fake-rdkit';
import { withChemCache } from './cached-toolkit';
import { createRdkitToolkit } from './rdkit/adapter';

vi.mock('@/core/hash', () => ({ hashParts: () => 'collides', hash64: () => 'collides', fnv1a: () => 0 }));

const smiles = (value: string): StructureRep => ({ format: 'smiles', value });

describe('withChemCache under a colliding hash', () => {
  it('a parse of another structure is computed, not answered from the colliding entry; each is cached for its own input', async () => {
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC, CCN: { ...ETHANOL_SPEC, smiles: 'CCN' } });
    const toolkit = withChemCache(createRdkitToolkit({ load: async () => fake.module }));
    const a = await toolkit.parse(smiles('CCO'));
    const b = await toolkit.parse(smiles('CCN'));
    expect(a.ok && a.facts.canonicalSmiles).toBe('CCO');
    expect(b.ok && b.facts.canonicalSmiles).toBe('CCN');
    expect(toolkit.stats()).toMatchObject({ hits: 0, misses: 2 });
    const again = await toolkit.parse(smiles('CCN'));
    expect(again).toBe(b);
    expect(toolkit.stats().hits).toBe(1);
  });

  it('the same holds for depictions', async () => {
    const draw = { width: 200, height: 150, showAtomMaps: true } as const;
    const fake = createFakeRdkit({ CCO: ETHANOL_SPEC, CCN: { ...ETHANOL_SPEC, svg: "<svg xmlns='http://www.w3.org/2000/svg'><text>N</text></svg>" } });
    const toolkit = withChemCache(createRdkitToolkit({ load: async () => fake.module }));
    const a = await toolkit.depict(smiles('CCO'), draw);
    const b = await toolkit.depict(smiles('CCN'), draw);
    expect(a.ok && b.ok && a.depiction.svg).not.toBe(b.ok && b.depiction.svg);
    expect(toolkit.stats()).toMatchObject({ hits: 0, misses: 2 });
  });
});
