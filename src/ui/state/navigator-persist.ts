/**
 * The navigator's saved UI state (step 5.5a part 2; PERSISTENCE §12): selection, expansion and the viewport per view, ONE `uiState`
 * entry `navigator`, written through a port that `src/app` provides (as the panels store does). Filters and the active exam version are
 * NOT saved: they stay in memory with their defaults until step 5.8 gives them a control.
 *  - Reading is tolerant: each part is checked by itself, an unusable part falls back to its default and is named in `resetFields`
 *    (never fatal, never silent); fields this version does not know are kept and written back.
 *  - Writing is debounced. The viewport store is fed only after the view has been still (the canvas does that), so a gesture is one write.
 *  - A tab that cannot write (read-only follower, session-only) keeps its values for the session, writes nothing and says so.
 * Pure of the DOM: timers arrive as an injected `{ after }`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { ExpansionState } from '@/core/graph/contracts';
import { VIEW_KEYS, type ViewKey } from '@/core/schema';
import {
  createActiveExamStore,
  createExpansionStore,
  createFiltersStore,
  createSelectionStore,
  createViewportsStore,
  NO_EXPANSION_STATE,
  type NavigatorUiStores,
  type SavedViewport,
  type Selected,
} from './navigator-stores';
import { SAVE_DEBOUNCE_MS, type PanelPersistence, type PanelsPort, type PanelsTimers } from './panels';

export const NAVIGATOR_UI_KEY = 'navigator';
/** A saved expansion longer than this is damaged (the navigator never admits more hubs than its node limit). */
export const MAX_SAVED_EXPANDED = 1_000;
const MAX_ID_LENGTH = 512;
const MAX_COORDINATE = 1e7;
const KNOWN = new Set(['selected', 'expanded', 'collapsedEdgeIds', 'viewports']);

/** The same shape as the panels port: the stored entry, whether this tab writes, and the write. */
export type NavigatorUiPort = PanelsPort;

export interface ParsedNavigatorUi {
  readonly selected: Selected | null;
  readonly expansion: ExpansionState;
  readonly views: Readonly<Partial<Record<ViewKey, SavedViewport>>>;
  /** Parts that were present but unusable (reset to their defaults). A missing part is not damage. */
  readonly damaged: readonly string[];
  readonly extra: Readonly<Record<string, unknown>>;
}

const isId = (value: unknown): value is string => typeof value === 'string' && value !== '' && value.length <= MAX_ID_LENGTH;
const isCoordinate = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
type Direction = 'both' | 'in' | 'out';
const isDirection = (value: unknown): value is Direction => value === 'both' || value === 'in' || value === 'out';

function parseExpanded(value: unknown): ExpansionState['expanded'] | undefined {
  if (!Array.isArray(value) || value.length > MAX_SAVED_EXPANDED) return undefined;
  const out: { nodeId: string; direction: Direction }[] = [];
  for (const entry of value as unknown[]) {
    if (!isRecord(entry) || !isId(entry.nodeId) || !isDirection(entry.direction)) return undefined;
    out.push({ nodeId: entry.nodeId, direction: entry.direction });
  }
  return out;
}

