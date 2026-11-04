/**
 * The legend of the arranged overview (step 5.5c; ADR-037): every family group of the drawing once, with its tone. Built from the Scene
 * (what is drawn), never from a fixed list: a group exists because a hub names it. Ordered the way the grid reads: the group whose first
 * box is highest, then the one furthest left, then by name. A group is listed with the tone of its first box.
 */
import type { AnchorTone } from '@/core/schema';
import type { Scene } from '@/render/scene';
import type { MapView } from './map-view';

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

/** What the drawing needs explained besides its family groups (step 5.5d, item d; reworked in 8.2a for the focus map). Each is true only when the map draws it. */
export interface LegendKey {
  /** The two line styles are explained: solid in the group's colour = what the family makes, dashed dark = what it is made from. */
  readonly lines: boolean;
  /** A count chip sits on an arrow. */
  readonly chip: boolean;
  /** A two-way pair is drawn as one line with a head at each end. */
  readonly pair: boolean;
  /** A box says "n within the family" (no loop is drawn any more). */
  readonly within: boolean;
  /** The Scene has an Unclassified box: whether it is shown and how many reactions lead to it. Undefined: none. */
  readonly unclassified: { readonly shown: boolean; readonly reactions: number } | undefined;
}

export const NO_KEY: LegendKey = { lines: false, chip: false, pair: false, within: false, unclassified: undefined };

export function keyOf(view: MapView | null): LegendKey {
  if (view === null) return NO_KEY;
  const marks = [...view.marks.edges.values()];
  return {
    lines: view.scene.nodes.some((node) => node.box === 'hub'),
    // always explained with the two line styles: a legend that grew when a family was focused would move the map under the pointer
    chip: view.scene.nodes.some((node) => node.box === 'hub'),
    pair: marks.some((mark) => mark.role === 'pair'),
    within: view.marks.captions.size > 0,
    unclassified: view.unclassified.present ? { shown: view.unclassified.shown, reactions: view.unclassified.reactions } : undefined,
  };
}
