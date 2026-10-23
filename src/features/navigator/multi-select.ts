/**
 * The model of the map's multi-selection (step 6.8b, R2; Studio only). Pure: which family boxes a marquee covers (a box counts only when it
 * lies wholly inside the rectangle), the selection line in words, and the reactions of a selection - the roll-up's reactions of each family
 * and of each arrow, once each. The screen rectangle becomes the drawing's through the element's origin and the viewport. No chemistry:
 * what a reaction is, and what happens to it, belongs to whoever receives the IDs.
 */
import type { Scene } from '@/render/scene';
import type { Selected } from '@/ui/state';

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Two client points, in any order, as a rectangle of the drawing (the element sits at `origin`, the drawing is translated and scaled). */
export function worldRect(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }, origin: { readonly left: number; readonly top: number }, view: { readonly x: number; readonly y: number; readonly scale: number }): Box {
  const toWorld = (p: { readonly x: number; readonly y: number }): { x: number; y: number } => ({ x: (p.x - origin.left - view.x) / view.scale, y: (p.y - origin.top - view.y) / view.scale });
  const [p, q] = [toWorld(a), toWorld(b)];
  return { x0: Math.min(p.x, q.x), y0: Math.min(p.y, q.y), x1: Math.max(p.x, q.x), y1: Math.max(p.y, q.y) };
}

/** The family boxes (hubs and Unclassified) wholly inside the rectangle, in scene order. Arrows are never marquee-selected. */
export function marqueeFamilies(scene: Scene, rect: Box): string[] {
  return scene.nodes
    .filter((node) => (node.box === 'hub' || node.box === 'unclassified') && node.x >= rect.x0 && node.y >= rect.y0 && node.x + node.width <= rect.x1 && node.y + node.height <= rect.y1)
    .map((node) => node.id);
}

const count = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function selectionLine(counts: { readonly families: number; readonly arrows: number; readonly reactions: number }): string {
  const parts = [counts.families > 0 ? count(counts.families, 'family', 'families') : undefined, counts.arrows > 0 ? count(counts.arrows, 'arrow', 'arrows') : undefined].filter((one) => one !== undefined);
  return `${parts.join(' and ')} selected (${count(counts.reactions, 'reaction', 'reactions')})`;
}

/** Each reaction once, in the order met. An item that is not drawn now contributes nothing. */
export function reactionsOfSelection(items: readonly Selected[], scene: Scene, candidatesFrom: (hubId: string) => readonly { readonly reactionId: string; readonly toHub: string }[]): string[] {
  const found = new Set<string>();
  for (const item of items) {
    if (item.kind === 'node') {
      if (!scene.nodes.some((node) => node.id === item.id)) continue;
      for (const candidate of candidatesFrom(item.id)) found.add(candidate.reactionId);
    } else {
      const edge = scene.edges.find((one) => one.id === item.id);
      if (edge === undefined) continue;
      for (const candidate of candidatesFrom(edge.from)) if (candidate.toHub === edge.to) found.add(candidate.reactionId);
    }
  }
  return [...found];
}
