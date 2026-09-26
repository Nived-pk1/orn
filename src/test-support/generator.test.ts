import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { documentToState, serializeDocument } from '@/core/dataset';
import { DatasetDocumentSchema } from '@/core/schema';
import { validator } from '@/core/validation';
import {
  GENERATOR_SHAPES,
  GENERATOR_TIERS,
  generateDataset,
  generateTier,
  tierParams,
  type GeneratorParams,
} from './generator';

const small = (shape: (typeof GENERATOR_SHAPES)[number], seed = 1): GeneratorParams => ({
  species: 60, classes: 6, reagents: 8, reactions: 120, relationshipsPerReaction: 0.5, topics: 5, shape, seed,
});

function errorsOf(doc: ReturnType<typeof generateDataset>): string[] {
  const parsed = documentToState(doc);
  if (!parsed.ok) return ['duplicate ids'];
  const state = parsed.state;
  return validator
    .validateAll(state, coreIndexEngine.build(state, 0))
    .filter((f) => f.severity === 'error')
    .map((f) => `${f.ruleId} ${f.subject.id}`);
}

describe('generator: every shape yields a valid dataset', () => {
  it.each(GENERATOR_SHAPES)('%s parses strictly and has no L1–L3 ERROR', (shape) => {
    const doc = generateDataset(small(shape));
    expect(DatasetDocumentSchema.safeParse(doc).success).toBe(true);
    expect(errorsOf(doc)).toEqual([]);
    expect(doc.records.reaction).toHaveLength(120);
    expect(doc.records.species).toHaveLength(60);
  });

  it.each(GENERATOR_SHAPES)('%s is deterministic and seed-sensitive where random', (shape) => {
    const text = (seed: number) => {
      const out = serializeDocument(generateDataset(small(shape, seed)));
      if (!out.ok) throw new Error('serialise');
      return out.text;
    };
    expect(text(3)).toBe(text(3));
    if (shape === 'dense' || shape === 'hub_explosion') expect(text(3)).not.toBe(text(4));
  });
});

describe('generator: every tier (parameters and validity)', () => {
  it('tier sizes follow PERFORMANCE_ARCHITECTURE.md §1', () => {
    for (const [tier, entities, reactions] of [['initial', 500, 1000], ['design', 2000, 5000], ['stress', 5000, 10000]] as const) {
      const p = tierParams(tier, 'dense', 1);
      expect(p.species + p.classes + p.reagents).toBe(entities);
      expect(p.reactions).toBe(reactions);
    }
  });

  it.each(GENERATOR_SHAPES)('tiny tier, %s: valid', (shape) => {
    expect(errorsOf(generateTier('tiny', shape, 7))).toEqual([]);
  });

  it('initial tier, one shape per run: valid, counts as specified', () => {
    const doc = generateTier('initial', 'hub_explosion', 5);
    expect(doc.records.reaction).toHaveLength(1000);
    expect(errorsOf(doc)).toEqual([]);
  });

  it('lists every tier', () => {
    expect(GENERATOR_TIERS).toEqual(['tiny', 'initial', 'design', 'stress']);
  });
});

describe('generator: shape properties', () => {
  const pairs = (shape: (typeof GENERATOR_SHAPES)[number]) => {
    const doc = generateDataset(small(shape));
    return doc.records.reaction.map((r) => {
      const from = r.participants.filter((p) => p.role === 'reactant').map((p) => p.ref.id);
      const to = r.outcomes.flatMap((o) => o.products.map((p) => p.ref.id));
      return { from, to };
    });
  };

  it('chain: the ends of a 59-link chain are 59 reactions deep', () => {
    const links = new Map<string, string>(pairs('chain').map((p) => [p.from[0] as string, p.to[0] as string]));
    let at: string = 'spc_g-00000';
    let depth = 0;
    while (links.has(at) && depth < 100) {
      at = links.get(at) as string;
      depth += 1;
    }
    expect(depth).toBe(59);
  });

  it('duplicate_endpoint: many reactions share the same endpoint pair', () => {
    const counts = new Map<string, number>();
    for (const p of pairs('duplicate_endpoint')) counts.set(`${p.from}>${p.to}`, (counts.get(`${p.from}>${p.to}`) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeGreaterThanOrEqual(10);
  });

  it('cyclic: contains 2-cycles and 3-cycles', () => {
    const edges = new Set(pairs('cyclic').map((p) => `${p.from[0]}>${p.to[0]}`));
    expect(edges.has('spc_g-00000>spc_g-00001') && edges.has('spc_g-00001>spc_g-00000')).toBe(true);
    expect(edges.has('spc_g-00001>spc_g-00002') && edges.has('spc_g-00002>spc_g-00000')).toBe(true);
  });

  it('wide: substrates are few, products many', () => {
    const p = pairs('wide');
    expect(new Set(p.map((x) => x.from[0])).size).toBeLessThanOrEqual(3);
    expect(new Set(p.map((x) => x.to[0])).size).toBeGreaterThan(30);
  });

  it('hub_explosion: one class holds every species', () => {
    const doc = generateDataset(small('hub_explosion'));
    expect(doc.records.species.every((s) => (s.classIds as readonly string[]).includes('cls_g-00000'))).toBe(true);
  });

  it('dense: some reactions have two reactants or two products', () => {
    expect(pairs('dense').some((p) => p.from.length === 2 || p.to.length === 2)).toBe(true);
  });

  it('rejects parameters too small for the shape', () => {
    expect(() => generateDataset({ ...small('cyclic'), species: 2 })).toThrow(/too small/);
  });
});
