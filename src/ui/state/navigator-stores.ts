/**
 * The navigator's UI stores (step 5.5a; UI_ARCHITECTURE §4): selection, expansion, filters, the active exam version and the viewport
 * per view. Small vanilla Zustand stores, in the pattern of the panels store. None of them holds canonical data (INV-10): they hold
 * IDs and numbers. Persistence is a separate wrapper (`persist.ts`) so the stores stay pure and testable without a port. Filters and
 * the active exam version are in-memory only until the step that gives them a control (5.8).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ExpansionState } from '@/core/graph/contracts';
import type { ExamId, ExamVersionId, ViewFilters, ViewKey } from '@/core/schema';

/** What is selected: one node or one edge of the drawing (step 5.5a; multi-selection is step 5.7). */
export interface Selected {
  readonly kind: 'node' | 'edge';
  readonly id: string;
}

export interface SelectionState {
  readonly selected: Selected | null;
  select(next: Selected | null): void;
}
export type SelectionStore = StoreApi<SelectionState>;

const sameSelected = (a: Selected | null, b: Selected | null): boolean => a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);

export function createSelectionStore(initial: Selected | null = null): SelectionStore {
  return createStore<SelectionState>((set, get) => ({
    selected: initial,
    select(next) {
      if (!sameSelected(get().selected, next)) set({ selected: next });
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

/** All the navigator's UI stores, as `src/app` creates and hands them to the feature. */
export interface NavigatorUiStores {
  readonly selection: SelectionStore;
  readonly expansion: ExpansionStore;
  readonly filters: FiltersStore;
  readonly exam: ActiveExamStore;
  readonly viewports: ViewportsStore;
}

export const createNavigatorUiStores = (): NavigatorUiStores => ({
  selection: createSelectionStore(),
  expansion: createExpansionStore(),
  filters: createFiltersStore(),
  exam: createActiveExamStore(),
  viewports: createViewportsStore(),
});
