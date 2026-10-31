/**
 * The navigator's UI stores (step 5.5a; UI_ARCHITECTURE §4): selection, expansion, filters, the active exam version and the viewport
 * per view. Small vanilla Zustand stores, in the pattern of the panels store. None of them holds canonical data (INV-10): they hold
 * IDs and numbers. Persistence is a separate wrapper (`persist.ts`) so the stores stay pure and testable without a port. The active exam version and the recent searches are saved (step 5.8); filters are in memory only.
 */
import { createExplorerStore, type ExplorerStore } from './explorer-state';
import { createChaptersStore, type ChaptersStore } from './chapters-state';
import { createPrecursorsStore, type PrecursorsStore } from './precursor-state';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ExpansionState } from '@/core/graph/contracts';
import type { ExamId, ExamVersionId, ViewFilters, ViewKey } from '@/core/schema';
import { createRecentStore, createViewCommandsStore, type RecentStore, type ViewCommandsStore } from './search-stores';

/** What is selected: one node or one edge of the drawing (step 5.5a; multi-selection is step 5.7). */
export interface Selected {
  readonly kind: 'node' | 'edge';
  readonly id: string;
}

export interface SelectionState {
  readonly selected: Selected | null;
  /**
   * The multi-selection of Studio's map (step 6.8b, R2): families and arrows chosen with Shift-click, Shift-drag or Shift+Space, in the
   * order they were chosen, never the same item twice. Empty in Study (nothing acts on it). Never saved. A single `select` empties it.
   */
  readonly multi: readonly Selected[];
  /** Counts every non-null `select` call, also one that changes nothing (step 5.6a): the inspector opens on a click even for what was already selected. Never saved. */
  readonly picks: number;
  /**
   * Counts every `reveal()` (step 5.7): a request to show the selection in the inspector PANE now. A click on the map asks for it only
   * when its 300 ms double-click window has passed (a double click opens the family page and never asks); Enter and a menu item ask
   * at once. Never saved.
   */
  readonly reveals: number;
  select(next: Selected | null): void;
  reveal(): void;
  /** Adds the item, or removes it when it is in. */
  toggle(item: Selected): void;
  setMulti(items: readonly Selected[]): void;
  clearMulti(): void;
}
export type SelectionStore = StoreApi<SelectionState>;

const sameSelected = (a: Selected | null, b: Selected | null): boolean => a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

export function createSelectionStore(initial: Selected | null = null): SelectionStore {
  return createStore<SelectionState>((set, get) => ({
    selected: initial,
    multi: [],
    picks: 0,
    reveals: 0,
    reveal: () => set({ reveals: get().reveals + 1 }),
    select(next) {
      const picks = next === null ? get().picks : get().picks + 1;
      const multi = get().multi.length === 0 ? get().multi : [];
      if (!sameSelected(get().selected, next) || picks !== get().picks || multi !== get().multi) set({ selected: next, picks, multi });
    },
    toggle(item) {
      const has = get().multi.some((one) => sameSelected(one, item));
      set({ multi: has ? get().multi.filter((one) => !sameSelected(one, item)) : [...get().multi, item] });
    },
    setMulti(items) {
      const out: Selected[] = [];
      for (const item of items) if (!out.some((one) => sameSelected(one, item))) out.push(item);
      set({ multi: out });
    },
    clearMulti() {
      if (get().multi.length > 0) set({ multi: [] });
    },
  }));
}

export const NO_EXPANSION_STATE: ExpansionState = { expanded: [], collapsedEdgeIds: [] };

export interface ExpansionStoreState {
  readonly expansion: ExpansionState;
  /** Expands a collapsed node (both directions) or collapses an expanded one. Answers what it did. */
  toggle(nodeId: string): 'expanded' | 'collapsed';
  /** Whether the node has an expansion entry. */
  isExpanded(nodeId: string): boolean;
  /** Removes every entry whose node is not in `keep`; answers the node IDs removed (sorted). */
  prune(keep: ReadonlySet<string>): readonly string[];
}
export type ExpansionStore = StoreApi<ExpansionStoreState>;

