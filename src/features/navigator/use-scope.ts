/**
 * The exam scope for the family page and the Unanchored panel (step 5.8): which reactions are outside the chosen exam version, and the
 * words for it. The lens is made when the chosen version, the study (or list) it serves, or the dataset changes, and asked only for the
 * cards that are drawn (the lists are virtualised). Under "Everything" a reaction outside the scope is dimmed and marked in words; under "Only <exam>" the
 * pages leave it out and say how many (step 8.3b, B2).
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { NavigatorPorts } from './contracts';
import { outsideNoteOf, scopeLens, scopeNameOf } from './scope-lens';
import { scopeChipOf, type ScopeChip } from './scope-chip';

export interface ScopeView {
  /** "outside JEE Main", or undefined when no exam scope is chosen. */
  readonly note: string | undefined;
  /** "JEE Main", or undefined when no exam scope is chosen. */
  readonly examName: string | undefined;
  isOutside(reactionId: string): boolean;
  /** "Extra" (enrichment) or "Background" (prerequisite) for the chosen exam (step 8.3b, B2); undefined otherwise. */
  chipOf(reactionId: string): ScopeChip | undefined;
}

/** `version` is whatever changes when the lists the lens serves are rebuilt (the study, the ids): it only keys the memo. */
export function useScope(ports: NavigatorPorts, version: unknown): ScopeView {
  const active = useStore(ports.ui.exam, (s) => s.active);
  return useMemo<ScopeView>(() => {
    // `version` re-makes the lens when the list it serves was rebuilt (the data moved)
    void version;
    if (active === null) return { note: undefined, examName: undefined, isOutside: () => false, chipOf: () => undefined };
    const lens = scopeLens(ports.indexes.current(), active);
    return { note: outsideNoteOf(ports.store.getState(), active), examName: scopeNameOf(ports.store.getState(), active), isOutside: (reactionId) => lens({ kind: 'reaction', id: reactionId }) === 'outside', chipOf: (reactionId) => scopeChipOf(lens({ kind: 'reaction', id: reactionId })) };
  }, [ports, active, version]);
}
