/**
 * The Chapters view's UI state (step 7.3b D6): the open chapter and the page's filters (kind chips, the name box, "Only <exam version>").
 * UI state only, never records. Saved inside the navigator's `uiState` entry (navigator-persist.ts) and read tolerantly: each part is
 * checked by itself, an unusable part falls back to its default and is named in `damaged`. A chapter id that names nothing is dropped by the
 * view, which says so once.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { CHAPTER_GROUPS, type GroupKey } from '@/core/chapters';

const MAX_ID_LENGTH = 512;
const MAX_TEXT_LENGTH = 200;
const KEYS: readonly GroupKey[] = CHAPTER_GROUPS.map((group) => group.key);
const inPageOrder = (kinds: readonly GroupKey[]): GroupKey[] => KEYS.filter((key) => kinds.includes(key));

type Choices = Partial<Pick<ChaptersState, 'chapterId' | 'kinds' | 'text' | 'onlyInScope'>>;

export interface ChaptersState {
  /** The open chapter (a topic id, or "none" for "No chapter yet"); null: the list. */
  readonly chapterId: string | null;
  /** The kind chips that are on (empty: all kinds). */
  readonly kinds: readonly GroupKey[];
  readonly text: string;
  readonly onlyInScope: boolean;
  /** Opens a chapter with a clean filter. */
  open(chapterId: string): void;
  back(): void;
  toggleKind(kind: GroupKey): void;
  setText(text: string): void;
  setOnlyInScope(on: boolean): void;
  clearFilters(): void;
}
export type ChaptersStore = StoreApi<ChaptersState>;

export function createChaptersStore(initial: Choices = {}): ChaptersStore {
  return createStore<ChaptersState>((set, get) => ({
    chapterId: initial.chapterId ?? null,
    kinds: initial.kinds ?? [],
    text: initial.text ?? '',
    onlyInScope: initial.onlyInScope ?? false,
    open: (chapterId) => set({ chapterId, kinds: [], text: '', onlyInScope: false }),
    back: () => set({ chapterId: null, kinds: [], text: '', onlyInScope: false }),
    toggleKind: (kind) => set({ kinds: inPageOrder(get().kinds.includes(kind) ? get().kinds.filter((one) => one !== kind) : [...get().kinds, kind]) }),
    setText: (text) => set({ text: text.slice(0, MAX_TEXT_LENGTH) }),
    setOnlyInScope: (onlyInScope) => set({ onlyInScope }),
    clearFilters: () => set({ kinds: [], text: '', onlyInScope: false }),
  }));
}

export interface ParsedChapters {
  readonly chapterId: string | null;
  readonly kinds: readonly GroupKey[];
  readonly text: string;
  readonly onlyInScope: boolean;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseChapters(raw: unknown): ParsedChapters {
  const defaults: ParsedChapters = { chapterId: null, kinds: [], text: '', onlyInScope: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return { ...defaults, damaged: ['chapters'] };
  const damaged: string[] = [];
  let chapterId: string | null = null;
  if (raw.chapterId !== undefined && raw.chapterId !== null) {
    if (typeof raw.chapterId === 'string' && raw.chapterId !== '' && raw.chapterId.length <= MAX_ID_LENGTH) chapterId = raw.chapterId;
    else damaged.push('chapters.chapterId');
  }
  let kinds: GroupKey[] = [];
  if (raw.kinds !== undefined) {
    if (Array.isArray(raw.kinds) && raw.kinds.length <= KEYS.length && raw.kinds.every((one): one is GroupKey => KEYS.includes(one as GroupKey))) kinds = inPageOrder(raw.kinds);
    else damaged.push('chapters.kinds');
  }
  let text = '';
  if (raw.text !== undefined) {
    if (typeof raw.text === 'string' && raw.text.length <= MAX_TEXT_LENGTH) text = raw.text;
    else damaged.push('chapters.text');
  }
  let onlyInScope = false;
  if (raw.onlyInScope !== undefined) {
    if (typeof raw.onlyInScope === 'boolean') onlyInScope = raw.onlyInScope;
    else damaged.push('chapters.onlyInScope');
  }
  return { chapterId, kinds, text, onlyInScope, damaged };
}
