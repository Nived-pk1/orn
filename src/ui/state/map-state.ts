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
  /** The map's view was still the automatic fit when it last settled (step 8.4b, E2a): saved, so a reload fits again. */
  readonly fitted: boolean;
  setFitted(fitted: boolean): void;
  setChapter(chapterId: string | null): void;
  setShowUnclassified(shown: boolean): void;
  setFocus(id: string | null): void;
  setChainOpen(open: boolean): void;
}
export type MapStore = StoreApi<MapState>;

export function createMapStore(initial: { readonly chapterId?: string | null; readonly showUnclassified?: boolean; readonly fitted?: boolean } = {}): MapStore {
  return createStore<MapState>((set) => ({
    chapterId: initial.chapterId ?? null,
    showUnclassified: initial.showUnclassified ?? false,
    focusId: null,
    chainOpen: false,
    fitted: initial.fitted ?? false,
    setFitted: (fitted) => set({ fitted }),
    // another chapter is another set of arrows: a focus from the old set would mislead
    setChapter: (chapterId) => set({ chapterId, focusId: null }),
    setShowUnclassified: (showUnclassified) => set({ showUnclassified }),
    setFocus: (focusId) => set({ focusId }),
    setChainOpen: (chainOpen) => set({ chainOpen }),
  }));
}

/** The fit rule this build writes (step 8.2b-fix, C4): a viewport saved under an older rule (or none) was made for smaller boxes and is ignored once. */
export const FIT_RULE = 3;

export interface ParsedMap {
  readonly chapterId: string | null;
  readonly showUnclassified: boolean;
  /** The fit rule the saved viewport was made under; null: before the rule existed (or unreadable). */
  readonly fitRule: number | null;
  /** Step 8.4b: the saved view was the automatic fit (optional field; absent means no). */
  readonly fitted: boolean;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseMap(raw: unknown): ParsedMap {
  const defaults: ParsedMap = { chapterId: null, showUnclassified: false, fitRule: null, fitted: false, damaged: [] };
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
  // tolerant: only the rule this build knows counts; anything else is read as missing
  const fitRule = raw.fitRule === FIT_RULE ? FIT_RULE : null;
  let fitted = false;
  if (raw.fitted !== undefined) {
    if (typeof raw.fitted === 'boolean') fitted = raw.fitted;
    else damaged.push('map.fitted');
  }
  return { chapterId, showUnclassified, fitRule, fitted, damaged };
}
