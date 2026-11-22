/**
 * Step 8.5 M4 (D2, D3, D5): the placement of a step's species in "before -> after", pure. Rows of species with a plus sign between them, the
 * reaction arrow (an equilibrium arrow when the step is reversible) between the sides, the curved arrows computed in the frame of the
 * before row, a transition state in brackets, and the whole thing shifted so that nothing (an arrow's bulge, a bracket) lies outside.
 */
import { describe, expect, it } from 'vitest';
import { composeStep, type DrawnSpecies } from './compose';

const drawn = (over: Partial<DrawnSpecies> & { width: number; height: number }): DrawnSpecies => ({ kind: 'structure', transitionState: false, atoms: [], bonds: [], ...over });
const inside = (c: { width: number; height: number }, p: { x: number; y: number }) => p.x >= -0.001 && p.y >= -0.001 && p.x <= c.width + 0.001 && p.y <= c.height + 0.001;

describe('composeStep: a row', () => {
  const a = drawn({ width: 100, height: 80, atoms: [{ map: 1, x: 10, y: 40, rx: 8, ry: 8 }, { map: 2, x: 90, y: 40, rx: 8, ry: 8 }], bonds: [{ a: 1, b: 2 }] });
  const b = drawn({ width: 60, height: 60, atoms: [{ map: 3, x: 30, y: 30, rx: 8, ry: 8 }] });

  it('puts before on the left and after on the right, the reaction arrow between, plus signs between the species of a side', () => {
    const c = composeStep({ before: [a, b], after: [b], orientation: 'row', reversible: false, movements: [] });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const [x0, x1, x2] = c.items.map((i) => i.x);
    expect(x0 as number).toBeLessThan(x1 as number);
    expect(x1 as number).toBeLessThan(x2 as number);
    expect(c.pluses.length).toBe(1);
    expect(c.arrow.equilibrium).toBe(false);
    expect(c.arrow.from.x).toBeGreaterThan((x1 as number) + 60);
    expect(c.arrow.to.x).toBeLessThan(x2 as number);
    expect(c.arrow.from.y).toBeCloseTo(c.arrow.to.y, 5);
  });

  it('a reversible step has the equilibrium arrow', () => {
    const c = composeStep({ before: [a], after: [b], orientation: 'row', reversible: true, movements: [] });
    expect(c.ok && c.arrow.equilibrium).toBe(true);
  });

  it('stacks the sides in a column with a down arrow for a phone', () => {
    const c = composeStep({ before: [a], after: [b], orientation: 'column', reversible: false, movements: [] });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.items[0]?.y as number).toBeLessThan(c.items[1]?.y as number);
    expect(c.arrow.from.x).toBeCloseTo(c.arrow.to.x, 5);
    expect(c.arrow.to.y).toBeGreaterThan(c.arrow.from.y);
    expect(c.height).toBeGreaterThan(c.width * 0.5);
  });

  it('a transition state is in brackets with the double dagger; empty sides are drawn as the arrow alone', () => {
    const ts = drawn({ width: 80, height: 60, transitionState: true });
    const c = composeStep({ before: [], after: [ts], orientation: 'row', reversible: false, movements: [] });
    expect(c.ok && c.items.map((i) => i.bracket)).toEqual([true]);
    const none = composeStep({ before: [], after: [], orientation: 'row', reversible: false, movements: [] });
    expect(none.ok && none.items).toEqual([]);
    expect(none.ok && none.width).toBeGreaterThan(0);
  });
});

describe('composeStep: curved arrows', () => {
  const left = drawn({ width: 100, height: 80, atoms: [{ map: 1, x: 80, y: 40, rx: 8, ry: 8 }] });
  const right = drawn({ width: 100, height: 80, atoms: [{ map: 2, x: 20, y: 40, rx: 8, ry: 8 }] });

  it('an arrow between two species spans the gap of the before row, and everything is inside the picture (the bulge too)', () => {
    const c = composeStep({ before: [left, right], after: [], orientation: 'row', reversible: false, movements: [{ from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 }] });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.arrows.length).toBe(1);
    const arrow = c.arrows[0];
    expect(arrow?.end.x as number).toBeGreaterThan(left.width);
    for (const p of [arrow?.start, arrow?.end, arrow?.control, ...(arrow?.head.wings ?? [])]) expect(inside(c, p as { x: number; y: number })).toBe(true);
  });

  it('an atom no drawn species of the before side has is reported (CHEM-008 words), nothing partial', () => {
    const c = composeStep({ before: [left], after: [right], orientation: 'row', reversible: false, movements: [{ from: { kind: 'atom', atom: 1 }, to: { kind: 'atom', atom: 2 }, electrons: 2 }] });
    expect(c).toEqual({ ok: false, reason: 'missing_atoms', missing: [2] });
  });

  it('a map number held by two species of the before side is ambiguous: refused as missing, never guessed', () => {
    const twin = drawn({ width: 100, height: 80, atoms: [{ map: 1, x: 20, y: 40, rx: 8, ry: 8 }] });
    const c = composeStep({ before: [left, twin], after: [], orientation: 'row', reversible: false, movements: [{ from: { kind: 'atom', atom: 1 }, to: { kind: 'atom', atom: 1 }, electrons: 2 }] });
    expect(c).toEqual({ ok: false, reason: 'missing_atoms', missing: [1] });
  });

  it('is the same picture every time', () => {
    const input = { before: [left, right], after: [left], orientation: 'row', reversible: false, movements: [{ from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'atom', atom: 2 }, electrons: 2 }] } as const;
    expect(JSON.stringify(composeStep(input))).toBe(JSON.stringify(composeStep(input)));
  });
});
