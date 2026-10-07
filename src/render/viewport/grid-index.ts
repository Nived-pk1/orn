/**
 * The uniform-grid culling index (step 5.4b; PERFORMANCE_ARCHITECTURE §6). Built once per Scene from the boxes of its nodes and edges;
 * a query answers the indices of every box that touches a rectangle, in ascending order (deterministic). An item that would span more
 * than `MAX_CELLS_PER_ITEM` cells goes to a short "large" list that every query scans, so building stays bounded whatever the input.
 */
import type { Scene } from '@/render/scene';
import type { Rect } from './contracts';

export const GRID_CELL = 256;
export const MAX_CELLS_PER_ITEM = 64;

export interface GridQuery {
  readonly nodes: readonly number[];
  readonly edges: readonly number[];
}

export interface GridIndex {
  readonly query: (rect: Rect) => GridQuery;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

const touches = (a: Rect, b: Rect): boolean => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
const cellOf = (value: number): number => Math.floor(value / GRID_CELL);
/** Cell coordinates pack into one number (|cell| < 2^20 is far beyond any bounded scene). */
const key = (cx: number, cy: number): number => cx * 2_097_152 + cy;

export function nodeBoxes(scene: Scene): Rect[] {
  return scene.nodes.map((node) => ({ x0: node.x, y0: node.y, x1: node.x + node.width, y1: node.y + node.height }));
}

/** An edge's box covers its route and the point its text is drawn at. */
export function edgeBoxes(scene: Scene): Rect[] {
  return scene.edges.map((edge) => {
    let x0 = edge.labelAt.x;
    let x1 = x0;
    let y0 = edge.labelAt.y;
    let y1 = y0;
    for (const point of edge.points) {
      if (point.x < x0) x0 = point.x;
      if (point.x > x1) x1 = point.x;
      if (point.y < y0) y0 = point.y;
      if (point.y > y1) y1 = point.y;
    }
    return { x0, y0, x1, y1 };
  });
}

class Layer {
  private readonly cells = new Map<number, number[]>();
  private readonly large: number[] = [];
  constructor(private readonly boxes: readonly Rect[]) {
    boxes.forEach((box, index) => this.add(box, index));
  }

  private add(box: Rect, index: number): void {
    const [ax, bx, ay, by] = [cellOf(box.x0), cellOf(box.x1), cellOf(box.y0), cellOf(box.y1)];
    if (!Number.isFinite(ax + bx + ay + by) || (bx - ax + 1) * (by - ay + 1) > MAX_CELLS_PER_ITEM) {
      this.large.push(index);
      return;
    }
    for (let cx = ax; cx <= bx; cx++) {
      for (let cy = ay; cy <= by; cy++) {
        const cell = this.cells.get(key(cx, cy));
        if (cell === undefined) this.cells.set(key(cx, cy), [index]);
        else cell.push(index);
      }
    }
  }

  query(rect: Rect): number[] {
    const found = new Set<number>();
    const [ax, bx, ay, by] = [cellOf(rect.x0), cellOf(rect.x1), cellOf(rect.y0), cellOf(rect.y1)];
    const cellsAsked = (bx - ax + 1) * (by - ay + 1);
    if (cellsAsked > this.cells.size) {
      // A query wider than the occupied grid: walking the occupied cells is cheaper than walking the rectangle.
      for (const [packed, items] of this.cells) {
        const cx = Math.round(packed / 2_097_152);
        const cy = packed - cx * 2_097_152;
        if (cx >= ax && cx <= bx && cy >= ay && cy <= by) for (const index of items) found.add(index);
      }
    } else {
      for (let cx = ax; cx <= bx; cx++) {
        for (let cy = ay; cy <= by; cy++) for (const index of this.cells.get(key(cx, cy)) ?? []) found.add(index);
      }
    }
    for (const index of this.large) found.add(index);
    // The grid is cell-granular: keep only the boxes that really touch the rectangle.
    return [...found].filter((index) => touches(this.boxes[index] as Rect, rect)).sort((a, b) => a - b);
  }
}

export function buildGridIndex(scene: Scene): GridIndex {
  const nodes = new Layer(nodeBoxes(scene));
  const edges = new Layer(edgeBoxes(scene));
  return { nodeCount: scene.nodes.length, edgeCount: scene.edges.length, query: (rect) => ({ nodes: nodes.query(rect), edges: edges.query(rect) }) };
}
