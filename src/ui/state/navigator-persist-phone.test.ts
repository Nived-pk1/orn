import { describe, expect, it } from 'vitest';
import { createNavigatorUi, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';
import { createOverviewStore } from './navigator-stores';

/** The phone's home tab (ADR-039): remembered in `uiState`, tolerant, and absent from the file while it is the default. */
function timers() {
  let pending: (() => void) | undefined;
  return { after: (_ms: number, run: () => void) => ((pending = run), () => void (pending = undefined)), fire: () => pending?.() };
}
function port(options: Partial<NavigatorUiPort> = {}) {
  const saves: Record<string, unknown>[] = [];
  const value: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()), ...options };
  return { value, saves };
}

describe('the phone tab', () => {
  it('is Families by default and Families when the file does not say', () => {
    expect(createOverviewStore().getState().phoneTab).toBe('families');
    expect(parseNavigatorUi(undefined).phoneTab).toBe('families');
    expect(parseNavigatorUi({ overviewMode: 'map' })).toMatchObject({ phoneTab: 'families', damaged: [] });
  });

  it('reads a saved tab, and resets a damaged one to Families and names it', () => {
    expect(parseNavigatorUi({ phoneTab: 'map' })).toMatchObject({ phoneTab: 'map', damaged: [] });
    expect(parseNavigatorUi({ phoneTab: 'search' })).toMatchObject({ phoneTab: 'families', damaged: ['phoneTab'] });
    expect(parseNavigatorUi({ phoneTab: 3 })).toMatchObject({ phoneTab: 'families', damaged: ['phoneTab'] });
  });

  it('does not keep the key in the "extra" part that is written back', () => {
    expect(parseNavigatorUi({ phoneTab: 'map', future: 1 }).extra).toEqual({ future: 1 });
  });

  it('is saved when it is the map, left out when it is Families, and comes back after a reload', async () => {
    const t = timers();
    const first = port();
    const ui = createNavigatorUi(first.value, t);
    ui.stores.overview.getState().setPhoneTab('map');
    t.fire();
    await ui.flush();
    const saved = first.saves.at(-1);
    expect(saved).toMatchObject({ phoneTab: 'map' });
    const again = createNavigatorUi(port({ stored: saved }).value, t);
    expect(again.stores.overview.getState().phoneTab).toBe('map');
    again.stores.overview.getState().setPhoneTab('families');
    await again.flush();
    const second = port({ stored: saved });
    const third = createNavigatorUi(second.value, t);
    third.stores.overview.getState().setPhoneTab('families');
    third.stores.overview.getState().setPhoneTab('map');
    third.stores.overview.getState().setPhoneTab('families');
    await third.flush();
    expect(second.saves.at(-1)).not.toHaveProperty('phoneTab');
  });
});
