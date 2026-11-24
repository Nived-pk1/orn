/**
 * The position reader on hand-written drawings (step 8.5 M1): the translation and scale between the shown and the highlighted drawing are
 * found and checked; anything else is a refusal with the reason in words. Real RDKit is tests/integration/chem-positions.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { elementLetterOf, labelGlyphsOf, readPositions } from './svg-positions';

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

// Step 8.5b A3: the position of a labelled atom is its ELEMENT LETTER. Glyph boxes below are measured from RDKit's own drawings of the five labels.
describe('elementLetterOf: the letter of a label, not the centre of the whole label', () => {
  const glyph = (x0: number, x1: number, y0: number, y1: number) => path('atom-0', `M ${x0},${y0} L ${x1},${y0} L ${x1},${y1} L ${x0},${y1} Z`);
  const bond = (x0: number, x1: number, y: number) => path('bond-0 atom-0 atom-1', `M ${x0},${y} L ${x1},${y}`);
  const centreX = (drawing: string) => elementLetterOf(drawing, 0)?.x;

  it('HO- (no bond; the hydrogen is drawn first): the O', () => {
    expect(centreX(svg(glyph(2.7, 14.1, 1, 15.6), glyph(16.9, 30.3, 0.8, 15.8), glyph(32.4, 37.4, 3.2, 4.3)))).toBeCloseTo(23.6, 1);
  });
  it('NH3+ bonded on its left: the N, next to the bond, not the centre of "NH3+"', () => {
    const out = elementLetterOf(svg(bond(28.4, 51.5, 9), glyph(53.2, 64.7, 1.4, 16.6), glyph(67.6, 79.5, 1.4, 16.6), glyph(82.4, 89.1, 14, 24.3), glyph(82.5, 89.1, 1.3, 8)), 0);
    expect(out?.x).toBeCloseTo(58.95, 1);
    expect(out?.rx).toBeCloseTo(5.75, 1);
  });
  it('H3N+ bonded on its right: the N, next to the bond', () => {
    const out = elementLetterOf(svg(bond(60, 82, 9), glyph(0, 12, 1.4, 16.6), glyph(13, 20, 14, 24.3), glyph(22, 33.5, 1.4, 16.6), glyph(36, 42, 1.3, 8)), 0);
    expect(out?.x).toBeCloseTo(27.75, 1);
  });
  it('OH bonded on its left: the O; HO bonded on its right: the O', () => {
    expect(centreX(svg(bond(27.8, 49.4, 8.2), glyph(51.1, 64.5, 0.8, 15.8), glyph(66.8, 78.2, 1, 15.6)))).toBeCloseTo(57.8, 1);
    expect(centreX(svg(bond(35.9, 71.7, 8.2), glyph(6.4, 17.8, 1, 15.6), glyph(20.8, 34.2, 0.8, 15.8)))).toBeCloseTo(27.5, 1);
  });
  it('Br- (no bond): the B; the r is a small letter and the charge a small mark, neither is the letter', () => {
    expect(centreX(svg(glyph(1.7, 11.9, 0.9, 15.8), glyph(13.6, 19.9, 4.8, 15.8), glyph(21, 26.1, 5.3, 6.4)))).toBeCloseTo(6.8, 1);
  });
  it('without a bond a subscript count tells the order: NH2- is N then H then the 2; OH2+ is H, the 2, then O; Cl keeps its first letter', () => {
    expect(centreX(svg(glyph(2.7, 13.8, 1.2, 15.9), glyph(16.5, 28, 1.2, 15.9), glyph(30.8, 37.3, 13.5, 23.2), glyph(31.5, 36.6, 3.7, 4.8)))).toBeCloseTo(8.25, 1);
    expect(centreX(svg(glyph(7.2, 19.1, 1.6, 16.7), glyph(22, 28.8, 14.2, 24.3), glyph(30.8, 44.7, 1.4, 17), glyph(46.9, 53.5, 1.3, 7.9)))).toBeCloseTo(37.75, 1);
    expect(centreX(svg(glyph(2, 13, 1, 16), glyph(14.5, 17.5, 1, 16), glyph(20, 25, 3, 4)))).toBeCloseTo(7.5, 1);
  });
  it('an atom with no label glyphs has no letter (an unlabelled carbon keeps its circle)', () => {
    expect(elementLetterOf(svg(bond(0, 20, 5)), 0)).toBeUndefined();
  });
});

describe('labelGlyphsOf (step 8.5c C1)', () => {
  it('is the box of every atom-N glyph path, and nothing for a bond or a drawing without labels', () => {
    const drawing = svg(path('atom-3', 'M 10,10 L 20,10 L 20,30 L 10,30 Z'), path('atom-3', 'M 22,20 L 26,20 L 26,24 L 22,24 Z'), path('bond-0 atom-0 atom-1', 'M 0,0 L 5,5'));
    expect(labelGlyphsOf(drawing)).toEqual([{ x0: 10, x1: 20, y0: 10, y1: 30 }, { x0: 22, x1: 26, y0: 20, y1: 24 }]);
    expect(labelGlyphsOf(svg(path('bond-0 atom-0 atom-1', 'M 0,0 L 5,5')))).toEqual([]);
  });
});
