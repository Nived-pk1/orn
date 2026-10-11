import { describe, expect, it } from 'vitest';
import { createNavigatorUi, MAX_SAVED_EXPANDED, parseNavigatorUi, type NavigatorUiPort } from './navigator-persist';
import { SAVE_DEBOUNCE_MS } from './panels';

function timers() {
  let pending: (() => void) | undefined;
  return {
    after: (_ms: number, run: () => void) => {
      pending = run;
      return () => void (pending = undefined);
    },
    fire: () => {
      const run = pending;
      pending = undefined;
      run?.();
    },
    waiting: () => pending !== undefined,
  };
}

function port(options: Partial<NavigatorUiPort> = {}) {
  const saves: Record<string, unknown>[] = [];
  const value: NavigatorUiPort = { stored: undefined, mode: () => 'writable', save: (v) => (saves.push({ ...v }), Promise.resolve()), ...options };
  return { value, saves };
}

describe('parseNavigatorUi', () => {
  it('nothing stored: the defaults, no damage', () => {
    expect(parseNavigatorUi(undefined)).toMatchObject({ selected: null, expansion: { expanded: [], collapsedEdgeIds: [] }, views: {}, damaged: [] });
  });

  it('a good entry is read whole', () => {
    const parsed = parseNavigatorUi({
      selected: { kind: 'edge', id: 'e1' },
      expanded: [{ nodeId: 'h1', direction: 'both' }],
      collapsedEdgeIds: ['e9'],
      viewports: { navigator: { x: 1, y: -2, scale: 0.5 } },
      future: { kept: true },
    });
    expect(parsed.damaged).toEqual([]);
    expect(parsed.selected).toEqual({ kind: 'edge', id: 'e1' });
    expect(parsed.expansion).toEqual({ expanded: [{ nodeId: 'h1', direction: 'both' }], collapsedEdgeIds: ['e9'] });
    expect(parsed.views).toEqual({ navigator: { x: 1, y: -2, scale: 0.5 } });
    expect(parsed.extra).toEqual({ future: { kept: true } });
  });

  it.each([
    ['not an object', 5, ['navigator']],
    ['a selection of the wrong kind', { selected: { kind: 'reaction', id: 'x' } }, ['selected']],
    ['an empty selected id', { selected: { kind: 'node', id: '' } }, ['selected']],
    ['expansion that is not a list', { expanded: 'all' }, ['expanded']],
    ['one bad expansion entry spoils the list', { expanded: [{ nodeId: 'a', direction: 'both' }, { nodeId: 'b', direction: 'sideways' }] }, ['expanded']],
    ['an over-long expansion', { expanded: Array.from({ length: MAX_SAVED_EXPANDED + 1 }, (_, i) => ({ nodeId: `n${i}`, direction: 'both' })) }, ['expanded']],
    ['collapsed ids that are not strings', { collapsedEdgeIds: [1] }, ['collapsedEdgeIds']],
    ['a viewport with NaN', { viewports: { navigator: { x: Number.NaN, y: 0, scale: 1 } } }, ['viewports.navigator']],
    ['a viewport with scale 0', { viewports: { navigator: { x: 0, y: 0, scale: 0 } } }, ['viewports.navigator']],
    ['a viewport for an unknown view', { viewports: { nowhere: { x: 0, y: 0, scale: 1 } } }, ['viewports.nowhere']],
    ['viewports that are not an object', { viewports: [] }, ['viewports']],
  ])('%s is reset to the default and named', (_name, raw, damaged) => {
    const parsed = parseNavigatorUi(raw);
    expect(parsed.damaged).toEqual(damaged);
    expect(parsed.selected).toBeNull();
    expect(parsed.expansion.expanded).toEqual([]);
    expect(parsed.views).toEqual({});
  });

  it('keeps the good parts when another part is damaged', () => {
    const parsed = parseNavigatorUi({ selected: { kind: 'node', id: 'a' }, expanded: 3 });
    expect(parsed.selected).toEqual({ kind: 'node', id: 'a' });
    expect(parsed.damaged).toEqual(['expanded']);
  });
});

