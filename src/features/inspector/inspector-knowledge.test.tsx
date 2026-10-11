// @vitest-environment jsdom
/**
 * The knowledge views of the inspector (step 5.6b, items c to e), in roles and names: a reaction's related reactions on the demo
 * (stored relationship, derived groups, "+N more"), a mechanism with its variants and steps, and the named reaction, concept,
 * transformation and caveat views of the maximal fixture.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Reaction, RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, maximalState, openEverything, openLevels } from '@/test-support/inspector-kit';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);

function show(state: ReturnType<typeof demoState>, ref: RecordRef, at?: string) {
  const rig = inspectorRig(state);
  render(<Inspector ports={rig.ports} host={rig.host} />);
  act(() => rig.inspector.getState().open(ref, at));
  return rig;
}

describe('a reaction: related reactions (demo)', () => {
  it('Cannizzaro lists the stored "commonly confused with" Aldol reaction, and the derived groups', () => {
    show(demoState(), { kind: 'reaction', id: 'rxn_benzaldehyde-cannizzaro' } as RecordRef);
    openEverything();
    const related = screen.getByRole('region', { name: 'Related reactions' });
    const stored = within(related).getByRole('region', { name: 'Relationships written by a person' });
    expect(within(stored).getByText(/commonly confused with/)).toBeTruthy();
    expect(within(stored).getByRole('link', { name: /Aldol reaction of ethanal/ })).toBeTruthy();
    const leads = within(related).getByRole('region', { name: 'Leads on to' });
    expect(within(leads).getByText(/inferred, through/)).toBeTruthy();
    expect(within(related).getByText(/None found for: .*Same transformation/)).toBeTruthy();
  });

  it('a group of more than 12 shows 12 and "+N more" opens the whole list as a virtual list', () => {
    show(demoState(), { kind: 'reaction', id: 'rxn_ethanal-aldol' } as RecordRef);
    openLevels();
    const group = screen.getByRole('region', { name: 'Same reagent family' });
    expect(within(group).getAllByRole('link')).toHaveLength(12);
    const more = within(group).getByRole('button', { name: /^\+\d+ more$/ });
    fireEvent.click(more);
    const list = within(group).getByRole('list', { name: /^Same reagent family \(\d+\)$/ });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.getAttribute('aria-setsize')).toBe(String(Number(/\((\d+)\)/.exec(list.getAttribute('aria-label') ?? '')?.[1])));
    fireEvent.click(within(group).getByRole('button', { name: 'Show fewer' }));
    expect(within(group).getAllByRole('link')).toHaveLength(12);
  });

  it('following a related reaction opens it, and Back returns', () => {
    const rig = show(demoState(), { kind: 'reaction', id: 'rxn_aniline-diazotisation' } as RecordRef);
    openEverything();
    const leads = screen.getByRole('region', { name: 'Leads on to' });
    fireEvent.click(within(leads).getAllByRole('link')[0] as HTMLElement);
    expect(rig.inspector.getState().history.at(-1)?.id).toBe('rxn_benzenediazonium-sandmeyer');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(rig.inspector.getState().history[rig.inspector.getState().index]?.id).toBe('rxn_aniline-diazotisation');
  });
});

describe('the maximal fixture: knowledge kinds', () => {
  const state = maximalState();

  it('a mechanism: variants as sections, steps as ordered rows with bonds and electron movements', () => {
    show(state, { kind: 'mechanism', id: 'mec_max-grignard-addition' } as RecordRef);
    openEverything();
    expect(screen.getByRole('list', { name: 'Variants' })).toBeTruthy();
    const steps = screen.getByRole('list', { name: 'Steps of Polar (two-electron) addition' });
    const first = within(steps).getAllByRole('listitem')[0] as HTMLElement;
    expect(within(first).getByText(/Step 1: Nucleophilic attack/)).toBeTruthy();
    expect(within(first).getByText('Bonds formed')).toBeTruthy();
    expect(within(first).getByText('Electron movements')).toBeTruthy();
    expect(within(first).getByText('Rate-determining')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Steps of Single-electron transfer' })).toBeTruthy();
  });

  it('opened at a variant, that variant is open and marked', () => {
    show(state, { kind: 'mechanism', id: 'mec_max-grignard-addition' } as RecordRef, 'mvr_max-grignard-set');
    const block = document.querySelector('[data-variant-id="mvr_max-grignard-set"]') as HTMLElement;
    expect(block.hasAttribute('data-focused')).toBe(true);
    expect(within(block).getByRole('button', { name: /Single-electron transfer/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('an outcome\'s mechanism link opens the mechanism at its variant', () => {
    const reactions = Object.values(state.records.reaction) as Reaction[];
    const reaction = reactions.find((r) => r.outcomes.some((o) => o.mechanism?.variantId !== undefined));
    expect(reaction).toBeDefined();
    const variantId = reaction?.outcomes.find((o) => o.mechanism?.variantId !== undefined)?.mechanism?.variantId as string;
    const rig = show(state, { kind: 'reaction', id: (reaction as Reaction).id } as RecordRef);
    openEverything();
    const link = document.querySelector('[data-record-id^="mec_"]') as HTMLElement;
    fireEvent.click(link);
    const entry = rig.inspector.getState().history.at(-1);
    expect(entry?.kind).toBe('mechanism');
    expect(entry?.at).toBe(variantId);
    expect(document.querySelector(`[data-variant-id="${variantId}"]`)?.hasAttribute('data-focused')).toBe(true);
  });

  it.each([
    ['named_reaction', 'Named reaction'],
    ['concept', 'Concept'],
    ['transformation', 'Transformation'],
    ['caveat', 'Caveat'],
  ] as const)('%s has its own readable view', (kind, label) => {
    const record = Object.values(state.records[kind] as Record<string, { id: string }>)[0];
    expect(record).toBeDefined();
    show(state, { kind, id: (record as { id: string }).id } as RecordRef);
    openEverything();
    expect(document.querySelector(`dl[aria-label="${label}"]`)).not.toBeNull();
  });

  it('a caveat lists every target with its role as a link', () => {
    show(state, { kind: 'caveat', id: 'cav_max-grignard-protic' } as RecordRef);
    openEverything();
    const targets = screen.getByRole('list', { name: /^Targets \(\d+\)$/ });
    expect(within(targets).getAllByRole('link').length).toBeGreaterThan(0);
    expect(within(targets).getAllByRole('listitem')[0]?.textContent).toMatch(/affected|context/);
  });
});
