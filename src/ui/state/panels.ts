/**
 * The panels store (step 5.2, UI_ARCHITECTURE §4, PERSISTENCE §12): the inspector's width, open state and (step 5.6a) deepest level opened, "Start empty dismissed" and (step 5.5d) the dismissed storage warning and (equation step, part 4) how structures are drawn.
 * A small Zustand store, persisted in `uiState` key `panels` through a PORT that `src/app` provides (src/ui imports neither
 * `src/app` nor `src/persistence`). Reading is TOLERANT: each field is checked by itself, a bad field falls back to its default and
 * the damage is reported in `resetFields` (never fatal, never silent); unknown fields are kept and written back. Writing is
 * debounced; a tab that cannot write (read-only follower, session-only) keeps the values for this session, writes nothing, and says
 * so in `persistence`. Pure of the DOM: timers arrive as an injected `{ after }`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { STRUCTURE_MODES, type StructureMode } from '@/chem/contracts';

export const INSPECTOR_MIN = 360;
export const INSPECTOR_MAX = 520;
export const INSPECTOR_DEFAULT = 400;
export const PANELS_KEY = 'panels';
export const SAVE_DEBOUNCE_MS = 300;

export interface PanelValues {
  readonly inspectorWidth: number;
  readonly inspectorOpen: boolean;
  /** "Start empty" was chosen: the first-run screen is not shown again for this dataset (E-notes: kept in `uiState`, 5.1d review item 6). */
  readonly startEmptyDismissed: boolean;
  /** The warning "the browser did not grant persistent storage" was dismissed (step 5.5d, item k); the status bar keeps a short line, so it is never silent. */
  readonly storageNoticeDismissed: boolean;
  /** The deepest inspector level (2 to 5) the user has opened; the default for the next record (UI_ARCHITECTURE §9). L1 is always shown, L2 is open the first time. */
  readonly inspectorLevel: InspectorLevel;
  /** How every structure is drawn: Skeletal, Condensed or Full (equation step, part 4). A drawing option only; the stored structure never changes. */
  readonly structureMode: StructureMode;
  /** The "Names" switch of the textbook equation: the name lines under the drawings are shown (equation step, part 5). */
  readonly equationNames: boolean;
}

export const INSPECTOR_LEVELS = [2, 3, 4, 5] as const;
export type InspectorLevel = (typeof INSPECTOR_LEVELS)[number];

/** The inspector starts closed until it has something to show (step 5.6a); a saved choice wins (step 5.5a review, item g). */
export const PANEL_DEFAULTS: PanelValues = Object.freeze({ inspectorWidth: INSPECTOR_DEFAULT, inspectorOpen: false, startEmptyDismissed: false, storageNoticeDismissed: false, inspectorLevel: 2, structureMode: 'skeletal', equationNames: true });

/** What the store says about keeping its values (shown in the status bar; nothing here is silent). */
export type PanelPersistence =
  | { readonly kind: 'saved' }
  | { readonly kind: 'read_only' }
  | { readonly kind: 'session_only' }
  | { readonly kind: 'save_failed'; readonly message: string };

/** What `src/app` gives the store. */
export interface PanelsPort {
  /** The stored `panels` entry as boot read it (any shape: it is checked here); `undefined`: nothing stored. */
  readonly stored: unknown;
  /** `writable`: this tab writes. `read_only`: a follower or a read-only tab. `session_only`: no database. Read when a save is due. */
  mode(): 'writable' | 'read_only' | 'session_only';
  save(value: Readonly<Record<string, unknown>>): Promise<void>;
}

export interface PanelsTimers {
  after(ms: number, run: () => void): () => void;
}

export interface PanelsState extends PanelValues {
  readonly persistence: PanelPersistence;
  /** Stored fields that were unusable at start and were reset to their defaults (stays for the session, so the report is not lost). */
  readonly resetFields: readonly string[];
  setInspectorWidth(width: number): void;
  setInspectorOpen(open: boolean): void;
  dismissStartEmpty(): void;
  dismissStorageNotice(): void;
  /** Opening a level deeper than the saved one saves it; opening or closing a shallower one changes nothing. */
  openInspectorLevel(level: InspectorLevel): void;
  setStructureMode(mode: StructureMode): void;
  setEquationNames(names: boolean): void;
}

export type PanelsStore = StoreApi<PanelsState>;

export const clampWidth = (width: number): number => Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, Math.round(width)));

export interface ParsedPanels {
  readonly values: PanelValues;
  /** Fields that were present but unusable (reset to their defaults). A missing field is not damage. */
  readonly damaged: readonly string[];
  /** Fields the store does not know, kept so a newer version's data is not dropped. */
  readonly extra: Readonly<Record<string, unknown>>;
}

