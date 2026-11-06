/** Where the in-map key sits (step 8.3b, A3): the bottom-left corner of the map, the bottom-right when the left would cover a box. */
import { describe, expect, it } from 'vitest';
import { keyPlacement } from './key-placement';

const area = { width: 800, height: 500 };
const key = { width: 220, height: 36 };

describe('keyPlacement', () => {
  it('no box near the corner: bottom-left', () => {
    expect(keyPlacement([{ x: 300, y: 100, width: 100, height: 60 }], key, area)).toBe('bottom-left');
    expect(keyPlacement([], key, area)).toBe('bottom-left');
  });
  it('a box under the bottom-left corner: bottom-right', () => {
    expect(keyPlacement([{ x: 20, y: 470, width: 100, height: 60 }], key, area)).toBe('bottom-right');
  });
  it('a box that only touches the key box edge to edge does not count as covered by 8 px of margin', () => {
    // the key occupies x 8..228, y 456..492; a box ending at x 8 is clear
    expect(keyPlacement([{ x: -100, y: 460, width: 108, height: 20 }], key, area)).toBe('bottom-left');
  });
  it('boxes under both corners: the corner that covers fewer boxes, the left on a tie', () => {
    const both = [{ x: 10, y: 470, width: 80, height: 20 }, { x: 700, y: 470, width: 80, height: 20 }];
    expect(keyPlacement(both, key, area)).toBe('bottom-left');
    expect(keyPlacement([...both, { x: 100, y: 470, width: 80, height: 20 }], key, area)).toBe('bottom-right');
  });
});
