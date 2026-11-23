/**
 * Step 8.5 M3 (ADR-038, decision D3): curved arrows as pure geometry over atom boxes and bonds, in the drawing's own units. Fixed
 * cases for each site kind, then property tests over random layouts (fast-check): the path starts and ends within reach of its
 * sites, the bulge is bounded and AWAY from the centre of the atoms involved, the head points along the end tangent, one electron
 * is a fishhook and two are a full head, coincident or very close sites never give NaN, two arrows that would overlap are bent to
 * opposite sides, and the answer is the same every time.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { layoutArrows, MAX_ARROWS, MAX_BULGE, MIN_BULGE, type AtomBox, type MovementInput } from './arrows';

const atom = (x: number, y: number, r = 10): AtomBox => ({ x, y, rx: r, ry: r });
const lay = (atoms: Record<number, AtomBox>, bonds: readonly (readonly [number, number])[], movements: readonly MovementInput[]) =>
  layoutArrows(movements, { atoms: new Map(Object.entries(atoms).map(([k, v]) => [Number(k), v])), bonds });
const must = (outcome: ReturnType<typeof lay>) => {
  if (!outcome.ok) throw new Error(`no arrows: ${JSON.stringify(outcome)}`);
  return outcome.arrows;
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const pair = (from: MovementInput['from'], to: MovementInput['to'], electrons: 1 | 2 = 2): MovementInput => ({ from, to, electrons });

describe('sites', () => {
  // hydroxide (1) at the left, a hydrogen (2) bonded to carbon (3), carbon bonded to 4 on the right
  const atoms = { 1: atom(0, 0), 2: atom(100, 0), 3: atom(150, 0), 4: atom(200, 0) };
  const bonds = [[2, 3], [3, 4]] as const;

  it('a lone pair starts at the two dots on the side away from the bonds of its atom, and the dots are drawn', () => {
    // atom 1 is bonded to an atom at its left, so its dots are on its right, towards atom 2
    const [arrow] = must(lay({ ...atoms, 5: atom(-50, 0) }, [[1, 5]], [pair({ kind: 'lone_pair', atom: 1 }, { kind: 'atom', atom: 2 })]));
    expect(arrow?.dots.length).toBe(2);
    expect(arrow?.dots[0]?.x ?? -1).toBeGreaterThan(5);
    expect(arrow?.dots[1]?.x ?? -1).toBeGreaterThan(5);
    expect(dist(arrow?.start ?? { x: 0, y: 0 }, atoms[1])).toBeLessThan(25);
  });

  it('a lone pair on an atom bonded on its right has its dots on its left', () => {
    const [arrow] = must(lay({ 1: atom(0, 0), 2: atom(50, 0), 3: atom(-100, 0) }, [[1, 2]], [pair({ kind: 'lone_pair', atom: 1 }, { kind: 'atom', atom: 3 })]));
    expect(arrow?.dots[0]?.x ?? 1).toBeLessThan(-5);
  });

  it('with no bond to turn away from, the dots face the target', () => {
    const [arrow] = must(lay({ 1: atom(0, 0), 2: atom(100, 0) }, [], [pair({ kind: 'lone_pair', atom: 1 }, { kind: 'atom', atom: 2 })]));
    expect(arrow?.dots[0]?.x ?? 0).toBeGreaterThan(5);
  });

  it('a radical starts at its single dot, which is drawn; one electron is a fishhook', () => {
    const [arrow] = must(lay({ 1: atom(0, 0), 2: atom(100, 0) }, [], [pair({ kind: 'radical', atom: 1 }, { kind: 'atom', atom: 2 }, 1)]));
    expect(arrow?.dots.length).toBe(1);
    expect(arrow?.head.full).toBe(false);
    expect(arrow?.head.wings.length).toBe(1);
  });

  it('a bond starts at its midpoint; an atom end stops just short of the atom; two electrons give a full head and no dots', () => {
    const [arrow] = must(lay(atoms, bonds, [pair({ kind: 'bond', atoms: [2, 3] }, { kind: 'atom', atom: 4 })]));
    expect(arrow?.start.x).toBeCloseTo(125, 0);
    expect(arrow?.start.y).toBeCloseTo(0, 0);
    const toAtom = dist(arrow?.end ?? { x: 0, y: 0 }, atoms[4]);
    expect(toAtom).toBeGreaterThan(8);
    expect(toAtom).toBeLessThan(20);
    expect(arrow?.head.full).toBe(true);
    expect(arrow?.head.wings.length).toBe(2);
    expect(arrow?.dots).toEqual([]);
  });

  it('a bond the movement FORMS ends on the atom of it that the movement does not start from, just short of it (reviewer R1), never in the gap', () => {
    // lone pair on 1 into the new bond 1-2: the arrow ends at atom 2
    const [a] = must(lay({ 1: atom(0, 0), 2: atom(100, 0) }, [], [pair({ kind: 'lone_pair', atom: 1 }, { kind: 'bond', atoms: [1, 2] })]));
    expect(dist(a?.end ?? { x: 0, y: 0 }, atom(100, 0))).toBeGreaterThan(8);
    expect(dist(a?.end ?? { x: 0, y: 0 }, atom(100, 0))).toBeLessThan(20);
    expect(a?.end.x).toBeLessThan(100);
    // the bond written the other way round (2-1) is the same movement
    const [b] = must(lay({ 1: atom(0, 0), 2: atom(100, 0) }, [], [pair({ kind: 'lone_pair', atom: 1 }, { kind: 'bond', atoms: [2, 1] })]));
    expect(b?.end).toEqual(a?.end);
    // a bond into a new bond: C3=C4 (bond 3-4) pushes into the new bond 3-7, which ends on atom 7, the carbonyl carbon
    const [c] = must(lay({ 3: atom(0, 0), 4: atom(40, 0), 7: atom(0, 100) }, [[3, 4]], [pair({ kind: 'bond', atoms: [3, 4] }, { kind: 'bond', atoms: [3, 7] })]));
    expect(dist(c?.end ?? { x: 0, y: 0 }, atom(0, 100))).toBeLessThan(20);
    expect(dist(c?.end ?? { x: 0, y: 0 }, atom(0, 100))).toBeGreaterThan(8);
  });

  it('a target bond that already exists keeps its midpoint; a new bond that shares no atom with the source, or both atoms, keeps the midpoint between its atoms', () => {
    const [existing] = must(lay({ 1: atom(0, 0), 2: atom(100, 0), 3: atom(50, 80) }, [[1, 2]], [pair({ kind: 'atom', atom: 3 }, { kind: 'bond', atoms: [1, 2] })]));
    expect(existing?.end.x).toBeCloseTo(50, 0);
    expect(existing?.end.y).toBeCloseTo(0, 0);
    const [unrelated] = must(lay({ 1: atom(0, 0), 2: atom(100, 0), 3: atom(50, 80) }, [], [pair({ kind: 'atom', atom: 3 }, { kind: 'bond', atoms: [1, 2] })]));
    expect(unrelated?.end.x).toBeCloseTo(50, 0);
    expect(unrelated?.end.y).toBeCloseTo(0, 0);
  });

  it('a movement that names an atom the drawing does not have is not drawn: the answer lists the missing atoms, nothing partial', () => {
    expect(lay(atoms, bonds, [pair({ kind: 'atom', atom: 1 }, { kind: 'bond', atoms: [2, 99] }), pair({ kind: 'atom', atom: 77 }, { kind: 'atom', atom: 2 })])).toEqual({ ok: false, missing: [77, 99] });
  });

  it('more movements than the limit are refused, not truncated', () => {
    const many = Array.from({ length: MAX_ARROWS + 1 }, (): MovementInput => pair({ kind: 'atom', atom: 1 }, { kind: 'atom', atom: 2 }));
    expect(lay(atoms, bonds, many)).toEqual({ ok: false, missing: [], tooMany: true });
  });

  it('no movements: no arrows', () => {
    expect(lay(atoms, bonds, [])).toEqual({ ok: true, arrows: [] });
  });
});

describe('overlap', () => {
  it('two arrows with the same ends are bent to opposite sides', () => {
    const arrows = must(lay({ 1: atom(0, 0), 2: atom(100, 0) }, [], [pair({ kind: 'atom', atom: 1 }, { kind: 'atom', atom: 2 }), pair({ kind: 'atom', atom: 1 }, { kind: 'atom', atom: 2 })]));
    expect(Math.sign(arrows[0]?.control.y ?? 0)).toBe(-Math.sign(arrows[1]?.control.y ?? 0));
    expect(arrows[0]?.control.y).not.toBe(0);
  });
});

const site = (atomCount: number): fc.Arbitrary<MovementInput['from']> =>
  fc.oneof(
    fc.record({ kind: fc.constantFrom('atom' as const, 'lone_pair' as const, 'radical' as const), atom: fc.integer({ min: 1, max: atomCount }) }),
    fc.record({ kind: fc.constant('bond' as const), atoms: fc.tuple(fc.integer({ min: 1, max: atomCount }), fc.integer({ min: 1, max: atomCount })) }),
  );
const layout = fc.integer({ min: 2, max: 7 }).chain((n) =>
  fc.record({
    boxes: fc.array(fc.record({ x: fc.integer({ min: -300, max: 300 }), y: fc.integer({ min: -300, max: 300 }), rx: fc.integer({ min: 3, max: 30 }), ry: fc.integer({ min: 3, max: 20 }) }), { minLength: n, maxLength: n }),
    bonds: fc.array(fc.tuple(fc.integer({ min: 1, max: n }), fc.integer({ min: 1, max: n })), { maxLength: 8 }),
    movements: fc.array(fc.record({ from: site(n), to: site(n), electrons: fc.constantFrom(1 as const, 2 as const) }), { minLength: 1, maxLength: 5 }),
  }),
);
type Sample = { boxes: AtomBox[]; bonds: [number, number][]; movements: MovementInput[] };
const run = (sample: Sample) => layoutArrows(sample.movements, { atoms: new Map(sample.boxes.map((b, i) => [i + 1, b])), bonds: sample.bonds });

describe('properties (fast-check)', () => {
  it('never NaN, the bulge is bounded, the head points along the end tangent, one electron is a fishhook and two a full head', () => {
    fc.assert(
      fc.property(layout, (sample: Sample) => {
        const out = run(sample);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        out.arrows.forEach((arrow, k) => {
          const numbers = [arrow.start.x, arrow.start.y, arrow.end.x, arrow.end.y, arrow.control.x, arrow.control.y, arrow.head.angle, ...arrow.head.wings.flatMap((w) => [w.x, w.y]), ...arrow.dots.flatMap((d) => [d.x, d.y])];
          expect(numbers.every(Number.isFinite)).toBe(true);
          expect(arrow.path).not.toMatch(/NaN|Infinity/);
          if (arrow.kind === 'curve') {
            const mid = { x: (arrow.start.x + arrow.end.x) / 2, y: (arrow.start.y + arrow.end.y) / 2 };
            // the control point of a quadratic is twice as far from the chord as the curve's own bulge
            expect(dist(arrow.control, mid)).toBeLessThanOrEqual(2 * MAX_BULGE + 1e-6);
            expect(dist(arrow.control, mid)).toBeGreaterThanOrEqual(2 * MIN_BULGE - 1e-6);
            const tangent = Math.atan2(arrow.end.y - arrow.control.y, arrow.end.x - arrow.control.x);
            expect(Math.abs(Math.atan2(Math.sin(arrow.head.angle - tangent), Math.cos(arrow.head.angle - tangent)))).toBeLessThan(1e-6);
          }
          const movement = sample.movements[k] as MovementInput;
          expect(arrow.head.full).toBe(movement.electrons === 2);
          expect(arrow.head.wings.length).toBe(movement.electrons === 2 ? 2 : 1);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('starts within reach of its source and ends within reach of its target (the site point plus the atom box, the gap and the dots)', () => {
    fc.assert(
      fc.property(layout, (sample: Sample) => {
        const out = run(sample);
        if (!out.ok) return;
        const reach = (s: MovementInput['from']): { x: number; y: number; r: number } => {
          const ids = s.kind === 'bond' ? s.atoms : [s.atom];
          const boxes = ids.map((id) => sample.boxes[id - 1] as AtomBox);
          const x = boxes.reduce((sum, b) => sum + b.x, 0) / boxes.length;
          const y = boxes.reduce((sum, b) => sum + b.y, 0) / boxes.length;
          // a bond: its midpoint, or (a bond the movement forms) one of its two atoms, so the reach is the whole bond
          const span = s.kind === 'bond' ? Math.max(...boxes.map((b) => Math.hypot(b.x - x, b.y - y) + Math.max(b.rx, b.ry) + 30)) : 0;
          return { x, y, r: s.kind === 'bond' ? Math.max(1, span) : Math.max(...boxes.map((b) => Math.max(b.rx, b.ry))) + 30 };
        };
        out.arrows.forEach((arrow, k) => {
          const m = sample.movements[k] as MovementInput;
          const a = reach(m.from);
          const b = reach(m.to);
          expect(dist(arrow.start, a)).toBeLessThanOrEqual(a.r + 1e-6);
          expect(dist(arrow.end, b)).toBeLessThanOrEqual(b.r + 1e-6);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('is the same path every time, and coincident sites (the same atom both ends) give a finite fixed loop', () => {
    fc.assert(fc.property(layout, (sample: Sample) => JSON.stringify(run(sample)) === JSON.stringify(run(sample))), { numRuns: 50 });
    const [arrow] = must(lay({ 1: atom(10, 10) }, [], [pair({ kind: 'bond', atoms: [1, 1] }, { kind: 'bond', atoms: [1, 1] })]));
    expect(arrow?.kind).toBe('loop');
    expect(arrow?.path).not.toMatch(/NaN/);
  });

  it('the bulge is away from the centre of the atoms involved: an arrow between two atoms with a third atom above bows downwards', () => {
    const arrows = must(lay({ 1: atom(0, 0), 2: atom(100, 0), 3: atom(50, -80) }, [], [pair({ kind: 'atom', atom: 1 }, { kind: 'atom', atom: 2 }), pair({ kind: 'atom', atom: 3 }, { kind: 'atom', atom: 3 })]));
    expect(arrows[0]?.control.y ?? -1).toBeGreaterThan(0);
  });
});
