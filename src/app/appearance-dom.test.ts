import { describe, expect, it } from 'vitest';
import { createAppearanceStore } from '@/ui/state';
import { applyAppearance } from './appearance-dom';
import { watchAppearance } from './appearance-watch';

const fakeRoot = () => {
  const attrs = new Map<string, string>();
  return { attrs, setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
};
const port = (stored: unknown) => ({ stored, mode: () => 'writable' as const, save: () => Promise.resolve() });
const timers = { after: () => () => undefined };

describe('applyAppearance', () => {
  it('a stored Dark and Reduce motion are on the root before anything renders', () => {
    const root = fakeRoot();
    applyAppearance(root, { theme: 'dark', reduceMotion: true });
    expect([...root.attrs]).toEqual([['data-theme', 'dark'], ['data-reduce-motion', 'on']]);
  });
  it('System removes the theme attribute (the device decides by CSS)', () => {
    const root = fakeRoot();
    applyAppearance(root, { theme: 'light', reduceMotion: false });
    applyAppearance(root, { theme: 'system', reduceMotion: false });
    expect(root.attrs.size).toBe(0);
  });
});

describe('watchAppearance', () => {
  it('applies the stored values at once and every later change', () => {
    const root = fakeRoot();
    const store = createAppearanceStore(port({ theme: 'light' }), timers);
    const stop = watchAppearance(root, store);
    expect(root.attrs.get('data-theme')).toBe('light');
    store.getState().setTheme('dark');
    expect(root.attrs.get('data-theme')).toBe('dark');
    stop();
    store.getState().setTheme('system');
    expect(root.attrs.get('data-theme')).toBe('dark');
  });
});
