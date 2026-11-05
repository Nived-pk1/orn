/** The text of a scaled box grows with the box (step 8.2b-fix, C1): font sizes, padding and baselines all follow `scale`. */
import { describe, expect, it } from 'vitest';
import type { SceneNode } from '@/render/scene';
import { textSlots } from './geometry';

const hub = (scale?: number): SceneNode =>
  ({ id: 'h', glyph: 'class_hub', box: 'hub', x: 0, y: 0, width: 120 * (scale ?? 1), height: 56 * (scale ?? 1), label: [{ text: 'Alcohols' }], badges: [], emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: 'x', ...(scale === undefined ? {} : { scale }) }) as SceneNode;

describe('textSlots with a box scale', () => {
  it('without a scale it is what it was', () => {
    expect(textSlots(hub()).labelSize).toBe(14);
  });
  it('every size and offset grows by the scale', () => {
    const one = textSlots(hub());
    const two = textSlots(hub(1.5));
    expect(two.labelSize).toBeCloseTo(one.labelSize * 1.5, 6);
    expect(two.sublabelSize).toBeCloseTo(one.sublabelSize * 1.5, 6);
    expect(two.x).toBeCloseTo(one.x * 1.5, 6);
    expect(two.labelY).toBeCloseTo(one.labelY * 1.5, 6);
    expect(two.sublabelY).toBeCloseTo(one.sublabelY * 1.5, 6);
  });
});
