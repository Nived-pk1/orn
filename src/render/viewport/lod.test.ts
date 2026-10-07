import { describe, expect, it } from 'vitest';
import type { LodLevel } from '@/render/scene';
import { LOD_THRESHOLDS, RENDER_BUDGET } from '@/render/scene';
import { lodWithHysteresis, overBudget, rawLod, resolveLod } from './lod';

describe('LOD from scale', () => {
  it('has the threshold table of the scene contract', () => {
    const table: [number, number][] = [[0.05, 0], [0.34, 0], [0.35, 1], [0.59, 1], [0.6, 2], [0.89, 2], [0.9, 3], [4, 3]];
    for (const [scale, level] of table) expect(rawLod(scale), String(scale)).toBe(level);
    expect(LOD_THRESHOLDS).toEqual({ 1: 0.35, 2: 0.6, 3: 0.9 });
  });

  it('needs 5% past a threshold to change level, going up and going down', () => {
    expect(lodWithHysteresis(0.36, 0)).toBe(0);
    expect(lodWithHysteresis(0.35 * 1.05, 0)).toBe(1);
    expect(lodWithHysteresis(0.34, 1)).toBe(1);
    expect(lodWithHysteresis(0.35 * 0.95 - 0.001, 1)).toBe(0);
    expect(lodWithHysteresis(0.9 * 1.05, 2)).toBe(3);
    expect(lodWithHysteresis(0.9 * 0.96, 3)).toBe(3);
    expect(lodWithHysteresis(0.9 * 0.94, 3)).toBe(2);
  });

  it('does not flicker when the scale wobbles around a threshold', () => {
    let level: LodLevel = rawLod(0.5);
    const seen = new Set<number>();
    for (const scale of [0.59, 0.6, 0.61, 0.6, 0.59, 0.62, 0.58]) {
      level = lodWithHysteresis(scale, level);
      seen.add(level);
    }
    expect(seen.size).toBe(1);
  });

  it('is capped at 1 over the budget, and says so', () => {
    expect(resolveLod(2, 3, RENDER_BUDGET.maxVisibleNodes, RENDER_BUDGET.maxVisibleEdges)).toEqual({ lod: 3, capped: false });
    expect(resolveLod(2, 3, RENDER_BUDGET.maxVisibleNodes + 1, 0)).toEqual({ lod: 1, capped: true });
    expect(resolveLod(2, 3, 0, RENDER_BUDGET.maxVisibleEdges + 1)).toEqual({ lod: 1, capped: true });
    expect(resolveLod(0.1, 0, 5000, 9000)).toEqual({ lod: 0, capped: false });
    expect(resolveLod(0.4, 0, 5000, 9000)).toEqual({ lod: 1, capped: false });
    expect(overBudget(1, 1)).toBe(false);
  });
});
