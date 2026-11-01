import { describe, expect, it } from 'vitest';
import { createExplorerStore, createFamilyStore, createOverviewStore, createReagentsStore } from '@/ui/state';
import { openReagent, openReagentsList } from './reagents-entry';

const stores = () => ({ reagents: createReagentsStore({ families: ['base'], text: 'x' }), overview: createOverviewStore(), family: createFamilyStore('hub_a'), explorer: createExplorerStore() });

describe('openReagent (7.3c D4)', () => {
  it('opens the page with clean filters, remembers the Explore tab and the Reagents explorer, closes a family page, switches the mode', () => {
    const ui = stores();
    const modes: string[] = [];
    openReagent(ui, (mode) => modes.push(mode), 'rgt_koh');
    expect(ui.reagents.getState()).toMatchObject({ reagentId: 'rgt_koh', families: [], text: '' });
    expect(ui.overview.getState().phoneTab).toBe('explore');
    expect(ui.explorer.getState().last).toBe('reagents');
    expect(ui.family.getState().open).toBeNull();
    expect(modes).toEqual(['reagents']);
  });
  it('opening the list leaves the choices as they are', () => {
    const ui = stores();
    const modes: string[] = [];
    openReagentsList(ui, (mode) => modes.push(mode));
    expect(ui.reagents.getState()).toMatchObject({ reagentId: null, families: ['base'], text: 'x' });
    expect(modes).toEqual(['reagents']);
  });
});
