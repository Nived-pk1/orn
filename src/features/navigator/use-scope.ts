/**
 * The exam scope for the family page and the Unanchored panel (step 5.8): which reactions are outside the chosen exam version, and the
 * words for it. The lens is made when the chosen version, the study (or list) it serves, or the dataset changes, and asked only for the
 * cards that are drawn (the lists are virtualised). Nothing is hidden: a reaction outside the scope is dimmed and marked in words.
 */
import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { NavigatorPorts } from './contracts';
import { outsideNoteOf, scopeLens } from './scope-lens';

export interface ScopeView {
  /** "outside JEE Main", or undefined when no exam scope is chosen. */
  readonly note: string | undefined;
  isOutside(reactionId: string): boolean;
}

/** `version` is whatever changes when the lists the lens serves are rebuilt (the study, the ids): it only keys the memo. */
export function useScope(ports: NavigatorPorts, version: unknown): ScopeView {
  const active = useStore(ports.ui.exam, (s) => s.active);
  return useMemo<ScopeView>(() => {
    // `version` re-makes the lens when the list it serves was rebuilt (the data moved)
    void version;
    if (active === null) return { note: undefined, isOutside: () => false };
    const lens = scopeLens(ports.indexes.current(), active);
    return { note: outsideNoteOf(ports.store.getState(), active), isOutside: (reactionId) => lens({ kind: 'reaction', id: reactionId }) === 'outside' };
  }, [ports, active, version]);
}
