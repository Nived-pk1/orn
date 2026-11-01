/**
 * The Syllabus view's UI state (7.6 D): the exam version chosen on the page, the version compared with, and "Gaps only" (Studio). UI state
 * only, never records, and never the app's exam scope (this select does not change it). Saved inside the navigator's `uiState` entry as the
 * sibling key `syllabus` and read tolerantly: each part is checked by itself, an unusable part falls back to its default and is named in
 * `damaged`. An id that names nothing is dropped by the view, which says so once.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';

const MAX_ID_LENGTH = 512;

type Choices = Partial<Pick<SyllabusState, 'versionId' | 'compareId' | 'gapsOnly'>>;

export interface SyllabusState {
  /** The chosen exam version; null: the view picks its default (the active exam scope's version, else the first exam's newest). */
  readonly versionId: string | null;
  /** The other version of the same exam being compared; null: no comparison. */
  readonly compareId: string | null;
  readonly gapsOnly: boolean;
  /** Choosing a version drops the comparison (it belonged to the version before). */
  setVersion(versionId: string | null): void;
  setCompare(compareId: string | null): void;
  setGapsOnly(on: boolean): void;
}
export type SyllabusStore = StoreApi<SyllabusState>;

export function createSyllabusStore(initial: Choices = {}): SyllabusStore {
  return createStore<SyllabusState>((set) => ({
    versionId: initial.versionId ?? null,
    compareId: initial.compareId ?? null,
    gapsOnly: initial.gapsOnly ?? false,
    setVersion: (versionId) => set({ versionId, compareId: null }),
    setCompare: (compareId) => set({ compareId }),
    setGapsOnly: (gapsOnly) => set({ gapsOnly }),
  }));
}

export interface ParsedSyllabus {
  readonly versionId: string | null;
  readonly compareId: string | null;
  readonly gapsOnly: boolean;
  readonly damaged: readonly string[];
}

export function parseSyllabus(raw: unknown): ParsedSyllabus {
  const defaults: ParsedSyllabus = { versionId: null, compareId: null, gapsOnly: false, damaged: [] };
  if (raw === undefined) return defaults;
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...defaults, damaged: ['syllabus'] };
  const saved = raw as Record<string, unknown>;
  const damaged: string[] = [];
  const id = (field: 'versionId' | 'compareId'): string | null => {
    const value = saved[field];
    if (value === undefined || value === null) return null;
    if (typeof value === 'string' && value !== '' && value.length <= MAX_ID_LENGTH) return value;
    damaged.push(`syllabus.${field}`);
    return null;
  };
  const versionId = id('versionId');
  const compareId = id('compareId');
  let gapsOnly = false;
  if (saved.gapsOnly !== undefined) {
    if (typeof saved.gapsOnly === 'boolean') gapsOnly = saved.gapsOnly;
    else damaged.push('syllabus.gapsOnly');
  }
  return { versionId, compareId, gapsOnly, damaged };
}
