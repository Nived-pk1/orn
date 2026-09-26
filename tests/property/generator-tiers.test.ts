/** Gate A: the generator produces valid data (zero L1–L3 ERRORs) at every tier and shape. */
import { describe, expect, it } from 'vitest';
import { coreIndexEngine } from '@/core/indexes/engine';
import { documentToState } from '@/core/dataset';
import { validator } from '@/core/validation';
import { GENERATOR_SHAPES, generateTier, tierParams, type GeneratorShape, type GeneratorTier } from '@/test-support/generator';

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

describe('generator tiers', () => {
  it.each(GENERATOR_SHAPES)('initial tier, %s', (shape) => {
    const { errors, reactions } = errorsAt('initial', shape);
    expect(errors).toEqual([]);
    expect(reactions).toBe(tierParams('initial', shape, 42).reactions);
  });

  it.each([
    ['design', 'dense'],
    ['design', 'hub_explosion'],
    ['stress', 'chain'],
    ['stress', 'duplicate_endpoint'],
  ] as const)('%s tier, %s', (tier, shape) => {
    const { errors, reactions } = errorsAt(tier, shape);
    expect(errors).toEqual([]);
    expect(reactions).toBe(tierParams(tier, shape, 42).reactions);
  }, 120_000);
});
