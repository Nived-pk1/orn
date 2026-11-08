/** Step 8.4c: measuring helpers for the map's proportions, mark sizes and the two lines of a pair, all in SCREEN pixels. Test code only. */
import type { Page } from '@playwright/test';

export interface Rect {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The family boxes that are drawn (hubs), as screen rectangles. */
export async function hubRects(page: Page): Promise<Rect[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('svg [data-node-id][data-box="hub"]')].map((g) => {
      const b = g.getBoundingClientRect();
      return { id: g.getAttribute('data-node-id') ?? '', left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }),
  );
}

/** Ratios between neighbouring boxes: column gap over box width (boxes side by side) and row gap over box height (boxes above each other). */
export function gapRatios(rects: readonly Rect[]): { readonly columns: number; readonly rows: number; readonly pairs: number } {
  let columns = Infinity;
  let rows = Infinity;
  let pairs = 0;
  rects.forEach((a, i) => {
    rects.slice(i + 1).forEach((b) => {
      const sx = Math.max(a.left - b.right, b.left - a.right);
      const sy = Math.max(a.top - b.bottom, b.top - a.bottom);
      if (sy < 0 && sx > 0) {
        columns = Math.min(columns, sx / Math.max(a.right - a.left, b.right - b.left));
        pairs += 1;
      }
      if (sx < 0 && sy > 0) {
        rows = Math.min(rows, sy / Math.max(a.bottom - a.top, b.bottom - b.top));
        pairs += 1;
      }
    });
  });
  return { columns, rows, pairs };
}

/** Things inside one box that intersect: title, formula, "↻ n" and the badges; and "↻ n" or a badge that is not inside its box. Empty is a pass. */
export async function overlapsInBoxes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    type Box = { l: number; t: number; r: number; b: number };
    const box = (el: Element, slack = 0): Box => {
      const r = el.getBoundingClientRect();
      return { l: r.left, t: r.top + r.height * slack, r: r.right, b: r.bottom - r.height * slack };
    };
    const hit = (a: Box, b: Box): boolean => a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
    for (const node of document.querySelectorAll('svg [data-node-id][data-box="hub"]')) {
      const id = node.getAttribute('data-node-id') ?? '';
      const parts: { name: string; at: Box }[] = [];
      document.querySelector(`svg [data-label-of="${id}"]`)?.querySelectorAll('text').forEach((t, i) => parts.push({ name: i === 0 ? 'title' : 'formula', at: box(t, 0.15) }));
      const loops = document.querySelector(`svg [data-loops-of="${id}"]`);
      if (loops !== null) parts.push({ name: 'loops', at: box(loops) });
      document.querySelectorAll(`svg [data-badges-of="${id}"] [data-badge-kind]`).forEach((b) => parts.push({ name: `badge ${b.getAttribute('data-badge-kind')}`, at: box(b) }));
      parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => hit(a.at, b.at) && out.push(`${id}: ${a.name} overlaps ${b.name}`)));
      const outer = box(node);
      parts
        .filter((p) => p.name !== 'title' && p.name !== 'formula')
        .forEach((p) => {
          if (p.at.l < outer.l - 0.5 || p.at.r > outer.r + 0.5 || p.at.t < outer.t - 0.5 || p.at.b > outer.b + 0.5) out.push(`${id}: ${p.name} is not inside its box`);
        });
    }
    return out;
  });
}

export interface LineFacts {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly dashed: boolean;
  readonly tone: string | null;
  readonly stroke: number;
  /** Points along the line in screen px. */
  readonly points: { x: number; y: number }[];
}

/** The visible lines (not the hit paths) between two families, sampled along their length. */
export async function linesBetween(page: Page, a: string, b: string, samples = 60): Promise<LineFacts[]> {
  return page.evaluate(
    ({ x, y, n }) =>
      [...document.querySelectorAll('svg [data-layer="edges"] [data-edge-id]')]
        .filter((g) => {
          const from = g.getAttribute('data-from');
          const to = g.getAttribute('data-to');
          return (from === x && to === y) || (from === y && to === x);
        })
        .map((g) => {
          const path = g.querySelector('path:not([data-hit])') as unknown as SVGPathElement;
          const m = path.getScreenCTM() as DOMMatrix;
          const len = path.getTotalLength();
          const points = Array.from({ length: n + 1 }, (_, i) => {
            const p = path.getPointAtLength((len * i) / n);
            return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
          });
          const cs = getComputedStyle(path);
          return {
            id: g.getAttribute('data-edge-id') ?? '',
            from: g.getAttribute('data-from') ?? '',
            to: g.getAttribute('data-to') ?? '',
            dashed: path.hasAttribute('stroke-dasharray'),
            tone: path.getAttribute('data-tone'),
            stroke: parseFloat(cs.strokeWidth) * (cs.vectorEffect === 'non-scaling-stroke' ? 1 : m.a),
            points,
          };
        }),
    { x: a, y: b, n: samples },
  );
}

function toSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  if (run === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (run * run)));
  return Math.hypot(p.x - (a.x + (b.x - a.x) * t), p.y - (a.y + (b.y - a.y) * t));
}

/** The least gap between the stroke EDGES of two lines, over the whole length of the first, ends included (screen px). */
export function edgeGap(first: LineFacts, second: LineFacts): number {
  let least = Infinity;
  for (const p of first.points) for (let i = 1; i < second.points.length; i += 1) least = Math.min(least, toSegment(p, second.points[i - 1] as { x: number; y: number }, second.points[i] as { x: number; y: number }));
  return least - (first.stroke + second.stroke) / 2;
}

export interface MarkSizes {
  readonly zoom: number;
  readonly strokes: number[];
  readonly hits: number[];
  readonly heads: number[];
  readonly chipHeights: number[];
  readonly chipText: number[];
}

/** The sizes of the marks drawn now, in screen px. */
export async function markSizes(page: Page): Promise<MarkSizes> {
  return page.evaluate(() => {
    const world = document.querySelector('svg [data-world]') as unknown as SVGGElement;
    const k = (world.getScreenCTM() as DOMMatrix).a;
    const px = (el: Element): number => {
      const cs = getComputedStyle(el);
      return parseFloat(cs.strokeWidth) * (cs.vectorEffect === 'non-scaling-stroke' ? 1 : k);
    };
    const strokes = [...document.querySelectorAll('svg [data-layer="edges"] [data-edge-id] > path:not([data-hit])')].map(px);
    const hits = [...document.querySelectorAll('svg [data-layer="edges"] [data-hit]')].map(px);
    const marker = document.querySelector('svg marker path');
    const t = marker === null ? 'none' : getComputedStyle(marker).transform;
    const heads = marker === null ? [] : [10 * new DOMMatrix(t === 'none' ? undefined : t).a * k];
    const chips = [...document.querySelectorAll('svg [data-count-of]')];
    return {
      zoom: k,
      strokes,
      hits,
      heads,
      chipHeights: chips.map((c) => c.getBoundingClientRect().height),
      chipText: chips.map((c) => {
        const text = c.querySelector('text');
        return text === null ? 0 : parseFloat(getComputedStyle(text).fontSize) * (text.getScreenCTM()?.a ?? 1);
      }),
    };
  });
}
