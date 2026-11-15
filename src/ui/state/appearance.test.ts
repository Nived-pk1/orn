import { describe, expect, it } from 'vitest';
import { APPEARANCE_DEFAULTS, APPEARANCE_KEY, appearanceAttributes, parseAppearance } from './appearance';
import { createAppearanceStore } from './appearance-store';
import { SAVE_DEBOUNCE_MS, type PanelsPort } from './panels';

function manualTimers() {
  let now = 0;
  const jobs: { at: number; run: () => void; live: boolean }[] = [];
  return {
    after(ms: number, run: () => void) {
      const job = { at: now + ms, run, live: true };
      jobs.push(job);
      return () => {
        job.live = false;
      };
    },
    advance(ms: number) {
      now += ms;
      for (const job of jobs.filter((j) => j.live && j.at <= now)) {
        job.live = false;
        job.run();
      }
    },
  };
}
function port(over: Partial<PanelsPort> = {}): PanelsPort & { saved: Record<string, unknown>[] } {
  const saved: Record<string, unknown>[] = [];
  return { stored: undefined, mode: () => 'writable', save: (value) => (saved.push({ ...value }), Promise.resolve()), saved, ...over };
}

describe('parseAppearance (tolerant)', () => {
  it('nothing stored: System, motion follows the device', () => {
    expect(parseAppearance(undefined)).toEqual({ values: APPEARANCE_DEFAULTS, damaged: [], extra: {} });
    expect(APPEARANCE_DEFAULTS).toEqual({ theme: 'system', reduceMotion: false });
  });
  it('a good entry is taken; a bad field resets and is reported; unknown fields are kept', () => {
    expect(parseAppearance({ theme: 'dark', reduceMotion: true, later: 1 })).toEqual({ values: { theme: 'dark', reduceMotion: true }, damaged: [], extra: { later: 1 } });
    expect(parseAppearance({ theme: 'purple', reduceMotion: 'yes' })).toEqual({ values: APPEARANCE_DEFAULTS, damaged: ['theme', 'reduceMotion'], extra: {} });
    expect(parseAppearance(7).damaged).toEqual(['appearance']);
  });
});

describe('appearanceAttributes (what goes on the root element)', () => {
  it('System writes no theme attribute (the device decides by CSS); Light and Dark write theirs; motion only when turned on', () => {
    expect(appearanceAttributes({ theme: 'system', reduceMotion: false })).toEqual({ 'data-theme': null, 'data-reduce-motion': null });
    expect(appearanceAttributes({ theme: 'light', reduceMotion: true })).toEqual({ 'data-theme': 'light', 'data-reduce-motion': 'on' });
    expect(appearanceAttributes({ theme: 'dark', reduceMotion: false })).toEqual({ 'data-theme': 'dark', 'data-reduce-motion': null });
  });
});

describe('createAppearanceStore', () => {
  it('starts from the stored entry', () => {
    const store = createAppearanceStore(port({ stored: { theme: 'dark' } }), manualTimers());
    expect(store.getState().theme).toBe('dark');
  });
  it('a change is saved after the debounce, under the key "appearance", with unknown fields kept', () => {
    const timers = manualTimers();
    const p = port({ stored: { later: 3 } });
    const store = createAppearanceStore(p, timers);
    store.getState().setTheme('light');
    store.getState().setReduceMotion(true);
    expect(p.saved).toEqual([]);
    timers.advance(SAVE_DEBOUNCE_MS);
    expect(p.saved).toEqual([{ later: 3, theme: 'light', reduceMotion: true }]);
    expect(APPEARANCE_KEY).toBe('appearance');
  });
  it('a read-only tab keeps the choice for the session and writes nothing', () => {
    const timers = manualTimers();
    const p = port({ mode: () => 'read_only' });
    const store = createAppearanceStore(p, timers);
    store.getState().setTheme('dark');
    timers.advance(SAVE_DEBOUNCE_MS);
    expect(p.saved).toEqual([]);
    expect(store.getState().theme).toBe('dark');
    expect(store.getState().persistence.kind).toBe('read_only');
  });
  it('setting the same value saves nothing', () => {
    const timers = manualTimers();
    const p = port();
    createAppearanceStore(p, timers).getState().setTheme('system');
    timers.advance(SAVE_DEBOUNCE_MS);
    expect(p.saved).toEqual([]);
  });
});
