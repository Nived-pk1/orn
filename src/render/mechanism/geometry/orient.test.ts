/**
 * Step 8.5g G3 (ADR-038 addendum "Placement"): the choice of turn, mirror and order of a step's species, pure, over made-up species.
 * Turn code 0..23: (code % 12) x 30 degrees clockwise on screen, 12 and up mirrored first. The after side is turned onto the places its
 * mapped atoms had before. Same input, same answer; the number of tries is bounded.
 */
import { describe, expect, it } from 'vitest';
import { composeStep, type DrawnSpecies } from './compose';
import { MAX_ORDERED, planStep, turnDrawn, TURN_CODES, type PlanSpecies } from './orient';
import type { MovementInput } from './arrows';

const atom = (map: number, x: number, y: number) => ({ map, x, y, rx: 8, ry: 8 });
function species(atoms: ReturnType<typeof atom>[], width: number, height: number, bonds: { a: number; b: number }[] = []): DrawnSpecies {
  return { kind: 'structure', transitionState: false, width, height, atoms, bonds };
}
const one = (drawn: DrawnSpecies, canTurn = true, canMirror = true): PlanSpecies => ({ drawn, canTurn, canMirror });

const ion = species([atom(1, 20, 20)], 40, 40);
/** A chain with the atom to be attacked (2) at its FAR (right) end, its partner 3 left of it. */
const chain = species([atom(4, 20, 20), atom(3, 120, 20), atom(2, 220, 20)], 240, 40, [{ a: 2, b: 3 }, { a: 3, b: 4 }]);
const attack: MovementInput[] = [
  { from: { kind: 'lone_pair', atom: 1 }, to: { kind: 'bond', atoms: [1, 2] }, electrons: 2 },
  { from: { kind: 'bond', atoms: [2, 3] }, to: { kind: 'lone_pair', atom: 3 }, electrons: 2 },
];

const chord = (before: readonly DrawnSpecies[]): number => {
  const out = composeStep({ before, after: [], orientation: 'row', reversible: false, movements: attack });
  if (!out.ok) throw new Error('missing');
  const a = out.arrows[0] as { start: { x: number; y: number }; end: { x: number; y: number } };
  return Math.hypot(a.end.x - a.start.x, a.end.y - a.start.y);
};
const placed = (plan: ReturnType<typeof planStep>, side: readonly PlanSpecies[]) => plan.before.map((c) => turnDrawn((side[c.index] as PlanSpecies).drawn, c.turn));

describe('turnDrawn', () => {
  it('turns about the picture, clockwise on screen, and keeps every atom inside', () => {
    const d = turnDrawn(chain, 3); // 90 degrees
    expect(d.width).toBeCloseTo(40);
    expect(d.height).toBeCloseTo(240);
    expect(d.atoms.map((a) => Math.round(a.y))).toEqual([20, 120, 220]);
  });
  it('code 12 mirrors left to right; 0 is the drawing itself', () => {
    expect(turnDrawn(chain, 12).atoms.map((a) => Math.round(a.x))).toEqual([220, 120, 20]);
    expect(turnDrawn(chain, 0)).toBe(chain);
  });
});

describe('planStep', () => {
  const before = [one(ion), one(chain)];

  it('brings the attacked atom next to the attacker: the arrow is much shorter', () => {
    const plan = planStep({ before, after: [], movements: attack });
    expect(chord(placed(plan, before))).toBeLessThan(0.6 * chord([ion, chain]));
  });

  it('never mirrors a species that may not be mirrored, and never turns one that may not be turned', () => {
    const wedged = [one(ion), one(chain, true, false)];
    for (const c of planStep({ before: wedged, after: [], movements: attack }).before) expect(c.turn).toBeLessThan(12);
    const fixed = [one(ion, false), one(chain, false)];
    expect(planStep({ before: fixed, after: [], movements: attack }).before.map((c) => c.turn)).toEqual([0, 0]);
  });

  it('gives the same answer twice', () => {
    const input = { before, after: [one(chain)], movements: attack };
    expect(planStep(input)).toEqual(planStep(input));
  });

  it('is bounded: at most 24 turns times the orders per species, and no reordering beyond the cap', () => {
    expect(planStep({ before, after: [], movements: attack }).tries).toBeLessThanOrEqual(2 * TURN_CODES * 2);
    const many = [one(ion), one(chain), ...Array.from({ length: MAX_ORDERED }, (_, k) => one(species([atom(10 + k, 20, 20)], 40, 40)))];
    const big = planStep({ before: many, after: [], movements: attack });
    expect(big.tries).toBeLessThanOrEqual(many.length * TURN_CODES);
    expect(big.before.map((c) => c.index)).toEqual(many.map((_, k) => k));
  });

  it('turns a product so its mapped atoms lie as they did before; with one shared atom it stays as drawn', () => {
    const upright = turnDrawn(chain, 3);
    const plan = planStep({ before: [one(chain, false)], after: [one(upright), one(ion)], movements: [] });
    const xs = turnDrawn(upright, (plan.after[0] as { turn: number }).turn).atoms.map((a) => a.x);
    expect(xs[0]).toBeLessThan(xs[1] as number);
    expect(xs[1]).toBeLessThan(xs[2] as number);
    expect(plan.after[1]).toEqual({ index: 1, turn: 0 });
  });

  it('with no movements the before side is left as drawn', () => {
    expect(planStep({ before, after: [], movements: [] }).before).toEqual([{ index: 0, turn: 0 }, { index: 1, turn: 0 }]);
  });
});
