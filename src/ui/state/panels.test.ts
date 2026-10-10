import { describe, expect, it, vi } from 'vitest';
import { clampWidth, createPanelsStore, INSPECTOR_DEFAULT, INSPECTOR_MAX, INSPECTOR_MIN, PANEL_DEFAULTS, parsePanels, SAVE_DEBOUNCE_MS, type PanelsPort } from './panels';

/** A manual scheduler: `advance(ms)` runs what is due. */
function manualTimers() {
  let now = 0;
  const jobs: { at: number; run: () => void; live: boolean }[] = [];
  return {
    after(ms: number, run: () => void) {
      const job = { at: now + ms, run, live: true };
      jobs.push(job);
      return () => {
        job.live = false;
      };
    },
    advance(ms: number) {
      now += ms;
      for (const job of jobs.filter((j) => j.live && j.at <= now)) {
        job.live = false;
        job.run();
      }
    },
  };
}

function port(over: Partial<PanelsPort> = {}): PanelsPort & { saved: Record<string, unknown>[] } {
  const saved: Record<string, unknown>[] = [];
  return { stored: undefined, mode: () => 'writable', save: (value) => (saved.push({ ...value }), Promise.resolve()), saved, ...over };
}

describe('parsePanels (tolerant)', () => {
  it('nothing stored: the defaults, no damage', () => {
    expect(parsePanels(undefined)).toEqual({ values: PANEL_DEFAULTS, damaged: [], extra: {} });
  });

  it('a good entry is taken as it is; a missing field is not damage', () => {
    expect(parsePanels({ inspectorWidth: 480, inspectorOpen: false })).toEqual({
      values: { inspectorWidth: 480, inspectorOpen: false, startEmptyDismissed: false, storageNoticeDismissed: false, inspectorLevel: 2 },
      damaged: [],
      extra: {},
    });
  });

  it.each([
    ['a string', 'wide'],
    ['a number', 42],
    ['null', null],
    ['an array', [1, 2]],
  ])('an entry that is %s is reset to the defaults and reported', (_name, raw) => {
    expect(parsePanels(raw)).toEqual({ values: PANEL_DEFAULTS, damaged: ['panels'], extra: {} });
  });

  it.each([
    ['text', 'wide'],
    ['NaN', Number.NaN],
    ['too narrow', INSPECTOR_MIN - 1],
    ['too wide', INSPECTOR_MAX + 1],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('an inspectorWidth that is %s is reset and reported, the other fields are kept', (_name, width) => {
    const parsed = parsePanels({ inspectorWidth: width, inspectorOpen: false, startEmptyDismissed: true });
    expect(parsed.values).toEqual({ inspectorWidth: INSPECTOR_DEFAULT, inspectorOpen: false, startEmptyDismissed: true, storageNoticeDismissed: false, inspectorLevel: 2 });
    expect(parsed.damaged).toEqual(['inspectorWidth']);
  });

  it('a non-boolean flag is reset and reported by name', () => {
    const parsed = parsePanels({ inspectorOpen: 'yes', startEmptyDismissed: 1 });
    expect(parsed.values).toEqual(PANEL_DEFAULTS);
    expect(parsed.damaged).toEqual(['inspectorOpen', 'startEmptyDismissed']);
  });

  it('unknown fields are kept (a newer version\'s data is not dropped)', () => {
    expect(parsePanels({ inspectorOpen: true, later: { a: 1 } }).extra).toEqual({ later: { a: 1 } });
  });
});

describe('the panels store', () => {
  it('starts from the stored values and reports a damaged entry without failing', () => {
    const store = createPanelsStore(port({ stored: { inspectorWidth: 'x', inspectorOpen: false } }), manualTimers());
    expect(store.getState()).toMatchObject({ inspectorWidth: INSPECTOR_DEFAULT, inspectorOpen: false, resetFields: ['inspectorWidth'], persistence: { kind: 'saved' } });
  });

  it('clamps a width to 360..520 and rounds it', () => {
    expect(clampWidth(100)).toBe(INSPECTOR_MIN);
    expect(clampWidth(9_000)).toBe(INSPECTOR_MAX);
    expect(clampWidth(400.6)).toBe(401);
    const store = createPanelsStore(port(), manualTimers());
    store.getState().setInspectorWidth(10);
    expect(store.getState().inspectorWidth).toBe(INSPECTOR_MIN);
  });

  it('saves once, after the debounce, with the latest values (a drag is many changes, one write)', async () => {
    const p = port();
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    for (const width of [400, 410, 420, 430]) store.getState().setInspectorWidth(width);
    store.getState().setInspectorOpen(false);
    timers.advance(SAVE_DEBOUNCE_MS - 1);
    expect(p.saved).toEqual([]);
    timers.advance(1);
    await Promise.resolve();
    expect(p.saved).toEqual([{ inspectorWidth: 430, inspectorOpen: false, startEmptyDismissed: false, storageNoticeDismissed: false, inspectorLevel: 2 }]);
  });

  it('a change to the same value schedules nothing', () => {
    const p = port();
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    store.getState().setInspectorOpen(false);
    store.getState().setInspectorWidth(INSPECTOR_DEFAULT);
    timers.advance(10_000);
    expect(p.saved).toEqual([]);
  });

  it('writes back unknown fields with the known ones', async () => {
    const p = port({ stored: { inspectorOpen: true, later: 7 } });
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    store.getState().dismissStartEmpty();
    timers.advance(SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    expect(p.saved[0]).toEqual({ later: 7, inspectorWidth: INSPECTOR_DEFAULT, inspectorOpen: true, startEmptyDismissed: true, storageNoticeDismissed: false, inspectorLevel: 2 });
  });

  it('the dismissed storage warning is saved, read back, and a damaged value is reset and reported (step 5.5d, item k)', async () => {
    const p = port();
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    expect(store.getState().storageNoticeDismissed).toBe(false);
    store.getState().dismissStorageNotice();
    timers.advance(SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    expect(p.saved[0]).toMatchObject({ storageNoticeDismissed: true });
    expect(parsePanels(p.saved[0]).values.storageNoticeDismissed).toBe(true);
    const bad = parsePanels({ storageNoticeDismissed: 'yes' });
    expect(bad.values.storageNoticeDismissed).toBe(false);
    expect(bad.damaged).toEqual(['storageNoticeDismissed']);
  });

  it('a read-only tab keeps its values for the session, writes nothing and says so', () => {
    const p = port({ mode: () => 'read_only' });
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    expect(store.getState().persistence).toEqual({ kind: 'read_only' });
    store.getState().setInspectorWidth(500);
    timers.advance(10_000);
    expect(store.getState().inspectorWidth).toBe(500);
    expect(p.saved).toEqual([]);
  });

  it('a session-only tab writes nothing and says so', () => {
    const p = port({ mode: () => 'session_only' });
    const store = createPanelsStore(p, manualTimers());
    expect(store.getState().persistence).toEqual({ kind: 'session_only' });
    store.getState().setInspectorOpen(false);
    expect(p.saved).toEqual([]);
  });

  it('a tab that becomes writable later (promotion) writes from the next change on and its status turns to saved', async () => {
    let mode: 'writable' | 'read_only' = 'read_only';
    const p = port({ mode: () => mode });
    const timers = manualTimers();
    const store = createPanelsStore(p, timers);
    store.getState().setInspectorOpen(false);
    expect(p.saved).toEqual([]);
    mode = 'writable';
    store.getState().setInspectorOpen(true);
    timers.advance(SAVE_DEBOUNCE_MS);
    await Promise.resolve();
    await Promise.resolve();
    expect(p.saved).toHaveLength(1);
    expect(store.getState().persistence).toEqual({ kind: 'saved' });
  });

  it('a failing save is a status, never a throw; the next successful save clears it', async () => {
    const fail = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const timers = manualTimers();
    const store = createPanelsStore(port({ save: fail }), timers);
    store.getState().setInspectorOpen(true);
    timers.advance(SAVE_DEBOUNCE_MS);
    await vi.waitFor(() => expect(store.getState().persistence).toEqual({ kind: 'save_failed', message: 'quota' }));
    store.getState().setInspectorOpen(false);
    timers.advance(SAVE_DEBOUNCE_MS);
    await vi.waitFor(() => expect(store.getState().persistence).toEqual({ kind: 'saved' }));
  });
});
