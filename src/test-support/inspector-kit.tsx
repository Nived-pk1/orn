/**
 * A rig for the inspector's component tests (step 5.6b): the ports over a store made from a state (the demo, the maximal fixture or any
 * generated state), and helpers to open a record and every closed level.
 */
import { fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { deserializeDocument, documentToState } from '@/core/dataset';
import type { CanonicalState } from '@/core/schema';
import type { InspectorHost, InspectorPorts } from '@/features/inspector/contracts';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import { manualTimers } from './navigator-kit';

export function maximalState(): CanonicalState {
  const parsed = deserializeDocument(readFileSync(resolve(process.cwd(), 'data/fixtures/schema/v2/maximal-valid.orn.json'), 'utf8'));
  if (!parsed.ok) throw new Error('the maximal fixture does not load');
  const loaded = documentToState(parsed.document);
  if (!loaded.ok) throw new Error('duplicate IDs in the maximal fixture');
  return loaded.state;
}

export interface InspectorRigOptions {
  readonly depictions?: InspectorPorts['depictions'];
}

export function inspectorRig(state: CanonicalState, options: InspectorRigOptions = {}) {
  const store = createCanonicalStore({ initial: state, revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const timers = manualTimers();
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    ...(options.depictions === undefined ? {} : { depictions: options.depictions }),
    timers,
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false };
  return { ports, host, inspector, state, store, timers };
}

/** Opens every closed level and the raw record until nothing more opens. */
export function openEverything(): void {
  for (let round = 0; round < 8; round += 1) {
    const closed = [...document.querySelectorAll('button[aria-expanded="false"]')];
    if (closed.length === 0) return;
    for (const button of closed) fireEvent.click(button);
  }
}

/** Opens the levels (their headings are buttons whose text has "Level N") and nothing else. */
export function openLevels(): void {
  for (const button of [...document.querySelectorAll('button[aria-expanded="false"]')]) {
    if (/Level \d/.test(button.textContent ?? '')) fireEvent.click(button);
  }
}

/** jsdom does no layout: every element would measure 0 px. Gives items the height the list estimates, so a VirtualList renders rows. */
export function fakeLayout(): void {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 30 });
  HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 320, bottom: 30, width: 320, height: 30, toJSON: () => ({}) });
}
