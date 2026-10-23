/** Which gestures d3-zoom may take (step 6.8b): its default, except a Shift press while multi-selection is on (that press draws a marquee, it must not pan). */
import { describe, expect, it } from 'vitest';
import { zoomFilter } from './zoom-binding';

const event = (type: string, extra: Partial<{ shiftKey: boolean; ctrlKey: boolean; button: number }> = {}) => ({ type, shiftKey: false, ctrlKey: false, button: 0, ...extra });

describe('zoomFilter', () => {
  it('is d3-zoom\'s default when multi-selection is off: Shift-drag still pans', () => {
    const filter = zoomFilter(() => false);
    expect(filter(event('mousedown', { shiftKey: true }))).toBe(true);
    expect(filter(event('mousedown', { button: 2 }))).toBe(false);
    expect(filter(event('mousedown', { ctrlKey: true }))).toBe(false);
    expect(filter(event('wheel', { ctrlKey: true }))).toBe(true); // a pinch-zoom wheel
  });
  it('with multi-selection on, a Shift press does not pan or pinch, but the wheel still zooms', () => {
    const filter = zoomFilter(() => true);
    expect(filter(event('mousedown', { shiftKey: true }))).toBe(false);
    expect(filter(event('touchstart', { shiftKey: true }))).toBe(false);
    expect(filter(event('mousedown'))).toBe(true);
    expect(filter(event('wheel', { shiftKey: true }))).toBe(true);
  });
});
