// @vitest-environment jsdom
/**
 * The lazily loaded kind views (step 5.7): a skeleton while the chunk loads, the view when it has, and a message in words with Retry
 * when the chunk fails to load (never a blank panel). Since step 6.1a EVERY kind is in the chunk, reaction, species, class and reagent too.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { demoState } from '@/test-support/app-boot-kit';
import { fakeLayout, inspectorRig, maximalState } from '@/test-support/inspector-kit';

beforeAll(fakeLayout);
beforeEach(() => {
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  vi.doUnmock('./views-other');
});

const mechanism = { kind: 'mechanism', id: 'mec_max-grignard-addition' } as RecordRef;

async function open(ref: RecordRef, state = maximalState()) {
  const { Inspector } = await import('./inspector');
  const rig = inspectorRig(state);
  render(<Inspector ports={rig.ports} host={rig.host} />);
  act(() => rig.inspector.getState().open(ref));
}

describe('lazy kind views', () => {
  it('a skeleton shows while the chunk loads, then the view', async () => {
    await open(mechanism);
    expect(screen.getByRole('status', { name: 'Loading this view' })).toBeTruthy();
    await screen.findByRole('list', { name: 'Variants' });
    expect(screen.queryByRole('status', { name: 'Loading this view' })).toBeNull();
  });

  it('a chunk that fails to load is a message in words with Retry, and Retry loads it', async () => {
    let fails = true;
    vi.doMock('./views-other', () => {
      if (fails) throw new Error('Failed to fetch dynamically imported module');
      return vi.importActual('./views-other');
    });
    await open(mechanism);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/could not be shown because part of the app did not load/);
    expect(alert.textContent).toMatch(/did not load \(.+\)/);
    fails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByRole('list', { name: 'Variants' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reaction, species, class and reagent come through the chunk too: a skeleton, then the view', async () => {
    const state = demoState();
    const reaction = Object.values(state.records.reaction)[0] as { id: string };
    await open({ kind: 'reaction', id: reaction.id } as RecordRef, state);
    expect(screen.getByRole('status', { name: 'Loading this view' })).toBeTruthy();
    await vi.waitFor(() => expect(document.querySelector('[data-view="reaction"] section[data-level="2"]')).not.toBeNull());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
