/**
 * The map's multi-selection shell (step 6.8b, R2 and Y1; Studio only): the small part that stays in the entry chunk. The Studio host puts
 * this hook in `MapBulkContext`, so the Study window has none of it. It owns the marquee being drawn and the phone's Select mode, turns the
 * pointer's Shift click / Shift drag and the keyboard's Shift+Space into work for the engine, and loads the engine (`multi-engine.tsx`, the
 * model, the bulk bar, the line in words) on the first of them through the injected loader. Every outcome is a UI-store change. No chemistry.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import type { SceneHit } from '@/render/svg';
import { useMapBulk } from './bulk-context';
import { createEngineLoader } from './multi-loader';
import { SelectToggle } from './multi-select-toggle';
import type { MarqueeBox, MultiArgs, MultiEngine, MultiSelect } from './multi-types';
import { useNavigator } from './navigator-context';

const NO_REACTIONS: readonly string[] = [];

export function useMultiSelect(args: MultiArgs): MultiSelect | null {
  const bulk = useMapBulk();
  const { ports } = useNavigator();
  const { scene, svg, controller, isHub, announce } = args;
  const items = useStore(ports.ui.selection, (s) => s.multi);
  const [selectMode, setSelectModeState] = useState(false);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const said = useRef(announce);
  said.current = announce;
  const loader = useMemo(() => (bulk === undefined ? null : createEngineLoader<MultiEngine>(bulk.load, (message) => said.current(message), bulk.loaded())), [bulk]);
  const [engine, setEngine] = useState<MultiEngine | undefined>(() => loader?.loaded());
  /** Run the work with the engine (loading it first when it is not there yet). */
  const withEngine = useCallback(
    (work: (loaded: MultiEngine) => void): void =>
      loader?.use((loaded) => {
        setEngine(loaded);
        work(loaded);
      }),
    [loader],
  );

  const described = useMemo(
    () => (engine === undefined || items.length === 0 ? null : engine.describe(items, scene, (hubId) => ports.indexes.current().navigatorRollup().candidatesFrom(hubId))),
    [engine, items, scene, ports],
  );

  const toggle = useCallback(
    (hit: SceneHit): void =>
      withEngine((loaded) => {
        const words = loaded.toggle(ports.ui.selection, hit, isHub);
        if (words !== null) announce(words);
      }),
    [withEngine, ports, isHub, announce],
  );
  const toggleFocused = useCallback(
    (id: string | undefined): void =>
      withEngine((loaded) => {
        const words = loaded.toggleFocused(ports.ui.selection, id, isHub);
        if (words !== null) announce(words);
      }),
    [withEngine, ports, isHub, announce],
  );

  const onMarquee = useCallback(
    (rect: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }, done: boolean): void => {
      if (svg === null || controller === null || scene === null) return;
      const box = svg.getBoundingClientRect();
      if (!done) {
        loader?.warm();
        setMarquee({ left: rect.x0 - box.left, top: rect.y0 - box.top, width: rect.x1 - rect.x0, height: rect.y1 - rect.y0 });
        return;
      }
      setMarquee(null);
      const view = controller.current();
      withEngine((loaded) => announce(loaded.addMarquee(ports.ui.selection, scene, box, view, rect)));
    },
    [svg, controller, scene, loader, withEngine, ports, announce],
  );
  const onMarqueeCancel = useCallback((): void => setMarquee(null), []);
  const clear = useCallback((): void => {
    ports.ui.selection.getState().clearMulti();
    setMarquee(null);
  }, [ports]);
  const setSelectMode = useCallback(
    (on: boolean): void => {
      setSelectModeState(on);
      if (on) loader?.warm();
      else ports.ui.selection.getState().clearMulti();
    },
    [ports, loader],
  );

  if (bulk === undefined) return null;
  const multi: MultiSelect = {
    bulk,
    items,
    selectMode,
    setSelectMode,
    selectToggle: <SelectToggle on={selectMode} set={setSelectMode} />,
    marquee,
    line: described?.line ?? '',
    reactionIds: described?.reactionIds ?? NO_REACTIONS,
    toggle,
    toggleFocused,
    onMarquee,
    onMarqueeCancel,
    clear,
    actions(bar) {
      if (engine === undefined || items.length === 0) return null;
      const Actions = engine.Actions;
      return <Actions multi={multi} bar={bar} />;
    },
  };
  return multi;
}
