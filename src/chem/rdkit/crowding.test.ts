/**
 * Step 8.5g B1: the crowding check on a drawn result, over hand-made drawings. It counts (a) two atom labels whose boxes overlap, (b) a
 * label lying on a bond that is not its own, (c) two atoms closer than half a bond (from the molblock's coordinates).
 */
import { describe, expect, it } from 'vitest';
import { crowdingOf } from './crowding';

const label = (atom: number, x: number, y: number) => `<path class='atom-${atom}' d='M ${x},${y} L ${x + 10},${y} L ${x + 10},${y + 12} L ${x},${y + 12} Z' />`;
const bond = (a: number, b: number, x1: number, y1: number, x2: number, y2: number) => `<path class='bond-0 atom-${a} atom-${b}' d='M ${x1},${y1} L ${x2},${y2}' />`;
const svg = (...parts: string[]) => `<svg viewBox='0 0 200 200'>${parts.join('')}</svg>`;
const block = (atoms: readonly (readonly [number, number])[], bonds: readonly (readonly [number, number])[]) =>
  [
    '',
    '     RDKit          2D',
    '',
    `${String(atoms.length).padStart(3)}${String(bonds.length).padStart(3)}  0  0  0  0  0  0  0  0999 V2000`,
    ...atoms.map(([x, y]) => `${x.toFixed(4).padStart(10)}${y.toFixed(4).padStart(10)}    0.0000 C   0  0`),
    ...bonds.map(([a, b]) => `${String(a + 1).padStart(3)}${String(b + 1).padStart(3)}  1  0`),
    'M  END',
  ].join('\n');
const apart = block([[0, 0], [1.5, 0], [3, 0]], [[0, 1], [1, 2]]);

describe('crowdingOf', () => {
  it('green: labels apart, bonds touching only their own labels, atoms a bond apart', () => {
    expect(crowdingOf(svg(label(0, 0, 0), label(2, 100, 0), bond(0, 1, 10, 6, 50, 6), bond(1, 2, 50, 6, 100, 6)), apart)).toEqual({ labels: 0, bonds: 0, atoms: 0, crossings: 0 });
  });
  it('red: two labels whose boxes overlap', () => {
    expect(crowdingOf(svg(label(0, 0, 0), label(2, 5, 4)), apart)).toMatchObject({ labels: 1 });
  });
  it('red: a bond running through a label that is not its own', () => {
    expect(crowdingOf(svg(label(2, 40, 0), bond(0, 1, 0, 6, 90, 6)), apart)).toMatchObject({ bonds: 1 });
  });
  it('red: two atoms closer than half a bond', () => {
    expect(crowdingOf(svg(), block([[0, 0], [1.5, 0], [3, 0], [3.2, 0]], [[0, 1], [1, 2], [0, 3]]))).toMatchObject({ atoms: 1 });
  });
  it('red: two bond lines that cross without sharing an atom (8.5h)', () => {
    expect(crowdingOf(svg(bond(0, 1, 0, 0, 50, 50), bond(2, 3, 0, 50, 50, 0)), apart)).toMatchObject({ crossings: 1 });
  });
  it('green: bonds that share an atom, and the two lines of one bond, are not counted (8.5h)', () => {
    expect(crowdingOf(svg(bond(0, 1, 0, 0, 50, 50), bond(1, 2, 0, 50, 50, 0), bond(3, 4, 60, 0, 110, 50), bond(3, 4, 60, 50, 110, 0)), apart)).toMatchObject({ crossings: 0 });
  });
  it('glyphs of one label overlapping each other are one label, not a clash', () => {
    expect(crowdingOf(svg(label(0, 0, 0), label(0, 8, 0)), apart)).toEqual({ labels: 0, bonds: 0, atoms: 0, crossings: 0 });
  });
});
