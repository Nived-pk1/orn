/**
 * The Reactions view's UI state (step 7.1b D5, ADR-042 E6): the filter, Cards or Compact and the last explorer. UI state only, never
 * records. Saved inside the navigator's `uiState` entry (navigator-persist.ts) and read tolerantly: each part is checked by itself, an
 * unusable part falls back to its default and is named in `damaged`. Ids are kept as they are (the view drops those that name nothing).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

export type ExplorerUse = 'any' | 'reactant' | 'arrow' | 'product';
export const EXPLORER_USES: readonly ExplorerUse[] = ['any', 'reactant', 'arrow', 'product'];
export type ExplorerView = 'cards' | 'compact';
export const EXPLORER_VIEWS: readonly ExplorerView[] = ['cards', 'compact'];
/** The explorers the Explore tab can reopen; 7.1 has one. */
export type ExplorerKind = 'reactions';
export const EXPLORER_KINDS: readonly ExplorerKind[] = ['reactions'];

const REVIEW_STATUSES: readonly string[] = ['unreviewed', 'review_required', 'verified'];
const MAX_IDS = 200;
const MAX_ID_LENGTH = 512;
const MAX_TEXT = 200;

export interface ExplorerFilter {
  readonly substanceIds: readonly string[];
  readonly usedAs: ExplorerUse;
  readonly fromFamilyIds: readonly string[];
  readonly toFamilyIds: readonly string[];
  readonly typeIds: readonly string[];
  readonly namedReactionIds: readonly string[];
  readonly reviewStatuses: readonly string[];
  readonly text: string;
  readonly onlyInScope: boolean;
}

export const EMPTY_EXPLORER_FILTER: ExplorerFilter = { substanceIds: [], usedAs: 'any', fromFamilyIds: [], toFamilyIds: [], typeIds: [], namedReactionIds: [], reviewStatuses: [], text: '', onlyInScope: false };

/** Whether any filter is set ("Used as" alone means nothing without a substance). */
export function isFilterSet(filter: ExplorerFilter): boolean {
  return filter.substanceIds.length + filter.fromFamilyIds.length + filter.toFamilyIds.length + filter.typeIds.length + filter.namedReactionIds.length + filter.reviewStatuses.length > 0 || filter.text !== '' || filter.onlyInScope;
}

export interface ExplorerState {
  readonly filter: ExplorerFilter;
  readonly view: ExplorerView;
  readonly last: ExplorerKind;
  setFilter(patch: Partial<ExplorerFilter>): void;
  /** Replaces the whole filter (an entry point opens the view filtered by one thing). */
  replaceFilter(filter: Partial<ExplorerFilter>): void;
  clearFilter(): void;
  setView(view: ExplorerView): void;
}
export type ExplorerStore = StoreApi<ExplorerState>;

export function createExplorerStore(initial: { readonly filter?: ExplorerFilter; readonly view?: ExplorerView; readonly last?: ExplorerKind } = {}): ExplorerStore {
  return createStore<ExplorerState>((set, get) => ({
    filter: initial.filter ?? EMPTY_EXPLORER_FILTER,
    view: initial.view ?? 'cards',
    last: initial.last ?? 'reactions',
    setFilter: (patch) => set({ filter: { ...get().filter, ...patch } }),
    replaceFilter: (filter) => set({ filter: { ...EMPTY_EXPLORER_FILTER, ...filter } }),
    clearFilter: () => set({ filter: EMPTY_EXPLORER_FILTER }),
    setView: (view) => {
      if (get().view !== view) set({ view });
    },
  }));
}

export interface ParsedExplorer {
  readonly filter: ExplorerFilter;
  readonly view: ExplorerView;
  readonly last: ExplorerKind;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIdList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= MAX_IDS && value.every((item) => typeof item === 'string' && item !== '' && item.length <= MAX_ID_LENGTH);

export function parseExplorer(raw: unknown): ParsedExplorer {
  const defaults: ParsedExplorer = { filter: EMPTY_EXPLORER_FILTER, view: 'cards', last: 'reactions', damaged: [] };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return { ...defaults, damaged: ['explorer'] };
  const damaged: string[] = [];
  let view: ExplorerView = 'cards';
  if (raw.view !== undefined) {
    if ((EXPLORER_VIEWS as readonly unknown[]).includes(raw.view)) view = raw.view as ExplorerView;
    else damaged.push('explorer.view');
  }
  let last: ExplorerKind = 'reactions';
  if (raw.last !== undefined) {
    if ((EXPLORER_KINDS as readonly unknown[]).includes(raw.last)) last = raw.last as ExplorerKind;
    else damaged.push('explorer.last');
  }
  const f = raw.filter;
  let filter: ExplorerFilter = EMPTY_EXPLORER_FILTER;
  if (f !== undefined) {
    if (!isRecord(f)) damaged.push('explorer.filter');
    else {
      const list = (key: 'substanceIds' | 'fromFamilyIds' | 'toFamilyIds' | 'typeIds' | 'namedReactionIds' | 'reviewStatuses'): readonly string[] => {
        const value = f[key];
        if (value === undefined) return [];
        if (isIdList(value) && (key !== 'reviewStatuses' || value.every((one) => REVIEW_STATUSES.includes(one)))) return value;
        damaged.push(`explorer.filter.${key}`);
        return [];
      };
      let usedAs: ExplorerUse = 'any';
      if (f.usedAs !== undefined) {
        if ((EXPLORER_USES as readonly unknown[]).includes(f.usedAs)) usedAs = f.usedAs as ExplorerUse;
        else damaged.push('explorer.filter.usedAs');
      }
      let text = '';
      if (f.text !== undefined) {
        if (typeof f.text === 'string' && f.text.length <= MAX_TEXT) text = f.text;
        else damaged.push('explorer.filter.text');
      }
      let onlyInScope = false;
      if (f.onlyInScope !== undefined) {
        if (typeof f.onlyInScope === 'boolean') onlyInScope = f.onlyInScope;
        else damaged.push('explorer.filter.onlyInScope');
      }
      filter = { substanceIds: list('substanceIds'), usedAs, fromFamilyIds: list('fromFamilyIds'), toFamilyIds: list('toFamilyIds'), typeIds: list('typeIds'), namedReactionIds: list('namedReactionIds'), reviewStatuses: list('reviewStatuses'), text, onlyInScope };
    }
  }
  return { filter, view, last, damaged };
}