export function parseNavigatorUi(raw: unknown): ParsedNavigatorUi {
  const empty: ParsedNavigatorUi = { selected: null, expansion: NO_EXPANSION_STATE, views: {}, damaged: [], extra: {} };
  if (raw === undefined) return empty;
  if (!isRecord(raw)) return { ...empty, damaged: ['navigator'] };
  const damaged: string[] = [];
  let selected: Selected | null = null;
  const s = raw.selected;
  if (s !== undefined && s !== null) {
    if (isRecord(s) && (s.kind === 'node' || s.kind === 'edge') && isId(s.id)) selected = { kind: s.kind, id: s.id };
    else damaged.push('selected');
  }
  let expanded: ExpansionState['expanded'] = [];
  if (raw.expanded !== undefined) {
    const parsed = parseExpanded(raw.expanded);
    if (parsed === undefined) damaged.push('expanded');
    else expanded = parsed;
  }
  let collapsedEdgeIds: readonly string[] = [];
  const c = raw.collapsedEdgeIds;
  if (c !== undefined) {
    if (Array.isArray(c) && c.length <= MAX_SAVED_EXPANDED && c.every(isId)) collapsedEdgeIds = c as string[];
    else damaged.push('collapsedEdgeIds');
  }
  const views: Partial<Record<ViewKey, SavedViewport>> = {};
  const v = raw.viewports;
  if (v !== undefined) {
    if (isRecord(v)) {
      for (const [key, value] of Object.entries(v)) {
        if ((VIEW_KEYS as readonly string[]).includes(key) && isRecord(value) && isCoordinate(value.x) && isCoordinate(value.y) && isCoordinate(value.scale) && value.scale > 0) {
          views[key as ViewKey] = { x: value.x, y: value.y, scale: value.scale };
        } else damaged.push(`viewports.${key}`);
      }
    } else damaged.push('viewports');
  }
  const extra = Object.fromEntries(Object.entries(raw).filter(([key]) => !KNOWN.has(key)));
  return { selected, expansion: { expanded, collapsedEdgeIds }, views, damaged, extra };
}

export interface NavigatorUiStatus {
  readonly persistence: PanelPersistence;
  /** Saved parts that were unusable at start (stays for the session, so the report is not lost). */
  readonly resetFields: readonly string[];
}

export interface NavigatorUi {
  readonly stores: NavigatorUiStores;
  readonly status: StoreApi<NavigatorUiStatus>;
  /** Writes now what is waiting (a tab that goes away). */
  flush(): Promise<void>;
  /** Stops listening and cancels a waiting write. */
  dispose(): void;
}

export function createNavigatorUi(port: NavigatorUiPort, timers: PanelsTimers, log: (type: string, message: string) => void = () => undefined): NavigatorUi {
  const parsed = parseNavigatorUi(port.stored);
  const mode = port.mode();
  const stores: NavigatorUiStores = {
    selection: createSelectionStore(parsed.selected),
    expansion: createExpansionStore(parsed.expansion),
    filters: createFiltersStore(),
    exam: createActiveExamStore(),
    viewports: createViewportsStore(parsed.views),
  };
  const status = createStore<NavigatorUiStatus>(() => ({
    persistence: mode === 'read_only' ? { kind: 'read_only' } : mode === 'session_only' ? { kind: 'session_only' } : { kind: 'saved' },
    resetFields: parsed.damaged,
  }));
  if (parsed.damaged.length > 0) log('ui_state_reset', `the saved navigator state was damaged and was reset: ${parsed.damaged.join(', ')}`);
  let cancel: (() => void) | undefined;
  let pending = false;

  async function flush(): Promise<void> {
    cancel?.();
    cancel = undefined;
    if (!pending) return;
    pending = false;
    const { selected } = stores.selection.getState();
    const { expansion } = stores.expansion.getState();
    const { views } = stores.viewports.getState();
    try {
      await port.save({ ...parsed.extra, selected, expanded: expansion.expanded, collapsedEdgeIds: expansion.collapsedEdgeIds, viewports: views });
      if (status.getState().persistence.kind !== 'saved') status.setState({ persistence: { kind: 'saved' } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      status.setState({ persistence: { kind: 'save_failed', message } });
      log('ui_state_save_failed', message);
    }
  }

  function schedule(): void {
    const now = port.mode();
    if (now !== 'writable') {
      const kind = now === 'read_only' ? 'read_only' : 'session_only';
      if (status.getState().persistence.kind !== kind) status.setState({ persistence: { kind } });
      return;
    }
    pending = true;
    cancel?.();
    cancel = timers.after(SAVE_DEBOUNCE_MS, () => {
      cancel = undefined;
      void flush();
    });
  }

  const offs = [stores.selection.subscribe(schedule), stores.expansion.subscribe(schedule), stores.viewports.subscribe(schedule)];
  return {
    stores,
    status,
    flush,
    dispose() {
      for (const off of offs) off();
      cancel?.();
      cancel = undefined;
      pending = false;
    },
  };
}
