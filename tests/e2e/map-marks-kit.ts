/** Step 8.4b: the layout fixture with a few reactions added at run time (the committed fixture is not edited). Test code only. */
import type { Page } from '@playwright/test';
import { MAP_LAYOUT } from './map-layout-kit';

interface Extra {
  readonly from: string;
  readonly to: string;
  readonly chapter: number;
}

interface Loose {
  id: string;
  name?: string;
  topicId?: string;
  target?: unknown;
  participants: [{ id: string; ref: unknown }];
  stages: [{ id: string; participantIds: string[] }];
  outcomes: [{ id: string; products: [{ id: string; ref: unknown }] }];
  [key: string]: unknown;
}

export function layoutWith(extra: readonly Extra[]): Buffer {
  const doc = JSON.parse(MAP_LAYOUT.toString('utf8')) as { records: Record<string, Record<string, unknown>[]> };
  const reactions = doc.records.reaction as unknown as Loose[];
  const mappings = doc.records.topic_mapping as unknown as Loose[];
  const model = reactions[0] as Loose;
  const mapping = mappings[0] as Loose;
  extra.forEach((one, i) => {
    const n = `x${i}`;
    const r = JSON.parse(JSON.stringify(model)) as Loose;
    r.id = `rxn_extra-${n}`;
    r.name = `Extra reaction ${n}`;
    r.participants[0].id = `prt_extra-${n}`;
    r.participants[0].ref = { kind: 'class', id: one.from };
    r.stages[0].id = `stg_extra-${n}`;
    r.stages[0].participantIds = [`prt_extra-${n}`];
    r.outcomes[0].id = `out_extra-${n}`;
    r.outcomes[0].products[0].id = `pdt_extra-${n}`;
    r.outcomes[0].products[0].ref = { kind: 'class', id: one.to };
    reactions.push(r);
    mappings.push({ ...JSON.parse(JSON.stringify(mapping)), id: `tmp_extra-${n}`, topicId: `top_section-${one.chapter}`, target: { kind: 'reaction', id: r.id } });
  });
  return Buffer.from(JSON.stringify(doc));
}

const fam = (n: number): string => `cls_family-${String(n).padStart(2, '0')}`;
/** Chapter 4 of the fixture is one two-way pair (families 8 and 13) and two one-way arrows: here the pair gets 2 more reactions one way (counts 3 and 1). */
export const PAIR_DATA = (): Buffer => layoutWith([{ from: fam(8), to: fam(13), chapter: 4 }, { from: fam(8), to: fam(13), chapter: 4 }]);
/** 17 reactions from 17 different families into the bucket (more than 15 arrows). */
export const BUCKET_DATA = (): Buffer => layoutWith(Array.from({ length: 17 }, (_, i) => ({ from: fam(1 + i), to: 'cls_orphan-a', chapter: 1 })));

export interface MarkMeasure {
  readonly strokes: number[];
  readonly hit: { width: string; effect: string }[];
  readonly chips: { id: string; left: number; top: number; right: number; bottom: number; textHeight: number }[];
  readonly nodes: { id: string; left: number; top: number; right: number; bottom: number }[];
  readonly head: number[];
}

/** What is drawn now, in SCREEN pixels. */
export async function measureMarks(page: Page): Promise<MarkMeasure> {
  return page.evaluate(() => {
    const rect = (el: Element) => el.getBoundingClientRect();
    const world = document.querySelector('svg [data-world]') as unknown as SVGGElement;
    const k = (world.getScreenCTM() as DOMMatrix).a;
    const paths = [...document.querySelectorAll('svg [data-layer="edges"] [data-edge-id] > path:not([data-hit])')] as SVGPathElement[];
    const strokes = paths.map((p) => {
      const cs = getComputedStyle(p);
      return parseFloat(cs.strokeWidth) * (cs.vectorEffect === 'non-scaling-stroke' ? 1 : k);
    });
    const hit = ([...document.querySelectorAll('svg [data-layer="edges"] [data-hit]')] as SVGPathElement[]).map((p) => ({ width: getComputedStyle(p).strokeWidth, effect: getComputedStyle(p).vectorEffect }));
    const markerPath = document.querySelector('svg marker path');
    const transform = markerPath === null ? 'none' : getComputedStyle(markerPath).transform;
    const head = markerPath === null ? [] : [10 * new DOMMatrix(transform === 'none' ? undefined : transform).a * k];
    const chips = [...document.querySelectorAll('svg [data-count-of]')].map((g) => {
      const b = rect(g);
      const t = g.querySelector('text');
      return { id: g.getAttribute('data-count-of') ?? '', left: b.left, top: b.top, right: b.right, bottom: b.bottom, textHeight: t === null ? 0 : rect(t).height };
    });
    const nodes = [...document.querySelectorAll('svg [data-node-id]')].map((g) => {
      const b = rect(g);
      return { id: g.getAttribute('data-node-id') ?? '', left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    });
    return { strokes, hit, chips, nodes, head };
  });
}

type Box = { left: number; top: number; right: number; bottom: number };
const cross = (a: Box, b: Box): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Problems found in one measurement (an empty list is a pass). */
export function marksProblems(m: MarkMeasure): string[] {
  const out: string[] = [];
  // step 8.4c, B: the sizes of 8.4b are the FLOORS now; marks grow with the map up to a ceiling (stroke 4 px, heavy 5; head 16; chip 30 px; hit area grows with the stroke)
  m.strokes.forEach((s) => {
    if (s < 2 - 0.1 || s > 5 + 0.1) out.push(`stroke ${s.toFixed(2)} px`);
  });
  m.hit.forEach((h) => {
    const width = parseFloat(h.width);
    if (h.effect !== 'non-scaling-stroke' || !(width >= 16 - 0.1) || width > 40) out.push(`hit ${h.width} ${h.effect}`);
  });
  m.head.forEach((h) => {
    if (h < 10 - 0.6 || h > 16 + 0.6) out.push(`arrowhead ${h.toFixed(2)} px`);
  });
  m.chips.forEach((c, i) => {
    if (c.bottom - c.top < 19.5 || c.bottom - c.top > 30.5) out.push(`chip ${c.id} ${(c.bottom - c.top).toFixed(1)} px tall`);
    if (c.textHeight < 12) out.push(`chip ${c.id} text ${c.textHeight.toFixed(1)} px`);
    m.chips.slice(i + 1).forEach((d) => cross(c, d) && out.push(`chips ${c.id} and ${d.id} overlap`));
    m.nodes.forEach((n) => cross(c, n) && out.push(`chip ${c.id} overlaps box ${n.id}`));
  });
  return out;
}
