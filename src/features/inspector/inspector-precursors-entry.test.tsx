// @vitest-environment jsdom
/**
 * The inspector's entry into Precursors (step 7.2a D7): "How to make it" on a species and a class, in both editions (no editing port is
 * needed). The inspector only tells its host; it knows no other feature.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, preloadViews } from '@/test-support/inspector-kit';
import { PHONE_QUERIES } from '@/ui/hooks';
import { Inspector } from './inspector';

afterEach(cleanup);
beforeAll(fakeLayout);
beforeAll(preloadViews);

const state = demoState();
const first = (kind: 'species' | 'class' | 'reagent' | 'reaction' | 'concept'): RecordRef => ({ kind, id: Object.keys(state.records[kind])[0] as string }) as RecordRef;

function show(ref: RecordRef, withHost = true) {
  const rig = inspectorRig(state);
  const showPrecursors = vi.fn();
  const host = withHost ? { ...rig.host, showPrecursors } : rig.host;
  render(<Inspector ports={rig.ports} host={host} />);
  act(() => rig.inspector.getState().open(ref));
  return { showPrecursors };
}

describe('How to make it', () => {
  it.each(['species', 'class'] as const)('a %s has the button; it asks the host to open Precursors for it', (kind) => {
    const ref = first(kind);
    const { showPrecursors } = show(ref);
    fireEvent.click(screen.getByRole('button', { name: 'How to make it' }));
    expect(showPrecursors).toHaveBeenCalledWith(ref);
  });

  it.each(['reagent', 'reaction', 'concept'] as const)('a %s has none (a route ends at a species or a class)', (kind) => {
    show(first(kind));
    expect(screen.queryByRole('button', { name: 'How to make it' })).toBeNull();
  });

  it('a host without the port draws no button', () => {
    show(first('species'), false);
    expect(screen.queryByRole('button', { name: 'How to make it' })).toBeNull();
  });
});

describe('on a phone (7.2b D3)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const onPhone = (): void => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === PHONE_QUERIES[0], media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  };

  it('"How to make it" is in the FULL sheet part (hidden at peek), and opening it closes the sheet', () => {
    onPhone();
    const ref = first('species');
    const rig = inspectorRig(state);
    const showPrecursors = vi.fn();
    const closePane = vi.fn();
    render(<Inspector ports={rig.ports} host={{ ...rig.host, showPrecursors, closePane }} />);
    act(() => rig.inspector.getState().open(ref));
    const button = screen.getByRole('button', { name: 'How to make it' });
    expect(button.closest('[data-sheet-full]')).not.toBeNull();
    fireEvent.click(button);
    expect(showPrecursors).toHaveBeenCalledWith(ref);
    expect(closePane).toHaveBeenCalled();
  });

  it('"Show its reactions" is in the full part too', () => {
    onPhone();
    const rig = inspectorRig(state);
    render(<Inspector ports={rig.ports} host={{ ...rig.host, showReactions: vi.fn() }} />);
    act(() => rig.inspector.getState().open(first('species')));
    expect(screen.getByRole('button', { name: 'Show its reactions' }).closest('[data-sheet-full]')).not.toBeNull();
  });
});
