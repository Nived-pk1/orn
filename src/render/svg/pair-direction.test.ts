import { describe, expect, it } from 'vitest';
import { halfOf, nearerHead } from './pair-direction';

const route = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]; // length 200, the middle is at (100, 0)

describe('a two-way pair: the direction whose head is nearer', () => {
  it('the point near the end is the forward direction, near the start the back one', () => {
    expect(nearerHead(route, { x: 100, y: 90 })).toBe('forward');
    expect(nearerHead(route, { x: 5, y: 3 })).toBe('back');
  });
  it('a point exactly in the middle goes forward (the first direction), always', () => {
    expect(nearerHead(route, { x: 100, y: 0 })).toBe('forward');
  });
  it('the half of a direction is the part of its own route from the middle to its head', () => {
    const half = halfOf(route);
    expect(half[0]).toEqual({ x: 100, y: 0 });
    expect(half[half.length - 1]).toEqual({ x: 100, y: 100 });
    expect(halfOf([...route].reverse())[halfOf([...route].reverse()).length - 1]).toEqual({ x: 0, y: 0 });
  });
});
