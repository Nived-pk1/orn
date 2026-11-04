/**
 * The map's focus state as a hook (step 8.2a, D1, D2, D7): the locked focus (the map store; set by a click, a tap or Enter, cleared by an empty click or
 * Esc), the 150 ms hover preview (the injected timers; moving away restores the locked focus or none), the saved chapter, Unclassified, and the
 * derived `MapView`. A saved chapter that no longer exists is dropped with a sentence, never a silent empty map. Nothing here is chemistry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { Scene } from '@/render/scene';
import type { NavigatorUiStores } from '@/ui/state';
import { mapView, type MapView } from './map-view';

/** How long the pointer rests on a family before its arrows are previewed. */
export const HOVER_FOCUS_MS = 150;

export interface MapViewArgs {
  readonly ui: NavigatorUiStores;
  readonly timers: { after(ms: number, run: () => void): () => void };
  readonly scene: Scene | null;
  readonly isHub: (id: string) => boolean;
  readonly selected: { readonly kind: 'node' | 'edge'; readonly id: string } | null;
  /** The ids of the chapters that exist now. */
  readonly chapters: readonly string[];
  readonly announce: (message: string) => void;
}

export interface MapViewState {
  readonly view: MapView | null;
  readonly chapterId: string | null;
  readonly showUnclassified: boolean;
  /** The family whose arrows are drawn now (locked or previewed), or null. */
  readonly focusId: string | null;
  /** The box under the pointer (desktop): previews its arrows after HOVER_FOCUS_MS. Stable. */
  readonly onNodeHover: (id: string | null) => void;
}

export function useMapView(args: MapViewArgs): MapViewState {
  const { ui, timers, scene, selected, chapters, announce } = args;
  const chapterId = useStore(ui.map, (s) => s.chapterId);
  const showUnclassified = useStore(ui.map, (s) => s.showUnclassified);
  const locked = useStore(ui.map, (s) => s.focusId);
  const [hover, setHover] = useState<string | undefined>(undefined);
  const live = useRef({ timers, isHub: args.isHub });
  live.current = { timers, isHub: args.isHub };
  const cancel = useRef<(() => void) | undefined>(undefined);
  useEffect(
    () => () => {
      cancel.current?.();
      cancel.current = undefined;
    },
    [],
  );
  const onNodeHover = useCallback((id: string | null): void => {
    cancel.current?.();
    cancel.current = undefined;
    if (id === null || !live.current.isHub(id)) {
      setHover(undefined);
      return;
    }
    cancel.current = live.current.timers.after(HOVER_FOCUS_MS, () => {
      cancel.current = undefined;
      setHover(id);
    });
  }, []);

  // a saved chapter that is not there any more (the data changed): all chapters, said once, saved as such
  const unknown = scene !== null && chapterId !== null && !chapters.includes(chapterId);
  useEffect(() => {
    if (!unknown) return;
    ui.map.getState().setChapter(null);
    announce('The chapter you chose no longer exists: showing all chapters.');
  }, [unknown, ui, announce]);

  const focusId = hover ?? locked;
  const selectedEdgeId = selected !== null && selected.kind === 'edge' ? selected.id : undefined;
  const view = useMemo(
    () => (scene === null ? null : mapView(scene, { focusId, chapter: chapterId !== null && !unknown, showUnclassified, selectedEdgeId })),
    [scene, focusId, chapterId, unknown, showUnclassified, selectedEdgeId],
  );
  return { view, chapterId: unknown ? null : chapterId, showUnclassified, focusId, onNodeHover };
}
