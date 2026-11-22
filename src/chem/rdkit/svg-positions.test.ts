/**
 * The position reader on hand-written drawings (step 8.5 M1): the translation and scale between the shown and the highlighted drawing are
 * found and checked; anything else is a refusal with the reason in words. Real RDKit is tests/integration/chem-positions.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { readPositions } from './svg-positions';

const path = (cls: string, d: string) => `<path class='${cls}' d='${d}' style='fill:none' />`;
const ellipse = (index: number, cx: number, cy: number) => `<ellipse cx='${cx}' cy='${cy}' rx='10' ry='8' class='atom-${index}' />`;
const svg = (...parts: string[]) => `<svg viewBox='0 0 100 100'>${parts.join('')}</svg>`;

// two bonds, atom 1 in the middle; the highlighted drawing is the shown one moved by (10, 5) and scaled by 1.01
const plain = svg(path('bond-0 atom-0 atom-1', 'M 10,10 L 50,50'), path('bond-1 atom-1 atom-2', 'M 50,50 L 70,50'), path('bond-1 atom-1 atom-2', 'M 70,50 L 90,50'));
const at = (x: number, y: number): [number, number] => [x * 1.01 + 10, y * 1.01 + 5];
const lit = svg(
  ellipse(0, ...at(10, 10)),
  ellipse(1, ...at(50, 50)),
  ellipse(2, ...at(90, 50)),
  path('bond-0 atom-0 atom-1', `M ${at(10, 10).join(',')} L ${at(50, 50).join(',')}`),
  path('bond-1 atom-1 atom-2', `M ${at(50, 50).join(',')} L ${at(90, 50).join(',')}`),
);

describe('readPositions', () => {
  it('gives each atom in the frame of the shown drawing, undoing the move and the scale, with the label box scaled back', () => {
    const out = readPositions(plain, lit, [0, 1, 2]);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.atoms.map((a) => [a.index, a.x, a.y])).toEqual([[0, 10, 10], [1, 50, 50], [2, 90, 50]]);
    expect(out.atoms[0]?.rx).toBeCloseTo(10 / 1.01, 1);
  });

  it('a bond split in two paths in the shown drawing and one in the highlighted one still gives the whole bond (start and end)', () => {
    expect(readPositions(plain, lit, [1]).ok).toBe(true);
  });

  it('says so when an atom has no ellipse (the atom-N classes changed), naming the atom', () => {
    const noClass = lit.replace(/class='atom-1'/, '');
    const out = readPositions(plain, noClass, [0, 1, 2]);
    expect(out).toEqual({ ok: false, error: expect.stringMatching(/atom 1 has 0 highlight shapes; the atom-N classes may have changed/) });
  });

  it('says so when an atom has two ellipses', () => {
    const twice = lit.replace('</svg>', `${ellipse(1, 1, 1)}</svg>`);
    expect(readPositions(plain, twice, [1])).toEqual({ ok: false, error: expect.stringMatching(/atom 1 has 2 highlight shapes/) });
  });

  it('refuses a highlighted drawing that is not the shown one moved and scaled (a shared point is off by more than the tolerance)', () => {
    const bent = lit.replace(`L ${at(90, 50).join(',')}`, 'L 190,150');
    expect(readPositions(plain, bent, [0, 1, 2])).toEqual({ ok: false, error: expect.stringMatching(/not the plain drawing moved and scaled/) });
  });

  it('refuses a drawing with no paths at all, and one with too many points', () => {
    expect(readPositions(svg(), lit, [0])).toEqual({ ok: false, error: expect.stringMatching(/no bond or label paths/) });
    const many = svg(path('bond-0 atom-0 atom-1', `M ${Array.from({ length: 3_100 }, (_, i) => `${i},0`).join(' L ')}`));
    expect(readPositions(many, many, [0])).toEqual({ ok: false, error: expect.stringMatching(/too many points/) });
  });

  it('is the same answer every time', () => {
    expect(readPositions(plain, lit, [0, 1, 2])).toEqual(readPositions(plain, lit, [0, 1, 2]));
  });
});
