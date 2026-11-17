// @vitest-environment jsdom
/** The address follows the app (step 8.4g, G1): one history entry per view or record, reload and hashchange restore, a bad address is lost. */
import { act, cleanup, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInspectorStore, createNavigatorUiStores } from '@/ui/state';
import type { AddressHost } from './address-state';
import { useAddress, type LostAddress } from './use-address';

const KNOWN: Record<string, readonly string[]> = { reagent: ['rg_1'], reaction: ['rxn_1'] };

function setup(ready = true) {
  const ui = createNavigatorUiStores();
  const inspector = createInspectorStore();
  const modeRef = { set: (_: string) => {} };
  const host: AddressHost = {
    ui,
    inspector,
    has: (kind, id) => KNOWN[kind]?.includes(id) === true,
    views: ['navigator', 'chapters', 'reactions', 'reagents', 'settings'],
    setMode: (mode) => modeRef.set(mode),
    open: { reagents: (id) => { ui.reagents.getState().open(id); modeRef.set('reagents'); } },
    show: () => {},
  };
  const view = renderHook(() => {
    const [mode, setMode] = useState('navigator');
    modeRef.set = setMode;
    const [lostAt, setLost] = useState<LostAddress>(null);
    useAddress(host, mode, ready, lostAt, setLost);
    const change = (next: string): void => {
      setLost(null);
      setMode(next);
    };
    return { mode, setMode, change, lost: lostAt !== null && lostAt.mode === mode ? lostAt.what : null };
  });
  return { view, ui, inspector };
}

const hashes = (): number => history.length;

beforeEach(() => history.replaceState(null, '', '#'));
afterEach(cleanup);

describe('useAddress', () => {
  it('writes the first address by replacing, then one entry per change of view', () => {
    const start = hashes();
    const { view } = setup();
    expect(location.hash).toBe('#/map');
    expect(hashes()).toBe(start);
    act(() => view.result.current.setMode('settings'));
    expect(location.hash).toBe('#/settings');
    expect(hashes()).toBe(start + 1);
    act(() => view.result.current.setMode('settings'));
    expect(hashes()).toBe(start + 1);
  });

  it('makes ONE entry when a view and a record change together', () => {
    const start = hashes();
    const { view, inspector } = setup();
    act(() => {
      inspector.getState().open({ kind: 'reaction', id: 'rxn_1' });
      view.result.current.setMode('reactions');
    });
    expect(location.hash).toBe('#/reactions/rxn_1');
    expect(hashes()).toBe(start + 1);
  });

  it('restores the view and page from the address when the app is ready', () => {
    history.replaceState(null, '', '#/reagents/rg_1');
    const { view, ui } = setup();
    expect(view.result.current.mode).toBe('reagents');
    expect(ui.reagents.getState().reagentId).toBe('rg_1');
    expect(location.hash).toBe('#/reagents/rg_1');
  });

  it('waits for the app: nothing is written before it is ready', () => {
    history.replaceState(null, '', '#/settings');
    const { view } = setup(false);
    expect(view.result.current.mode).toBe('navigator');
    expect(location.hash).toBe('#/settings');
  });

  it('follows a hash change (Back and Forward) without making an entry', () => {
    const { view } = setup();
    const before = hashes();
    act(() => {
      history.replaceState(null, '', '#/chapters');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(view.result.current.mode).toBe('chapters');
    expect(hashes()).toBe(before);
  });

  it('says lost for a bad address and a missing record and leaves the address alone', () => {
    history.replaceState(null, '', '#/nowhere');
    const { view } = setup();
    expect(view.result.current.lost).toBe('bad');
    expect(location.hash).toBe('#/nowhere');
    act(() => view.result.current.change('chapters'));
    expect(view.result.current.lost).toBeNull();
    expect(location.hash).toBe('#/chapters');
    act(() => {
      history.replaceState(null, '', '#/reactions/rxn_9');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(view.result.current.lost).toBe('missing');
  });

  it('writes nothing while the full map owns the history entry, and writes once that entry is gone (Back of the full map)', () => {
    const { view } = setup();
    const start = hashes();
    act(() => history.pushState({ orn: 'full-map' }, ''));
    act(() => view.result.current.setMode('settings'));
    expect(location.hash).toBe('#/map');
    act(() => {
      history.replaceState(null, '', location.href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(location.hash).toBe('#/settings');
    expect(hashes()).toBe(start + 2);
  });
});
