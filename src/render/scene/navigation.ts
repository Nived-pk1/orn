/**
 * Keyboard navigation over a Scene (step 5.7, item f; UI_ARCHITECTURE §10): pure functions of the Scene, no DOM and no state.
 * The things the keyboard moves between are the FAMILIES (hubs and the unclassified box); the arrows of a family are reached from its
 * context menu. Everything is deterministic: ties end in the reading order and then the id, so the order of `scene.nodes` never
 * changes an answer.
 */
import type { Scene, SceneNode } from './contracts';

export type Direction = 'left' | 'right' | 'up' | 'down';

/** A farther sideways step costs this many times its length: the arrow key keeps to its row or column when it can. */
const SIDEWAYS_WEIGHT = 2;

const centreX = (node: SceneNode): number => node.x + node.width / 2;
const centreY = (node: SceneNode): number => node.y + node.height / 2;
const byId = (a: SceneNode, b: SceneNode): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The nodes the keyboard moves between. */
export function familiesOf(scene: Scene): readonly SceneNode[] {
  return scene.nodes.filter((node) => node.box === 'hub' || node.box === 'unclassified');
}

/** Top to bottom, then left to right: a row is the families whose centres are within half a family height of its first. */
export function readingOrder(nodes: readonly SceneNode[]): readonly SceneNode[] {
  const sorted = [...nodes].sort((a, b) => centreY(a) - centreY(b) || centreX(a) - centreX(b) || byId(a, b));
  const rows: SceneNode[][] = [];
  let anchor: SceneNode | undefined;
  for (const node of sorted) {
    if (anchor === undefined || centreY(node) - centreY(anchor) > anchor.height / 2) {
      anchor = node;
      rows.push([]);
    }
    (rows[rows.length - 1] as SceneNode[]).push(node);
  }
  return rows.flatMap((row) => row.sort((a, b) => centreX(a) - centreX(b) || byId(a, b)));
}

/** Along the direction (positive when `to` lies in it) and across it. */
function offsets(from: SceneNode, to: SceneNode, direction: Direction): { readonly along: number; readonly across: number } {
  const dx = centreX(to) - centreX(from);
  const dy = centreY(to) - centreY(from);
  switch (direction) {
    case 'right':
      return { along: dx, across: Math.abs(dy) };
    case 'left':
      return { along: -dx, across: Math.abs(dy) };
    case 'down':
      return { along: dy, across: Math.abs(dx) };
    case 'up':
      return { along: -dy, across: Math.abs(dx) };
  }
}

/**
 * The family nearest to `fromId` in `direction`: among the families whose centre lies strictly further along that direction, the one
 * with the least `along + 2 * across`. It answers a family whenever one lies in the direction (a half-plane), and undefined only when
 * none does, or when `fromId` is not a family of the Scene.
 */
export function neighbourInDirection(scene: Scene, fromId: string, direction: Direction): string | undefined {
  const families = familiesOf(scene);
  const from = families.find((node) => node.id === fromId);
  if (from === undefined) return undefined;
  const order = new Map(readingOrder(families).map((node, index) => [node.id, index]));
  let best: { readonly id: string; readonly score: number; readonly rank: number } | undefined;
  for (const node of families) {
    if (node.id === from.id) continue;
    const { along, across } = offsets(from, node, direction);
    if (along <= 0) continue;
    const score = along + SIDEWAYS_WEIGHT * across;
    const rank = order.get(node.id) ?? 0;
    if (best === undefined || score < best.score || (score === best.score && rank < best.rank)) best = { id: node.id, score, rank };
  }
  return best?.id;
}

/** The first family in reading order (where Tab enters the canvas), or undefined when there is none. */
export function firstFamily(scene: Scene): string | undefined {
  return readingOrder(familiesOf(scene))[0]?.id;
}

/** The last family in reading order (where Shift+Tab enters the canvas). */
export function lastFamily(scene: Scene): string | undefined {
  return readingOrder(familiesOf(scene)).at(-1)?.id;
}

/** The family after (+1) or before (-1) `fromId` in reading order; undefined past either end, where Tab leaves the canvas. */
export function stepInReadingOrder(scene: Scene, fromId: string, delta: 1 | -1): string | undefined {
  const ordered = readingOrder(familiesOf(scene));
  const index = ordered.findIndex((node) => node.id === fromId);
  if (index < 0) return undefined;
  return ordered[index + delta]?.id;
}
