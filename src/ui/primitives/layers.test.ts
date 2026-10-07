import { describe, expect, it } from 'vitest';
import { isTopLayer, openLayers, pushLayer } from './layers';

describe('the layer stack (Esc closes the topmost layer only)', () => {
  it('the last pushed layer is on top; releasing it makes the one below the top again', () => {
    const base = openLayers();
    const releaseA = pushLayer('a');
    const releaseB = pushLayer('b');
    expect(openLayers()).toBe(base + 2);
    expect(isTopLayer('b')).toBe(true);
    expect(isTopLayer('a')).toBe(false);
    releaseB();
    expect(isTopLayer('a')).toBe(true);
    releaseA();
    expect(openLayers()).toBe(base);
  });

  it('releasing twice, or releasing a layer below the top, changes nothing else', () => {
    const releaseA = pushLayer('a2');
    const releaseB = pushLayer('b2');
    releaseA();
    releaseA();
    expect(isTopLayer('b2')).toBe(true);
    expect(isTopLayer('a2')).toBe(false);
    releaseB();
    expect(isTopLayer('b2')).toBe(false);
  });
});
