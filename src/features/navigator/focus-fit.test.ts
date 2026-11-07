import { describe, expect, it } from 'vitest';
import { focusSetOf, zoomTargetRect } from './focus-fit';

const focus = { x0: 100, y0: 100, x1: 500, y1: 300 };
const size = { width: 900, height: 600 };

describe('what "Zoom to selection" fills the map with (step 8.4b, E2b)', () => {
  it('the focus set, when it can be shown with box titles of at least 12 px', () => {
    expect(zoomTargetRect({ focus, size, titleSize: 14, minTitlePx: 12 })).toBe(focus);
  });
  it('a focus set too wide for 12 px titles: centred on the selected box at exactly 12 px', () => {
    const wide = { x0: 0, y0: 0, x1: 5000, y1: 300 };
    const rect = zoomTargetRect({ focus: wide, size, titleSize: 14, minTitlePx: 12, selected: { x0: 100, y0: 100, x1: 300, y1: 200 } });
    expect(rect).toBeDefined();
    const scale = (size.width - 48) / ((rect?.x1 ?? 0) - (rect?.x0 ?? 0));
    expect(14 * scale).toBeCloseTo(12, 5);
  });
  it('too wide and no selected box known: the focus set (the name floor applies)', () => {
    const wide = { x0: 0, y0: 0, x1: 5000, y1: 300 };
    expect(zoomTargetRect({ focus: wide, size, titleSize: 14, minTitlePx: 12 })).toBe(wide);
  });
  it('nothing to focus on: nothing', () => {
    expect(zoomTargetRect({ focus: undefined, size, titleSize: 14, minTitlePx: 12 })).toBeUndefined();
  });
});

describe('the focus set', () => {
  const nodes = [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 300, y: 0, width: 100, height: 50 },
    { id: 'c', x: 900, y: 400, width: 100, height: 50 },
  ];
  it('is the selected family and the far ends of its drawn arrows', () => {
    expect(focusSetOf(nodes, { ids: ['a'], arrows: [{ from: 'a', to: 'b' }], outlined: [] })).toEqual({ x0: 0, y0: 0, x1: 400, y1: 50 });
  });
  it('adds the outlined families of a busy selection', () => {
    expect(focusSetOf(nodes, { ids: ['a'], arrows: [], outlined: ['c'] })).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 450 });
  });
  it('is undefined when nothing known is selected', () => {
    expect(focusSetOf(nodes, { ids: ['zzz'], arrows: [], outlined: [] })).toBeUndefined();
  });
});