export function createExpansionStore(initial: ExpansionState = NO_EXPANSION_STATE): ExpansionStore {
  return createStore<ExpansionStoreState>((set, get) => ({
    expansion: initial,
    toggle(nodeId) {
      const { expansion } = get();
      if (expansion.expanded.some((entry) => entry.nodeId === nodeId)) {
        set({ expansion: { ...expansion, expanded: expansion.expanded.filter((entry) => entry.nodeId !== nodeId) } });
        return 'collapsed';
      }
      set({ expansion: { ...expansion, expanded: [...expansion.expanded, { nodeId, direction: 'both' }] } });
      return 'expanded';
    },
    isExpanded: (nodeId) => get().expansion.expanded.some((entry) => entry.nodeId === nodeId),
    prune(keep) {
      const { expansion } = get();
      const removed = [...new Set(expansion.expanded.filter((entry) => !keep.has(entry.nodeId)).map((entry) => entry.nodeId))].sort();
      if (removed.length > 0) set({ expansion: { ...expansion, expanded: expansion.expanded.filter((entry) => keep.has(entry.nodeId)) } });
      return removed;
    },
  }));
}

export const DEFAULT_FILTERS: ViewFilters = { scopes: [], topicIds: [], reagentFamilies: [] };

export interface FiltersState {
  readonly filters: ViewFilters;
  setFilters(next: ViewFilters): void;
}
export type FiltersStore = StoreApi<FiltersState>;

/** Default: no filter (the navigator's default request is UNFILTERED; exam scope dims, it does not filter). */
export function createFiltersStore(initial: ViewFilters = DEFAULT_FILTERS): FiltersStore {
  return createStore<FiltersState>((set) => ({ filters: initial, setFilters: (next) => set({ filters: next }) }));
}

/** The exam version scope is derived from. None until step 5.8 gives it a control: then `scopeOf` answers `unmapped` for every record. */
export interface ActiveExam {
  readonly examId: ExamId;
  readonly examVersionId: ExamVersionId;
}
export interface ActiveExamState {
  readonly active: ActiveExam | null;
  setActive(next: ActiveExam | null): void;
}
export type ActiveExamStore = StoreApi<ActiveExamState>;

export function createActiveExamStore(initial: ActiveExam | null = null): ActiveExamStore {
  return createStore<ActiveExamState>((set) => ({ active: initial, setActive: (next) => set({ active: next }) }));
}

export interface SavedViewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}
export interface ViewportsState {
  readonly views: Readonly<Partial<Record<ViewKey, SavedViewport>>>;
  setViewport(view: ViewKey, next: SavedViewport): void;
}
export type ViewportsStore = StoreApi<ViewportsState>;

export function createViewportsStore(initial: ViewportsState['views'] = {}): ViewportsStore {
  return createStore<ViewportsState>((set, get) => ({
    views: initial,
    setViewport(view, next) {
      const old = get().views[view];
      if (old !== undefined && old.x === next.x && old.y === next.y && old.scale === next.scale) return;
      set({ views: { ...get().views, [view]: next } });
    },
  }));
}

/** Where the family page should bring the reader once it is open: a group of one section (a selected arrow opens its source family at the target's group). */
export interface FamilyTarget {
  readonly section: 'reactions_of' | 'preparation_of';
  readonly hubId: string;
}

/**
 * The family page (step 5.5b; ADR-037): which family is open, or none (the overview). Only `open` is saved; `target` is a one-off
 * request the page consumes. None of it is canonical data (INV-10): IDs only.
 */
export interface FamilyState {
  readonly open: string | null;
  readonly target: FamilyTarget | null;
  /** The reaction selected on the page (a click on a card); kept while the page is closed, not saved. */
  readonly reaction: string | null;
  /** Counts every `selectReaction` call with a reaction, also a repeat (step 5.6a). Never saved. */
  readonly picks: number;
  openFamily(hubId: string, target?: FamilyTarget): void;
  selectReaction(reactionId: string | null): void;
  /** Back to the overview. */
  closeFamily(): void;
  /** The page has brought the reader to the target. */
  clearTarget(): void;
}
export type FamilyStore = StoreApi<FamilyState>;

