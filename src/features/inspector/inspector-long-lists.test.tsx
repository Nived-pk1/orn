// @vitest-environment jsdom
/**
 * Long lists in the inspector (step 5.6b, item k): a class of a hub_explosion file with 1,000 or more reactions shows them in a
 * virtualised list, so the DOM keeps a handful of rows whatever the length; the row says its place in the whole list.
 */
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RecordRef } from '@/core/schema';
import { fakeLayout, inspectorRig, openLevels } from '@/test-support/inspector-kit';
import { tierState, withNavigatorAnchors } from '@/test-support/perf-kit';
import { indexEngine } from '@/core/indexes';
import { Inspector } from './inspector';

vi.setConfig({ testTimeout: 120_000 });
afterEach(cleanup);
beforeAll(fakeLayout);

describe('a class with 1,000 reactions', () => {
  const state = withNavigatorAnchors(tierState('initial', 'hub_explosion'));
  const rollup = indexEngine.build(state).navigatorRollup();
  const hub = [...rollup.hubs].sort((a, b) => rollup.candidatesFrom(b.id).length - rollup.candidatesFrom(a.id).length)[0] as RecordRef;

  it('lists its reactions in a virtual list: at most 60 rows in the DOM, the whole size in aria-setsize', () => {
    const rig = inspectorRig(state);
    render(<Inspector ports={rig.ports} host={rig.host} />);
    act(() => rig.inspector.getState().open({ kind: hub.kind, id: hub.id } as RecordRef));
    openLevels();
    const list = screen.getByRole('list', { name: /^Reactions of this class \(\d+\)$/ });
    const total = Number(/\((\d+)\)/.exec(list.getAttribute('aria-label') ?? '')?.[1]);
    expect(total).toBeGreaterThanOrEqual(1000);
    const rows = within(list).getAllByRole('listitem');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(60);
    expect(rows[0]?.getAttribute('aria-setsize')).toBe(String(total));
    expect(document.querySelectorAll('[data-record-list] li').length).toBeLessThanOrEqual(120);
  });
});
