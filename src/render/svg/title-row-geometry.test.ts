/** Where "↻ n" and the badges sit in a box (step 8.4c, A3): inside the box, in the title row, "↻ n" left of the badges, neither over the title. */
import { describe, expect, it } from 'vitest';
import type { SceneNode } from '@/render/scene';
import { BADGE_SIZE, badgeRunWidth } from '@/render/scene';
import { badgeOrigin, loopsAnchor, textSlots, titleRowRight } from './geometry';

const hub = (scale?: number, badges: SceneNode['badges'] = []): SceneNode =>
  ({ id: 'h', glyph: 'class_hub', box: 'hub', x: 100, y: 50, width: 200 * (scale ?? 1), height: 56 * (scale ?? 1), label: [{ text: 'Amides' }], sublabel: [{ text: 'R-CO-NR2' }], badges, emphasis: 'anchor', state: { dimmed: false, onPath: false }, minLod: 0, ariaLabel: 'x', ...(scale === undefined ? {} : { scale }) }) as SceneNode;

describe('the title row geometry', () => {
  it('the right end of the row is one padding inside the box', () => {
    expect(titleRowRight(hub())).toBe(100 + 200 - 16);
    expect(titleRowRight(hub(1.5))).toBeCloseTo(100 + 300 - 24, 6);
  });
  it('the badges lie wholly inside the box, on the title row, at its right end', () => {
    const node = hub(undefined, [{ kind: 'review' }]);
    const at = badgeOrigin(node);
    const slots = textSlots(node);
    expect(at.x + badgeRunWidth(node.badges) - 3).toBeCloseTo(titleRowRight(node), 6);
    expect(at.y).toBeGreaterThanOrEqual(node.y);
    expect(at.y + BADGE_SIZE).toBeLessThanOrEqual(node.y + node.height);
    // the row is from the label's top to its line bottom
    expect(at.y).toBeGreaterThanOrEqual(node.y + slots.labelY - slots.labelSize);
    expect(at.y + BADGE_SIZE).toBeLessThanOrEqual(node.y + slots.labelY + slots.labelSize * 0.5 + BADGE_SIZE);
  });
  it('"↻ n" is on the title row (the label baseline), ends before the badges and not over the formula line', () => {
    const plain = hub();
    const withR = hub(undefined, [{ kind: 'review' }]);
    const slots = textSlots(plain);
    expect(loopsAnchor(plain).y).toBe(plain.y + slots.labelY);
    expect(loopsAnchor(plain).y).not.toBe(plain.y + slots.sublabelY);
    expect(loopsAnchor(plain).x).toBe(titleRowRight(plain));
    expect(loopsAnchor(withR).x).toBeLessThan(badgeOrigin(withR).x);
  });
});
