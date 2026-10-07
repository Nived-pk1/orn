/** The LOD of a scale (step 5.4b): thresholds from the scene contract, 5% hysteresis, and the render-budget cap (UI_ARCHITECTURE §6). */
import type { LodLevel } from '@/render/scene';
import { LOD_THRESHOLDS, RENDER_BUDGET } from '@/render/scene';
import { LOD_HYSTERESIS } from './contracts';

/** The level of a scale with no memory: the highest level whose threshold the scale has reached. */
export function rawLod(scale: number): LodLevel {
  if (scale >= LOD_THRESHOLDS[3]) return 3;
  if (scale >= LOD_THRESHOLDS[2]) return 2;
  if (scale >= LOD_THRESHOLDS[1]) return 1;
  return 0;
}

/** The level for `scale` given the previous one: it changes only when the scale is `LOD_HYSTERESIS` past a threshold. */
export function lodWithHysteresis(scale: number, previous: LodLevel): LodLevel {
  const up = rawLod(scale / (1 + LOD_HYSTERESIS));
  if (up > previous) return up;
  const down = rawLod(scale / (1 - LOD_HYSTERESIS));
  return down < previous ? down : previous;
}

export const overBudget = (visibleNodes: number, visibleEdges: number): boolean =>
  visibleNodes > RENDER_BUDGET.maxVisibleNodes || visibleEdges > RENDER_BUDGET.maxVisibleEdges;

/** Over the budget the level is capped at 1 (labels): the drawing stays legible and cheap. `capped` says it happened. */
export function resolveLod(scale: number, previous: LodLevel, visibleNodes: number, visibleEdges: number): { readonly lod: LodLevel; readonly capped: boolean } {
  const wanted = lodWithHysteresis(scale, previous);
  if (wanted > 1 && overBudget(visibleNodes, visibleEdges)) return { lod: 1, capped: true };
  return { lod: wanted, capped: false };
}
