/**
 * The map's multi-selection where it lives (step 6.8b, R2; Studio only): the hook returns `null` when the window provides no bulk actions
 * (Study), so nothing below it exists there. Otherwise it owns the marquee being drawn and the phone's Select mode, turns the pointer's
 * Shift click / Shift drag and the keyboard's Shift+Space into toggles of the selection store, and answers the line in words and the
 * reactions of the selection. The model is `multi-select.ts` (pure); every outcome is a UI-store change. No chemistry.
 */
import { useCallback, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { Scene } from '@/render/scene';
import type { SceneHit } from '@/render/svg';
import type { ViewportController } from '@/render/viewport';
import type { Selected } from '@/ui/state';
import { useMapBulk, type MapBulk } from './bulk-context';
import { marqueeFamilies, reactionsOfSelection, selectionLine, worldRect } from './multi-select';
import { useNavigator } from './navigator-context';

export interface MarqueeBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface MultiSelect {
  readonly bulk: MapBulk;
  readonly items: readonly Selected[];
  /** The phone's Select mode: a tap toggles. */
  readonly selectMode: boolean;
  setSelectMode(on: boolean): void;
  /** The rectangle being dragged, in pixels of the drawing; null when there is none. */
  readonly marquee: MarqueeBox | null;
  readonly line: string;
  readonly reactionIds: readonly string[];
  toggle(hit: SceneHit): void;
  toggleFocused(id: string): void;
  onMarquee(rect: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, done: boolean): void;
  onMarqueeCancel(): void;
  clear(): void;
}

export function useMultiSelect(args: {
  readonly scene: Scene | null;
  readonly svg: SVGSVGElement | null;
  readonly controller: ViewportController | null;
  readonly isHub: (id: string) => boolean;
  readonly announce: (message: string) => void;
}): MultiSelect | null {
  const bulk = useMapBulk();
  const { ports } = useNavigator();
  const { scene, svg, controller, isHub, announce } = args;
  const items = useStore(ports.ui.selection, (s) => s.multi);
  const [selectMode, setSelectModeState] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);

  const reactionIds = useMemo(
    () => (scene === null || items.length === 0 ? [] : reactionsOfSelection(items, scene, (hubId) => ports.indexes.current().navigatorRollup().candidatesFrom(hubId))),
    [items, scene, ports],
  );
  const line = useMemo(() => selectionLine({ families: items.filter((one) => one.kind === 'node').length, arrows: items.filter((one) => one.kind === 'edge').length, reactions: reactionIds.length }), [items, reactionIds]);

  const toggleItem = useCallback(
    (item: Selected): void => {
      const store = ports.ui.selection.getState();
      // the single selection and the multi-selection are never both on: the first Shift-click brings the single one in
      if (store.multi.length === 0 && store.selected !== null && (store.selected.kind !== item.kind || store.selected.id !== item.id)) store.setMulti([store.selected]);
      store.toggle(item);
    },
    [ports],
  );
  const toggle = useCallback(
    (hit: SceneHit): void => {
      if (hit.kind === 'node' && !isHub(hit.id)) return;
      toggleItem({ kind: hit.kind, id: hit.id });
      const now = ports.ui.selection.getState().multi.length;
      announce(now === 0 ? 'Selection cleared' : `${now} selected`);
    },
    [ports, isHub, announce, toggleItem],
  );
  const toggleFocused = useCallback((id: string): void => toggle({ kind: 'node', id }), [toggle]);

  const onMarquee = useCallback(
    (rect: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, done: boolean): void => {
      if (svg === null || controller === null || scene === null) return;
      const box = svg.getBoundingClientRect();
      if (!done) {
        setMarquee({ left: rect.x0 - box.left, top: rect.y0 - box.top, width: rect.x1 - rect.x0, height: rect.y1 - rect.y0 });
        return;
      }
      setMarquee(null);
      const inside = marqueeFamilies(scene, worldRect({ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, box, controller.current()));
      const store = ports.ui.selection.getState();
      const base = store.multi.length === 0 && store.selected !== null ? [store.selected] : store.multi;
      store.setMulti([...base, ...inside.map((id) => ({ kind: 'node', id }) as const)]);
      announce(`${inside.length} ${inside.length === 1 ? 'family' : 'families'} added; ${ports.ui.selection.getState().multi.length} selected`);
    },
    [svg, controller, scene, ports, announce],
  );
  const onMarqueeCancel = useCallback((): void => setMarquee(null), []);
  const clear = useCallback((): void => {
    ports.ui.selection.getState().clearMulti();
    setMarquee(null);
  }, [ports]);
  const setSelectMode = useCallback(
    (on: boolean): void => {
      setSelectModeState(on);
      if (!on) ports.ui.selection.getState().clearMulti();
    },
    [ports],
  );

  if (bulk === undefined) return null;
  return { bulk, items, selectMode, setSelectMode, marquee, line, reactionIds, toggle, toggleFocused, onMarquee, onMarqueeCancel, clear };
}
