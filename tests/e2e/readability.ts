/**
 * Readability measurements for the e2e specs (step 5.5a, item h): the rectangles of the arrow text and the count badges, the node boxes
 * and the Scene bounds, read from the DOM in WORLD coordinates (the text elements carry no transform of their own, so `getBBox` of a
 * text is already in the world; node and count groups carry a translate). Real fonts, the production build. Test code only.
 */
import type { Page } from '@playwright/test';

export interface Rect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Measured {
  readonly labels: Rect[];
  readonly nodes: Rect[];
  readonly bounds: { readonly width: number; readonly height: number };
  /** Segments of every drawn route, with the id of its edge. */
  readonly segments: { readonly id: string; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }[];
}

export async function measure(page: Page): Promise<Measured> {
  return page.evaluate(() => {
    const translate = (el: Element): { x: number; y: number } => {
      const found = /translate\((-?[\d.e+-]+)[ ,]+(-?[\d.e+-]+)\)/.exec(el.getAttribute('transform') ?? '');
      return found === null ? { x: 0, y: 0 } : { x: Number(found[1]), y: Number(found[2]) };
    };
    const labels: Measured['labels'] = [];
    for (const group of document.querySelectorAll('[data-arrow-text-of]')) {
      const id = group.getAttribute('data-arrow-text-of') ?? '';
      group.querySelectorAll('text').forEach((text, i) => {
        const b = (text as SVGTextElement).getBBox();
        labels.push({ id: `${id}#${i}`, x: b.x, y: b.y, width: b.width, height: b.height });
      });
    }
    for (const group of document.querySelectorAll('[data-count-of]')) {
      const at = translate(group);
      const rect = group.querySelector('rect');
      labels.push({ id: `${group.getAttribute('data-count-of') ?? ''}#count`, x: at.x, y: at.y, width: Number(rect?.getAttribute('width') ?? 0) + 1, height: Number(rect?.getAttribute('height') ?? 0) + 1 });
    }
    const nodes: Measured['nodes'] = [];
    for (const group of document.querySelectorAll('[data-node-id]')) {
      const at = translate(group);
      const rect = group.querySelector('rect');
      nodes.push({ id: group.getAttribute('data-node-id') ?? '', x: at.x, y: at.y, width: Number(rect?.getAttribute('width') ?? 0), height: Number(rect?.getAttribute('height') ?? 0) });
    }
    const svg = document.querySelector('svg[data-scene-width]');
    const segments: Measured['segments'] = [];
    for (const group of document.querySelectorAll('[data-edge-id]')) {
      const path = group.querySelector('path:not([data-hit])');
      const points = [...(path?.getAttribute('d') ?? '').matchAll(/[ML](-?[\d.e+-]+) (-?[\d.e+-]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1] as { x: number; y: number };
        const b = points[i] as { x: number; y: number };
        segments.push({ id: group.getAttribute('data-edge-id') ?? '', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
      }
    }
    return { labels, nodes, bounds: { width: Number(svg?.getAttribute('data-scene-width') ?? 0), height: Number(svg?.getAttribute('data-scene-height') ?? 0) }, segments };
  });
}

const EPS = 0.5;
const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - EPS && b.x < a.x + a.width - EPS && a.y < b.y + b.height - EPS && b.y < a.y + a.height - EPS;

/** Does the segment cross the rectangle (Liang-Barsky clipping against the rectangle)? */
function crosses(s: Measured['segments'][number], r: Rect): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, s.x1 - r.x], [dx, r.x + r.width - s.x1], [-dy, s.y1 - r.y], [dy, r.y + r.height - s.y1]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
    }
  }
  return t0 < t1;
}

export interface Problems {
  readonly labelOverLabel: string[];
  readonly labelOverNode: string[];
  readonly outside: string[];
  /** How many text rectangles a line crosses (reported, not asserted). */
  readonly linesCrossingText: number;
  readonly labels: number;
}

/** The overlaps the readability item asks to be zero, and the crossings it asks to be reported. */
export function problemsOf(m: Measured): Problems {
  const labelOverLabel: string[] = [];
  for (let i = 0; i < m.labels.length; i += 1) {
    for (let j = i + 1; j < m.labels.length; j += 1) {
      const a = m.labels[i] as Rect;
      const b = m.labels[j] as Rect;
      // the two lines of one arrow are stacked in one box: they are one label
      if (a.id.split('#')[0] === b.id.split('#')[0] && !a.id.endsWith('#count') && !b.id.endsWith('#count')) continue;
      if (overlap(a, b)) labelOverLabel.push(`${a.id} / ${b.id}`);
    }
  }
  const labelOverNode = m.labels.flatMap((l) => m.nodes.filter((n) => overlap(l, n)).map((n) => `${l.id} / ${n.id}`));
  const outside = m.labels.filter((l) => l.x < -EPS || l.y < -EPS || l.x + l.width > m.bounds.width + EPS || l.y + l.height > m.bounds.height + EPS).map((l) => l.id);
  const crossed = new Set<string>();
  for (const l of m.labels) for (const s of m.segments) if (crosses(s, l)) crossed.add(l.id);
  return { labelOverLabel, labelOverNode, outside, linesCrossingText: crossed.size, labels: m.labels.length };
}
