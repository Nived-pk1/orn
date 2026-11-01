/**
 * The entry points of the Named reactions and Mechanisms views as callbacks for the window (step 7.4): open a named reaction's page, open a
 * mechanism's page, and open Reactions filtered by a named reaction. Composition only; the stores and the mode switch are the window's.
 */
import { useCallback } from 'react';
import type { ExplorerFilter, NavigatorUiStores } from '@/ui/state';
import { openMechanism, openNamed } from './page-entries';

export function usePageEntries(ui: NavigatorUiStores, setMode: (mode: string) => void, onReactions: (filter: Partial<ExplorerFilter>) => void) {
  const onNamed = useCallback((namedReactionId: string) => openNamed(ui, setMode, namedReactionId), [ui, setMode]);
  const onMechanism = useCallback((mechanismId: string) => openMechanism(ui, setMode, mechanismId), [ui, setMode]);
  const onShowNamedInReactions = useCallback((namedReactionId: string) => onReactions({ namedReactionIds: [namedReactionId] }), [onReactions]);
  return { onNamed, onMechanism, onShowNamedInReactions };
}
