/**
 * Gate A/B: the generator produces valid data (zero L1–L3 ERRORs) at every tier and every shape — the
 * full sweep, closing the sampling gap step 1.11 left (PROGRESS.md step 1.11: design/stress were sampled
 * for two shapes each; step 2.8 measured that a full run is cheap enough — worst case ≈ 0.3 s per
 * combination at the design tier — to run all 4 × 6 = 24 combinations on every `npm run check`).
 */
import { describe, expect, it, vi } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { documentToState } from '@/core/dataset';
import { validator } from '@/core/validation';
import { GENERATOR_SHAPES, GENERATOR_TIERS, generateTier, tierParams, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';

// Resource limit, not an assertion: this file builds large datasets and loses its 5 s default under workstation contention (docs/PROGRESS.md, step 3.6 review).
vi.setConfig({ testTimeout: 30_000 });

function errorsAt(tier: GeneratorTier, shape: GeneratorShape): { errors: string[]; reactions: number } {
  const parsed = documentToState(generateTier(tier, shape, 42));
  if (!parsed.ok) return { errors: ['duplicate ids'], reactions: 0 };
  const { state } = parsed;
  const errors = validator
    .validateAll(state, coreIndexEngine.build(state, 0))
    .filter((f) => f.severity === 'error')
    .map((f) => `${f.ruleId} ${f.subject.id}`);
  return { errors, reactions: Object.keys(state.records.reaction).length };
}

const HEAVY_TIER_TIMEOUT = 120_000;

describe('generator tiers', () => {
  it.each(GENERATOR_SHAPES)('tiny tier, %s', (shape) => {
    const { errors, reactions } = errorsAt('tiny', shape);
    expect(errors).toEqual([]);
    expect(reactions).toBe(tierParams('tiny', shape, 42).reactions);
  });

  it.each(GENERATOR_SHAPES)('initial tier, %s', (shape) => {
    const { errors, reactions } = errorsAt('initial', shape);
    expect(errors).toEqual([]);
    expect(reactions).toBe(tierParams('initial', shape, 42).reactions);
  });

  it.each(GENERATOR_SHAPES)(
    'design tier, %s',
    (shape) => {
      const { errors, reactions } = errorsAt('design', shape);
      expect(errors).toEqual([]);
      expect(reactions).toBe(tierParams('design', shape, 42).reactions);
    },
    HEAVY_TIER_TIMEOUT,
  );

  it.each(GENERATOR_SHAPES)(
    'stress tier, %s',
    (shape) => {
      const { errors, reactions } = errorsAt('stress', shape);
      expect(errors).toEqual([]);
      expect(reactions).toBe(tierParams('stress', shape, 42).reactions);
    },
    HEAVY_TIER_TIMEOUT,
  );

  it('every tier and every shape was actually run (the sweep itself did not shrink)', () => {
    expect(GENERATOR_TIERS.length * GENERATOR_SHAPES.length).toBe(24);
  });
});
