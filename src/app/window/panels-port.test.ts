import { describe, expect, it, vi } from 'vitest';
import { INITIAL_STATUS, createStatusStore } from '@/app/services';
import { createPanelsStore, INSPECTOR_DEFAULT, SAVE_DEBOUNCE_MS } from '@/ui/state';
import { panelNoticesOf } from './panels-status';
import { createPanelsPort, type PanelsPortServices } from './panels-port';

function services(over: { mode?: 'writer' | 'follower' | 'read_only' | 'session_only'; stored?: unknown; persistence?: 'present' | 'absent' } = {}) {
  const status = createStatusStore(() => undefined);
  status.update({ ...INITIAL_STATUS, stage: 'ready', mode: over.mode ?? 'writer' });
  const setUiState = vi.fn(() => Promise.resolve());
  const value = {
    status,
    bootReport: over.stored === undefined ? undefined : { uiState: { panels: over.stored } },
    persistence: over.persistence === 'absent' ? undefined : { setUiState },
  } as unknown as PanelsPortServices;
  return { value, setUiState, status };
}

describe('createPanelsPort', () => {
  it('reads the stored entry from what boot found; nothing stored is undefined', () => {
    expect(createPanelsPort(services({ stored: { inspectorWidth: 480 } }).value).stored).toEqual({ inspectorWidth: 480 });
    expect(createPanelsPort(services().value).stored).toBeUndefined();
  });

  it.each([
    ['writer', 'present', 'writable'],
    ['follower', 'present', 'read_only'],
    ['read_only', 'present', 'read_only'],
    ['session_only', 'present', 'session_only'],
    ['writer', 'absent', 'session_only'],
  ] as const)('a %s tab with persistence %s writes as %s', (mode, persistence, expected) => {
    expect(createPanelsPort(services({ mode, persistence }).value).mode()).toBe(expected);
  });

  it('follows the status: a tab promoted to writer writes from then on', () => {
    const s = services({ mode: 'follower' });
    const port = createPanelsPort(s.value);
    expect(port.mode()).toBe('read_only');
    s.status.update({ mode: 'writer' });
    expect(port.mode()).toBe('writable');
  });

  it('saves into uiState under the key "panels"', async () => {
    const s = services();
    await createPanelsPort(s.value).save({ inspectorWidth: 450, inspectorOpen: true, startEmptyDismissed: false, storageNoticeDismissed: false });
    expect(s.setUiState).toHaveBeenCalledWith('panels', { inspectorWidth: 450, inspectorOpen: true, startEmptyDismissed: false, storageNoticeDismissed: false });
  });

  it('a save with no persistence rejects (the store turns that into a status)', async () => {
    await expect(createPanelsPort(services({ persistence: 'absent' }).value).save({})).rejects.toThrow(/nothing is stored/);
  });

  it('end to end with the store: a damaged stored entry is reset and reported, and the layout is saved after the debounce', async () => {
    const s = services({ stored: { inspectorWidth: 'wide', inspectorOpen: false } });
    let run: (() => void) | undefined;
    const store = createPanelsStore(createPanelsPort(s.value), { after: (_ms, fn) => ((run = fn), () => undefined) });
    expect(store.getState()).toMatchObject({ inspectorWidth: INSPECTOR_DEFAULT, inspectorOpen: false, resetFields: ['inspectorWidth'] });
    expect(panelNoticesOf(store.getState())).toEqual(['The saved panel layout was damaged and was reset (inspectorWidth).']);
    store.getState().setInspectorWidth(480);
    expect(run).toBeDefined();
    run?.();
    await vi.waitFor(() => expect(s.setUiState).toHaveBeenCalledWith('panels', { inspectorWidth: 480, inspectorOpen: false, startEmptyDismissed: false, storageNoticeDismissed: false }));
    expect(SAVE_DEBOUNCE_MS).toBeGreaterThan(0);
  });
});

describe('panelNoticesOf', () => {
  const base = { resetFields: [] as readonly string[] };
  it('says nothing when everything is saved and nothing was reset', () => {
    expect(panelNoticesOf({ ...base, persistence: { kind: 'saved' } })).toEqual([]);
  });
  it.each([
    [{ kind: 'read_only' } as const, 'Panel layout is not saved: this tab is read-only.'],
    [{ kind: 'session_only' } as const, 'Panel layout is not saved: nothing is saved in this session.'],
    [{ kind: 'save_failed', message: 'quota' } as const, 'Panel layout could not be saved (quota).'],
  ])('%j', (persistence, text) => {
    expect(panelNoticesOf({ ...base, persistence })).toEqual([text]);
  });
});
