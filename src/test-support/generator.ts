/**
 * Synthetic dataset generator — docs/PERFORMANCE_ARCHITECTURE.md §10. Seeded, deterministic, and valid:
 * every generated dataset passes L1–L3 with zero ERRORs (checked in generator.test.ts). Test-only.
 */
import {
  emptyRecordTables,
  type AnyRecord,
  type CanonicalState,
  type DatasetDocument,
  type RecordKind,
} from '@/core/schema';
import { stateToDocument } from '@/core/dataset';
import { mulberry32 } from './command-kit';
import { endpointsOf, minSpeciesFor, type GeneratorShape } from './generator-shapes';

export { GENERATOR_SHAPES, type GeneratorShape } from './generator-shapes';

export interface GeneratorParams {
  readonly species: number;
  readonly classes: number;
  readonly reagents: number;
  readonly reactions: number;
  /** Curated relationships added per reaction (rounded down in total; never duplicates). */
  readonly relationshipsPerReaction: number;
  readonly topics: number;
  readonly shape: GeneratorShape;
  readonly seed: number;
}

/** PERFORMANCE_ARCHITECTURE.md §1, plus a tiny tier for fast unit and property tests. */
export const GENERATOR_TIERS = ['tiny', 'initial', 'design', 'stress'] as const;
export type GeneratorTier = (typeof GENERATOR_TIERS)[number];

interface TierSize {
  readonly entities: number;
  readonly reactions: number;
  readonly links: number;
}
const TIER_SIZES: Readonly<Record<GeneratorTier, TierSize>> = {
  tiny: { entities: 30, reactions: 40, links: 60 },
  initial: { entities: 500, reactions: 1_000, links: 3_000 },
  design: { entities: 2_000, reactions: 5_000, links: 15_000 },
  stress: { entities: 5_000, reactions: 10_000, links: 30_000 },
};

/**
 * Parameters for a tier. Entities split 70% species, 10% classes, 20% reagents; links (relationships +
 * mappings) split between per-reaction relationships and topics (each reaction gets one mapping).
 */
export function tierParams(tier: GeneratorTier, shape: GeneratorShape, seed: number): GeneratorParams {
  const size = TIER_SIZES[tier];
  const classes = Math.max(2, Math.floor(size.entities * 0.1));
  const reagents = Math.max(1, Math.floor(size.entities * 0.2));
  return {
    species: Math.max(minSpeciesFor(shape), size.entities - classes - reagents),
    classes,
    reagents,
    reactions: size.reactions,
    relationshipsPerReaction: Math.max(0, (size.links - size.reactions) / size.reactions / 2),
    topics: Math.max(1, Math.floor(size.reactions / 50)),
    shape,
    seed,
  };
}

const STAMP = '2026-09-26T00:00:00.000Z';
const provenance = { origin: 'seed', createdAt: STAMP, updatedAt: STAMP } as const;
const published = { lifecycle: 'published', status: 'unreviewed', reasons: [] } as const;
const meta = { provenance, review: published, tags: [], citations: [] } as const;

const num = (n: number): string => String(n).padStart(5, '0');
const NAME = { aliases: [], common: [] } as const;

function put(state: CanonicalState, record: AnyRecord): void {
  (state.records[record.kind] as Record<string, AnyRecord>)[record.id] = record;
}

