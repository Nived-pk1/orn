/**
 * Step 8.5h A2 and A4 on REAL RDKit and every demo step with electron movements (the owner's own drawn steps are the same seven):
 * orientation as in a textbook (aldol step 2 lies flat, and the enolate keeps the way the ethanal of step 1 was turned), no curved arrow
 * runs over a bond or a label of any species outside a short zone at its own tail and head, no arrowhead sits inside or beyond a label,
 * and the wins of 8.5g still hold. Step 8.5h Part B: all of it in Skeletal AND Condensed (B1); species stay in the written order and a
 * species is shown as the step before showed it (B2). The bond lines and label boxes are read by the TEST's own reader from the drawings' SVG.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import type { StructureMode } from '@/chem/contracts';
import type { StructureRep } from '@/core/schema';
import type { DrawableStep, StepDrawingPort } from '@/render/mechanism/contracts';
import { composeStep, type CurvedArrow, type MovementInput } from '@/render/mechanism/geometry';
import { loadStep, type LoadedStep } from '@/render/mechanism/step-model';
import demo from '../../data/seed/demo.orn.json';

/** The zone at an arrow's own tail and head, in drawing units (a bond is 54): inside it the arrow may touch what it starts or ends on. */
const ZONE = 12;
/** How close to a bond line a path may not come outside the zones. */
const NEAR = 1.2;

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

/** The mode the drawings are asked in; each describe block below sets it. */
let mode: StructureMode = 'skeletal';
const port: StepDrawingPort = {
  async depict(structure: StructureRep, positions: boolean, turn?: number) {
    const out = await toolkit.depict(structure, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, mode, atomPositions: positions, ...(turn === undefined ? {} : { turn }) });
    if (!out.ok) return { ok: false, reason: out.reason, message: out.error };
    const d = out.depiction;
    return { ok: true, svg: d.svg, width: d.width, height: d.height, ...(d.atoms === undefined ? {} : { atoms: d.atoms, bonds: d.bonds ?? [], glyphs: d.glyphs ?? [] }) };
  },
  createUrl: () => '',
  revokeUrl: () => {},
};

interface DemoStep {
  readonly id: string;
  readonly species: readonly { role: never; label?: string; structure?: StructureRep }[];
  readonly electronMovements?: readonly MovementInput[];
  readonly reversible?: boolean;
}
type Mechanism = { id?: string; variants: { steps: DemoStep[] }[]; record?: Mechanism };
const mechanisms = (demo as unknown as { records: { mechanism: Mechanism[] } }).records.mechanism.map((m) => m.record ?? m);

/** A step as the screen hands it over: with the step before it, when there is one. */
function drawable(steps: readonly DemoStep[], k: number): DrawableStep {
  const s = steps[k] as DemoStep;
  return { number: k + 1, species: s.species, electronMovements: s.electronMovements ?? [], reversible: s.reversible === true, ...(k === 0 ? {} : { previous: drawable(steps, k - 1) }) };
}
const drawnSteps = mechanisms.flatMap((m) => m.variants.flatMap((v) => v.steps.flatMap((s, k) => ((s.electronMovements ?? []).length > 0 && s.species.some((x) => x.structure !== undefined) ? [{ id: s.id, step: drawable(v.steps, k) }] : []))));
const stepNamed = (id: string): DrawableStep => (drawnSteps.find((s) => s.id === id) as { step: DrawableStep }).step;

type Ready = Extract<LoadedStep, { status: 'ready' }>;
type Point = { readonly x: number; readonly y: number };
async function composed(step: DrawableStep) {
  const loaded = (await loadStep(step, port)) as Ready;
  expect(loaded.status).toBe('ready');
  const out = composeStep({ before: loaded.before.map((p) => p.drawn), after: loaded.after.map((p) => p.drawn), orientation: 'row', reversible: false, movements: step.electronMovements });
  if (!out.ok) throw new Error('missing atoms');
  const atoms = new Map<number, Point>();
  loaded.before.forEach((part, k) => {
    const at = out.items[k] as Point;
    for (const a of part.drawn.atoms) atoms.set(a.map, { x: a.x + at.x, y: a.y + at.y });
  });
  return { loaded, out, atoms };
}

