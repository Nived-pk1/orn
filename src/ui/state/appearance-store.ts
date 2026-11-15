/** The appearance store itself (step 8.4f). A separate file from the values so that the page boot (which only reads and applies) does not carry it: it loads with Settings. */
import { createStore } from 'zustand/vanilla';
import { parseAppearance, type AppearanceState, type AppearanceStore, type AppearanceValues } from './appearance';
import { SAVE_DEBOUNCE_MS, type PanelsPort, type PanelsTimers } from './panels';

export function createAppearanceStore(port: PanelsPort, timers: PanelsTimers): AppearanceStore {
  const parsed = parseAppearance(port.stored);
  const mode = port.mode();
  let cancel: (() => void) | undefined;
  let pending = false;
  const store: AppearanceStore = createStore<AppearanceState>((set, get) => {
    const change = (patch: Partial<AppearanceValues>): void => {
      const current = get();
      if ((Object.keys(patch) as (keyof AppearanceValues)[]).every((key) => current[key] === patch[key])) return;
      set(patch);
      schedule();
    };
    return {
      ...parsed.values,
      persistence: mode === 'read_only' ? { kind: 'read_only' } : mode === 'session_only' ? { kind: 'session_only' } : { kind: 'saved' },
      resetFields: parsed.damaged,
      setTheme: (theme) => change({ theme }),
      setReduceMotion: (on) => change({ reduceMotion: on }),
    };
  });

  function schedule(): void {
    const now = port.mode();
    if (now !== 'writable') {
      const kind = now === 'read_only' ? 'read_only' : 'session_only';
      if (store.getState().persistence.kind !== kind) store.setState({ persistence: { kind } });
      return;
    }
    pending = true;
    cancel?.();
    cancel = timers.after(SAVE_DEBOUNCE_MS, () => {
      cancel = undefined;
      void flushNow();
    });
  }

  async function flushNow(): Promise<void> {
    if (!pending) return;
    pending = false;
    const { theme, reduceMotion } = store.getState();
    try {
      await port.save({ ...parsed.extra, theme, reduceMotion });
      if (store.getState().persistence.kind !== 'saved') store.setState({ persistence: { kind: 'saved' } });
    } catch (error) {
      store.setState({ persistence: { kind: 'save_failed', message: error instanceof Error ? error.message : String(error) } });
    }
  }

  return store;
}
