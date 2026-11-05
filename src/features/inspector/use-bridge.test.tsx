// @vitest-environment jsdom
/**
 * The bridge from the canvas (step 5.6a; step 5.7 item d): a pick on the map focuses the inspector's record at once but opens the pane
 * only on `reveal()` (the pointer state machine's confirmation after its 300 ms double-click window; Enter and the menu reveal at
 * once), never while a family page is open; a pick on a family page's card opens the pane at once. The bridge has no timer.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore, selectionOf } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { useBridge } from './use-bridge';

afterEach(cleanup);

function rig() {
  const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const timers = manualTimers();
  const selection = createSelectionStore();
  const family = createFamilyStore();
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers,
    ui: {
      inspector: createInspectorStore(),
      selection,
      family,
      panels: createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined }),
    },
    log: () => undefined,
  };
  let opened = 0;
  const edges = new Map<string, { from: string; to: string }>();
  const host: InspectorHost = { openPane: () => void (opened += 1), edgeEnds: (id) => edges.get(id), navigatorShown: true };
  const Probe = () => {
    useBridge(ports, host);
    return null;
  };
  render(<Probe />);
  return { ports, timers, selection, family, edges, opened: () => opened };
}

describe('opening the pane from a pick', () => {
  it('a pick on the map focuses the record but does not open the pane; a reveal opens it', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    expect(r.ports.ui.inspector.getState().history.length).toBe(1);
    act(() => r.timers.advance(10_000));
    expect(r.opened()).toBe(0);
    act(() => r.selection.getState().reveal());
    expect(r.opened()).toBe(1);
  });

  it('a reveal while a family page is open does not open the pane (a double click opened the page)', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.family.getState().openFamily('cls_alcohols'));
    act(() => r.selection.getState().reveal());
    expect(r.opened()).toBe(0);
  });

  it('the bridge keeps no timer of its own', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    expect(r.timers.pending()).toBe(0);
  });

  it('a pick of a card on a family page opens it at once', () => {
    const r = rig();
    const reactionId = Object.keys(r.ports.store.getState().records.reaction)[0] as string;
    act(() => r.family.getState().selectReaction(reactionId));
    expect(r.opened()).toBe(1);
  });
});

describe('the inspector follows the ONE map selection (step 8.2b-fix, S1)', () => {
  const UNCLASSIFIED = 'virtual:unclassified:hub';
  const sel = (r: ReturnType<typeof rig>) => selectionOf(r.ports.ui.inspector.getState());
  it('a family is a record; Unclassified is the bucket, never the family that was open before', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    expect(sel(r)).toMatchObject({ kind: 'class', id: 'cls_alcohols' });
    act(() => r.selection.getState().select({ kind: 'node', id: UNCLASSIFIED }));
    expect(sel(r)).toEqual({ kind: 'bucket' });
    act(() => r.selection.getState().reveal());
    expect(r.opened()).toBe(1);
  });
  it('an arrow is an arrow (from, to), whichever pane state came before', () => {
    const r = rig();
    r.edges.set('e1', { from: 'cls_amines', to: UNCLASSIFIED });
    r.edges.set('e2', { from: UNCLASSIFIED, to: 'cls_alkynes' });
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_amines' }));
    act(() => r.selection.getState().select({ kind: 'edge', id: 'e1' }));
    expect(sel(r)).toEqual({ kind: 'arrow', from: 'cls_amines', to: UNCLASSIFIED });
    act(() => r.selection.getState().select({ kind: 'edge', id: 'e2' }));
    expect(sel(r)).toEqual({ kind: 'arrow', from: UNCLASSIFIED, to: 'cls_alkynes' });
  });
  it('an arrow with no ends, or a node that names no record, selects nothing (never keeps the old record)', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.selection.getState().select({ kind: 'edge', id: 'edge-without-ends' }));
    expect(sel(r)).toEqual({ kind: 'none' });
  });
  it('an empty-map click or Esc (select(null)) selects nothing, also when nothing was selected on the map', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.selection.getState().select(null));
    expect(sel(r)).toEqual({ kind: 'none' });
    const reaction = Object.keys(r.ports.store.getState().records.reaction)[0] as string;
    act(() => r.family.getState().selectReaction(reaction));
    expect(sel(r)).toMatchObject({ kind: 'reaction', id: reaction });
    act(() => r.selection.getState().select(null));
    expect(sel(r)).toEqual({ kind: 'none' });
  });
  it('opening and closing the pane changes nothing', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: UNCLASSIFIED }));
    act(() => r.ports.ui.panels.getState().setInspectorOpen(true));
    act(() => r.ports.ui.panels.getState().setInspectorOpen(false));
    act(() => r.ports.ui.panels.getState().setInspectorOpen(true));
    expect(sel(r)).toEqual({ kind: 'bucket' });
  });
  it('the drawing dropping the selection by itself (drop) leaves what the inspector shows', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.selection.getState().drop());
    expect(sel(r)).toMatchObject({ kind: 'class', id: 'cls_alcohols' });
  });
});
