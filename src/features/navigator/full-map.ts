/**
 * Full map's browser side (step 8.4e, Part D; a lazy chunk, loaded by the first press of Full map). The MODE is the map store's `fullMap` flag
 * (the shell hides its frame by it); this controller reacts to the flag: entering pushes ONE history entry and asks the browser for true fullscreen
 * where it is allowed (no error when it is not: the in-app mode stands alone); Back, Esc and the browser leaving fullscreen all clear the flag, and the
 * flag clearing (the button, a page that opens) leaves fullscreen and pops the entry. Nothing is kept across a reload. Pure over injected `doc` / `win`.
 */
import { openLayers } from "@/ui/primitives";
import type { MapStore } from "@/ui/state/map-state";
import "./full-map.css";

interface Target {
  addEventListener(type: string, fn: EventListener, capture?: boolean): void;
  removeEventListener(type: string, fn: EventListener, capture?: boolean): void;
}
export interface FullMapDeps {
  readonly map: MapStore;
  readonly doc: Target & {
    readonly fullscreenEnabled: boolean;
    readonly fullscreenElement: unknown;
    readonly documentElement: { requestFullscreen?: () => Promise<void> };
    exitFullscreen(): Promise<void>;
  };
  readonly win: Target & {
    readonly history: {
      pushState(state: unknown, title: string): void;
      back(): void;
    };
  };
  /** Something else may use Esc (a menu, a dialog, the A-to-B panel): it is read when the key goes down, before they close. */
  readonly busy: () => boolean;
  /** Calls `gone` when the map's screen leaves the page (a family page, another view opened); returns how to stop watching. */
  readonly watch?: (gone: () => void) => () => void;
}

export function createFullMap(deps: FullMapDeps): { dispose(): void } {
  const { map, doc, win } = deps;
  let on = false;
  let pushed = false;
  let fullscreen = false;
  let escBusy = false;
  let unwatch: (() => void) | undefined;
  const leave = (): void => map.getState().setFullMap(false);
  const onPop = (): void => {
    pushed = false; // Back already took our entry
    leave();
  };
  const onFullscreen = (): void => {
    if (doc.fullscreenElement !== null) fullscreen = true;
    else if (fullscreen) leave(); // the browser left fullscreen (Esc, system back)
  };
  const onKeyDown = ((event: KeyboardEvent): void => {
    if (event.key === "Escape" && !event.defaultPrevented && !escBusy) leave();
  }) as EventListener;
  const onKeyCapture = (): void => {
    escBusy = deps.busy();
  };
  const start = (): void => {
    if (on) return;
    on = true;
    win.history.pushState({ orn: "full-map" }, "");
    pushed = true;
    win.addEventListener("popstate", onPop);
    doc.addEventListener("fullscreenchange", onFullscreen);
    doc.addEventListener("keydown", onKeyCapture, true);
    doc.addEventListener("keydown", onKeyDown);
    unwatch = deps.watch?.(leave);
    if (doc.fullscreenEnabled)
      doc.documentElement
        .requestFullscreen?.()
        .then(onFullscreen, () => undefined);
  };
  const stop = (): void => {
    if (!on) return;
    on = false;
    unwatch?.();
    unwatch = undefined;
    win.removeEventListener("popstate", onPop);
    doc.removeEventListener("fullscreenchange", onFullscreen);
    doc.removeEventListener("keydown", onKeyCapture, true);
    doc.removeEventListener("keydown", onKeyDown);
    if (doc.fullscreenElement !== null)
      void doc.exitFullscreen().catch(() => undefined);
    fullscreen = false;
    if (pushed) {
      pushed = false;
      win.history.back();
    }
  };
  if (map.getState().fullMap) start();
  const unsubscribe = map.subscribe((now, before) => {
    if (now.fullMap !== before.fullMap) (now.fullMap ? start : stop)();
  });
  return {
    dispose: () => {
      unsubscribe();
      stop();
    },
  };
}

/** The canvas's root carries `data-chips-zoom` for as long as the map is mounted (a scene being rebuilt does not take it away). */
function watchCanvas(gone: () => void): () => void {
  const observer = new MutationObserver(() => {
    if (document.querySelector("[data-chips-zoom]") === null) gone();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}

const live = new WeakMap<MapStore, unknown>();

/** The first call for a map builds its controller on the real window; every call sets the flag. */
export function enterFullMap(map: MapStore): void {
  if (!live.has(map))
    live.set(
      map,
      createFullMap({
        map,
        doc: document,
        win: window,
        busy: () => openLayers() > 0 || map.getState().chainOpen,
        watch: watchCanvas,
      }),
    );
  map.getState().setFullMap(true);
}
