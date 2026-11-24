/**
 * Step 8.5c C1 (8.5b carried + reviewer finding R2): lone-pair and radical dots never sit over any glyph of a label (letters, hydrogen counts,
 * the charge sign: a charge must always show) and a curved arrow crosses no label glyph, in every demo mechanism step (real RDKit, the step model and
 * the layout the screen uses) and on the M1 fixtures (every labelled atom, a lone pair and a radical, towards four directions). The glyph boxes are
 * read by the TEST's own reader from the drawing's SVG, not from the code under test. An arrow that cannot avoid a label (both sides cross) must SAY so
 * (`crossings` > 0 on that arrow): nothing silent.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { composeStep, layoutArrows } from '@/render/mechanism/geometry';
import type { AtomBox, CurvedArrow, MovementInput } from '@/render/mechanism/geometry';
import type { StepDrawingPort } from '@/render/mechanism/contracts';
import { loadStep } from '@/render/mechanism/step-model';
import type { StructureRep } from '@/core/schema';
import demo from '../../data/seed/demo.orn.json';

let toolkit: StructureToolkit;
beforeAll(async () => {
  const shared = await loadRdkit();
  toolkit = createRdkitToolkit({ load: async () => shared });
  await toolkit.ready();
}, 60_000);

const port: StepDrawingPort = {
  async depict(structure: StructureRep, positions: boolean) {
    const out = await toolkit.depict(structure, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, ...(positions ? { atomPositions: true } : {}) });
    if (!out.ok) return { ok: false, reason: out.reason, message: out.error };
    const d = out.depiction;
    const glyphs = (d as { glyphs?: unknown }).glyphs;
    return { ok: true, svg: d.svg, width: d.width, height: d.height, ...(d.atoms === undefined ? {} : { atoms: d.atoms, bonds: d.bonds ?? [] }), ...(glyphs === undefined ? {} : { glyphs }) } as never;
  },
  createUrl: () => '',
  revokeUrl: () => {},
};

interface Box {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
/** Every label glyph (`atom-N` path) of a drawing, by the test's own reader. */
function glyphsOf(svg: string): Box[] {
  return [...svg.matchAll(/<path\s[^>]*?class=['"]atom-\d+['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => {
    const n = (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
}
const DOT_R = 1.9;
const hitsPoint = (b: Box, x: number, y: number, r: number): boolean => x + r > b.x0 && x - r < b.x1 && y + r > b.y0 && y - r < b.y1;

/** Points along an arrow path ("M a b Q c d e f" or "M .. C ..."), by the test's own sampler. */
function sample(path: string): { x: number; y: number }[] {
  const n = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
  const p = (i: number) => ({ x: n[i] as number, y: n[i + 1] as number });
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k <= 60; k += 1) {
    const t = k / 60;
    const u = 1 - t;
    if (n.length === 6) out.push({ x: u * u * p(0).x + 2 * u * t * p(2).x + t * t * p(4).x, y: u * u * p(0).y + 2 * u * t * p(2).y + t * t * p(4).y });
    else out.push({ x: u ** 3 * p(0).x + 3 * u * u * t * p(2).x + 3 * u * t * t * p(4).x + t ** 3 * p(6).x, y: u ** 3 * p(0).y + 3 * u * u * t * p(2).y + 3 * u * t * t * p(4).y + t ** 3 * p(6).y });
  }
  return out;
}

/** What is wrong with these arrows against these glyph boxes (all in one frame). */
function problems(arrows: readonly CurvedArrow[], glyphs: readonly Box[], where: string): string[] {
  const found: string[] = [];
  arrows.forEach((arrow, k) => {
    for (const dot of arrow.dots) if (glyphs.some((g) => hitsPoint(g, dot.x, dot.y, DOT_R))) found.push(`${where} arrow ${k + 1}: a dot at ${dot.x.toFixed(1)},${dot.y.toFixed(1)} is over a label glyph`);
    const crossing = sample(arrow.path).filter((s) => glyphs.some((g) => hitsPoint(g, s.x, s.y, 0.5))).length;
    const said = (arrow as { crossings?: number }).crossings ?? 0;
    if (crossing > 0 && said === 0) found.push(`${where} arrow ${k + 1}: the path crosses a label glyph (${crossing} of 61 samples) and the arrow does not say so`);
  });
  return found;
}

interface DemoStep {
  readonly id: string;
  readonly species: readonly { role: never; label?: string; structure?: StructureRep }[];
  readonly electronMovements?: readonly MovementInput[];
  readonly reversible?: boolean;
}
type Mechanism = { variants?: { steps: DemoStep[] }[]; record?: { variants?: { steps: DemoStep[] }[] } };
const steps: DemoStep[] = [];
for (const m of (demo as unknown as { records: { mechanism: Mechanism[] } }).records.mechanism) {
  for (const v of (m.record ?? m).variants ?? []) for (const s of v.steps) if ((s.electronMovements ?? []).length > 0) steps.push(s);
}

describe('no dot and no arrow covers a label glyph in any demo step (real RDKit)', () => {
  for (const step of steps) {
    it(step.id, async () => {
      const movements = step.electronMovements ?? [];
      const loaded = await loadStep({ number: 1, species: step.species, electronMovements: movements, reversible: step.reversible === true }, port);
      expect(loaded.status).toBe('ready');
      if (loaded.status !== 'ready') return;
      const composed = composeStep({ before: loaded.before.map((p) => p.drawn), after: loaded.after.map((p) => p.drawn), orientation: 'row', reversible: false, movements });
      expect(composed.ok).toBe(true);
      if (!composed.ok) return;
      const glyphs: Box[] = [];
      loaded.before.forEach((part, k) => {
        const at = composed.items[k] as { x: number; y: number };
        for (const g of glyphsOf(part.svg ?? '')) glyphs.push({ x0: g.x0 + at.x, x1: g.x1 + at.x, y0: g.y0 + at.y, y1: g.y1 + at.y });
      });
      expect(problems(composed.arrows, glyphs, step.id)).toEqual([]);
    }, 30_000);
  }
});

const FIXTURES = ['[OH-:1]', '[SH-:1]', '[OH2:1]', '[NH3:1]', '[NH4+:1]', '[OH3+:1]', '[NH2-:1]', '[Br-:1]', '[Cl-:1]', '[CH3:2][OH:1]', '[CH3:2][NH3+:1]', '[CH3:3][CH2:2][O-:1]', '[CH3:2][Br:1]', '[CH3:2][OH2+:1]', '[NH-:1][CH3:2]'];
const AWAY = [{ x: 70, y: 0 }, { x: -70, y: 0 }, { x: 0, y: -70 }, { x: 0, y: 70 }];

describe('the M1 fixtures: a lone pair or a radical on a labelled atom never covers its own label', () => {
  for (const value of FIXTURES) {
    it(value, async () => {
      const out = await toolkit.depict({ format: 'smiles', value }, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const d = out.depiction;
      const glyphs = (((d as { glyphs?: readonly { x0: number; x1: number; y0: number; y1: number }[] }).glyphs) ?? glyphsOf(d.svg)) as Box[];
      const own = glyphsOf(d.svg);
      const atoms = new Map<number, AtomBox>((d.atoms ?? []).map((a) => [a.map, { x: a.x, y: a.y, rx: a.rx, ry: a.ry, ...(glyphs.length > 0 ? { glyphs } : {}) } as AtomBox]));
      const bonds = (d.bonds ?? []).map((b) => [b.a, b.b] as const);
      const me = atoms.get(1) as AtomBox;
      for (const kind of ['lone_pair', 'radical'] as const) {
        for (const off of AWAY) {
          const target: AtomBox = { x: me.x + off.x, y: me.y + off.y, rx: 3, ry: 3 };
          const drawn = layoutArrows([{ from: { kind, atom: 1 }, to: { kind: 'atom', atom: 99 }, electrons: kind === 'radical' ? 1 : 2 }], { atoms: new Map([...atoms, [99, target]]), bonds, glyphs: own } as never);
          expect(drawn.ok).toBe(true);
          if (!drawn.ok) continue;
          expect(problems(drawn.arrows, own, `${value} ${kind} towards ${off.x},${off.y}`)).toEqual([]);
        }
      }
    });
  }
});