export function createFamilyStore(initial: string | null = null): FamilyStore {
  return createStore<FamilyState>((set, get) => ({
    open: initial,
    target: null,
    reaction: null,
    picks: 0,
    openFamily(hubId, target) {
      set({ open: hubId, target: target ?? null });
    },
    selectReaction(reactionId) {
      const picks = reactionId === null ? get().picks : get().picks + 1;
      if (get().reaction !== reactionId || picks !== get().picks) set({ reaction: reactionId, picks });
    },
    closeFamily() {
      if (get().open !== null || get().target !== null) set({ open: null, target: null });
    },
    clearTarget() {
      if (get().target !== null) set({ target: null });
    },
  }));
}

/** How the overview is shown (step 5.7, item j): the map, or the List view of the same projection. Saved in `uiState`. */
export type OverviewMode = 'map' | 'list';
export const OVERVIEW_MODES: readonly OverviewMode[] = ['map', 'list'];

/** The phone's home tab (ADR-039): the families as cards, or the map. (Search is an action, not a place, so it is not remembered.) Saved in `uiState` only when it is not the default. */
export type PhoneTab = 'chapters' | 'families' | 'map' | 'explore';
export const PHONE_TABS: readonly PhoneTab[] = ['chapters', 'families', 'map', 'explore'];

export interface OverviewState {
  readonly mode: OverviewMode;
  setMode(mode: OverviewMode): void;
  readonly phoneTab: PhoneTab;
  setPhoneTab(tab: PhoneTab): void;
  /** The tab the app starts on when the visitor has never chosen one (7.3b D5: Chapters in Study when the dataset has chapters). Not saved while it is the tab shown. */
  readonly defaultTab: PhoneTab;
  /** Whether the visitor has chosen a tab (a saved one, or a tap). */
  readonly tabChosen: boolean;
  /** Takes `tab` as the default and shows it, only while no tab was chosen. */
  adoptDefaultTab(tab: PhoneTab): void;
}
export type OverviewStore = StoreApi<OverviewState>;

export function createOverviewStore(initial: OverviewMode = 'map', initialTab: PhoneTab = 'families', tabSaved = false): OverviewStore {
  return createStore<OverviewState>((set, get) => ({
    mode: initial,
    setMode(mode) {
      if (get().mode !== mode) set({ mode });
    },
    phoneTab: initialTab,
    defaultTab: 'families',
    tabChosen: tabSaved,
    setPhoneTab(tab) {
      if (get().phoneTab !== tab || !get().tabChosen) set({ phoneTab: tab, tabChosen: true });
    },
    adoptDefaultTab(tab) {
      if (get().tabChosen) return;
      set({ defaultTab: tab, phoneTab: tab });
    },
  }));
}

/** All the navigator's UI stores, as `src/app` creates and hands them to the feature. */
export interface NavigatorUiStores {
  readonly selection: SelectionStore;
  readonly expansion: ExpansionStore;
  readonly filters: FiltersStore;
  readonly exam: ActiveExamStore;
  readonly viewports: ViewportsStore;
  readonly family: FamilyStore;
  readonly overview: OverviewStore;
  /** The Reactions view: its filter, Cards or Compact, the last explorer (step 7.1b; saved). */
  readonly explorer: ExplorerStore;
  /** The Precursors view: target, starting materials, steps, toggles (step 7.2a; saved). */
  readonly precursors: PrecursorsStore;
  /** The Chapters view: the open chapter and its filters (step 7.3b; saved). */
  readonly chapters: ChaptersStore;
  /** The palette's recent searches (step 5.8; saved). */
  readonly recent: RecentStore;
  /** What the map offers the palette (step 5.8; never saved). */
  readonly viewCommands: ViewCommandsStore;
}

export const createNavigatorUiStores = (): NavigatorUiStores => ({
  selection: createSelectionStore(),
  expansion: createExpansionStore(),
  filters: createFiltersStore(),
  exam: createActiveExamStore(),
  viewports: createViewportsStore(),
  family: createFamilyStore(),
  overview: createOverviewStore(),
  explorer: createExplorerStore(),
  precursors: createPrecursorsStore(),
  chapters: createChaptersStore(),
  recent: createRecentStore(),
  viewCommands: createViewCommandsStore(),
});
