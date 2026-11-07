import { describe, expect, it } from 'vitest';
import { initialViewOf } from './initial-view';

const saved = { x: 10, y: 20, scale: 0.7 };

describe('the view a reloaded map starts from (step 8.4b, E2a)', () => {
  it('a map that was still fitted when it was saved is fitted again: the saved view is not used', () => {
    expect(initialViewOf(saved, true)).toBeUndefined();
  });
  it('a map the person had panned or zoomed keeps its saved view', () => {
    expect(initialViewOf(saved, false)).toBe(saved);
  });
  it('nothing saved: nothing to restore', () => {
    expect(initialViewOf(undefined, false)).toBeUndefined();
    expect(initialViewOf(undefined, true)).toBeUndefined();
  });
});
