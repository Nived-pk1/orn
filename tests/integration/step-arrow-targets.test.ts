/**
 * Step 8.5b A2 (reviewer's finding R1): every curved arrow of every demo mechanism step ENDS ON ITS TARGET, on the real worker output (real
 * RDKit, the step model and the layout the screen uses). The expectation is written from the step's DATA only, not from the code under
 * test: a lone pair or atom target is that atom; a bond that already exists is its midpoint; a bond the step FORMS (its two atoms are in
 * different species, or are not bonded yet) is the atom of it that the movement does not start from (a lone pair on O1 into the new
 * bond O1-C2 ends on C2, not in the gap between them). For a target atom with a label (O, N, Br, a charge) the position table must lie in
 * the glyph of the ELEMENT LETTER, not elsewhere in the label. Also the M1 fixtures: every labelled atom's position is in a letter glyph.
 * Written to FAIL on 0386c4f (a formed bond ended at the midpoint in the gap; a label's position was the centre of its whole label).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRdkitToolkit, loadRdkit, type StructureToolkit } from '@/chem';
import { composeStep } from '@/render/mechanism/geometry';
import type { MovementInput } from '@/render/mechanism/geometry';
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
    return { ok: true, svg: d.svg, width: d.width, height: d.height, ...(d.atoms === undefined ? {} : { atoms: d.atoms, bonds: d.bonds ?? [] }) };
  },
  createUrl: () => '',
  revokeUrl: () => {},
};

interface Glyph {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
/** The label glyphs (`atom-N` paths) of a drawing, read by the test's own reader. */
function glyphsOf(svg: string): Glyph[] {
  return [...svg.matchAll(/<path\s[^>]*?class=['"]atom-\d+['"][^>]*?\sd=['"]([^'"]+)['"]/g)].map((m) => {
    const n = (m[1] ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
    const xs = n.filter((_, i) => i % 2 === 0);
    const ys = n.filter((_, i) => i % 2 === 1);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  });
}
/** Is the point inside a glyph of full letter size (not a subscript count, a charge, a dot) of a label? */
function inLetterGlyph(svg: string, x: number, y: number): boolean {
  const glyphs = glyphsOf(svg);
  const tall = Math.max(0, ...glyphs.map((g) => g.y1 - g.y0));
  return glyphs.some((g) => g.y1 - g.y0 >= 0.8 * tall && g.x1 - g.x0 >= 5 && x >= g.x0 - 1 && x <= g.x1 + 1 && y >= g.y0 - 1 && y <= g.y1 + 1);
}
const nearLabel = (svg: string, x: number, y: number): boolean => glyphsOf(svg).some((g) => x >= g.x0 - 12 && x <= g.x1 + 12 && y >= g.y0 - 12 && y <= g.y1 + 12);

const atomsOfSite = (site: MovementInput['from']): readonly number[] => (site.kind === 'bond' ? site.atoms : [site.atom]);
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

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

interface Where {
  readonly x: number;
  readonly y: number;
  readonly svg: string;
  readonly dx: number;
  readonly dy: number;
}

describe('every arrow of the demo steps ends on its target (real RDKit)', () => {
  it('there are demo steps with movements to check', () => {
    expect(steps.length).toBeGreaterThanOrEqual(7);
  });

  /**
   * DATA FAULT, reported to the reviewer (8.5b notes A1; the demo is not edited by the implementer): "Hydroxide (regenerated)" has the role
   * `catalyst`, which the sides rule puts BEFORE, so atom 10 is held by two before-side species and the step is (correctly, in words) "No
   * drawing". Proposed correction: role `leaving_group` (or `product`). When the demo is corrected this entry must be removed.
   */
  const DATA_FAULT = new Set(['mst_aldol-base-3']);
  it('a step with a known data fault is shown as "No drawing" (never a partial arrow) until the reviewer corrects the data', async () => {
    const step = steps.find((s) => s.id === 'mst_aldol-base-3') as DemoStep;
    const loaded = await loadStep({ number: 1, species: step.species, electronMovements: step.electronMovements ?? [], reversible: true }, port);
    expect(loaded.status).toBe('none');
  });

  for (const step of steps.filter((s) => !DATA_FAULT.has(s.id))) {
    it(`${step.id}: each arrow end is on its target atom or bond, and a labelled target is hit on its element letter`, async () => {
      const movements = step.electronMovements ?? [];
      const loaded = await loadStep({ number: 1, species: step.species, electronMovements: movements, reversible: step.reversible === true }, port);
      expect(loaded.status).toBe('ready');
      if (loaded.status !== 'ready') return;
      const composed = composeStep({ before: loaded.before.map((p) => p.drawn), after: loaded.after.map((p) => p.drawn), orientation: 'row', reversible: false, movements });
      expect(composed.ok).toBe(true);
      if (!composed.ok) return;
      const where = new Map<number, Where>();
      const bonded = new Set<string>();
      loaded.before.forEach((part, k) => {
        const item = composed.items[k] as { x: number; y: number };
        for (const a of part.drawn.atoms) where.set(a.map, { x: a.x + item.x, y: a.y + item.y, svg: part.svg ?? '', dx: item.x, dy: item.y });
        for (const b of part.drawn.bonds) bonded.add(`${Math.min(b.a, b.b)}-${Math.max(b.a, b.b)}`);
      });
      movements.forEach((movement, k) => {
        const arrow = composed.arrows[k];
        expect(arrow).toBeDefined();
        if (arrow === undefined) return;
        const assertOnAtom = (id: number): void => {
          const all = [...where.entries()].map(([map, w]) => ({ map, d: dist(arrow.end, w) })).sort((a, b) => a.d - b.d);
          expect(all[0]?.map, `${step.id} movement ${k + 1}: the arrow end is nearest atom ${all[0]?.map}, the target is ${id}`).toBe(id);
          const w = where.get(id) as Where;
          expect(dist(arrow.end, w), `${step.id} movement ${k + 1}: the arrow end is within a few pixels of atom ${id}`).toBeLessThan(28);
          const [px, py] = [w.x - w.dx, w.y - w.dy];
          if (nearLabel(w.svg, px, py)) expect(inLetterGlyph(w.svg, px, py), `${step.id}: atom ${id}'s position is in a letter glyph, not elsewhere in its label`).toBe(true);
        };
        const target = movement.to;
        if (target.kind !== 'bond') {
          assertOnAtom(target.atom);
          return;
        }
        const [p, q] = target.atoms;
        const key = `${Math.min(p, q)}-${Math.max(p, q)}`;
        if (bonded.has(key)) {
          const a = where.get(p) as Where;
          const b = where.get(q) as Where;
          expect(dist(arrow.end, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }), `${step.id} movement ${k + 1}: ends at the midpoint of the existing bond ${key}`).toBeLessThan(4);
          return;
        }
        const from = atomsOfSite(movement.from);
        const others = [p, q].filter((id) => !from.includes(id));
        expect(others.length, `${step.id} movement ${k + 1}: the new bond ${key} has exactly one atom the arrow does not start from`).toBe(1);
        assertOnAtom(others[0] as number);
      });
    }, 30_000);
  }
});

describe('the M1 fixtures: a labelled atom is positioned on its element letter', () => {
  const FIXTURES = ['[CH3:1][CH2:2][OH:3]', '[CH3:1][C:2](=[O:3])[O-:4]', '[CH3:1][C@@H:2]([Br:3])[NH3+:4]', '[Br-:1]', '[OH-:1]', '[H:1][O:2][CH3:3]', '[NH3+:1]'];
  for (const value of FIXTURES) {
    it(value, async () => {
      const out = await toolkit.depict({ format: 'smiles', value }, { width: 120, height: 80, showAtomMaps: false, fixedScale: true, atomPositions: true });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      for (const a of out.depiction.atoms ?? []) {
        if (nearLabel(out.depiction.svg, a.x, a.y)) expect(inLetterGlyph(out.depiction.svg, a.x, a.y), `${value}: map ${a.map} is in a letter glyph`).toBe(true);
      }
    });
  }
});
