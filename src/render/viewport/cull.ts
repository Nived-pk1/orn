/** What the viewport sees (step 5.4b): the culling rectangle, the counts for the LOD budget and the depiction candidates. */
import type { Scene } from '@/render/scene';
import { OVERSCAN } from './contracts';
import type { Size, Viewport } from './contracts';
import type { GridIndex } from './grid-index';
import { growRect, worldRect } from './transform';

export interface Visible {
  readonly nodes: readonly number[];
  readonly edges: readonly number[];
}

/** Indices of the nodes and edges inside the screen plus its overscan (half a screen each side, so a pan has margin). */
export function visibleIn(index: GridIndex, view: Viewport, size: Size): Visible {
  return index.query(growRect(worldRect(view, size), OVERSCAN));
}

/**
 * The depiction keys to ask for: the species nodes strictly on the screen (no overscan: only what the user can see), nearest to the
 * centre first, each key once. Order is deterministic (distance, then scene order).
 */
export function depictionCandidates(scene: Scene, index: GridIndex, view: Viewport, size: Size): string[] {
  const rect = worldRect(view, size);
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const seen = new Set<string>();
  const ranked: { readonly key: string; readonly distance: number; readonly order: number }[] = [];
  for (const order of index.query(rect).nodes) {
    const node = scene.nodes[order];
    if (node?.depictionKey === undefined || seen.has(node.depictionKey)) continue;
    seen.add(node.depictionKey);
    ranked.push({ key: node.depictionKey, distance: Math.hypot(node.x + node.width / 2 - cx, node.y + node.height / 2 - cy), order });
  }
  return ranked.sort((a, b) => a.distance - b.distance || a.order - b.order).map((item) => item.key);
}
