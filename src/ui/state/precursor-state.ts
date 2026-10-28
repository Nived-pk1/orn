/**
 * The Precursors view's UI state (step 7.2a D6): the target, the starting materials, the steps, the two toggles and whether a search was
 * run (its QUERY is these values; the result is never saved and is made again from them). UI state only, never records. Saved inside the
 * navigator's `uiState` entry (navigator-persist.ts) and read tolerantly: each part is checked by itself, an unusable part falls back to
 * its default and is named in `damaged`. Ids are kept as they are (the view drops those that name nothing and says so once).
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { RecordRef } from '@/core/schema';

/** The substances a route can end at or start from. */
export type SubstanceKind = 'species' | 'class';
export interface SubstanceChoice {
  readonly kind: SubstanceKind;
  readonly id: string;
}

export const MIN_PRECURSOR_STEPS = 1;
/** The engine's default (`DEFAULT_ROUTE_MAX_STEPS`, asserted equal in the feature's model test) and the most the view allows. */
export const DEFAULT_PRECURSOR_STEPS = 5;
const MAX_START = 20;
const MAX_ID_LENGTH = 512;

type Choices = Partial<Pick<PrecursorsState, 'target' | 'startFrom' | 'maxSteps' | 'onlyListed' | 'onlyInScope' | 'searched'>>;

export interface PrecursorsState {
  readonly target: SubstanceChoice | null;
  readonly startFrom: readonly SubstanceChoice[];
  readonly maxSteps: number;
  readonly onlyListed: boolean;
  readonly onlyInScope: boolean;
  readonly searched: boolean;
  setTarget(target: SubstanceChoice | null): void;
  addStart(choice: SubstanceChoice): void;
  removeStart(id: string): void;
  setMaxSteps(steps: number): void;
  setOnlyListed(on: boolean): void;
  setOnlyInScope(on: boolean): void;
  setSearched(searched: boolean): void;
  /** Replaces the choices (an entry point opens the view for one target). */
  replace(next: Choices): void;
}
export type PrecursorsStore = StoreApi<PrecursorsState>;

const clampSteps = (steps: number): number => Math.min(DEFAULT_PRECURSOR_STEPS, Math.max(MIN_PRECURSOR_STEPS, Math.round(steps)));
export const asChoice = (ref: RecordRef): SubstanceChoice | undefined => (ref.kind === 'species' || ref.kind === 'class' ? { kind: ref.kind, id: ref.id } : undefined);

export function createPrecursorsStore(initial: Choices = {}): PrecursorsStore {
  return createStore<PrecursorsState>((set, get) => ({
    target: initial.target ?? null,
    startFrom: initial.startFrom ?? [],
    maxSteps: initial.maxSteps ?? DEFAULT_PRECURSOR_STEPS,
    onlyListed: initial.onlyListed ?? false,
    onlyInScope: initial.onlyInScope ?? false,
    searched: initial.searched ?? false,
    setTarget: (target) => set({ target, searched: false }),
    addStart: (choice) => {
      if (get().startFrom.some((one) => one.id === choice.id) || get().startFrom.length >= MAX_START) return;
      set({ startFrom: [...get().startFrom, choice] });
    },
    removeStart: (id) => {
      const startFrom = get().startFrom.filter((one) => one.id !== id);
      set({ startFrom, ...(startFrom.length === 0 ? { onlyListed: false } : {}) });
    },
    setMaxSteps: (steps) => set({ maxSteps: clampSteps(steps) }),
    setOnlyListed: (on) => set({ onlyListed: on && get().startFrom.length > 0 }),
    setOnlyInScope: (on) => set({ onlyInScope: on }),
    setSearched: (searched) => {
      if (get().searched !== searched) set({ searched });
    },
    replace: (next) => set({ ...next, ...(next.startFrom !== undefined && next.startFrom.length === 0 ? { onlyListed: false } : {}) }),
  }));
}

export interface ParsedPrecursors {
  readonly target: SubstanceChoice | null;
  readonly startFrom: readonly SubstanceChoice[];
  readonly maxSteps: number;
  readonly onlyListed: boolean;
  readonly onlyInScope: boolean;
  readonly searched: boolean;
  readonly damaged: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const choiceOf = (value: unknown): SubstanceChoice | undefined =>
  isRecord(value) && (value.kind === 'species' || value.kind === 'class') && typeof value.id === 'string' && value.id !== '' && value.id.length <= MAX_ID_LENGTH ? { kind: value.kind, id: value.id } : undefined;

export function parsePrecursors(raw: unknown): ParsedPrecursors {
  const defaults: ParsedPrecursors = { target: null, startFrom: [], maxSteps: DEFAULT_PRECURSOR_STEPS, onlyListed: false, onlyInScope: false, searched: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (!isRecord(raw)) return { ...defaults, damaged: ['precursors'] };
  const damaged: string[] = [];
  let target: SubstanceChoice | null = null;
  if (raw.target !== undefined && raw.target !== null) {
    const choice = choiceOf(raw.target);
    if (choice === undefined) damaged.push('precursors.target');
    else target = choice;
  }
  let startFrom: SubstanceChoice[] = [];
  if (raw.startFrom !== undefined) {
    const list = Array.isArray(raw.startFrom) && raw.startFrom.length <= MAX_START ? raw.startFrom.map(choiceOf) : undefined;
    if (list !== undefined && list.every((one): one is SubstanceChoice => one !== undefined)) startFrom = list;
    else damaged.push('precursors.startFrom');
  }
  let maxSteps = DEFAULT_PRECURSOR_STEPS;
  if (raw.maxSteps !== undefined) {
    if (typeof raw.maxSteps === 'number' && Number.isInteger(raw.maxSteps) && raw.maxSteps >= MIN_PRECURSOR_STEPS && raw.maxSteps <= DEFAULT_PRECURSOR_STEPS) maxSteps = raw.maxSteps;
    else damaged.push('precursors.maxSteps');
  }
  const flag = (key: 'onlyListed' | 'onlyInScope' | 'searched'): boolean => {
    const value = raw[key];
    if (value === undefined) return false;
    if (typeof value === 'boolean') return value;
    damaged.push(`precursors.${key}`);
    return false;
  };
  const onlyListed = flag('onlyListed');
  const onlyInScope = flag('onlyInScope');
  const searched = flag('searched');
  return { target, startFrom, maxSteps, onlyListed: onlyListed && startFrom.length > 0, onlyInScope, searched, damaged };
}
