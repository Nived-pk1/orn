// @vitest-environment jsdom
/**
 * The bridge from the canvas (step 5.6a; follow-up of 5.6b Part A): a pick on the map opens the pane only after the double-click grace
 * (opening it moves the drawing, which would make the second click of a double click land elsewhere); a family page opened in the
 * meantime cancels it; a pick on a family page's card opens the pane at once.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { DOUBLE_CLICK_GRACE_MS, useBridge } from './use-bridge';

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
  const host: InspectorHost = { openPane: () => void (opened += 1), edgeEnds: () => undefined, navigatorShown: true };
  const Probe = () => {
    useBridge(ports, host);
    return null;
  };
  render(<Probe />);
  return { ports, timers, selection, family, opened: () => opened };
}

describe('opening the pane from a pick', () => {
  it('a pick on the map opens the pane after the grace, not before', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    expect(r.ports.ui.inspector.getState().history.length).toBe(1);
    expect(r.opened()).toBe(0);
    act(() => r.timers.advance(DOUBLE_CLICK_GRACE_MS - 1));
    expect(r.opened()).toBe(0);
    act(() => r.timers.advance(1));
    expect(r.opened()).toBe(1);
  });

  it('a family page opened within the grace (a double click) cancels it', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.family.getState().openFamily('cls_alcohols'));
    act(() => r.timers.advance(DOUBLE_CLICK_GRACE_MS * 2));
    expect(r.opened()).toBe(0);
  });

  it('two picks in a row open it once', () => {
    const r = rig();
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.selection.getState().select({ kind: 'node', id: 'cls_alcohols' }));
    act(() => r.timers.advance(DOUBLE_CLICK_GRACE_MS));
    expect(r.opened()).toBe(1);
  });

  it('a pick of a card on a family page opens it at once', () => {
    const r = rig();
    const reactionId = Object.keys(r.ports.store.getState().records.reaction)[0] as string;
    act(() => r.family.getState().selectReaction(reactionId));
    expect(r.opened()).toBe(1);
  });
});
