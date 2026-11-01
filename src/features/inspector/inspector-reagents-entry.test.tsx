// @vitest-environment jsdom
/**
 * The inspector's entry into Reagents (step 7.3c D4): "Show in Reagents" on a reagent, in both editions. The inspector only tells its host; it
 * knows no other feature. On a phone the button is in the FULL part of the sheet and opening it closes the sheet.
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
const first = (kind: 'species' | 'class' | 'reagent' | 'reaction'): RecordRef => ({ kind, id: Object.keys(state.records[kind])[0] as string }) as RecordRef;

function show(ref: RecordRef, withHost = true, extra: Record<string, unknown> = {}) {
  const rig = inspectorRig(state);
  const showReagent = vi.fn();
  render(<Inspector ports={rig.ports} host={withHost ? { ...rig.host, showReagent, ...extra } : rig.host} />);
  act(() => rig.inspector.getState().open(ref));
  return { showReagent };
}

describe('Show in Reagents', () => {
  it('a reagent has the button; it asks the host to open its page', () => {
    const ref = first('reagent');
    const { showReagent } = show(ref);
    fireEvent.click(screen.getByRole('button', { name: 'Show in Reagents' }));
    expect(showReagent).toHaveBeenCalledWith(ref);
  });

  it.each(['species', 'class', 'reaction'] as const)('a %s has none', (kind) => {
    show(first(kind));
    expect(screen.queryByRole('button', { name: 'Show in Reagents' })).toBeNull();
  });

  it('a host without the port draws no button', () => {
    show(first('reagent'), false);
    expect(screen.queryByRole('button', { name: 'Show in Reagents' })).toBeNull();
  });

  it('on a phone it is in the FULL part of the sheet, and opening it closes the sheet', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
    const closePane = vi.fn();
    const ref = first('reagent');
    const { showReagent } = show(ref, true, { closePane });
    const button = screen.getByRole('button', { name: 'Show in Reagents' });
    expect(button.closest('[data-sheet-full]')).not.toBeNull();
    fireEvent.click(button);
    expect(showReagent).toHaveBeenCalledWith(ref);
    expect(closePane).toHaveBeenCalled();
  });
});
