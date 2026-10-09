/**
 * The legend of the arranged overview (step 5.5c; ADR-037): every family group of the drawing once, with its tone. Built from the Scene
 * (what is drawn), never from a fixed list: a group exists because a hub names it. Ordered the way the grid reads: the group whose first
 * box is highest, then the one furthest left, then by name. A group is listed with the tone of its first box.
 */
import type { AnchorTone } from '@/core/schema';
import type { Scene } from '@/render/scene';

export interface LegendItem {
  readonly group: string;
  readonly tone: AnchorTone | undefined;
  /** How many of the drawn hubs belong to the group. */
  readonly hubs: number;
}

export function legendOf(scene: Scene | null): readonly LegendItem[] {
  if (scene === null) return [];
  const found = new Map<string, { tone: AnchorTone | undefined; x: number; y: number; hubs: number }>();
  const boxes = scene.nodes
    .filter((node) => node.group !== undefined)
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const node of boxes) {
    const group = node.group as string;
    const known = found.get(group);
    if (known === undefined) found.set(group, { tone: node.tone, x: node.x, y: node.y, hubs: 1 });
    else known.hubs += 1;
  }
  return [...found]
    .sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([group, entry]) => ({ group, tone: entry.tone, hubs: entry.hubs }));
}
