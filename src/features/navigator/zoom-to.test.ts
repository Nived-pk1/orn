import { describe, expect, it, vi } from 'vitest';
import { animateView } from './zoom-to';

const from = { x: 0, y: 0, scale: 1 };
const to = { x: 100, y: 50, scale: 2 };

function rig(reduced: boolean) {
  const views: { x: number; y: number; scale: number }[] = [];
  let frame: ((now: number) => void) | undefined;
  const raf = vi.fn((run: (now: number) => void) => {
    frame = run;
    return 1;
  });
  const start = animateView({ current: () => views.at(-1) ?? from, setViewport: (v) => void views.push(v) }, to, { reduced, raf, now: () => 0 });
  return { views, start, step: (now: number) => frame?.(now) };
}

describe('moving the view to a target', () => {
  it('with reduced motion it jumps at once, with no frame asked for', () => {
    const r = rig(true);
    expect(r.views).toEqual([to]);
  });
  it('otherwise it moves over 200 ms and ends exactly on the target', () => {
    const r = rig(false);
    r.step(100);
    expect(r.views.at(-1)?.scale).toBeGreaterThan(1);
    expect(r.views.at(-1)?.scale).toBeLessThan(2);
    r.step(200);
    expect(r.views.at(-1)).toEqual(to);
  });
  it('leaves the view alone when the person moved it meanwhile', () => {
    const r = rig(false);
    r.step(50);
    const count = r.views.length;
    r.views.push({ x: 9, y: 9, scale: 1.3 }); // someone else moved it
    r.step(100);
    expect(r.views.length).toBe(count + 1);
  });
});