describe('createNavigatorUi', () => {
  it('starts the stores from the stored entry and logs a reset', () => {
    const logs: string[] = [];
    const { value } = port({ stored: { selected: { kind: 'node', id: 'a' }, expanded: 1 } });
    const ui = createNavigatorUi(value, timers(), (type) => void logs.push(type));
    expect(ui.stores.selection.getState().selected).toEqual({ kind: 'node', id: 'a' });
    expect(ui.status.getState().resetFields).toEqual(['expanded']);
    expect(logs).toEqual(['ui_state_reset']);
  });

  it('writes once after the debounce, with unknown fields kept, and never writes filters or the exam version', async () => {
    const t = timers();
    const { value, saves } = port({ stored: { future: 1 } });
    const ui = createNavigatorUi(value, t);
    ui.stores.selection.getState().select({ kind: 'node', id: 'a' });
    ui.stores.expansion.getState().toggle('a');
    ui.stores.viewports.getState().setViewport('navigator', { x: 1, y: 2, scale: 3 });
    ui.stores.filters.getState().setFilters({ scopes: [], topicIds: ['t' as never], reagentFamilies: [] });
    expect(saves).toHaveLength(0);
    expect(SAVE_DEBOUNCE_MS).toBe(300);
    t.fire();
    await Promise.resolve();
    expect(saves).toHaveLength(1);
    expect(saves[0]).toEqual({
      future: 1,
      selected: { kind: 'node', id: 'a' },
      expanded: [{ nodeId: 'a', direction: 'both' }],
      collapsedEdgeIds: [],
      viewports: { navigator: { x: 1, y: 2, scale: 3 } },
      openFamily: null,
      overviewMode: 'map',
      recentSearches: [],
    });
  });

  it('writes the open family; closing it writes null (step 5.5b)', async () => {
    const t = timers();
    const { value, saves } = port();
    const ui = createNavigatorUi(value, t);
    ui.stores.family.getState().openFamily('cls_alcohols', { section: 'reactions_of', hubId: 'cls_ethers' });
    await ui.flush();
    expect(saves.at(-1)).toMatchObject({ openFamily: 'cls_alcohols' });
    expect(JSON.stringify(saves.at(-1))).not.toContain('cls_ethers');
    ui.stores.family.getState().closeFamily();
    await ui.flush();
    expect(saves.at(-1)).toMatchObject({ openFamily: null });
  });

  it('reads the open family back; an unusable one is damaged, not fatal', () => {
    expect(createNavigatorUi(port({ stored: { openFamily: 'cls_alcohols' } }).value, timers()).stores.family.getState().open).toBe('cls_alcohols');
    expect(parseNavigatorUi({ openFamily: 7 })).toMatchObject({ openFamily: null, damaged: ['openFamily'] });
    expect(parseNavigatorUi({ openFamily: '' })).toMatchObject({ openFamily: null, damaged: ['openFamily'] });
    expect(parseNavigatorUi({ openFamily: null })).toMatchObject({ openFamily: null, damaged: [] });
  });

  it('a saved expansion is ignored, removed once, logged, and written back empty (ADR-037)', async () => {
    const logs: { type: string; message: string }[] = [];
    const t = timers();
    const { value, saves } = port({ stored: { selected: null, expanded: [{ nodeId: 'a', direction: 'both' }], collapsedEdgeIds: ['e'], openFamily: null } });
    const ui = createNavigatorUi(value, t, (type, message) => void logs.push({ type, message }));
    expect(ui.stores.expansion.getState().expansion).toEqual({ expanded: [], collapsedEdgeIds: [] });
    expect(logs.filter((l) => l.type === 'ui_state_expansion_removed')).toHaveLength(1);
    expect(t.waiting()).toBe(true);
    t.fire();
    await Promise.resolve();
    expect(saves[0]).toMatchObject({ expanded: [], collapsedEdgeIds: [] });
    // nothing saved to remove: no log, no write
    const again = createNavigatorUi(port({ stored: { expanded: [] } }).value, timers(), (type) => void logs.push({ type, message: '' }));
    expect(again.stores.expansion.getState().expansion.expanded).toEqual([]);
    expect(logs.filter((l) => l.type === 'ui_state_expansion_removed')).toHaveLength(1);
  });

  it('a change that sets the same value schedules no write', () => {
    const t = timers();
    const { value } = port();
    const ui = createNavigatorUi(value, t);
    ui.stores.selection.getState().select(null);
    expect(t.waiting()).toBe(false);
    ui.stores.viewports.getState().setViewport('navigator', { x: 1, y: 1, scale: 1 });
    t.fire();
    ui.stores.viewports.getState().setViewport('navigator', { x: 1, y: 1, scale: 1 });
    expect(t.waiting()).toBe(false);
  });

  it.each([
    ['read_only', 'read_only'],
    ['session_only', 'session_only'],
  ] as const)('a %s tab keeps its values, writes nothing and says so', (mode, kind) => {
    const t = timers();
    const { value, saves } = port({ mode: () => mode });
    const ui = createNavigatorUi(value, t);
    ui.stores.selection.getState().select({ kind: 'node', id: 'a' });
    expect(t.waiting()).toBe(false);
    expect(saves).toHaveLength(0);
    expect(ui.stores.selection.getState().selected).toEqual({ kind: 'node', id: 'a' });
    expect(ui.status.getState().persistence.kind).toBe(kind);
  });

  it('a failed save is reported and logged, not thrown', async () => {
    const logs: string[] = [];
    const t = timers();
    const { value } = port({ save: () => Promise.reject(new Error('disk full')) });
    const ui = createNavigatorUi(value, t, (type) => void logs.push(type));
    ui.stores.selection.getState().select({ kind: 'node', id: 'a' });
    t.fire();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(ui.status.getState().persistence).toEqual({ kind: 'save_failed', message: 'disk full' });
    expect(logs).toContain('ui_state_save_failed');
  });

  it('flush writes what is waiting at once; dispose stops listening', async () => {
    const t = timers();
    const { value, saves } = port();
    const ui = createNavigatorUi(value, t);
    ui.stores.selection.getState().select({ kind: 'node', id: 'a' });
    await ui.flush();
    expect(saves).toHaveLength(1);
    ui.dispose();
    ui.stores.selection.getState().select({ kind: 'node', id: 'b' });
    expect(t.waiting()).toBe(false);
  });
});
