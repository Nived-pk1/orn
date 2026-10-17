// @vitest-environment jsdom
/** "Show full equation" at L1 of a reaction in the inspector (step 5.9a review, follow-up b). */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDerivedIndexes } from '@/app/services/derived-indexes';
import { createCanonicalStore } from '@/core/commands';
import { demoState } from '@/test-support/app-boot-kit';
import { manualTimers } from '@/test-support/navigator-kit';
import { createFamilyStore, createInspectorStore, createPanelsStore, createSelectionStore } from '@/ui/state';
import type { InspectorHost, InspectorPorts } from './contracts';
import { Inspector } from './inspector';
import { loadOtherViews } from './lazy-views';

afterEach(cleanup);

function openDisclosure(): void {
  const details = screen.getByText('Show full equation').closest('details') as HTMLDetailsElement;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
}

function show(reactionId: string): void {
  const store = createCanonicalStore({ initial: demoState(), revision: 0, validateInitial: false });
  const indexes = createDerivedIndexes({ store, clock: { nowMs: () => 0 } });
  const inspector = createInspectorStore();
  const panels = createPanelsStore({ stored: undefined, mode: () => 'writable', save: () => Promise.resolve() }, { after: () => () => undefined });
  const ports: InspectorPorts = {
    store,
    indexes: { current: () => indexes.current() },
    findings: store.findings,
    l4: { statusOf: () => ({ state: 'none' }), derivedFormulaOf: () => undefined, subscribe: () => () => undefined, subscribeFormulas: () => () => undefined },
    timers: manualTimers(),
    ui: { inspector, selection: createSelectionStore(), family: createFamilyStore(), panels },
    log: () => undefined,
  };
  const host: InspectorHost = { openPane: () => undefined, edgeEnds: () => undefined, navigatorShown: false };
  render(<Inspector ports={ports} host={host} />);
  act(() => inspector.getState().open({ kind: 'reaction', id: reactionId } as never));
}

// the kind views are a lazy chunk since step 6.1a: load it once so these tests render a view at once
beforeAll(async () => {
  await loadOtherViews();
});

describe('Show full equation in the inspector', () => {
  it('Cannizzaro: a closed disclosure whose line reads 2 Benzaldehyde to both products', () => {
    show('rxn_benzaldehyde-cannizzaro');
    const summary = screen.getByText('Show full equation');
    expect(summary.closest('details')?.open).toBe(false);
    openDisclosure();
    expect(screen.getByRole('list', { name: 'Full equation', hidden: true }).textContent).toContain('2 Benzaldehyde');
    // two main products: the outcome's word is written once, after the last (phone mode C review, item 5)
    expect(screen.getByRole('list', { name: 'Full equation', hidden: true }).textContent).toContain('Benzyl alcohol + Sodium benzoate (both exclusive)');
  });

  it('the 413 K reaction has one line per outcome, each with its own temperature', () => {
    show('rxn_ethanol-conc-h2so4');
    openDisclosure();
    const lines = screen.getAllByRole('listitem', { hidden: true }).filter((li) => li.getAttribute('aria-label')?.includes('→'));
    expect(lines.length).toBe(2);
    expect(lines[0]?.textContent).toContain('413 K');
    expect(lines[1]?.textContent).toContain('443 K');
  });
});
