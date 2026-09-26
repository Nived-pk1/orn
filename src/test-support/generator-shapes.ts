/**
 * Topology of synthetic reactions (docs/PERFORMANCE_ARCHITECTURE.md §10). Each shape maps a reaction
 * index to reactant and product species indexes. Pure and seeded; no chemistry, only graph structure.
 */

export const GENERATOR_SHAPES = ['chain', 'wide', 'dense', 'cyclic', 'duplicate_endpoint', 'hub_explosion'] as const;
export type GeneratorShape = (typeof GENERATOR_SHAPES)[number];

export interface Endpoints {
  readonly reactants: readonly number[];
  readonly products: readonly number[];
}

export interface ShapeContext {
  readonly species: number;
  readonly reactions: number;
  readonly rng: () => number;
}

const below = (rng: () => number, n: number): number => Math.floor(rng() * n);

/** `count` distinct indexes below `n`, none in `avoid` (n must exceed count + avoid.length). */
function distinct(rng: () => number, n: number, count: number, avoid: readonly number[] = []): number[] {
  const out: number[] = [];
  while (out.length < count) {
    const candidate = below(rng, n);
    if (!out.includes(candidate) && !avoid.includes(candidate)) out.push(candidate);
  }
  return out;
}

/** Fixed pairs used by `duplicate_endpoint`: many reactions share few (reactant, product) pairs. */
function pairCount(ctx: ShapeContext): number {
  return Math.max(1, Math.min(Math.floor(ctx.reactions / 10), Math.floor(ctx.species / 2)));
}

export function minSpeciesFor(shape: GeneratorShape): number {
  return shape === 'cyclic' ? 3 : shape === 'dense' || shape === 'hub_explosion' ? 6 : 2;
}

export function endpointsOf(shape: GeneratorShape, i: number, ctx: ShapeContext): Endpoints {
  const { species: n, rng } = ctx;
  switch (shape) {
    case 'chain': {
      // A long linear sequence, wrapped when there are more reactions than links.
      const from = i % (n - 1);
      return { reactants: [from], products: [from + 1] };
    }
    case 'wide': {
      // Few substrates, many products.
      const substrates = Math.max(1, Math.floor(n / 20));
      const products = n - substrates;
      return { reactants: [i % substrates], products: [substrates + (Math.floor(i / substrates) % products)] };
    }
    case 'dense': {
      // Random, high degree: two reactants and up to two products.
      const reactants = distinct(rng, n, 1 + below(rng, 2));
      return { reactants, products: distinct(rng, n, 1 + below(rng, 2), reactants) };
    }
    case 'cyclic': {
      // Groups of 2 or 3 species; reactions walk around each group.
      const size = i % 2 === 0 ? 3 : 2;
      const groups = Math.max(1, Math.floor(n / 3));
      const base = (Math.floor(i / 2) % groups) * 3;
      const step = Math.floor(i / (2 * groups)) % size;
      return { reactants: [base + step], products: [base + ((step + 1) % size)] };
    }
    case 'duplicate_endpoint': {
      const pairs = pairCount(ctx);
      const p = i % pairs;
      return { reactants: [2 * p], products: [2 * p + 1] };
    }
    case 'hub_explosion': {
      // Everything happens around a handful of hub substrates.
      const hubs = Math.max(1, Math.floor(n / 50));
      const reactant = i % hubs;
      return { reactants: [reactant], products: distinct(rng, n, 1, [reactant]) };
    }
  }
}