type Segment = readonly [Point, Point];
interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
/** The bond strokes and the label glyph boxes of every species of the before side, in the frame of the composed picture. */
async function obstacles(step: DrawableStep): Promise<{ lines: Segment[]; glyphs: Box[]; arrows: readonly CurvedArrow[]; atoms: ReadonlyMap<number, Point> }> {
  const { loaded, out, atoms } = await composed(step);
  const lines: Segment[] = [];
  const glyphs: Box[] = [];
  loaded.before.forEach((part, k) => {
    const at = out.items[k] as Point;
    for (const tag of (part.svg ?? '').match(/<path\s[^>]*>/g) ?? []) {
      const cls = /class=['"]([^'"]*)['"]/.exec(tag)?.[1] ?? '';
      const n = (/\sd=['"]([^'"]+)['"]/.exec(tag)?.[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const points: Point[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) points.push({ x: (n[i] as number) + at.x, y: (n[i + 1] as number) + at.y });
      if (cls.startsWith('bond-')) points.slice(1).forEach((p, i) => lines.push([points[i] as Point, p]));
      if (/^atom-\d+$/.test(cls)) glyphs.push({ x0: Math.min(...points.map((p) => p.x)), x1: Math.max(...points.map((p) => p.x)), y0: Math.min(...points.map((p) => p.y)), y1: Math.max(...points.map((p) => p.y)) });
    }
  });
  return { lines, glyphs, arrows: out.arrows, atoms };
}

function sample(path: string): Point[] {
  const n = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const p = (i: number): Point => ({ x: n[i] as number, y: n[i + 1] as number });
  return Array.from({ length: 201 }, (_, k) => {
    const t = k / 200;
    const u = 1 - t;
    if (n.length === 6) return { x: u * u * p(0).x + 2 * u * t * p(2).x + t * t * p(4).x, y: u * u * p(0).y + 2 * u * t * p(2).y + t * t * p(4).y };
    return { x: u ** 3 * p(0).x + 3 * u * u * t * p(2).x + 3 * u * t * t * p(4).x + t ** 3 * p(6).x, y: u ** 3 * p(0).y + 3 * u * u * t * p(2).y + 3 * u * t * t * p(4).y + t ** 3 * p(6).y };
  });
}
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
function toSegment(p: Point, [a, b]: Segment): number {
  const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len));
  return dist(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
}
const inside = (p: Point, g: Box, pad: number): boolean => p.x > g.x0 - pad && p.x < g.x1 + pad && p.y > g.y0 - pad && p.y < g.y1 + pad;
/** The angle of the line from a to b from the horizontal, 0 to 90 degrees. */
const tilt = (a: Point, b: Point): number => {
  const d = Math.abs((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  return Math.min(d, 180 - d);
};
const direction = (a: Point, b: Point): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
const turnedBy = (a: number, b: number): number => Math.abs(((a - b + 540) % 360) - 180);

describe.each(['skeletal', 'condensed'] as const)('%s', (wanted) => {
beforeAll(() => {
  mode = wanted;
});

describe('orientation (A2)', () => {
  it('aldol step 2: the enolate’s C=C-O and the ethanal’s C-C=O lie within 30 degrees of horizontal', async () => {
    const { atoms } = await composed(stepNamed('mst_aldol-base-2'));
    const at = (map: number): Point => atoms.get(map) as Point;
    console.log(`aldol step 2 tilts: enolate ${tilt(at(3), at(5)).toFixed(1)}, ethanal ${tilt(at(6), at(8)).toFixed(1)} degrees`);
    expect(tilt(at(3), at(5))).toBeLessThanOrEqual(30.5);
    expect(tilt(at(6), at(8))).toBeLessThanOrEqual(30.5);
  }, 60_000);

  it('the enolate of step 2 is turned the same way as the ethanal it came from in step 1', async () => {
    const one = (await composed(stepNamed('mst_aldol-base-1'))).atoms;
    const two = (await composed(stepNamed('mst_aldol-base-2'))).atoms;
    for (const [a, b] of [[3, 5], [3, 4], [4, 5]] as const) {
      const off = turnedBy(direction(one.get(a) as Point, one.get(b) as Point), direction(two.get(a) as Point, two.get(b) as Point));
      expect(off, `${a} to ${b}: ${off.toFixed(1)} degrees`).toBeLessThanOrEqual(30.5);
    }
  }, 60_000);

  it('the same input gives the same picture', async () => {
    const step = stepNamed('mst_aldol-base-3');
    expect((await composed(step)).out).toEqual((await composed(step)).out);
  }, 60_000);
});

describe('the wins of 8.5g still hold', () => {
  it('aldol step 1: the hydroxide arrow is at most 75 units', async () => {
    const arrow = (await composed(stepNamed('mst_aldol-base-1'))).out.arrows[0] as CurvedArrow;
    console.log(`aldol step 1 hydroxide arrow: ${dist(arrow.start, arrow.end).toFixed(1)} units`);
    expect(dist(arrow.start, arrow.end)).toBeLessThanOrEqual(75);
  }, 60_000);

  it('SN2: the attack comes in at 150 degrees or more from the leaving group', async () => {
    const { out, atoms } = await composed(stepNamed('mst_sn2-concerted-1'));
    const carbon = atoms.get(2) as Point;
    const angle = turnedBy(direction(carbon, (out.arrows[0] as CurvedArrow).start), direction(carbon, atoms.get(3) as Point));
    console.log(`SN2 attack to leaving group: ${angle.toFixed(1)} degrees`);
    expect(angle).toBeGreaterThanOrEqual(150);
  }, 60_000);
});

describe('arrows keep off their own molecules (A4)', () => {
  it('there are the demo steps to check', () => {
    expect(drawnSteps.length).toBeGreaterThanOrEqual(7);
  });

  for (const { id, step } of drawnSteps) {
    it(`${id}: no arrow path crosses a bond or a label outside its end zones, and no arrowhead is inside or beyond a label`, async () => {
      const { lines, glyphs, arrows, atoms } = await obstacles(step);
      const problems: string[] = [];
      arrows.forEach((arrow, k) => {
        const middle = sample(arrow.path).filter((p) => dist(p, arrow.start) > ZONE && dist(p, arrow.end) > ZONE);
        const onBond = middle.filter((p) => lines.some((l) => toSegment(p, l) < NEAR)).length;
        const onLabel = middle.filter((p) => glyphs.some((g) => inside(p, g, 0.5))).length;
        if (onBond > 0) problems.push(`arrow ${k + 1} runs over a bond (${onBond} of 201 samples)`);
        if (onLabel > 0) problems.push(`arrow ${k + 1} runs over a label (${onLabel} samples)`);
        if ([arrow.head.tip, ...arrow.head.wings].some((p) => glyphs.some((g) => inside(p, g, 0)))) problems.push(`arrow ${k + 1}: the head is inside a label`);
        const target = (step.electronMovements[k] as MovementInput).to;
        if (target.kind === 'bond') return;
        const centre = atoms.get(target.atom) as Point;
        const near = (arrow.head.tip.x - centre.x) * (arrow.start.x - centre.x) + (arrow.head.tip.y - centre.y) * (arrow.start.y - centre.y);
        if (near < -1) problems.push(`arrow ${k + 1}: the head is past atom ${target.atom}, on the far side of it`);
      });
      expect(problems).toEqual([]);
    }, 60_000);
  }
});

describe('the written order and the picture just seen (8.5h B2)', () => {
  /** The index in the step's species list of each drawn part of the before side. */
  const writtenIndexes = async (step: DrawableStep): Promise<number[]> => {
    const { loaded } = await composed(step);
    const mapsOf = (value: string): string => [...value.matchAll(/:(\d+)\]/g)].map((m) => Number(m[1])).sort((a, b) => a - b).join();
    return loaded.before.map((part) => {
      const maps = part.drawn.atoms.map((a) => a.map).sort((a, b) => a - b).join();
      return step.species.findIndex((one) => mapsOf(one.structure?.value ?? '') === maps);
    });
  };

  it('aldol step 2 shows enolate + ethanal, as written', async () => {
    expect(await writtenIndexes(stepNamed('mst_aldol-base-2'))).toEqual([0, 1]);
  }, 60_000);

  for (const { id, step } of drawnSteps) {
    it(`${id}: the species of the before side stay in the written order`, async () => {
      const order = await writtenIndexes(step);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }, 60_000);
  }

  it('aldol step 3: the alkoxide is turned like the product of step 2', async () => {
    const two = (await composed(stepNamed('mst_aldol-base-2'))).loaded.after[0]?.drawn.atoms ?? [];
    const was = new Map(two.map((a) => [a.map, a as Point]));
    const three = (await composed(stepNamed('mst_aldol-base-3'))).atoms;
    const shared = [...was.keys()].filter((map) => three.has(map));
    expect(shared.length).toBeGreaterThanOrEqual(5);
    let worst = 0;
    shared.forEach((a, i) => {
      for (const b of shared.slice(i + 1)) worst = Math.max(worst, turnedBy(direction(was.get(a) as Point, was.get(b) as Point), direction(three.get(a) as Point, three.get(b) as Point)));
    });
    console.log(`${mode} aldol step 3 alkoxide against the product of step 2: ${worst.toFixed(1)} degrees at most`);
    expect(worst).toBeLessThanOrEqual(30.5);
  }, 60_000);
});
});
