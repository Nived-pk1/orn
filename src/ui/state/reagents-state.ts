/**
 * The Reagents view's UI state (step 7.3c D5): the open reagent and the list's filters (reagent families, the name box, "Only <exam version>").
 * UI state only, never records. Saved inside the navigator's `uiState` entry as the sibling key `reagents` and read tolerantly: each part is
 * checked by itself, an unusable part falls back to its default and is named in `damaged`. A reagent id that names nothing is dropped by the
 * view, which says so once.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { REAGENT_FAMILIES, type ReagentFamily } from '@/core/schema';

const MAX_ID_LENGTH = 512;
const MAX_TEXT_LENGTH = 200;
const inSchemaOrder = (families: readonly ReagentFamily[]): ReagentFamily[] => REAGENT_FAMILIES.filter((family) => families.includes(family));

type Choices = Partial<Pick<ReagentsState, 'reagentId' | 'families' | 'text' | 'onlyInScope'>>;

export interface ReagentsState {
  /** The open reagent's id; null: the list. */
  readonly reagentId: string | null;
  readonly families: readonly ReagentFamily[];
  readonly text: string;
  readonly onlyInScope: boolean;
  /** Opens a reagent's page (the list filters are cleared). */
  open(reagentId: string): void;
  back(): void;
  toggleFamily(family: ReagentFamily): void;
  setText(text: string): void;
  setOnlyInScope(on: boolean): void;
  clearFilters(): void;
}
export type ReagentsStore = StoreApi<ReagentsState>;

export function createReagentsStore(initial: Choices = {}): ReagentsStore {
  return createStore<ReagentsState>((set, get) => ({
    reagentId: initial.reagentId ?? null,
    families: initial.families ?? [],
    text: initial.text ?? '',
    onlyInScope: initial.onlyInScope ?? false,
    open: (reagentId) => set({ reagentId, families: [], text: '', onlyInScope: false }),
    back: () => set({ reagentId: null }),
    toggleFamily: (family) => set({ families: inSchemaOrder(get().families.includes(family) ? get().families.filter((one) => one !== family) : [...get().families, family]) }),
    setText: (text) => set({ text: text.slice(0, MAX_TEXT_LENGTH) }),
    setOnlyInScope: (onlyInScope) => set({ onlyInScope }),
    clearFilters: () => set({ families: [], text: '', onlyInScope: false }),
  }));
}

export interface ParsedReagents {
  readonly reagentId: string | null;
  readonly families: readonly ReagentFamily[];
  readonly text: string;
  readonly onlyInScope: boolean;
  readonly damaged: readonly string[];
}

export function parseReagents(raw: unknown): ParsedReagents {
  const defaults: ParsedReagents = { reagentId: null, families: [], text: '', onlyInScope: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults, damaged: ['reagents'] };
  const saved = raw as Record<string, unknown>;
  const damaged: string[] = [];
  const read = <T>(key: string, fallback: T, ok: (value: unknown) => boolean): T => {
    const value = saved[key];
    if (value === undefined || (key === 'reagentId' && value === null)) return fallback;
    if (ok(value)) return value as T;
    damaged.push(`reagents.${key}`);
    return fallback;
  };
  const reagentId = read<string | null>('reagentId', null, (v) => typeof v === 'string' && v !== '' && v.length <= MAX_ID_LENGTH);
  const picked = read<readonly ReagentFamily[]>('families', [], (v) => Array.isArray(v) && v.length <= REAGENT_FAMILIES.length && v.every((one) => (REAGENT_FAMILIES as readonly unknown[]).includes(one)));
  const text = read('text', '', (v) => typeof v === 'string' && v.length <= MAX_TEXT_LENGTH);
  const onlyInScope = read('onlyInScope', false, (v) => typeof v === 'boolean');
  return { reagentId, families: inSchemaOrder(picked), text, onlyInScope, damaged };
}
