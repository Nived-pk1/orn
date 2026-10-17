// @vitest-environment jsdom
/** "Show full equation" at L1 of a reaction in the inspector (step 5.9a review, follow-up b). */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
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

function show(reactionId: string) {
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
  return { panels };
}

// the kind views are a lazy chunk since step 6.1a: load it once so these tests render a view at once
beforeAll(async () => {
  await loadOtherViews();
});

const descriptionOf = (group: HTMLElement): string => document.getElementById(group.getAttribute('aria-describedby') as string)?.textContent ?? '';

describe('Show full equation in the inspector', () => {
  it('Cannizzaro: a closed disclosure; opened, the description of the scheme is the sentence 2 Benzaldehyde to both products', () => {
    show('rxn_benzaldehyde-cannizzaro');
    const summary = screen.getByText('Show full equation');
    expect(summary.closest('details')?.open).toBe(false);
    openDisclosure();
    const scheme = screen.getByRole('group', { name: 'Full equation', hidden: true });
    // two main products: the outcome's word is written once, after the last (phone mode C review, item 5)
    expect(descriptionOf(scheme)).toBe('2 Benzaldehyde → Benzyl alcohol + Sodium benzoate (both exclusive)');
    expect(document.querySelector('[data-equation-coefficient]')?.textContent).toBe('2');
    expect([...document.querySelectorAll('[data-equation-word]')].map((el) => el.textContent)).toEqual(['(both exclusive)']);
  });

  it('the 413 K reaction has one scheme per outcome, each named by its label and with its own temperature', () => {
    show('rxn_ethanol-conc-h2so4');
    openDisclosure();
    const schemes = [...document.querySelectorAll('[data-equation-scheme]')] as HTMLElement[];
    expect(schemes.length).toBe(2);
    expect(schemes[0]?.querySelector('[data-equation-below]')?.textContent).toContain('413 K');
    expect(schemes[1]?.querySelector('[data-equation-below]')?.textContent).toContain('443 K');
    expect(descriptionOf(schemes[0] as HTMLElement)).toContain('→');
    expect(schemes.map((s) => s.getAttribute('aria-label'))).not.toEqual(['Full equation', 'Full equation']); // each outcome has its own label
  });

  it('the Names switch is in the first scheme only (one setting), on by default; off hides the name lines in every scheme and is saved in the panels store', () => {
    const rig = show('rxn_ethanol-conc-h2so4');
    openDisclosure();
    expect(screen.getAllByRole('checkbox', { name: 'Names', hidden: true })).toHaveLength(1);
    expect(document.querySelectorAll('[data-equation-name]').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Names', hidden: true }));
    expect(rig.panels.getState().equationNames).toBe(false);
    expect(document.querySelectorAll('[data-equation-name]')).toHaveLength(0);
  });

  it('a reaction stored as an equilibrium has the equilibrium arrow', () => {
    show('rxn_ethene-hydration');
    openDisclosure();
    expect(document.querySelector('[data-equation-arrow]')?.hasAttribute('data-equilibrium')).toBe(true);
  });
});
