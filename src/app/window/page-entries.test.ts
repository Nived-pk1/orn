import { describe, expect, it } from 'vitest';
import { createExplorerStore, createFamilyStore, createOverviewStore, createPageListStore } from '@/ui/state';
import { openMechanism, openMechanismsList, openNamed, openNamedList } from './page-entries';

const stores = () => ({ named: createPageListStore({ text: 'x', onlyInScope: true }), mechanisms: createPageListStore({ text: 'y' }), overview: createOverviewStore(), family: createFamilyStore('hub_a'), explorer: createExplorerStore() });

describe('openNamed (7.4 D)', () => {
  it('opens the page with clean filters, remembers the Explore tab and the explorer, closes a family page, switches the mode', () => {
    const ui = stores();
    const modes: string[] = [];
    openNamed(ui, (mode) => modes.push(mode), 'nrx_aldol');
    expect(ui.named.getState()).toMatchObject({ openId: 'nrx_aldol', text: '', onlyInScope: false });
    expect(ui.overview.getState().phoneTab).toBe('explore');
    expect(ui.explorer.getState().last).toBe('named');
    expect(ui.family.getState().open).toBeNull();
    expect(modes).toEqual(['named']);
  });
  it('opening the list leaves the choices as they are', () => {
    const ui = stores();
    const modes: string[] = [];
    openNamedList(ui, (mode) => modes.push(mode));
    expect(ui.named.getState()).toMatchObject({ openId: null, text: 'x', onlyInScope: true });
    expect(modes).toEqual(['named']);
  });
});

describe('openMechanism (7.4 E)', () => {
  it('opens the page, remembers the Mechanisms explorer and switches the mode', () => {
    const ui = stores();
    const modes: string[] = [];
    openMechanism(ui, (mode) => modes.push(mode), 'mec_sn2');
    expect(ui.mechanisms.getState()).toMatchObject({ openId: 'mec_sn2', text: '' });
    expect(ui.explorer.getState().last).toBe('mechanisms');
    expect(ui.overview.getState().phoneTab).toBe('explore');
    expect(modes).toEqual(['mechanisms']);
  });
  it('opening the list leaves the choices as they are', () => {
    const ui = stores();
    openMechanismsList(ui, () => undefined);
    expect(ui.mechanisms.getState()).toMatchObject({ openId: null, text: 'y' });
  });
});
