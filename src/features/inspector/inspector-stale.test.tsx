// @vitest-environment jsdom
/**
 * B4 (step 8.2b): the inspector never shows a record that is not the current selection. The cause was the bridge keeping the OLD record when
 * the selection had no record (the map's Unclassified box): the pane then opened on the stale one. Select A, close the pane, select
 * Unclassified, open it: Unclassified, not A. Nothing selected: the empty state.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';
import { loadOtherViews } from './lazy-views';

afterEach(cleanup);

function rig() {
  const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const selection = createSelectionStore();
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: manualTimers(),
    ui: { inspector: createInspectorStore(), selection, family: createFamilyStore(), panels: createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined }) },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: true };
  render(<Inspector ports={ports} host={host} />);
  return { selection, panels: ports.ui.panels };
}

describe('Inspector: no stale record (B4)', () => {
  it('select a family, then Unclassified: the pane shows Unclassified, not the family', async () => {
    await loadOtherViews();
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    expect(await screen.findByRole('article', { name: 'Record' })).toBeTruthy();
    act(() => r.selection.getState().select({ kind: 'node', id: 'virtual:unclassified:hub' }));
    expect(await screen.findByRole('heading', { name: 'Compounds not in a family yet' })).toBeTruthy();
    expect(screen.queryByRole('article', { name: 'Record' })).toBeNull();
    expect(screen.getByText('Not in a family yet')).toBeTruthy();
  });
  it('select a family, then nothing: the empty state', async () => {
    await loadOtherViews();
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.selection.getState().select(null));
    act(() => r.panels.getState().setInspectorOpen(true));
    expect(screen.getByLabelText('Inspector empty state')).toBeTruthy();
  });
});