const KNOWN = new Set(['inspectorWidth', 'inspectorOpen', 'startEmptyDismissed', 'storageNoticeDismissed', 'inspectorLevel', 'structureMode', 'equationNames']);

export function parsePanels(raw: unknown): ParsedPanels {
  if (raw === undefined) return { values: PANEL_DEFAULTS, damaged: [], extra: {} };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { values: PANEL_DEFAULTS, damaged: ['panels'], extra: {} };
  const record = raw as Record<string, unknown>;
  const damaged: string[] = [];
  const width = record.inspectorWidth;
  let inspectorWidth = PANEL_DEFAULTS.inspectorWidth;
  if (width !== undefined) {
    if (typeof width === 'number' && Number.isFinite(width) && width >= INSPECTOR_MIN && width <= INSPECTOR_MAX) inspectorWidth = Math.round(width);
    else damaged.push('inspectorWidth');
  }
  const bool = (name: 'inspectorOpen' | 'startEmptyDismissed' | 'storageNoticeDismissed' | 'equationNames'): boolean => {
    const value = record[name];
    if (value === undefined) return PANEL_DEFAULTS[name];
    if (typeof value === 'boolean') return value;
    damaged.push(name);
    return PANEL_DEFAULTS[name];
  };
  const inspectorOpen = bool('inspectorOpen');
  const startEmptyDismissed = bool('startEmptyDismissed');
  const storageNoticeDismissed = bool('storageNoticeDismissed');
  const equationNames = bool('equationNames');
  let inspectorLevel: InspectorLevel = PANEL_DEFAULTS.inspectorLevel;
  if (record.inspectorLevel !== undefined) {
    if ((INSPECTOR_LEVELS as readonly unknown[]).includes(record.inspectorLevel)) inspectorLevel = record.inspectorLevel as InspectorLevel;
    else damaged.push('inspectorLevel');
  }
  let structureMode: StructureMode = PANEL_DEFAULTS.structureMode;
  if (record.structureMode !== undefined) {
    if ((STRUCTURE_MODES as readonly unknown[]).includes(record.structureMode)) structureMode = record.structureMode as StructureMode;
    else damaged.push('structureMode');
  }
  const extra = Object.fromEntries(Object.entries(record).filter(([key]) => !KNOWN.has(key)));
  return { values: { inspectorWidth, inspectorOpen, startEmptyDismissed, storageNoticeDismissed, inspectorLevel, structureMode, equationNames }, damaged, extra };
}

export function createPanelsStore(port: PanelsPort, timers: PanelsTimers): PanelsStore {
  const parsed = parsePanels(port.stored);
  const mode = port.mode();
  const initialPersistence: PanelPersistence = mode === 'read_only' ? { kind: 'read_only' } : mode === 'session_only' ? { kind: 'session_only' } : { kind: 'saved' };
  let cancel: (() => void) | undefined;
  let pending = false;

  const store: PanelsStore = createStore<PanelsState>((set, get) => {
    const change = (patch: Partial<PanelValues>): void => {
      const current = get();
      const next = { ...patch };
      if ((Object.keys(next) as (keyof PanelValues)[]).every((key) => current[key] === next[key])) return;
      set(next);
      schedule();
    };
    return {
      ...parsed.values,
      persistence: initialPersistence,
      resetFields: parsed.damaged,
      setInspectorWidth: (width) => change({ inspectorWidth: clampWidth(width) }),
      setInspectorOpen: (open) => change({ inspectorOpen: open }),
      dismissStartEmpty: () => change({ startEmptyDismissed: true }),
      dismissStorageNotice: () => change({ storageNoticeDismissed: true }),
      openInspectorLevel: (level) => {
        if (level > get().inspectorLevel) change({ inspectorLevel: level });
      },
      setStructureMode: (mode) => change({ structureMode: mode }),
      setEquationNames: (names) => change({ equationNames: names }),
    };
  });

  function schedule(): void {
    const now = port.mode();
    if (now !== 'writable') {
      // Nothing is written; the status says why (a tab that was promoted later writes from then on).
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
    const { inspectorWidth, inspectorOpen, startEmptyDismissed, storageNoticeDismissed, inspectorLevel, structureMode, equationNames } = store.getState();
    try {
      // the default is not written, so an entry that never chose a mode stays as it was
      await port.save({ ...parsed.extra, inspectorWidth, inspectorOpen, startEmptyDismissed, storageNoticeDismissed, inspectorLevel, ...(structureMode === PANEL_DEFAULTS.structureMode ? {} : { structureMode }), ...(equationNames === PANEL_DEFAULTS.equationNames ? {} : { equationNames }) });
      if (store.getState().persistence.kind !== 'saved') store.setState({ persistence: { kind: 'saved' } });
    } catch (error) {
      store.setState({ persistence: { kind: 'save_failed', message: error instanceof Error ? error.message : String(error) } });
    }
  }

  return store;
}
