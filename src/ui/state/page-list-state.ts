/**
 * The UI state of a "list and page" view (Named reactions and Mechanisms, step 7.4): the open record, the name box and "Only <exam version>".
 * UI state only, never records. Saved inside the navigator's `uiState` entry as a sibling key and read tolerantly: each part is checked by
 * itself, an unusable part falls back to its default and is named in `damaged`. An id that names nothing is dropped by the view, which says so
 * once. The two views have the same shape; each makes its own store with its own key.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

const MAX_ID_LENGTH = 512;
const MAX_TEXT_LENGTH = 200;

export interface PageListState {
  /** The open record's id; null: the list. */
  readonly openId: string | null;
  readonly text: string;
  readonly onlyInScope: boolean;
  /** Opens a record's page (the list filters are cleared). */
  open(id: string): void;
  back(): void;
  setText(text: string): void;
  setOnlyInScope(on: boolean): void;
  clearFilters(): void;
}
export type PageListStore = StoreApi<PageListState>;
export type PageListChoices = Partial<Pick<PageListState, 'openId' | 'text' | 'onlyInScope'>>;

export function createPageListStore(initial: PageListChoices = {}): PageListStore {
  return createStore<PageListState>((set) => ({
    openId: initial.openId ?? null,
    text: initial.text ?? '',
    onlyInScope: initial.onlyInScope ?? false,
    open: (openId) => set({ openId, text: '', onlyInScope: false }),
    back: () => set({ openId: null }),
    setText: (text) => set({ text: text.slice(0, MAX_TEXT_LENGTH) }),
    setOnlyInScope: (onlyInScope) => set({ onlyInScope }),
    clearFilters: () => set({ text: '', onlyInScope: false }),
  }));
}

export interface ParsedPageList {
  readonly openId: string | null;
  readonly text: string;
  readonly onlyInScope: boolean;
  readonly damaged: readonly string[];
}

/** Reads a saved value for `key` (the name used in `damaged`). The saved field for the open record is `id`. */
export function parsePageList(raw: unknown, key: string): ParsedPageList {
  const defaults: ParsedPageList = { openId: null, text: '', onlyInScope: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults, damaged: [key] };
  const saved = raw as Record<string, unknown>;
  const damaged: string[] = [];
  const read = <T>(field: string, fallback: T, ok: (value: unknown) => boolean): T => {
    const value = saved[field];
    if (value === undefined || (field === 'id' && value === null)) return fallback;
    if (ok(value)) return value as T;
    damaged.push(`${key}.${field}`);
    return fallback;
  };
  const openId = read<string | null>('id', null, (v) => typeof v === 'string' && v !== '' && v.length <= MAX_ID_LENGTH);
  const text = read('text', '', (v) => typeof v === 'string' && v.length <= MAX_TEXT_LENGTH);
  const onlyInScope = read('onlyInScope', false, (v) => typeof v === 'boolean');
  return { openId, text, onlyInScope, damaged };
}