/** Non-frozen canonical state; callers that need immutability run it through `documentToState`. */
export function generateState(params: GeneratorParams): CanonicalState {
  const { species, classes, reagents, reactions, topics, shape, seed } = params;
  if (species < minSpeciesFor(shape) || classes < 1 || reagents < 0 || reactions < 0 || topics < 1) {
    throw new Error(`generator: parameters too small for shape ${shape}`);
  }
  const rng = mulberry32(seed);
  const below = (n: number): number => Math.floor(rng() * n);
  const state: CanonicalState = {
    meta: { datasetId: `synthetic-${shape.replaceAll("_", "-")}-${seed}`, title: `Synthetic ${shape} dataset`, createdAt: STAMP, updatedAt: STAMP },
    records: emptyRecordTables() as unknown as CanonicalState['records'],
  };
  const spcId = (i: number): string => `spc_g-${num(i)}`;
  const clsId = (i: number): string => `cls_g-${num(i)}`;
  const rgtId = (i: number): string => `rgt_g-${num(i)}`;
  const rxnId = (i: number): string => `rxn_g-${num(i)}`;
  const topId = (i: number): string => `top_g-${num(i)}`;

  // Classes: a shallow tree (every class after the first hangs under an earlier one).
  for (let i = 0; i < classes; i += 1) {
    put(state, {
      id: clsId(i), kind: 'class', names: { canonical: `Class ${i}`, ...NAME }, classKind: 'compound_class',
      parentIds: i === 0 ? [] : [clsId(below(i))], exampleSpeciesIds: [], ...meta,
    } as unknown as AnyRecord);
  }
  for (let i = 0; i < species; i += 1) {
    // hub_explosion: every species belongs to class 0, so that class carries every reaction.
    const own = clsId(below(classes));
    const classIds = shape === 'hub_explosion' && own !== clsId(0) ? [clsId(0), own] : [own];
    put(state, {
      id: spcId(i), kind: 'species', names: { canonical: `Species ${i}`, ...NAME }, speciesKind: 'molecule',
      classIds, properties: [], ...meta,
    } as unknown as AnyRecord);
  }
  for (let i = 0; i < reagents; i += 1) {
    put(state, {
      id: rgtId(i), kind: 'reagent', names: { canonical: `Reagent ${i}`, ...NAME }, components: [], families: [],
      classIds: [], profiles: [], ...meta,
    } as unknown as AnyRecord);
  }
  for (let i = 0; i < reactions; i += 1) {
    const { reactants, products } = endpointsOf(shape, i, { species, reactions, rng });
    const participants = reactants.map((s, k) => ({
      id: `prt_g-${num(i)}-${k}`, ref: { kind: 'species', id: spcId(s) }, role: 'reactant', isPrimarySubstrate: k === 0,
    }));
    if (reagents > 0) {
      participants.push({ id: `prt_g-${num(i)}-r`, ref: { kind: 'reagent', id: rgtId(i % reagents) }, role: 'reagent' } as never);
    }
    put(state, {
      id: rxnId(i), kind: 'reaction', name: `Reaction ${i}`, aliases: [], scope: 'specific', purposes: ['synthesis'],
      namedReactionIds: [], transformationIds: [], reactionTypes: [], mechanismClasses: [], participants, stages: [],
      conditionVariants: [],
      outcomes: [{
        id: `out_g-${num(i)}`, conditionVariantIds: [], selectivity: 'exclusive', conceptIds: [],
        products: products.map((s, k) => ({ id: `pdt_g-${num(i)}-${k}`, ref: { kind: 'species', id: spcId(s) }, role: 'main' })),
      }],
      intermediates: [], mechanismIds: [], reversibility: { kind: 'irreversible' }, conceptIds: [],
      prerequisiteConceptIds: [], difficulty: 1 + (i % 5), ...meta,
    } as unknown as AnyRecord);
  }

  // Topics: one root, the rest chapters under it; each reaction is mapped to one topic.
  put(state, { id: topId(0), kind: 'topic', name: 'Organic chemistry', aliases: [], topicKind: 'subject', order: 1, ...meta } as unknown as AnyRecord);
  for (let i = 1; i <= topics; i += 1) {
    put(state, {
      id: topId(i), kind: 'topic', name: `Chapter ${i}`, aliases: [], parentId: topId(0), topicKind: 'chapter', order: i + 1, ...meta,
    } as unknown as AnyRecord);
  }
  for (let i = 0; i < reactions; i += 1) {
    put(state, {
      id: `tmp_g-${num(i)}`, kind: 'topic_mapping', topicId: topId(1 + (i % topics)),
      target: { kind: 'reaction', id: rxnId(i) }, role: 'core', ...meta,
    } as unknown as AnyRecord);
  }

  // Relationships between distinct reactions; symmetric types stored once, never duplicated.
  const wanted = Math.floor(params.relationshipsPerReaction * reactions);
  const seen = new Set<string>();
  for (let attempts = 0, made = 0; made < wanted && reactions > 1 && attempts < wanted * 4 + 16; attempts += 1) {
    const a = below(reactions);
    const b = below(reactions);
    const type = below(2) === 0 ? 'alternative_to' : 'competing_with';
    const key = `${type}:${Math.min(a, b)}:${Math.max(a, b)}`;
    if (a === b || seen.has(key)) continue;
    seen.add(key);
    put(state, {
      id: `rel_g-${num(made)}`, kind: 'relationship', type, from: { kind: 'reaction', id: rxnId(a) },
      to: { kind: 'reaction', id: rxnId(b) }, ...meta,
    } as unknown as AnyRecord);
    made += 1;
  }
  return state;
}

export function generateDataset(params: GeneratorParams): DatasetDocument {
  return stateToDocument(generateState(params), {
    exportedAt: STAMP,
    exportScope: 'full',
    generator: { app: 'orn-test-generator', version: '0.1.0' },
  });
}

export function generateTier(tier: GeneratorTier, shape: GeneratorShape, seed: number): DatasetDocument {
  return generateDataset(tierParams(tier, shape, seed));
}

export type { RecordKind };
