/**
 * The overview map's UI state (step 8.2a, ADR-044): the chapter the map shows ("All chapters" is null) and whether the Unclassified box is
 * shown are saved inside the navigator's `uiState` entry (navigator-persist.ts), read tolerantly like the other parts (each field checked by
 * itself, a bad one falls back and is named in `damaged`). The FOCUS (the family whose arrows are drawn) lives here too but is never saved: the
 * map always opens with nothing focused. UI state only, never records.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

const MAX_ID_LENGTH = 512;

export interface MapState {
  /** The chapter (a topic id) whose reactions the map is built from; null: all chapters. */
  readonly chapterId: string | null;
  readonly showUnclassified: boolean;
  /** The focused family (a node id), or null. Not saved. */
  readonly focusId: string | null;
  /** The "From A to B" panel is open (step 8.2b): the map is built across ALL chapters while it is. Not saved. */
  readonly chainOpen: boolean;
  setChapter(chapterId: string | null): void;
  setShowUnclassified(shown: boolean): void;
  setFocus(id: string | null): void;
  setChainOpen(open: boolean): void;
}
export type MapStore = StoreApi<MapState>;

export function createMapStore(initial: { readonly chapterId?: string | null; readonly showUnclassified?: boolean } = {}): MapStore {
  return createStore<MapState>((set) => ({
    chapterId: initial.chapterId ?? null,
    showUnclassified: initial.showUnclassified ?? false,
    focusId: null,
    chainOpen: false,
    // another chapter is another set of arrows: a focus from the old set would mislead
    setChapter: (chapterId) => set({ chapterId, focusId: null }),
    setShowUnclassified: (showUnclassified) => set({ showUnclassified }),
    setFocus: (focusId) => set({ focusId }),
    setChainOpen: (chainOpen) => set({ chainOpen }),
  }));
}

export interface ParsedMap {
  readonly chapterId: string | null;
  readonly showUnclassified: boolean;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseMap(raw: unknown): ParsedMap {
  const defaults: ParsedMap = { chapterId: null, showUnclassified: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return { ...defaults, damaged: ['map'] };
  const damaged: string[] = [];
  let chapterId: string | null = null;
  if (raw.chapterId !== undefined && raw.chapterId !== null) {
    if (typeof raw.chapterId === 'string' && raw.chapterId !== '' && raw.chapterId.length <= MAX_ID_LENGTH) chapterId = raw.chapterId;
    else damaged.push('map.chapterId');
  }
  let showUnclassified = false;
  if (raw.showUnclassified !== undefined) {
    if (typeof raw.showUnclassified === 'boolean') showUnclassified = raw.showUnclassified;
    else damaged.push('map.showUnclassified');
  }
  return { chapterId, showUnclassified, damaged };
}
