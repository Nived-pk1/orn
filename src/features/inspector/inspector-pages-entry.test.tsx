// @vitest-environment jsdom
/**
 * The inspector's entries into Named reactions and Mechanisms (step 7.4): "Show in Named reactions" on a named reaction and "Show in Mechanisms"
 * on a mechanism, in both editions. The inspector only tells its host; it knows no other feature. On a phone the button is in the FULL part of
 * the sheet and opening it closes the sheet.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { PHONE_QUERIES } from '@/ui/hooks';
import { Inspector } from './inspector';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeAll(fakeLayout);
beforeAll(preloadViews);

const state = demoState();
const first = (kind: 'species' | 'named_reaction' | 'mechanism' | 'reagent'): RecordRef => ({ kind, id: Object.keys(state.records[kind])[0] as string }) as RecordRef;

function show(ref: RecordRef, withHost = true, extra: Record<string, unknown> = {}) {
  const rig = inspectorRig(state);
  const showNamed = vi.fn();
  const showMechanism = vi.fn();
  render(<Inspector ports={rig.ports} host={withHost ? { ...rig.host, showNamed, showMechanism, ...extra } : rig.host} />);
  act(() => rig.inspector.getState().open(ref));
  return { showNamed, showMechanism };
}

describe.each([
  ['named_reaction', 'Show in Named reactions', 'showNamed'],
  ['mechanism', 'Show in Mechanisms', 'showMechanism'],
] as const)('%s: "%s"', (kind, label, port) => {
  it('has the button; it asks the host to open its page', () => {
    const ref = first(kind);
    const calls = show(ref);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(calls[port]).toHaveBeenCalledWith(ref);
  });

  it('other kinds have none, and a host without the port draws none', () => {
    show(first('species'));
    expect(screen.queryByRole('button', { name: label })).toBeNull();
    cleanup();
    show(first(kind), false);
    expect(screen.queryByRole('button', { name: label })).toBeNull();
  });

  it('on a phone it is a main action in the peek of the sheet (8.1: the first two go-next buttons), and opening it closes the sheet', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const closePane = vi.fn();
    const ref = first(kind);
    const calls = show(ref, true, { closePane });
    const button = screen.getByRole('button', { name: label });
    expect(button.closest('[data-sheet-full]')).toBeNull();
    fireEvent.click(button);
    expect(calls[port]).toHaveBeenCalledWith(ref);
    expect(closePane).toHaveBeenCalled();
  });
});
