/**
 * Two small UI stores of step 5.8. Neither holds canonical data (INV-10).
 *  - Recent searches: the last texts typed into the palette (newest first, no repeats, bounded), saved in `uiState` with the navigator's
 *    entry. Only text the person typed; never a result.
 *  - View commands: what the map on the canvas can do now (zoom, fit, the Unanchored panel). The canvas registers them while it is
 *    mounted, so the palette's command list can run them without holding a reference to the canvas. Never saved.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export const MAX_RECENT_SEARCHES = 8;
export const MAX_RECENT_LENGTH = 200;

export interface RecentState {
  readonly items: readonly string[];
  /** Adds a typed text at the front (trimmed; empty text and over-long text are not kept; a repeat moves to the front). */
  add(text: string): void;
  clear(): void;
}
export type RecentStore = StoreApi<RecentState>;

export function createRecentStore(initial: readonly string[] = []): RecentStore {
  return createStore<RecentState>((set, get) => ({
    items: initial.slice(0, MAX_RECENT_SEARCHES),
    add(text) {
      const kept = text.trim();
      if (kept === '' || kept.length > MAX_RECENT_LENGTH) return;
      const next = [kept, ...get().items.filter((item) => item !== kept)].slice(0, MAX_RECENT_SEARCHES);
      if (next.length !== get().items.length || next.some((item, index) => item !== get().items[index])) set({ items: next });
    },
    clear() {
      if (get().items.length > 0) set({ items: [] });
    },
  }));
}

/** What the map offers the palette. `unanchoredReason` is why the Unanchored panel cannot open now (absent: it can). */
export interface ViewCommands {
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
  openUnanchored(): void;
  readonly unanchoredReason?: string;
  /** Why zoom and fit cannot run now (the List view has no zoom); absent: they can. */
  readonly zoomReason?: string;
}

export interface ViewCommandsState {
  readonly commands: ViewCommands | null;
  /** Registers the map's commands; answers the function that removes exactly these (a later registration is kept). */
  register(commands: ViewCommands): () => void;
}
export type ViewCommandsStore = StoreApi<ViewCommandsState>;

export function createViewCommandsStore(): ViewCommandsStore {
  return createStore<ViewCommandsState>((set, get) => ({
    commands: null,
    register(commands) {
      set({ commands });
      return () => {
        if (get().commands === commands) set({ commands: null });
      };
    },
  }));
}
